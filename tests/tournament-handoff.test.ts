import { describe, expect, it } from "vitest";
import {
  createTournamentHandoffRepository,
  generateHandoffReference,
  hashHandoffReference,
  TournamentHandoffError,
  type TournamentAccessRecord,
  type TournamentHandoffRecord,
} from "../lib/database";
import type { SupabaseRestClient } from "../lib/supabase/rest-client";

describe("STEP 14 tournament handoff", () => {
  it("generates strong references and stores only hashes", () => {
    const reference = generateHandoffReference();

    expect(reference).toMatch(/^[A-Za-z0-9_-]{32,}$/);
    expect(hashHandoffReference(reference)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashHandoffReference(reference)).not.toBe(reference);
  });

  it("provisions a short-lived handoff for an existing access row", async () => {
    const client = createMemoryHandoffClient({
      access: [createAccess("00000000-0000-4000-8000-000000000001")],
    });
    const repository = createTournamentHandoffRepository(client);

    const result = await repository.provision("00000000-0000-4000-8000-000000000001", {
      now: () => new Date("2026-08-13T10:00:00.000Z"),
      expiresInSeconds: 120,
    });

    expect(result.handoffReference).toMatch(/^[A-Za-z0-9_-]{32,}$/);
    expect(result.expiresAt).toBe("2026-08-13T10:02:00.000Z");
    expect(client.snapshot().tournament_handoffs).toHaveLength(1);
    expect(client.snapshot().tournament_handoffs[0].handoff_token_hash).toBe(hashHandoffReference(result.handoffReference));
  });

  it("denies expired, invalid and revoked handoff references without exposing details", async () => {
    const access = createAccess("00000000-0000-4000-8000-000000000002");
    const activeReference = "valid-reference-with-enough-entropy-1234567890";
    const expiredReference = "expired-reference-with-enough-entropy-123456789";
    const revokedReference = "revoked-reference-with-enough-entropy-123456789";
    const client = createMemoryHandoffClient({
      access: [{ ...access, revoked_at: "2026-08-13T10:00:00.000Z" }],
      handoffs: [
        createHandoff(access.id, activeReference, "2026-08-13T10:30:00.000Z"),
        createHandoff(access.id, expiredReference, "2026-08-13T09:59:00.000Z"),
        { ...createHandoff(access.id, revokedReference, "2026-08-13T10:30:00.000Z"), revoked_at: "2026-08-13T10:00:00.000Z" },
      ],
    });
    const repository = createTournamentHandoffRepository(client);

    await expect(repository.redeem("bad")).rejects.toBeInstanceOf(TournamentHandoffError);
    await expect(repository.redeem(expiredReference, { now: () => new Date("2026-08-13T10:00:00.000Z") })).rejects.toMatchObject({ status: 410 });
    await expect(repository.redeem(revokedReference, { now: () => new Date("2026-08-13T10:00:00.000Z") })).rejects.toMatchObject({ status: 403 });
    await expect(repository.redeem(activeReference, { now: () => new Date("2026-08-13T10:00:00.000Z") })).rejects.toMatchObject({ status: 403 });
  });
});

function createAccess(tournamentId: string): TournamentAccessRecord {
  return {
    id: `10000000-0000-4000-8000-${tournamentId.slice(-12)}`,
    tournament_id: tournamentId,
    tournament_code: "K7M4XP",
    share_token_hash: "a".repeat(64),
    token_version: 1,
    revoked_at: null,
    created_at: "2026-08-13T09:00:00.000Z",
    updated_at: "2026-08-13T09:00:00.000Z",
    metadata: {},
  };
}

