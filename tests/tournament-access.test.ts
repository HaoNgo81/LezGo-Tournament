import { describe, expect, it } from "vitest";
import {
  createTournamentAccessRepository,
  generateShareToken,
  generateTournamentCode,
  hashShareToken,
  normalizeTournamentCode,
  TournamentAccessError,
  type TournamentAccessRecord,
} from "../lib/database";
import { SupabaseRestClientError, type SupabaseRestClient } from "../lib/supabase/rest-client";

describe("STEP 12 tournament access", () => {
  it("generates readable codes and strong share tokens", () => {
    const code = generateTournamentCode();
    const token = generateShareToken();

    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(code).not.toMatch(/[O0I1]/);
    expect(token.length).toBeGreaterThanOrEqual(40);
    expect(hashShareToken(token)).toMatch(/^[a-f0-9]{64}$/);
  });

  it("normalizes tournament codes for mobile entry", () => {
    expect(normalizeTournamentCode(" k7m-4xp ")).toBe("K7M4XP");
  });

  it("retries code generation when a generated code collides", async () => {
    const client = createMemoryAccessClient({ conflictOnFirstInsert: true });
    const repository = createTournamentAccessRepository(client);

    const result = await repository.provision("00000000-0000-4000-8000-000000000001");

    expect(result.tournamentCode).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(result.shareToken).toBeTruthy();
    expect(client.snapshot().tournament_access).toHaveLength(1);
  });

  it("denies invalid token input before reading tournament rows", async () => {
    const client = createMemoryAccessClient();
    const repository = createTournamentAccessRepository(client);

    await expect(repository.readByAccess("K7M4XP", "bad")).rejects.toBeInstanceOf(TournamentAccessError);
    expect(client.calls.select).toBe(0);
  });
});

function createMemoryAccessClient(options: { conflictOnFirstInsert?: boolean } = {}) {
  const state: { tournament_access: TournamentAccessRecord[] } = { tournament_access: [] };
  const calls = { insert: 0, select: 0 };
  const client: SupabaseRestClient & { calls: typeof calls; snapshot: () => typeof state } = {
    calls,
    snapshot: () => state,
    async rpc<T>(): Promise<T> {
      throw new Error("rpc is not implemented in this memory client.");
    },
    async select<T>(table: string, query: string): Promise<T[]> {
      calls.select += 1;
      const tournamentIdMatch = /(?:^|[&?])tournament_id=eq\.([^&]+)/.exec(query);
      const codeMatch = /(?:^|[&?])tournament_code=eq\.([^&]+)/.exec(query);
      let rows = (state[table as keyof typeof state] ?? []) as unknown[];

      if (tournamentIdMatch) rows = rows.filter((row) => (row as TournamentAccessRecord).tournament_id === decodeURIComponent(tournamentIdMatch[1]));
      if (codeMatch) rows = rows.filter((row) => (row as TournamentAccessRecord).tournament_code === decodeURIComponent(codeMatch[1]));

      return rows as T[];
    },
    async insert<T>(table: string, rows: Record<string, unknown> | Record<string, unknown>[]): Promise<T[]> {
      calls.insert += 1;

      if (options.conflictOnFirstInsert && calls.insert === 1) {
        throw new SupabaseRestClientError("duplicate key value violates unique constraint", 409, {});
      }

      const insertedRows = (Array.isArray(rows) ? rows : [rows]).map((row, index) => ({
        id: `00000000-0000-4000-8000-${String(index + calls.insert).padStart(12, "0")}`,
        revoked_at: null,
        created_at: "2026-08-13T09:00:00.000Z",
        updated_at: "2026-08-13T09:00:00.000Z",
        metadata: {},
        ...row,
      })) as TournamentAccessRecord[];
      state.tournament_access.push(...insertedRows);
      return insertedRows as T[];
    },
    async update<T>(): Promise<T[]> {
      throw new Error("update is not implemented in this memory client.");
    },
    async delete(): Promise<void> {
      throw new Error("delete is not implemented in this memory client.");
    },
  };

  return client;
}
