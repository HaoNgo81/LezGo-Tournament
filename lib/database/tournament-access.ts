import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import type { LiveTournamentState } from "../live-scoring";
import type { TeamVsTeamTournamentState } from "../tournament-setup";
import { createSupabaseRestClient, SupabaseRestClientError, type SupabaseRestClient } from "../supabase/rest-client";
import { createStandardTournamentRepository, TournamentPersistenceError } from "./supabase-standard-repository";
import { createTeamVsTeamTournamentRepository } from "./supabase-team-vs-team-repository";

export interface TournamentAccessRecord {
  id: string;
  tournament_id: string;
  tournament_code: string;
  share_token_hash: string;
  token_version: number;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
  metadata: Record<string, unknown>;
}

export interface ProvisionTournamentAccessResult {
  tournamentId: string;
  tournamentCode: string;
  shareToken: string;
  tokenVersion: number;
}

export interface ReadTournamentByAccessResult {
  tournamentId: string;
  accessId: string;
  tournamentCode: string;
  tokenVersion: number;
  kind: "standard" | "team-vs-team";
  state: LiveTournamentState | TeamVsTeamTournamentState;
  updatedAt?: string;
}

export interface TournamentAccessRepository {
  provision(tournamentId: string): Promise<ProvisionTournamentAccessResult>;
  readByAccess(tournamentCode: string, shareToken: string): Promise<ReadTournamentByAccessResult>;
  revoke(tournamentCode: string): Promise<void>;
}

const tournamentCodeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const tournamentCodeLength = 6;
const accessPinLength = 4;
const maxCodeGenerationAttempts = 8;

export class TournamentAccessError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "TournamentAccessError";
    this.status = status;
  }
}

export function createTournamentAccessRepository(client: SupabaseRestClient = createSupabaseRestClient()): TournamentAccessRepository {
  return {
    async provision(tournamentId) {
      validateUuid(tournamentId, "tournamentId");
      const existing = await readAccessByTournamentId(client, tournamentId);

      if (existing) {
        const shareToken = generateNewShareToken(existing.share_token_hash);
        const [updated] = await client.update<TournamentAccessRecord>("tournament_access", `id=eq.${encodeURIComponent(existing.id)}`, {
          share_token_hash: hashShareToken(shareToken),
          token_version: existing.token_version + 1,
          revoked_at: null,
        });

        if (!updated) {
          throw new TournamentAccessError("Could not renew tournament access.", 500);
        }

        return {
          tournamentId,
          tournamentCode: existing.tournament_code,
          shareToken,
          tokenVersion: updated.token_version,
        };
      }

      for (let attempt = 0; attempt < maxCodeGenerationAttempts; attempt += 1) {
        const tournamentCode = generateTournamentCode();
        const shareToken = generateShareToken();

        try {
          const [created] = await client.insert<TournamentAccessRecord>("tournament_access", {
            tournament_id: tournamentId,
            tournament_code: tournamentCode,
            share_token_hash: hashShareToken(shareToken),
            token_version: 1,
          });

          if (!created) {
            throw new TournamentAccessError("Could not provision tournament access.", 500);
          }

          return {
            tournamentId,
            tournamentCode,
            shareToken,
            tokenVersion: created.token_version,
          };
        } catch (error) {
          if (error instanceof SupabaseRestClientError && error.status === 409) {
            continue;
          }

          throw toAccessError("Could not provision tournament access.", error);
        }
      }

      throw new TournamentAccessError("Could not generate a unique tournament code.", 500);
    },
    async readByAccess(tournamentCode, shareToken) {
      const normalizedCode = normalizeTournamentCode(tournamentCode);
      validateShareTokenInput(shareToken);
      const [access] = await client.select<TournamentAccessRecord>("tournament_access", `tournament_code=eq.${encodeURIComponent(normalizedCode)}&select=*`);

      if (!access || access.revoked_at) {
        throw new TournamentAccessError("Tournament access was not found.", 404);
      }

      if (!verifyShareToken(shareToken, access.share_token_hash)) {
        throw new TournamentAccessError("Tournament access was denied.", 403);
      }

      const [tournament] = await client.select<{ id: string; format: string; team_competition_mode: string | null; updated_at?: string }>("tournaments", `id=eq.${encodeURIComponent(access.tournament_id)}&select=id,format,team_competition_mode,updated_at`);

      if (!tournament) {
        throw new TournamentAccessError("Tournament access was not found.", 404);
      }

      if (tournament.format === "team-vs-team" || tournament.team_competition_mode) {
        return {
          tournamentId: tournament.id,
          accessId: access.id,
          tournamentCode: access.tournament_code,
          tokenVersion: access.token_version,
          kind: "team-vs-team",
          state: await createTeamVsTeamTournamentRepository(client).read(tournament.id),
          updatedAt: tournament.updated_at,
        };
      }

      return {
        tournamentId: tournament.id,
        accessId: access.id,
        tournamentCode: access.tournament_code,
        tokenVersion: access.token_version,
        kind: "standard",
        state: await createStandardTournamentRepository(client).read(tournament.id),
        updatedAt: tournament.updated_at,
      };
    },
    async revoke(tournamentCode) {
      const normalizedCode = normalizeTournamentCode(tournamentCode);
      await client.update<TournamentAccessRecord>("tournament_access", `tournament_code=eq.${encodeURIComponent(normalizedCode)}`, {
        revoked_at: new Date().toISOString(),
      });
    },
  };
}

