import { describe, expect, it } from "vitest";
import { saveMatchResult } from "../lib/live-scoring";
import { createStandardTournamentWritePlan, getOperationRows, mapLiveTournamentToPersistencePayload, mapTeamVsTeamTournamentToPersistencePayload } from "../lib/database";
import { createTeamVsTeamTournamentFromSetup, createTournamentFromSetup, type TeamVsTeamTournamentState } from "../lib/tournament-setup";

describe("database persistence mappers", () => {
  it("maps a standard live tournament without changing localStorage persistence", () => {
    const initialState = createTournamentFromSetup({
      name: "Fredag Americano",
      format: "Americano",
      playerText: Array.from({ length: 16 }, (_, index) => `Spiller ${index + 1}`).join("\n"),
      femalePlayerText: "",
      malePlayerText: "",
      courts: 4,
      rounds: 5,
      scoringMode: "Fast antal point",
      fixedScoreRule: "total",
      fixedScorePoints: 24,
      firstRoundOrder: "manual",
      rankingMode: "matchPointsFirst",
    });
    const firstMatch = initialState.rounds[0].matches[0];
    const state = saveMatchResult(initialState, { matchId: firstMatch.id, teamAPoints: 17, teamBPoints: 7 });

    const payload = mapLiveTournamentToPersistencePayload(state, { legacyLocalId: "fredag-americano" });

    expect(payload.tournament).toMatchObject({
      name: "Fredag Americano",
      format: "americano",
      status: "active",
      scoring_mode: "Fast antal point",
      fixed_score_rule: "total",
      fixed_score_points: 24,
      ranking_mode: "matchPointsFirst",
      court_count: 4,
      configured_rounds: 5,
      active_round_number: 1,
      legacy_local_id: "fredag-americano",
      privacy: "private",
    });
    expect(payload.players).toHaveLength(16);
    expect(payload.rounds).toHaveLength(5);
    expect(payload.matches).toHaveLength(20);
    expect(payload.fixedPairs).toEqual([]);
    expect(getOperationRows(createStandardTournamentWritePlan(payload, { createId: createDeterministicUuidFactory() }), "matches")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          legacy_match_id: firstMatch.id,
          score_version: 1,
        }),
      ]),
    );
    expect(payload.matchSides.find((side) => side.clientRef === `match-side:${firstMatch.id}:1`)?.score).toBe(17);
    expect(payload.matchSides.find((side) => side.clientRef === `match-side:${firstMatch.id}:2`)?.score).toBe(7);
    expect(payload.matchSidePlayers.filter((sidePlayer) => sidePlayer.matchSideRef === `match-side:${firstMatch.id}:1`).map((sidePlayer) => sidePlayer.tournamentPlayerRef)).toEqual(
      firstMatch.teamA.playerIds.map((playerId) => `player:${playerId}`),
    );
  });

  it("maps fixed partner tournaments as fixed pairs based on the entered player order", () => {
    const state = createTournamentFromSetup({
      name: "Fast Makker",
      format: "Fast Makker Mexicano",
      playerText: Array.from({ length: 16 }, (_, index) => `Spiller ${index + 1}`).join("\n"),
      femalePlayerText: "",
      malePlayerText: "",
      courts: 4,
      rounds: 5,
      scoringMode: "Fri scoring",
      firstRoundOrder: "manual",
      rankingMode: "matchPointsFirst",
    });

    const payload = mapLiveTournamentToPersistencePayload(state);

    expect(payload.tournament.format).toBe("fixed-partner-mexicano");
    expect(payload.tournament.privacy).toBe("private");
    expect(payload.fixedPairs).toHaveLength(8);
    expect(payload.fixedPairs[0]).toMatchObject({
      player1Ref: "player:p1",
      player2Ref: "player:p2",
      display_order: 1,
    });
    expect(payload.fixedPairs[7]).toMatchObject({
      player1Ref: "player:p15",
      player2Ref: "player:p16",
      display_order: 8,
    });
  });

  it("normalizes legacy tournament rows with missing privacy to the existing safe default", () => {
    const state = createTournamentFromSetup({
      name: "Legacy privacy",
      format: "Americano",
      playerText: Array.from({ length: 4 }, (_, index) => `Spiller ${index + 1}`).join("\n"),
      femalePlayerText: "",
      malePlayerText: "",
      courts: 1,
      rounds: 1,
      scoringMode: "Fri scoring",
      firstRoundOrder: "manual",
      rankingMode: "matchPointsFirst",
    });
    const payload = mapLiveTournamentToPersistencePayload(state);
    const legacyTournament = { ...payload.tournament } as Partial<typeof payload.tournament>;
    delete legacyTournament.privacy;
    const legacyPayload = { ...payload, tournament: legacyTournament };

    const writePlan = createStandardTournamentWritePlan(legacyPayload as ReturnType<typeof mapLiveTournamentToPersistencePayload>, {
      createId: createDeterministicUuidFactory(),
    });

    expect(getOperationRows(writePlan, "tournaments")[0]).toMatchObject({
      privacy: "private",
    });
  });

  it("preserves an explicit public result privacy value in the persistence payload", () => {
    const state = createTournamentFromSetup({
      name: "Public result privacy",
      format: "Americano",
      playerText: Array.from({ length: 4 }, (_, index) => `Spiller ${index + 1}`).join("\n"),
      femalePlayerText: "",
      malePlayerText: "",
      courts: 1,
      rounds: 1,
      scoringMode: "Fri scoring",
      firstRoundOrder: "manual",
      rankingMode: "matchPointsFirst",
    });

    const payload = mapLiveTournamentToPersistencePayload(state, { privacy: "public_result" });

    expect(payload.tournament.privacy).toBe("public_result");
  });

  it("keeps Mixed Americano gender and match-side structure in the payload", () => {
    const state = createTournamentFromSetup({
      name: "Mixed",
      format: "Mixed Americano",
      playerText: "",
      femalePlayerText: Array.from({ length: 8 }, (_, index) => `Kvinde ${index + 1}`).join("\n"),
      malePlayerText: Array.from({ length: 8 }, (_, index) => `Mand ${index + 1}`).join("\n"),
      courts: 4,
      rounds: 3,
      scoringMode: "Spil på tid",
      timeLimitMinutes: 15,
      firstRoundOrder: "manual",
      rankingMode: "partiPointsFirst",
    });

    const payload = mapLiveTournamentToPersistencePayload(state);

    expect(payload.tournament).toMatchObject({
      format: "mixed-americano",
      scoring_mode: "Spil på tid",
      time_limit_minutes: 15,
      privacy: "private",
    });
    expect(payload.players.filter((player) => player.gender === "female")).toHaveLength(8);
    expect(payload.players.filter((player) => player.gender === "male")).toHaveLength(8);
    expect(payload.matchSides).toHaveLength(payload.matches.length * 2);
    expect(payload.matchSidePlayers).toHaveLength(payload.matches.length * 4);
  });

  it("maps Team vs Team state to the dedicated Team vs Team payload tables", () => {
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
    const matchup = state.matchups[0];
    const populatedState: TeamVsTeamTournamentState = {
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

    const payload = mapTeamVsTeamTournamentToPersistencePayload(populatedState, { legacyLocalId: "klubkamp" });

    expect(payload.tournament).toMatchObject({
      name: "Klubkamp",
      format: "team-vs-team",
      status: "active",
      team_count: 2,
      players_per_team: 4,
      team_match_format: "oneSet",
      team_competition_mode: "knockout",
      team_draw_mode: "manual",
      active_matchup_legacy_id: "knockout-1-kamp-1",
      legacy_local_id: "klubkamp",
      privacy: "private",
    });
    expect(payload.teams).toHaveLength(2);
    expect(payload.players).toHaveLength(8);
    expect(payload.matchups[0]).toMatchObject({
      legacy_matchup_id: "knockout-1-kamp-1",
      teamARef: "team-vs-team-team:team-a",
      teamBRef: "team-vs-team-team:team-b",
      status: "completed",
    });
    expect(payload.lineups).toHaveLength(2);
    expect(payload.roundResults.map((result) => `${result.match_number}:${result.team_a_points}-${result.team_b_points}`)).toEqual(["1:6-2", "2:3-6"]);
  });
});

function createTeam(idPrefix: string, name: string) {
  return {
    id: `team-${idPrefix}`,
    name,
    captainPlayerId: `${idPrefix}1`,
    players: Array.from({ length: 4 }, (_, index) => ({ id: `${idPrefix}${index + 1}`, name: `${name} spiller ${index + 1}` })),
  };
}

function createDeterministicUuidFactory(): () => string {
  let nextId = 1;
  return () => `00000000-0000-4000-8000-${String(nextId++).padStart(12, "0")}`;
}
