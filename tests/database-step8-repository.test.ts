import { describe, expect, it } from "vitest";
import { saveMatchResult } from "../lib/live-scoring";
import {
  createStandardTournamentRepository,
  getOperationRows,
  TournamentPersistenceError,
  type DatabaseWriteOperation,
  type PersistenceWritePlan,
} from "../lib/database";
import type { SupabaseRestClient } from "../lib/supabase/rest-client";
import { createPoolTournamentFromSetup, createTournamentFromSetup } from "../lib/tournament-setup";

describe("STEP 8 standard Supabase repository", () => {
  it("saves through the atomic RPC and reads through the read-back mapper", async () => {
    const state = createSavedAmericanoState();
    const client = createMemoryClient();
    const repository = createStandardTournamentRepository(client);

    const saved = await repository.save(state, {
      legacyLocalId: "STEP_08_TEST_UNIT",
      createId: createDeterministicUuidFactory(),
    });
    const readBack = await repository.read(saved.tournamentId);

    expect(saved.tournamentId).toBe("00000000-0000-4000-8000-000000000001");
    expect(readBack.tournamentName).toBe(state.tournamentName);
    expect(readBack.players).toEqual(state.players);
    expect(readBack.rounds).toEqual(state.rounds);
    expect(readBack.results).toEqual(state.results);
  });

  it("keeps writes atomic when a later operation fails", async () => {
    const state = createSavedAmericanoState();
    const client = createMemoryClient({ failAfterTournamentInsert: true });
    const repository = createStandardTournamentRepository(client);

    await expect(repository.save(state, {
      legacyLocalId: "STEP_08_TEST_ROLLBACK",
      createId: createDeterministicUuidFactory(),
    })).rejects.toBeInstanceOf(TournamentPersistenceError);

    expect(client.snapshot().tournaments).toEqual([]);
  });

  it("round-trips pool-play through the runtime-state snapshot", async () => {
    const client = createMemoryClient();
    const repository = createStandardTournamentRepository(client);
    const poolPlayState = createPoolTournamentFromSetup({
      name: "STEP_09_TEST Pool",
      participantType: "pair",
      participantText: ["Par A", "Par B", "Par C", "Par D"].join("\n"),
      poolCount: 2,
      participantsPerPool: 2,
      advancementMode: "crossMatches",
      unmatchedResolution: "bye",
      scoringMode: "Fri scoring",
      rankingMode: "matchPointsFirst",
    });

    const saved = await repository.save(poolPlayState, {
      legacyLocalId: "STEP_09_TEST_POOL",
      createId: createDeterministicUuidFactory(),
    });

    await expect(repository.read(saved.tournamentId)).resolves.toEqual(poolPlayState);
  });

  it("uses the owner-scoped RPC when an authenticated owner is supplied", async () => {
    const state = createSavedAmericanoState();
    const client = createMemoryClient();
    const repository = createStandardTournamentRepository(client);

    await repository.save(state, {
      legacyLocalId: "STEP_25I_TEST_OWNER",
      createId: createDeterministicUuidFactory(),
      ownerUserId: "00000000-0000-4000-8000-000000000777",
    });

    expect(client.calls.rpcNames).toEqual(["lezgo_save_owned_tournament_snapshot_v1"]);
    expect(client.calls.lastRpcBody).toMatchObject({
      p_actor_user_id: "00000000-0000-4000-8000-000000000777",
    });
  });

  it("preserves existing explicit privacy when replacing a snapshot", async () => {
    const state = createSavedAmericanoState();
    const client = createMemoryClient();
    const repository = createStandardTournamentRepository(client);
    const tournamentId = "00000000-0000-4000-8000-000000000999";
    client.snapshot().tournaments.push({
      id: tournamentId,
      privacy: "public_result",
      updated_at: "2026-08-21T10:00:00.000Z",
    });

    await repository.save(state, {
      legacyLocalId: "STEP_25I_C8D_PRIVACY",
      createId: createDeterministicUuidFactory(),
      tournamentId,
      expectedUpdatedAt: "2026-08-21T10:00:00.000Z",
    });

    const operations = client.calls.lastRpcBody?.p_operations as DatabaseWriteOperation[];
    expect(getOperationRows({ operations, idMap: {}, transactional: true }, "tournaments")[0]).toMatchObject({
      id: tournamentId,
      privacy: "public_result",
    });
  });
});

