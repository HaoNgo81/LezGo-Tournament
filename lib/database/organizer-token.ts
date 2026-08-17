import { createHmac, timingSafeEqual } from "node:crypto";
import { assertSupabaseServerConfig } from "../supabase/server";

export interface OrganizerTokenClaims {
  v: 1;
  scope: "tournament-organizer";
  tournamentId: string;
  kind: "standard" | "team-vs-team";
  legacyLocalId: string;
  iat: number;
}

const maxOrganizerTokenLength = 2048;

export class OrganizerTokenError extends Error {
  readonly status: number;

  constructor(message = "Organizer authorization was denied.", status = 403) {
    super(message);
    this.name = "OrganizerTokenError";
    this.status = status;
  }
}

export function createOrganizerToken(input: { tournamentId: string; kind: "standard" | "team-vs-team"; legacyLocalId: string }, now = new Date()): string {
  validateUuid(input.tournamentId, "tournamentId");

  if (!input.legacyLocalId.trim()) {
    throw new OrganizerTokenError("legacyLocalId is required.", 400);
  }

  const claims: OrganizerTokenClaims = {
    v: 1,
    scope: "tournament-organizer",
    tournamentId: input.tournamentId,
    kind: input.kind,
    legacyLocalId: input.legacyLocalId,
    iat: Math.floor(now.getTime() / 1000),
  };
  const payload = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  return `${payload}.${signOrganizerPayload(payload)}`;
}

export function assertOrganizerToken(token: string | undefined, input: { tournamentId: string; kind?: "standard" | "team-vs-team"; legacyLocalId?: string }): OrganizerTokenClaims {
  if (!token || token.length > maxOrganizerTokenLength) {
    throw new OrganizerTokenError();
  }

  const [payload, signature, extra] = token.split(".");

  if (!payload || !signature || extra !== undefined || !verifyOrganizerSignature(payload, signature)) {
    throw new OrganizerTokenError();
  }

  const claims = parseClaims(payload);

  if (claims.tournamentId !== input.tournamentId || (input.kind && claims.kind !== input.kind) || (input.legacyLocalId && claims.legacyLocalId !== input.legacyLocalId)) {
    throw new OrganizerTokenError();
  }

  return claims;
}

function parseClaims(payload: string): OrganizerTokenClaims {
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as OrganizerTokenClaims;

    if (
      claims.v !== 1
      || claims.scope !== "tournament-organizer"
      || !isUuid(claims.tournamentId)
      || (claims.kind !== "standard" && claims.kind !== "team-vs-team")
      || typeof claims.legacyLocalId !== "string"
      || !claims.legacyLocalId.trim()
      || !Number.isInteger(claims.iat)
    ) {
      throw new Error("Invalid claims.");
    }

    return claims;
  } catch {
    throw new OrganizerTokenError();
  }
}

function signOrganizerPayload(payload: string): string {
  return createHmac("sha256", getOrganizerSecret()).update(payload, "utf8").digest("base64url");
}

function verifyOrganizerSignature(payload: string, signature: string): boolean {
  const expected = Buffer.from(signOrganizerPayload(payload), "utf8");
  const actual = Buffer.from(signature, "utf8");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function getOrganizerSecret(): string {
  return process.env.LEZGO_REMOTE_SESSION_SECRET || assertSupabaseServerConfig().serviceRoleKey;
}

function validateUuid(value: string, fieldName: string): void {
  if (!isUuid(value)) {
    throw new OrganizerTokenError(`${fieldName} must be a UUID.`, 400);
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
