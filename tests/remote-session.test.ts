import { afterEach, describe, expect, it } from "vitest";
import { createRemoteSession, parseRemoteSessionToken, readRemoteSession } from "../lib/database";
import type { TournamentAccessRecord } from "../lib/database/tournament-access";
import type { SupabaseRestClient } from "../lib/supabase/rest-client";

describe("STEP 17 remote session", () => {
  const originalEnv = { ...process.env };
  const now = () => new Date("2026-08-13T12:00:00.000Z");

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("creates a signed read-only token scoped to one tournament access row", () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "STEP_17_TEST_SERVER_SECRET";
    process.env.LEZGO_REMOTE_SESSION_SECRET = "STEP_17_TEST_REMOTE_SESSION_SECRET";

    const session = createRemoteSession({
      tournamentId: "00000000-0000-4000-8000-000000000001",
      accessId: "20000000-0000-4000-8000-000000000001",
      tokenVersion: 1,
    }, { now });

    const claims = parseRemoteSessionToken(session.remoteSessionToken, now);
    expect(claims.scope).toBe("remote-read");
    expect(claims.tournamentId).toBe("00000000-0000-4000-8000-000000000001");
    expect(claims.accessId).toBe("20000000-0000-4000-8000-000000000001");
    expect(session.remoteSessionExpiresAt).toBe("2026-08-14T00:00:00.000Z");
    expect(session.remoteSessionToken).not.toContain("STEP_17_TEST_SERVER_SECRET");
  });

  it("rejects manipulated and expired remote session tokens", () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "STEP_17_TEST_SERVER_SECRET";
    process.env.LEZGO_REMOTE_SESSION_SECRET = "STEP_17_TEST_REMOTE_SESSION_SECRET";
    const session = createRemoteSession({
      tournamentId: "00000000-0000-4000-8000-000000000002",
      accessId: "20000000-0000-4000-8000-000000000002",
      tokenVersion: 1,
    }, { now });

    expect(() => parseRemoteSessionToken(`${session.remoteSessionToken.slice(0, -1)}x`, now)).toThrow("Remote session was denied.");
    expect(() => parseRemoteSessionToken(session.remoteSessionToken, () => new Date("2026-08-14T00:00:01.000Z"))).toThrow("Remote session has expired.");
  });

  it("denies revoked or mismatched access rows before reading the tournament snapshot", async () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "STEP_17_TEST_SERVER_SECRET";
    process.env.LEZGO_REMOTE_SESSION_SECRET = "STEP_17_TEST_REMOTE_SESSION_SECRET";
    const session = createRemoteSession({
      tournamentId: "00000000-0000-4000-8000-000000000003",
      accessId: "20000000-0000-4000-8000-000000000003",
      tokenVersion: 1,
    }, { now });
    const client = createMemoryRemoteSessionClient([{
      id: "20000000-0000-4000-8000-000000000003",
      tournament_id: "00000000-0000-4000-8000-000000000003",
      tournament_code: "STP17A",
      share_token_hash: "hash",
      token_version: 2,
      revoked_at: null,
      created_at: "2026-08-13T12:00:00.000Z",
      updated_at: "2026-08-13T12:00:00.000Z",
      metadata: {},
    }]);

    await expect(readRemoteSession(session.remoteSessionToken, { client, now })).rejects.toMatchObject({ status: 403 });
    expect(client.snapshotReads()).toBe(0);
  });
});

function createMemoryRemoteSessionClient(access: TournamentAccessRecord[]): SupabaseRestClient & { snapshotReads: () => number } {
  let tournamentReads = 0;

  return {
    async rpc() {
      throw new Error("Not implemented.");
    },
    async select<T>(table: string, query: string) {
      if (table === "tournament_access") {
        const idMatch = /id=eq\.([^&]+)/.exec(query);
        const id = idMatch ? decodeURIComponent(idMatch[1]) : "";
        return access.filter((row) => row.id === id) as T[];
      }

      if (table === "tournaments") {
        tournamentReads += 1;
      }

      return [] as T[];
    },
    async insert() {
      throw new Error("Not implemented.");
    },
    async update() {
      throw new Error("Not implemented.");
    },
    async delete() {
      throw new Error("Not implemented.");
    },
    snapshotReads: () => tournamentReads,
  };
}