function createSavedAmericanoState() {
  const initialState = createTournamentFromSetup({
    name: "STEP_08_TEST_UNIT Americano",
    format: "Americano",
    playerText: Array.from({ length: 4 }, (_, index) => `Spiller ${index + 1}`).join("\n"),
    femalePlayerText: "",
    malePlayerText: "",
    courts: 1,
    rounds: 1,
    scoringMode: "Fast antal point",
    fixedScoreRule: "total",
    fixedScorePoints: 24,
    firstRoundOrder: "manual",
    rankingMode: "matchPointsFirst",
  });

  return saveMatchResult(initialState, { matchId: initialState.rounds[0].matches[0].id, teamAPoints: 17, teamBPoints: 7 });
}

function createDeterministicUuidFactory(): () => string {
  let nextId = 1;
  return () => `00000000-0000-4000-8000-${String(nextId++).padStart(12, "0")}`;
}

function createMemoryClient(options: { failAfterTournamentInsert?: boolean } = {}) {
  const state: Record<string, Record<string, unknown>[]> = {
    tournaments: [],
    tournament_players: [],
    fixed_pairs: [],
    rounds: [],
    tournament_pools: [],
    pool_participants: [],
    matches: [],
    match_sides: [],
    match_side_players: [],
  };
  const calls: { rpc: number; rpcNames: string[]; lastRpcBody?: Record<string, unknown> } = { rpc: 0, rpcNames: [] };
  const client: SupabaseRestClient & { calls: typeof calls; snapshot: () => typeof state } = {
    calls,
    snapshot: () => state,
    async rpc<T>(functionName: string, body: Record<string, unknown>): Promise<T> {
      calls.rpc += 1;
      calls.rpcNames.push(functionName);
      calls.lastRpcBody = body;
      const operations = body.p_operations as DatabaseWriteOperation[];
      const staged = cloneState(state);

      try {
        for (const operation of operations) {
          if (operation.kind !== "insert" || !operation.rows) {
            throw new Error("Unsupported operation");
          }

          staged[operation.table] = [...(staged[operation.table] ?? []), ...operation.rows];

          if (operation.table === "tournaments" && options.failAfterTournamentInsert) {
            throw new Error("Simulated failure after tournament insert");
          }
        }
      } catch (error) {
        throw error;
      }

      Object.assign(state, staged);
      const tournamentId = getOperationRows({ operations, idMap: {}, transactional: true } satisfies PersistenceWritePlan, "tournaments")[0]?.id;
      return tournamentId as T;
    },
    async select<T>(table: string, query: string): Promise<T[]> {
      const idMatch = /(?:^|[&?])id=eq\.([^&]+)/.exec(query);
      const tournamentIdMatch = /(?:^|[&?])tournament_id=eq\.([^&]+)/.exec(query);
      const inMatch = /(?:^|[&?])(match_id|match_side_id)=in\.\(([^)]+)\)/.exec(query);
      let rows = state[table] ?? [];

      if (idMatch) {
        rows = rows.filter((row) => row.id === decodeURIComponent(idMatch[1]));
      }

      if (tournamentIdMatch) {
        rows = rows.filter((row) => row.tournament_id === decodeURIComponent(tournamentIdMatch[1]));
      }

      if (inMatch) {
        const ids = new Set(inMatch[2].split(","));
        rows = rows.filter((row) => ids.has(String(row[inMatch[1]])));
      }

      return rows as T[];
    },
    async insert<T>(): Promise<T[]> {
      throw new Error("insert is not implemented in this memory client.");
    },
    async update<T>(): Promise<T[]> {
      throw new Error("update is not implemented in this memory client.");
    },
    async delete(table: string, query: string): Promise<void> {
      const idMatch = /(?:^|[&?])id=eq\.([^&]+)/.exec(query);

      if (idMatch) {
        state[table] = (state[table] ?? []).filter((row) => row.id !== decodeURIComponent(idMatch[1]));
      }
    },
  };

  return client;
}

function cloneState(state: Record<string, Record<string, unknown>[]>): Record<string, Record<string, unknown>[]> {
  return Object.fromEntries(Object.entries(state).map(([table, rows]) => [table, rows.map((row) => ({ ...row }))]));
}