function createHandoff(accessId: string, reference: string, expiresAt: string): TournamentHandoffRecord {
  return {
    id: `20000000-0000-4000-8000-${String(hashHandoffReference(reference).charCodeAt(0)).padStart(12, "0")}`,
    tournament_access_id: accessId,
    handoff_token_hash: hashHandoffReference(reference),
    created_at: "2026-08-13T09:00:00.000Z",
    updated_at: "2026-08-13T09:00:00.000Z",
    expires_at: expiresAt,
    first_used_at: null,
    last_used_at: null,
    use_count: 0,
    revoked_at: null,
    metadata: {},
  };
}

function createMemoryHandoffClient(initial: { access?: TournamentAccessRecord[]; handoffs?: TournamentHandoffRecord[] } = {}) {
  const state: {
    tournament_access: TournamentAccessRecord[];
    tournament_handoffs: TournamentHandoffRecord[];
    tournaments: Array<{ id: string; format: string; team_competition_mode: string | null; updated_at?: string }>;
  } = {
    tournament_access: initial.access ?? [],
    tournament_handoffs: initial.handoffs ?? [],
    tournaments: [],
  };
  const client: SupabaseRestClient & { snapshot: () => typeof state } = {
    snapshot: () => state,
    async rpc<T>(): Promise<T> {
      throw new Error("rpc is not implemented in this memory client.");
    },
    async select<T>(table: string, query: string): Promise<T[]> {
      let rows = (state[table as keyof typeof state] ?? []) as unknown[];
      const idMatch = /(?:^|[&?])id=eq\.([^&]+)/.exec(query);
      const tournamentIdMatch = /(?:^|[&?])tournament_id=eq\.([^&]+)/.exec(query);
      const tokenHashMatch = /(?:^|[&?])handoff_token_hash=eq\.([^&]+)/.exec(query);

      if (idMatch) rows = rows.filter((row) => "id" in (row as Record<string, unknown>) && (row as { id: string }).id === decodeURIComponent(idMatch[1]));
      if (tournamentIdMatch) rows = rows.filter((row) => "tournament_id" in (row as Record<string, unknown>) && (row as TournamentAccessRecord).tournament_id === decodeURIComponent(tournamentIdMatch[1]));
      if (tokenHashMatch) rows = rows.filter((row) => "handoff_token_hash" in (row as Record<string, unknown>) && (row as TournamentHandoffRecord).handoff_token_hash === decodeURIComponent(tokenHashMatch[1]));

      return rows as T[];
    },
    async insert<T>(table: string, rows: Record<string, unknown> | Record<string, unknown>[]): Promise<T[]> {
      const insertedRows = (Array.isArray(rows) ? rows : [rows]).map((row, index) => ({
        id: `30000000-0000-4000-8000-${String(state.tournament_handoffs.length + index + 1).padStart(12, "0")}`,
        created_at: "2026-08-13T10:00:00.000Z",
        updated_at: "2026-08-13T10:00:00.000Z",
        first_used_at: null,
        last_used_at: null,
        use_count: 0,
        revoked_at: null,
        metadata: {},
        ...row,
      })) as TournamentHandoffRecord[];

      if (table === "tournament_handoffs") {
        state.tournament_handoffs.push(...insertedRows);
      }

      return insertedRows as T[];
    },
    async update<T>(table: string, query: string, values: Record<string, unknown>): Promise<T[]> {
      const idMatch = /(?:^|[&?])id=eq\.([^&]+)/.exec(query);
      const tokenHashMatch = /(?:^|[&?])handoff_token_hash=eq\.([^&]+)/.exec(query);
      const rows = state[table as keyof typeof state] as unknown[];
      const updated = rows.filter((row) => {
        const record = row as Record<string, unknown>;
        if (idMatch) return record.id === decodeURIComponent(idMatch[1]);
        if (tokenHashMatch) return record.handoff_token_hash === decodeURIComponent(tokenHashMatch[1]);
        return false;
      }).map((row) => Object.assign(row as Record<string, unknown>, values));

      return updated as T[];
    },
    async delete(): Promise<void> {
      throw new Error("delete is not implemented in this memory client.");
    },
  };

  return client;
}
