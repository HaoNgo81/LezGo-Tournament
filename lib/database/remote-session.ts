import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { LiveTournamentState } from "../live-scoring";
import type { TeamVsTeamTournamentState } from "../tournament-setup";
import { assertSupabaseServerConfig } from "../supabase/server";
import { createSupabaseRestClient, SupabaseRestClientError, type SupabaseRestClient } from "../supabase/rest-client";
import { createStandardTournamentRepository, TournamentPersistenceError } from "./supabase-standard-repository";
import { createTeamVsTeamTournamentRepository } from "./supabase-team-vs-team-repository";
import type { TournamentAccessRecord } from "./tournament-access";

export interface RemoteSessionInput {
  tournamentId: string;
  accessId: string;
  tokenVersion: number;
}

export interface RemoteSessionResult {
  remoteSessionToken: string;
  remoteSessionExpiresAt: string;
}

export interface ReadRemoteSessionResult {
  tournamentId: string;
  kind: "standard" | "team-vs-team";
  state: LiveTournamentState | TeamVsTeamTournamentState;
  updatedAt?: string;
  remoteSessionExpiresAt: string;
}

interface RemoteSessionClaims {
  v: 1;
  scope: "remote-read";
  tournamentId: string;
  accessId: string;
  tokenVersion: number;
  iat: number;
  exp: number;
  nonce: string;
}

const remoteSessionLifetimeSeconds = 12 * 60 * 60;
const maxRemoteSessionTokenLength = 2048;

export class RemoteSessionError extends Error {
  readonly status: number;
  readonly reason: "denied" | "expired" | "invalid";

  constructor(message: string, status = 403, reason: RemoteSessionError["reason"] = "denied") {
    super(message);
    this.name = "RemoteSessionError";
    this.status = status;
    this.reason = reason;
  }
}

export function createRemoteSession(input: RemoteSessionInput, options: { now?: () => Date } = {}): RemoteSessionResult {
  validateUuid(input.tournamentId, "tournamentId");
  validateUuid(input.accessId, "accessId");

  if (!Number.isInteger(input.tokenVersion) || input.tokenVersion <= 0) {
    throw new RemoteSessionError("Remote session was denied.", 403, "invalid");
  }

  const now = options.now?.() ?? new Date();
  const issuedAt = Math.floor(now.getTime() / 1000);
  const expiresAt = issuedAt + remoteSessionLifetimeSeconds;
  const claims: RemoteSessionClaims = {
    v: 1,
    scope: "remote-read",
    tournamentId: input.tournamentId,
    accessId: input.accessId,
    tokenVersion: input.tokenVersion,
    iat: issuedAt,
    exp: expiresAt,
    nonce: randomBytes(16).toString("base64url"),
  };
  const payload = encodeBase64Url(JSON.stringify(claims));
  const signature = signRemoteSessionPayload(payload);

  return {
    remoteSessionToken: `${payload}.${signature}`,
    remoteSessionExpiresAt: new Date(expiresAt * 1000).toISOString(),
  };
}

export async function readRemoteSession(remoteSessionToken: string, options: { client?: SupabaseRestClient; now?: () => Date } = {}): Promise<ReadRemoteSessionResult> {
  const client = options.client ?? createSupabaseRestClient();
  const claims = parseRemoteSessionToken(remoteSessionToken, options.now);
  const [access] = await client.select<TournamentAccessRecord>("tournament_access", `id=eq.${encodeURIComponent(claims.accessId)}&select=*`);

  if (!access || access.revoked_at || access.tournament_id !== claims.tournamentId || access.token_version !== claims.tokenVersion) {
    throw new RemoteSessionError("Remote session was denied.", 403, "denied");
  }

  const [tournament] = await client.select<{ id: string; format: string; team_competition_mode: string | null; updated_at?: string }>("tournaments", `id=eq.${encodeURIComponent(claims.tournamentId)}&select=id,format,team_competition_mode,updated_at`);

  if (!tournament) {
    throw new RemoteSessionError("Remote session was denied.", 403, "denied");
  }

  if (tournament.format === "team-vs-team" || tournament.team_competition_mode) {
    return {
      tournamentId: tournament.id,
      kind: "team-vs-team",
      state: await createTeamVsTeamTournamentRepository(client).read(tournament.id),
      updatedAt: tournament.updated_at,
      remoteSessionExpiresAt: new Date(claims.exp * 1000).toISOString(),
    };
  }

  return {
    tournamentId: tournament.id,
    kind: "standard",
    state: await createStandardTournamentRepository(client).read(tournament.id),
    updatedAt: tournament.updated_at,
    remoteSessionExpiresAt: new Date(claims.exp * 1000).toISOString(),
  };
}

export function parseRemoteSessionToken(remoteSessionToken: string, now: (() => Date) | undefined = undefined): RemoteSessionClaims {
  if (!remoteSessionToken || remoteSessionToken.length > maxRemoteSessionTokenLength) {
    throw new RemoteSessionError("Remote session was denied.", 403, "invalid");
  }

  const [payload, signature, extra] = remoteSessionToken.split(".");

  if (!payload || !signature || extra !== undefined || !verifyRemoteSessionSignature(payload, signature)) {
    throw new RemoteSessionError("Remote session was denied.", 403, "invalid");
  }

  const claims = parseClaims(payload);
  const nowSeconds = Math.floor((now?.() ?? new Date()).getTime() / 1000);

  if (claims.exp <= nowSeconds) {
    throw new RemoteSessionError("Remote session has expired.", 410, "expired");
  }

  return claims;
}

export function toRemoteSessionError(message: string, error: unknown): RemoteSessionError {
  if (error instanceof RemoteSessionError) {
    return error;
  }

  if (error instanceof TournamentPersistenceError) {
    return new RemoteSessionError(`${message} ${error.message}`, 500, "denied");
  }

  if (error instanceof SupabaseRestClientError) {
    return new RemoteSessionError(`${message} ${error.message}`, error.status, "denied");
  }

  return new RemoteSessionError(message, 500, "denied");
}

function parseClaims(payload: string): RemoteSessionClaims {
  try {
    const claims = JSON.parse(decodeBase64Url(payload)) as RemoteSessionClaims;

    if (
      claims.v !== 1
      || claims.scope !== "remote-read"
      || !isUuid(claims.tournamentId)
      || !isUuid(claims.accessId)
      || !Number.isInteger(claims.tokenVersion)
      || claims.tokenVersion <= 0
      || !Number.isInteger(claims.iat)
      || !Number.isInteger(claims.exp)
      || claims.exp <= claims.iat
      || typeof claims.nonce !== "string"
      || claims.nonce.length < 16
    ) {
      throw new Error("Invalid claims.");
    }

    return claims;
  } catch {
    throw new RemoteSessionError("Remote session was denied.", 403, "invalid");
  }
}

function signRemoteSessionPayload(payload: string): string {
  const secret = getRemoteSessionSecret();
  return createHmac("sha256", secret).update(payload, "utf8").digest("base64url");
}

function verifyRemoteSessionSignature(payload: string, signature: string): boolean {
  const expected = Buffer.from(signRemoteSessionPayload(payload), "utf8");
  const actual = Buffer.from(signature, "utf8");

  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function getRemoteSessionSecret(): string {
  return process.env.LEZGO_REMOTE_SESSION_SECRET || assertSupabaseServerConfig().serviceRoleKey;
}

function encodeBase64Url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decodeBase64Url(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function validateUuid(value: string, fieldName: string): void {
  if (!isUuid(value)) {
    throw new RemoteSessionError(`${fieldName} must be a UUID.`, 400, "invalid");
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