export function generateTournamentCode(): string {
  return Array.from({ length: tournamentCodeLength }, () => tournamentCodeAlphabet[randomBytes(1)[0] % tournamentCodeAlphabet.length]).join("");
}

export function generateShareToken(): string {
  return generateAccessPin();
}

export function generateAccessPin(): string {
  return Array.from({ length: accessPinLength }, () => String(randomInt(0, 10))).join("");
}

function generateNewShareToken(previousHash: string): string {
  for (let attempt = 0; attempt < maxCodeGenerationAttempts; attempt += 1) {
    const shareToken = generateShareToken();

    if (hashShareToken(shareToken) !== previousHash) {
      return shareToken;
    }
  }

  throw new TournamentAccessError("Could not renew tournament access.", 500);
}

export function hashShareToken(shareToken: string): string {
  return createHash("sha256").update(shareToken, "utf8").digest("hex");
}

export function normalizeTournamentCode(tournamentCode: string): string {
  return tournamentCode.trim().toLocaleUpperCase("en").replaceAll("-", "").replaceAll(" ", "");
}

function verifyShareToken(shareToken: string, expectedHash: string): boolean {
  const actualHash = hashShareToken(shareToken);
  const actualBuffer = Buffer.from(actualHash, "hex");
  const expectedBuffer = Buffer.from(expectedHash, "hex");

  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(actualBuffer, expectedBuffer);
}

async function readAccessByTournamentId(client: SupabaseRestClient, tournamentId: string): Promise<TournamentAccessRecord | null> {
  const [row] = await client.select<TournamentAccessRecord>("tournament_access", `tournament_id=eq.${encodeURIComponent(tournamentId)}&select=*`);
  return row ?? null;
}

function validateUuid(value: string, fieldName: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new TournamentAccessError(`${fieldName} must be a UUID.`);
  }
}

function validateShareTokenInput(shareToken: string): void {
  if (!/^\d{4}$/.test(shareToken)) {
    throw new TournamentAccessError("Tournament access was denied.", 403);
  }
}

function toAccessError(message: string, error: unknown): TournamentAccessError {
  if (error instanceof TournamentAccessError) {
    return error;
  }

  if (error instanceof TournamentPersistenceError) {
    return new TournamentAccessError(`${message} ${error.message}`, 500);
  }

  if (error instanceof SupabaseRestClientError) {
    return new TournamentAccessError(`${message} ${error.message}`, error.status);
  }

  return new TournamentAccessError(message, 500);
}
