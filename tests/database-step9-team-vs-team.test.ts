import { describe, expect, it } from "vitest";
import {
  createTeamVsTeamTournamentRepository,
  TournamentPersistenceError,
  type DatabaseWriteOperation,
} from "../lib/database";
import type { SupabaseRestClient } from "../lib/supabase/rest-client";
import { createTeamVsTeamTournamentFromSetup, type TeamVsTeamTournamentState } from "../lib/tournament-setup";

describe("STEP 9 Team vs Team persistence", () => {
  it("round-trips Team vs Team rows through the repository", async () => {
    const state = createPopulatedTeamVsTeamState();
    const client = createMemoryClient();
    const repository = createTeamVsTeamTournamentRepository(client);

    const saved = await repository.save(state, {
      legacyLocalId: "STEP_09_TEST_TEAM",
      createId: createDeterministicUuidFactory(),
    });
    const readBack = await repository.read(saved.tournamentId);

    expect(readBack).toEqual(state);
  });

  it("replaces the same Team vs Team tournament id without duplicate rows", async () => {
    const state = createPopulatedTeamVsTeamState();
    const client = createMemoryClient();
    const repository = createTeamVsTeamTournamentRepository(client);
    const saved = await repository.save(state, {
      legacyLocalId: "STEP_09_TEST_TEAM_UPDATE",
      createId: createDeterministicUuidFactory(),
    });
    const updatedState = { ...state, name: "STEP_09_TEST Team Updated" };

    const updated = await repository.save(updatedState, {
      legacyLocalId: "STEP_09_TEST_TEAM_UPDATE",
      tournamentId: saved.tournamentId,
      createId: createDeterministicUuidFactory(100),
    });
    const readBack = await repository.read(saved.tournamentId);

    expect(updated.saveMode).toBe("replace");
    expect(updated.tournamentId).toBe(saved.tournamentId);
    expect(readBack.name).toBe("STEP_09_TEST Team Updated");
    expect(client.snapshot().tournaments).toHaveLength(1);
  });

  it("rolls back Team vs Team writes when a child insert fails", async () => {
    const state = createPopulatedTeamVsTeamState();
    const client = createMemoryClient({ failTable: "team_vs_team_lineups" });
    const repository = createTeamVsTeamTournamentRepository(client);

    await expect(repository.save(state, {
      legacyLocalId: "STEP_09_TEST_TEAM_ROLLBACK",
      createId: createDeterministicUuidFactory(),
    })).rejects.toBeInstanceOf(TournamentPersistenceError);
    expect(client.snapshot().tournaments).toEqual([]);
  });
});

function createPopulatedTeamVsTeamState(): TeamVsTeamTournamentState {
  const state = {
    ...createTeamVsTeamTournamentFromSetup({
      name: "STEP_09_TEST Team",
      scoringMode: "Fri scoring",
      teamCount: 2,
      competitionMode: "knockout",
      drawMode: "manual",
      playersPerTeam: 4,
      matchFormat: "oneSet",
      teams: [createTeam("a", "Hold A"), createTeam("b", "Hold B")],
    }),
    status: "active" as const,
  };
  const matchup = state.matchups[0];

  return {
    ...state,
    matchups: [
      {
        ...matchup,
        lineups: [
          {
            roundNumber: 1,
            match1: { teamAPlayerIds: ["a1", "a2"], teamBPlayerIds: ["b1", "b2"] },
            match2: { teamAPlayerIds: ["a3", "a4"], teamBPlayerIds: ["b3", "b4"] },
          },
        ],
        roundResults: [
          {
            roundNumber: 1,
            match1: { sets: [{ teamAPoints: 6, teamBPoints: 2 }] },
            match2: { sets: [{ teamAPoints: 3, teamBPoints: 6 }] },
          },
        ],
      },
    ],
  };
}

function createTeam(idPrefix: string, name: string) {
  return {
    id: `team-${idPrefix}`,
    name,
    captainPlayerId: `${idPrefix}1`,
    players: Array.from({ length: 4 }, (_, index) => ({ id: `${idPrefix}${index + 1}`, name: `${name} spiller ${index + 1}` })),
  };
}

function createDeterministicUuidFactory(start = 1): () => string {
  let nextId = start;
  return () => `00000000-0000-4000-8000-${String(nextId++).padStart(12, "0")}`;
}

function createMemoryClient(options: { failTable?: string } = {}) {
  const state: Record<string, Record<string, unknown>[]> = {
    tournaments: [],
    team_vs_team_teams: [],
    team_vs_team_players: [],
    team_vs_team_matchups: [],
    team_vs_team_lineups: [],
    team_vs_team_round_results: [],
    team_vs_team_tiebreaks: [],
  };
  const client: SupabaseRestClient & { snapshot: () => typeof state } = {
    snapshot: () => state,
    async rpc<T>(_functionName: string, body: Record<string, unknown>): Promise<T> {
      const operations = body.p_operations as DatabaseWriteOperation[];
      const staged = cloneState(state);
      const tournamentId = getTournamentId(operations);

      for (const table of Object.keys(staged)) {
        staged[table] = staged[table].filter((row) => row.tournament_id !== tournamentId && row.id !== tournamentId);
      }

      for (const operation of operations) {
        if (operation.kind === "insert" && operation.rows) {
          if (operation.table === options.failTable) {
            throw new Error("Simulated failure");
          }

          staged[operation.table] = [...(staged[operation.table] ?? []), ...operation.rows];
          continue;
        }

        if (operation.kind === "update" && operation.table === "team_vs_team_teams") {
          const row = staged.team_vs_team_teams.find((candidate) => candidate.id === operation.match?.id);
          if (row) Object.assign(row, operation.values);
          continue;
        }

        if (operation.kind === "update" && operation.table === "tournaments") {
          const row = staged.tournaments.find((candidate) => candidate.id === operation.match?.id);
          if (row) Object.assign(row, operation.values);
        }
      }

      Object.assign(state, staged);
      return tournamentId as T;
    },
    async select<T>(table: string, query: string): Promise<T[]> {
      let rows = state[table] ?? [];
      const idMatch = /(?:^|[&?])id=eq\.([^&]+)/.exec(query);
      const tournamentIdMatch = /(?:^|[&?])tournament_id=eq\.([^&]+)/.exec(query);
      const inMatch = /(?:^|[&?])(team_id|matchup_id)=in\.\(([^)]+)\)/.exec(query);

      if (idMatch) rows = rows.filter((row) => row.id === decodeURIComponent(idMatch[1]));
      if (tournamentIdMatch) rows = rows.filter((row) => row.tournament_id === decodeURIComponent(tournamentIdMatch[1]));
      if (inMatch) {
        const ids = new Set(inMatch[2].split(","));
        rows = rows.filter((row) => ids.has(String(row[inMatch[1]])));
      }

      return rows as T[];
    },
    async delete(table: string, query: string): Promise<void> {
      const idMatch = /(?:^|[&?])id=eq\.([^&]+)/.exec(query);
      if (idMatch) state[table] = (state[table] ?? []).filter((row) => row.id !== decodeURIComponent(idMatch[1]));
    },
  };

  return client;
}

function getTournamentId(operations: DatabaseWriteOperation[]): string {
  return String(operations.find((operation) => operation.table === "tournaments")?.rows?.[0]?.id);
}

function cloneState(state: Record<string, Record<string, unknown>[]>): Record<string, Record<string, unknown>[]> {
  return Object.fromEntries(Object.entries(state).map(([table, rows]) => [table, rows.map((row) => ({ ...row }))]));
}
