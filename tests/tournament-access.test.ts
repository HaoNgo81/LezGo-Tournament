import { describe, expect, it } from "vitest";
import {
  createTournamentAccessRepository,
  generateAccessPin,
  generateShareToken,
  generateTournamentCode,
  hashShareToken,
  normalizeTournamentCode,
  TournamentAccessError,
  type TournamentAccessRecord,
} from "../lib/database";
import { SupabaseRestClientError, type SupabaseRestClient } from "../lib/supabase/rest-client";

describe("STEP 12 tournament access", () => {
  it("generates readable codes and 4-digit access codes", () => {
    const code = generateTournamentCode();
    const token = generateShareToken();

    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(code).not.toMatch(/[O0I1]/);
    expect(token).toMatch(/^\d{4}$/);
    expect(generateAccessPin()).toMatch(/^\d{4}$/);
    expect(hashShareToken(token)).toMatch(/^[a-f0-9]{64}$/);
  });

  it("preserves leading zeroes in access code hashing", () => {
    expect(hashShareToken("0427")).toMatch(/^[a-f0-9]{64}$/);
    expect(hashShareToken("0427")).not.toBe(hashShareToken("427"));
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

  it("renews an existing access row with a new 4-digit access code and invalidates the old one", async () => {
    const client = createMemoryAccessClient();
    const repository = createTournamentAccessRepository(client);
    const tournamentId = "00000000-0000-4000-8000-000000000001";

    const first = await repository.provision(tournamentId);
    const second = await repository.provision(tournamentId);

    expect(second.tournamentCode).toBe(first.tournamentCode);
    expect(second.shareToken).toMatch(/^\d{4}$/);
    expect(second.tokenVersion).toBe(2);
    expect(client.snapshot().tournament_access).toHaveLength(1);
    expect(client.snapshot().tournament_access[0].token_version).toBe(2);
    await expect(repository.readByAccess(first.tournamentCode, first.shareToken)).rejects.toMatchObject({ status: 403 });
    await expect(repository.readByAccess(second.tournamentCode, second.shareToken)).rejects.toMatchObject({ status: 404 });
  });

  it("denies invalid access code input before reading tournament rows", async () => {
    const client = createMemoryAccessClient();
    const repository = createTournamentAccessRepository(client);

    await expect(repository.readByAccess("K7M4XP", "bad")).rejects.toBeInstanceOf(TournamentAccessError);
    await expect(repository.readByAccess("K7M4XP", "123")).rejects.toBeInstanceOf(TournamentAccessError);
    await expect(repository.readByAccess("K7M4XP", "12345")).rejects.toBeInstanceOf(TournamentAccessError);
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
    async update<T>(table: string, query: string, values: Record<string, unknown>): Promise<T[]> {
      const idMatch = /(?:^|[&?])id=eq\.([^&]+)/.exec(query);
      const rows = (state[table as keyof typeof state] ?? []) as TournamentAccessRecord[];
      const updatedRows = rows.filter((row) => !idMatch || row.id === decodeURIComponent(idMatch[1])).map((row) => {
        Object.assign(row, values, { updated_at: "2026-08-13T09:01:00.000Z" });
        return row;
      });

      return updatedRows as T[];
    },
    async delete(): Promise<void> {
      throw new Error("delete is not implemented in this memory client.");
    },
  };

  return client;
}
