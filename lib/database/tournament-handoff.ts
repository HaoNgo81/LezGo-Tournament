import { createHash, randomBytes } from "node:crypto";
import type { LiveTournamentState } from "../live-scoring";
import type { TeamVsTeamTournamentState } from "../tournament-setup";
import { createSupabaseRestClient, SupabaseRestClientError, type SupabaseRestClient } from "../supabase/rest-client";
import { createStandardTournamentRepository, TournamentPersistenceError } from "./supabase-standard-repository";
import { createTeamVsTeamTournamentRepository } from "./supabase-team-vs-team-repository";
import { createTournamentAccessRepository, TournamentAccessError, type TournamentAccessRecord } from "./tournament-access";

export interface TournamentHandoffRecord {
  id: string;
  tournament_access_id: string;
  handoff_token_hash: string;
  created_at: string;
  updated_at: string;
  expires_at: string;
  first_used_at: string | null;
  last_used_at: string | null;
  use_count: number;
  revoked_at: string | null;
  metadata: Record<string, unknown>;
}

export interface ProvisionTournamentHandoffOptions {
  expiresInSeconds?: number;
  now?: () => Date;
}

export interface ProvisionTournamentHandoffResult {
  tournamentId: string;
  handoffReference: string;
  expiresAt: string;
}

export interface RedeemTournamentHandoffResult {
  tournamentId: string;
  kind: "standard" | "team-vs-team";
  state: LiveTournamentState | TeamVsTeamTournamentState;
  updatedAt?: string;
}

export interface TournamentHandoffRepository {
  provision(tournamentId: string, options?: ProvisionTournamentHandoffOptions): Promise<ProvisionTournamentHandoffResult>;
  redeem(handoffReference: string, options?: { now?: () => Date }): Promise<RedeemTournamentHandoffResult>;
  revoke(handoffReference: string): Promise<void>;
}

const defaultHandoffLifetimeSeconds = 10 * 60;
const minHandoffLifetimeSeconds = 30;
const maxHandoffLifetimeSeconds = 30 * 60;
const handoffReferenceMinLength = 32;
const handoffReferenceMaxLength = 256;

export class TournamentHandoffError extends Error {
  readonly status: number;
  readonly reason: "denied" | "expired" | "invalid" | "not-found";

  constructor(message: string, status = 403, reason: TournamentHandoffError["reason"] = "denied") {
    super(message);
    this.name = "TournamentHandoffError";
    this.status = status;
    this.reason = reason;
  }
}

