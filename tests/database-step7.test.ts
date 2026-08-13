import { describe, expect, it } from "vitest";
import { saveMatchResult } from "../lib/live-scoring";
import {
  createStandardTournamentWritePlan,
  createTeamVsTeamTournamentWritePlan,
  mapLiveTournamentToPersistencePayload,
  mapPersistenceRowsToLiveTournamentState,
  mapTeamVsTeamTournamentToPersistencePayload,
  resolveLocalStoragePrimaryConflict,
  type MatchReadRow,
  type MatchSidePlayerReadRow,
  type MatchSideReadRow,
  type RoundReadRow,
  type TournamentPlayerReadRow,
  type TournamentReadRow,
} from "../lib/database";
import { assertServerSideSupabaseAccess } from "../lib/supabase/server";
import { createTeamVsTeamTournamentFromSetup, createTournamentFromSetup, type TeamVsTeamTournamentState } from "../lib/tournament-setup";

describe("STEP 7 database integration boundary", () => {
  it("creates a transactional UUID write plan for standard tournaments", () => {
    const state = createTournamentFromSetup({
      name: "Fast Makker",
      format: "Fast Makker Americano",
      playerText: Array.from({ length: 8 }, (_, index) => `Spiller ${index + 1}`).join("\n"),
      femalePlayerText: "",
      malePlayerText: "",
      courts: 2,
      rounds: 2,
      scoringMode: "Fast antal point",
      fixedScoreRule: "total",
      fixedScorePoints: 24,
      firstRoundOrder: "manual",
      rankingMode: "matchPointsFirst",
    });
    const payload = mapLiveTournamentToPersistencePayload(state);
    const plan = createStandardTournamentWritePlan(payload, { createId: createDeterministicIdFactory() });

    expect(plan.transactional).toBe(true);
    expect(plan.operations.map((operation) => `${operation.kind}:${operation.table}`)).toEqual([
      "insert:tournaments",
      "insert:tournament_players",
      "insert:fixed_pairs",
      "insert:rounds",
      "insert:matches",
      "insert:match_sides",
      "insert:match_side_players",
    ]);
    expect(plan.operations[0].rows?.[0]).toMatchObject({ id: "uuid-1", active_matchup_id: null });
    expect(plan.operations.find((operation) => operation.table === "fixed_pairs")?.rows?.[0]).toMatchObject({
      tournament_id: "uuid-1",
      player_1_id: plan.idMap["player:p1"],
      player_2_id: plan.idMap["player:p2"],
    });
  });

  it("creates two-phase UUID updates for Team vs Team circular references", () => {
    const state: TeamVsTeamTournamentState = {
      ...createTeamVsTeamTournamentFromSetup({
        name: "Klubkamp",
        scoringMode: "Fri scoring",
        teamCount: 2,
        competitionMode: "knockout",
        drawMode: "manual",
        playersPerTeam: 4,
        matchFormat: "oneSet",
        teams: [createTeam("a", "Hold A"), createTeam("b", "Hold B")],
      }),
      status: "active",
    };
    const payload = mapTeamVsTeamTournamentToPersistencePayload(state);
    const plan = createTeamVsTeamTournamentWritePlan(payload, { createId: createDeterministicIdFactory() });
    const captainUpdates = plan.operations.filter((operation) => operation.kind === "update" && operation.table === "team_vs_team_teams");
    const activeMatchupUpdate = plan.operations.find((operation) => operation.kind === "update" && operation.table === "tournaments");

    expect(plan.transactional).toBe(true);
    expect(plan.operations[0].rows?.[0]).toMatchObject({ id: "uuid-1", active_matchup_id: null });
    expect(captainUpdates).toHaveLength(2);
    expect(activeMatchupUpdate?.values?.active_matchup_id).toBe(plan.idMap["team-vs-team-matchup:knockout-1-kamp-1"]);
  });

  it("maps Supabase standard rows back into the existing live tournament state shape", () => {
    const initialState = createTournamentFromSetup({
      name: "Readback Americano",
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
    const match = initialState.rounds[0].matches[0];
    const state = saveMatchResult(initialState, { matchId: match.id, teamAPoints: 17, teamBPoints: 7 });
    const payload = mapLiveTournamentToPersistencePayload(state);
    const plan = createStandardTournamentWritePlan(payload, { createId: createDeterministicIdFactory() });
    const readModel = toStandardReadModel(plan);

    const readbackState = mapPersistenceRowsToLiveTournamentState(readModel);

    expect(readbackState).toMatchObject({
      tournamentName: "Readback Americano",
      format: "americano",
      status: "active",
      activeRoundNumber: 1,
      scoringMode: "Fast antal point",
      fixedScoreRule: "total",
      fixedScorePoints: 24,
    });
    expect(readbackState.players.map((player) => player.id)).toEqual(["p1", "p2", "p3", "p4"]);
    expect(readbackState.rounds[0].matches[0]).toEqual(match);
    expect(readbackState.results).toEqual([{ matchId: match.id, teamAPoints: 17, teamBPoints: 7 }]);
  });

  it("keeps localStorage primary in conflict resolution while migration is not complete", () => {
    expect(resolveLocalStoragePrimaryConflict({ hasLocalState: true, hasRemoteState: true, localHasUnsyncedChanges: true })).toMatchObject({
      decision: "use-local",
    });
    expect(resolveLocalStoragePrimaryConflict({ hasLocalState: true, hasRemoteState: true, localUpdatedAt: "2026-08-13T10:00:00.000Z", remoteUpdatedAt: "2026-08-13T09:00:00.000Z" })).toMatchObject({
      decision: "use-local",
    });
    expect(resolveLocalStoragePrimaryConflict({ hasLocalState: true, hasRemoteState: true })).toMatchObject({
      decision: "manual-review",
    });
  });

  it("blocks Supabase service credential access from a browser-like runtime", () => {
    const originalWindow = globalThis.window;

    Object.defineProperty(globalThis, "window", { value: {}, configurable: true });

    try {
      expect(() => assertServerSideSupabaseAccess()).toThrow("server-side");
    } finally {
      Object.defineProperty(globalThis, "window", { value: originalWindow, configurable: true });
    }
  });
});

function createDeterministicIdFactory(): () => string {
  let nextId = 1;
  return () => `uuid-${nextId++}`;
}

function createTeam(idPrefix: string, name: string) {
  return {
    id: `team-${idPrefix}`,
    name,
    captainPlayerId: `${idPrefix}1`,
    players: Array.from({ length: 4 }, (_, index) => ({ id: `${idPrefix}${index + 1}`, name: `${name} spiller ${index + 1}` })),
  };
}

function toStandardReadModel(plan: ReturnType<typeof createStandardTournamentWritePlan>) {
  const getRows = (table: string) => plan.operations.find((operation) => operation.kind === "insert" && operation.table === table)?.rows ?? [];

  return {
    tournament: getRows("tournaments")[0] as unknown as TournamentReadRow,
    players: getRows("tournament_players") as unknown as TournamentPlayerReadRow[],
    rounds: getRows("rounds") as unknown as RoundReadRow[],
    matches: getRows("matches") as unknown as MatchReadRow[],
    matchSides: getRows("match_sides") as unknown as MatchSideReadRow[],
    matchSidePlayers: getRows("match_side_players") as unknown as MatchSidePlayerReadRow[],
  };
}