export function createTournamentHandoffRepository(client: SupabaseRestClient = createSupabaseRestClient()): TournamentHandoffRepository {
  return {
    async provision(tournamentId, options = {}) {
      validateUuid(tournamentId, "tournamentId");
      let access = await readAccessByTournamentId(client, tournamentId);

      if (!access) {
        await createTournamentAccessRepository(client).provision(tournamentId);
        access = await readAccessByTournamentId(client, tournamentId);
      }

      if (!access || access.revoked_at) {
        throw new TournamentHandoffError("Tournament handoff was denied.", 403, "denied");
      }

      const now = options.now?.() ?? new Date();
      const lifetimeSeconds = normalizeLifetime(options.expiresInSeconds);
      const handoffReference = generateHandoffReference();
      const expiresAt = new Date(now.getTime() + lifetimeSeconds * 1000).toISOString();
      const [created] = await client.insert<TournamentHandoffRecord>("tournament_handoffs", {
        tournament_access_id: access.id,
        handoff_token_hash: hashHandoffReference(handoffReference),
        expires_at: expiresAt,
        metadata: { tournament_id: tournamentId },
      });

      if (!created) {
        throw new TournamentHandoffError("Could not create tournament handoff.", 500, "denied");
      }

      return {
        tournamentId,
        handoffReference,
        expiresAt: created.expires_at,
      };
    },
    async redeem(handoffReference, options = {}) {
      validateHandoffReferenceInput(handoffReference);
      const now = options.now?.() ?? new Date();
      const [handoff] = await client.select<TournamentHandoffRecord>("tournament_handoffs", `handoff_token_hash=eq.${encodeURIComponent(hashHandoffReference(handoffReference))}&select=*`);

      if (!handoff || handoff.revoked_at) {
        throw new TournamentHandoffError("Tournament handoff was denied.", 403, handoff ? "denied" : "not-found");
      }

      if (new Date(handoff.expires_at).getTime() <= now.getTime()) {
        throw new TournamentHandoffError("Tournament handoff has expired.", 410, "expired");
      }

      const [access] = await client.select<TournamentAccessRecord>("tournament_access", `id=eq.${encodeURIComponent(handoff.tournament_access_id)}&select=*`);

      if (!access || access.revoked_at) {
        throw new TournamentHandoffError("Tournament handoff was denied.", 403, "denied");
      }

      await client.update<TournamentHandoffRecord>("tournament_handoffs", `id=eq.${encodeURIComponent(handoff.id)}`, {
        first_used_at: handoff.first_used_at ?? now.toISOString(),
        last_used_at: now.toISOString(),
        use_count: handoff.use_count + 1,
      });

      const [tournament] = await client.select<{ id: string; format: string; team_competition_mode: string | null; updated_at?: string }>("tournaments", `id=eq.${encodeURIComponent(access.tournament_id)}&select=id,format,team_competition_mode,updated_at`);

      if (!tournament) {
        throw new TournamentHandoffError("Tournament handoff was denied.", 403, "denied");
      }

      if (tournament.format === "team-vs-team" || tournament.team_competition_mode) {
        return {
          tournamentId: tournament.id,
          kind: "team-vs-team",
          state: await createTeamVsTeamTournamentRepository(client).read(tournament.id),
          updatedAt: tournament.updated_at,
        };
      }

      return {
        tournamentId: tournament.id,
        kind: "standard",
        state: await createStandardTournamentRepository(client).read(tournament.id),
        updatedAt: tournament.updated_at,
      };
    },
    async revoke(handoffReference) {
      validateHandoffReferenceInput(handoffReference);
      await client.update<TournamentHandoffRecord>("tournament_handoffs", `handoff_token_hash=eq.${encodeURIComponent(hashHandoffReference(handoffReference))}`, {
        revoked_at: new Date().toISOString(),
      });
    },
  };
}

export function generateHandoffReference(): string {
  return randomBytes(32).toString("base64url");
}

export function hashHandoffReference(handoffReference: string): string {
  return createHash("sha256").update(handoffReference, "utf8").digest("hex");
}

function normalizeLifetime(value?: number): number {
  if (value === undefined) {
    return defaultHandoffLifetimeSeconds;
  }

  if (!Number.isInteger(value) || value < minHandoffLifetimeSeconds || value > maxHandoffLifetimeSeconds) {
    throw new TournamentHandoffError("Invalid tournament handoff lifetime.", 400, "invalid");
  }

  return value;
}

async function readAccessByTournamentId(client: SupabaseRestClient, tournamentId: string): Promise<TournamentAccessRecord | null> {
  const [row] = await client.select<TournamentAccessRecord>("tournament_access", `tournament_id=eq.${encodeURIComponent(tournamentId)}&select=*`);
  return row ?? null;
}

function validateUuid(value: string, fieldName: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new TournamentHandoffError(`${fieldName} must be a UUID.`, 400, "invalid");
  }
}

function validateHandoffReferenceInput(handoffReference: string): void {
  if (!handoffReference || handoffReference.length < handoffReferenceMinLength || handoffReference.length > handoffReferenceMaxLength || !/^[A-Za-z0-9_-]+$/.test(handoffReference)) {
    throw new TournamentHandoffError("Tournament handoff was denied.", 403, "invalid");
  }
}

export function toHandoffError(message: string, error: unknown): TournamentHandoffError {
  if (error instanceof TournamentHandoffError) {
    return error;
  }

  if (error instanceof TournamentAccessError) {
    return new TournamentHandoffError(message, error.status, "denied");
  }

  if (error instanceof TournamentPersistenceError) {
    return new TournamentHandoffError(`${message} ${error.message}`, 500, "denied");
  }

  if (error instanceof SupabaseRestClientError) {
    return new TournamentHandoffError(`${message} ${error.message}`, error.status, "denied");
  }

  return new TournamentHandoffError(message, 500, "denied");
}
