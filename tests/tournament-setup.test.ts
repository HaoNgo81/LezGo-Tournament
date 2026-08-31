import { describe, expect, it, vi } from "vitest";
import { advanceTeamVsTeamKnockout, calculateTeamVsTeamPlacements, calculateTeamVsTeamStandings, canAdvanceTeamVsTeamKnockout, createPoolTournamentFromSetup, createTeamVsTeamTournamentFromSetup, finishTeamVsTeamTournament, createTournamentFromSetup, parsePlayers, saveTeamVsTeamTieBreak, type TeamVsTeamTournamentState } from "../lib/tournament-setup";
import type { TeamVsTeamRoundResult, TeamVsTeamTeam } from "../lib/team-vs-team";

const playerText = ["Anna", "Hassan", "Maja", "Noah", "Sofia", "Emil", "Clara", "Jonas"].join("\n");
const femalePlayerText = ["Anna", "Maja", "Sofia", "Clara"].join("\n");
const malePlayerText = ["Hassan", "Noah", "Emil", "Jonas"].join("\n");
const sixteenPlayerText = Array.from({ length: 16 }, (_, index) => `Spiller ${index + 1}`).join("\n");
const eightFemalePlayerText = Array.from({ length: 8 }, (_, index) => `Kvinde ${index + 1}`).join("\n");
const eightMalePlayerText = Array.from({ length: 8 }, (_, index) => `Mand ${index + 1}`).join("\n");

const teamA = createTeam("a", "Hold A");
const teamB = createTeam("b", "Hold B");
const teamC = createTeam("c", "Hold C");
const teamD = createTeam("d", "Hold D");

describe("tournament setup", () => {
  it.each([
    ["Americano", sixteenPlayerText, "", "", 15],
    ["Mexicano", sixteenPlayerText, "", "", 1],
    ["Mixed Americano", "", eightFemalePlayerText, eightMalePlayerText, 8],
    ["Fast Makker Americano", sixteenPlayerText, "", "", 7],
    ["Fast Makker Mexicano", sixteenPlayerText, "", "", 1],
  ] as const)("creates %s for 16 players or 8 pairs on 4 courts", (format, formatPlayerText, formatFemaleText, formatMaleText, expectedRounds) => {
    const tournament = createTournamentFromSetup({
      name: `${format} 16/4`,
      format,
      playerText: formatPlayerText,
      femalePlayerText: formatFemaleText,
      malePlayerText: formatMaleText,
      courts: 4,
      rounds: 5,
      scoringMode: "Fri scoring",
      firstRoundOrder: "manual",
      rankingMode: "matchPointsFirst",
    });

    expect(tournament.players).toHaveLength(16);
    if (format === "Americano") {
      expect(tournament.configuredRounds).toBeUndefined();
      expect(tournament.automaticCycle).toEqual({ type: "automatic-cycle", cycleLength: 15 });
    } else if (format === "Fast Makker Americano") {
      expect(tournament.configuredRounds).toBeUndefined();
      expect(tournament.automaticCycle).toEqual({ type: "automatic-cycle", cycleLength: 7 });
    } else if (format === "Mixed Americano") {
      expect(tournament.configuredRounds).toBeUndefined();
      expect(tournament.automaticCycle).toEqual({ type: "automatic-cycle", cycleLength: 8 });
    } else if (format === "Mexicano") {
      expect(tournament.configuredRounds).toBeUndefined();
      expect(tournament.automaticCycle).toBeUndefined();
    } else {
      expect(tournament.configuredRounds).toBe(5);
    }
    expect(tournament.courtCount).toBe(4);
    expect(tournament.rounds).toHaveLength(expectedRounds);
    expect(tournament.rounds.every((round) => round.matches.length === 4)).toBe(true);
  });

  it("parses one player per line", () => {
    expect(parsePlayers("Anna\nHassan\n\nMaja")).toEqual([
      { id: "p1", name: "Anna" },
      { id: "p2", name: "Hassan" },
      { id: "p3", name: "Maja" },
    ]);
  });

  it("creates a local Americano tournament state from setup input and stores scoring mode", () => {
    const tournament = createTournamentFromSetup({
      name: "Fredag Americano",
      format: "Americano",
      playerText,
      femalePlayerText: "",
      malePlayerText: "",
      courts: 2,
      rounds: 2,
      scoringMode: "Fri scoring",
      firstRoundOrder: "manual",
      rankingMode: "matchPointsFirst",
    });

    expect(tournament).toMatchObject({
      tournamentName: "Fredag Americano",
      format: "americano",
      status: "active",
      activeRoundNumber: 1,
      scoringMode: "Fri scoring",
      rankingMode: "matchPointsFirst",
    });
    expect(tournament.players).toHaveLength(8);
    expect(tournament.configuredRounds).toBeUndefined();
    expect(tournament.automaticCycle).toEqual({ type: "automatic-cycle", cycleLength: 7 });
    expect(tournament.rounds).toHaveLength(7);
  });

  it("stores selected time limit for timed scoring", () => {
    const tournament = createTournamentFromSetup({
      name: "Tid Americano",
      format: "Americano",
      playerText,
      femalePlayerText: "",
      malePlayerText: "",
      courts: 2,
      rounds: 2,
      scoringMode: "Spil på tid",
      timeLimitMinutes: 12,
      firstRoundOrder: "manual",
      rankingMode: "matchPointsFirst",
    });

    expect(tournament).toMatchObject({ scoringMode: "Spil på tid", timeLimitMinutes: 12 });
  });

  it("keeps timed Americano free of fixed-score settings", () => {
    const tournament = createTournamentFromSetup({
      name: "Tid uden fast score",
      format: "Americano",
      playerText,
      femalePlayerText: "",
      malePlayerText: "",
      courts: 2,
      rounds: 2,
      scoringMode: "Spil på tid",
      fixedScoreRule: "total",
      fixedScorePoints: 24,
      timeLimitMinutes: 12,
      firstRoundOrder: "manual",
      rankingMode: "matchPointsFirst",
    });

    expect(tournament.scoringMode).toBe("Spil på tid");
    expect(tournament.fixedScoreRule).toBeUndefined();
    expect(tournament.fixedScorePoints).toBeUndefined();
  });

  it("accepts timed scoring with valid duration while ignoring irrelevant fixed score points", () => {
    const tournament = createTournamentFromSetup({
      name: "Tid uden scorekrav",
      format: "Mexicano",
      playerText: sixteenPlayerText,
      femalePlayerText: "",
      malePlayerText: "",
      courts: 4,
      rounds: 20,
      scoringMode: "Spil på tid",
      fixedScoreRule: "target",
      fixedScorePoints: 0,
      timeLimitMinutes: 15,
      firstRoundOrder: "manual",
      rankingMode: "matchPointsFirst",
    });

    expect(tournament).toMatchObject({
      scoringMode: "Spil på tid",
      timeLimitMinutes: 15,
      fixedScoreRule: undefined,
      fixedScorePoints: undefined,
    });
  });

  it("creates new Mexicano tournaments as open-ended with exact court capacity", () => {
    const tournament = createTournamentFromSetup({
      name: "Åben Mexicano",
      format: "Mexicano",
      playerText: playerText,
      femalePlayerText: "",
      malePlayerText: "",
      courts: 2,
      rounds: 20,
      scoringMode: "Fri scoring",
      firstRoundOrder: "manual",
      rankingMode: "matchPointsFirst",
    });

    expect(tournament.format).toBe("mexicano");
    expect(tournament.configuredRounds).toBeUndefined();
    expect(tournament.automaticCycle).toBeUndefined();
    expect(tournament.rounds).toHaveLength(1);
    expect(tournament.rounds[0].matches).toHaveLength(2);
    expect(tournament.rounds[0].byePlayerIds).toBeUndefined();
  });

  it("rejects new Mexicano tournaments unless players fill the selected courts exactly", () => {
    expect(() => createTournamentFromSetup({
      name: "For få spillere",
      format: "Mexicano",
      playerText: playerText,
      femalePlayerText: "",
      malePlayerText: "",
      courts: 3,
      rounds: 5,
      scoringMode: "Fri scoring",
      firstRoundOrder: "manual",
      rankingMode: "matchPointsFirst",
    })).toThrow("Mexicano kræver præcis 4 spillere pr. bane.");
  });

  it("rejects timed scoring without a valid duration", () => {
    expect(() => createTournamentFromSetup({
      name: "Tid uden minutter",
      format: "Americano",
      playerText,
      femalePlayerText: "",
      malePlayerText: "",
      courts: 2,
      rounds: 2,
      scoringMode: "Spil på tid",
      timeLimitMinutes: 0,
      firstRoundOrder: "manual",
      rankingMode: "matchPointsFirst",
    })).toThrow("Vælg spilletid for Spil på tid.");
  });

  it("rejects fixed scoring without a valid score-point count", () => {
    expect(() => createTournamentFromSetup({
      name: "Fast uden point",
      format: "Americano",
      playerText,
      femalePlayerText: "",
      malePlayerText: "",
      courts: 2,
      rounds: 2,
      scoringMode: "Fast antal point",
      fixedScoreRule: "target",
      fixedScorePoints: 0,
      firstRoundOrder: "manual",
      rankingMode: "matchPointsFirst",
    })).toThrow("Vælg et fast antal scorepoint på mindst 1.");
  });

  it("stores target score settings for fixed scoring", () => {
    const tournament = createTournamentFromSetup({
      name: "Fast Americano",
      format: "Americano",
      playerText,
      femalePlayerText: "",
      malePlayerText: "",
      courts: 2,
      rounds: 2,
      scoringMode: "Fast antal point",
      fixedScoreRule: "target",
      fixedScorePoints: 21,
      firstRoundOrder: "manual",
      rankingMode: "matchPointsFirst",
    });

    expect(tournament).toMatchObject({ scoringMode: "Fast antal point", fixedScoreRule: "target", fixedScorePoints: 21 });
  });

  it("stores total score settings for Team vs. Team", () => {
    const tournament = createTeamVsTeamTournamentFromSetup({
      name: "Fast klubkamp",
      scoringMode: "Fast antal point",
      fixedScoreRule: "total",
      fixedScorePoints: 21,
      teamCount: 2,
      playersPerTeam: 4,
      matchFormat: "oneSet",
      teams: [teamA, teamB],
    });

    expect(tournament).toMatchObject({ scoringMode: "Fast antal point", fixedScoreRule: "total", fixedScorePoints: 21 });
  });

  it("creates fixed partner rounds from adjacent player pairs", () => {
    const tournament = createTournamentFromSetup({
      name: "Fast Makker",
      format: "Fast Makker Americano",
      playerText,
      femalePlayerText: "",
      malePlayerText: "",
      courts: 2,
      rounds: 2,
      scoringMode: "Fri scoring",
      firstRoundOrder: "manual",
      rankingMode: "matchPointsFirst",
    });

    expect(tournament.rounds[0].matches).toHaveLength(2);
    expect(tournament.rounds[0].matches[0].teamA.playerIds).toEqual(["p1", "p2"]);
  });

  it("rejects more courts than fixed partner pairs can fill", () => {
    expect(() => createTournamentFromSetup({
      name: "For mange baner",
      format: "Fast Makker Mexicano",
      playerText,
      femalePlayerText: "",
      malePlayerText: "",
      courts: 3,
      rounds: 2,
      scoringMode: "Fri scoring",
      firstRoundOrder: "manual",
      rankingMode: "matchPointsFirst",
    })).toThrow("4 par kan højst fylde 2 baner");
  });

  it("creates Mixed Americano from separate women and men fields", () => {
    const tournament = createTournamentFromSetup({
      name: "Mixed fredag",
      format: "Mixed Americano",
      playerText: "",
      femalePlayerText,
      malePlayerText,
      courts: 2,
      rounds: 2,
      scoringMode: "Fri scoring",
      firstRoundOrder: "manual",
      rankingMode: "partiPointsFirst",
    });

    expect(tournament.format).toBe("mixed-americano");
    expect(tournament.players.filter((player) => player.gender === "female")).toHaveLength(4);
    expect(tournament.players.filter((player) => player.gender === "male")).toHaveLength(4);
    expect(tournament.configuredRounds).toBeUndefined();
    expect(tournament.automaticCycle).toEqual({ type: "automatic-cycle", cycleLength: 4 });
    expect(tournament.rankingMode).toBe("partiPointsFirst");
  });

  it("creates a pool-play live state from setup input", () => {
    const tournament = createPoolTournamentFromSetup({
      name: "Lørdag Puljespil",
      participantType: "pair",
      participantText: ["Par A", "Par B", "Par C", "Par D", "Par E", "Par F"].join("\n"),
      poolCount: 2,
      participantsPerPool: 3,
      advancementMode: "crossMatches",
      unmatchedResolution: "bye",
      scoringMode: "Fast antal point",
      fixedScoreRule: "target",
      fixedScorePoints: 21,
      rankingMode: "matchPointsFirst",
    });

    expect(tournament).toMatchObject({
      tournamentName: "Lørdag Puljespil",
      format: "pool-play",
      status: "active",
      rounds: [],
      scoringMode: "Fast antal point",
      fixedScoreRule: "target",
      fixedScorePoints: 21,
      rankingMode: "matchPointsFirst",
    });
    expect(tournament.poolPlay).toMatchObject({
      phase: "initial",
      advancementMode: "crossMatches",
      unmatchedResolution: "bye",
    });
    expect(tournament.poolPlay?.initialStage.pools).toHaveLength(2);
    expect(tournament.poolPlay?.initialStage.pools[0].encounters).toHaveLength(3);
  });

  it("creates pool-play team setup with approved submatch count", () => {
    const tournament = createPoolTournamentFromSetup({
      name: "Holdpuljer",
      participantType: "team",
      participantText: ["Hold A", "Hold B", "Hold C", "Hold D"].join("\n"),
      poolCount: 2,
      participantsPerPool: 2,
      advancementMode: "placementPools",
      unmatchedResolution: "walkover",
      scoringMode: "Fri scoring",
      rankingMode: "partiPointsFirst",
      teamPlayersPerTeam: 6,
    });

    expect(tournament.poolPlay?.initialStage.participantType).toBe("team");
    expect(tournament.poolPlay?.initialStage.pools.every((pool) => (
      pool.encounters.length === 1 && pool.encounters[0].matchesPerTeam === 3
    ))).toBe(true);
    expect(tournament.poolPlay?.unmatchedResolution).toBe("walkover");
  });

  it("validates pool-play participant count through the pool engine", () => {
    expect(() => createPoolTournamentFromSetup({
      name: "For få par",
      participantType: "pair",
      participantText: ["Par A", "Par B", "Par C"].join("\n"),
      poolCount: 2,
      participantsPerPool: 2,
      advancementMode: "crossMatches",
      unmatchedResolution: "bye",
      scoringMode: "Fri scoring",
      rankingMode: "matchPointsFirst",
    })).toThrow("Der skal være præcis 4 deltagere.");
  });

  it("creates Team vs. Team setup with free scoring", () => {
    const tournament = createTeamVsTeamTournamentFromSetup({
      name: "Klubkamp",
      scoringMode: "Fri scoring",
      teamCount: 2,
      playersPerTeam: 4,
      matchFormat: "oneSet",
      teams: [teamA, teamB],
    });

    expect(tournament).toMatchObject({
      name: "Klubkamp",
      status: "setup",
      scoringMode: "Fri scoring",
      teamCount: 2,
      playersPerTeam: 4,
      matchFormat: "oneSet",
      maxRounds: 3,
    });
    expect(tournament.teams).toHaveLength(2);
    expect(tournament.activeMatchupId).toBe("knockout-1-kamp-1");
    expect(tournament.matchups[0]).toMatchObject({ id: "knockout-1-kamp-1", teamAId: "team-a", teamBId: "team-b", lineups: [], roundResults: [] });
  });

  it("creates one pool match for every unique team pair from 2 to 8 teams", () => {
    for (let count = 2; count <= 8; count += 1) {
      const teams = Array.from({ length: count }, (_, index) => createTeam(`pool-${index + 1}`, `Puljehold ${index + 1}`));
      const tournament = createTeamVsTeamTournamentFromSetup({
        name: `${count} hold pulje`,
        scoringMode: "Fri scoring",
        teamCount: count as 2 | 3 | 4 | 5 | 6 | 7 | 8,
        competitionMode: "pool",
        drawMode: "manual",
        playersPerTeam: 4,
        matchFormat: "oneSet",
        teams,
      });
      const pairKeys = tournament.matchups.map((match) => [match.teamAId, match.teamBId].sort().join("-"));

      expect(tournament.competitionMode).toBe("pool");
      expect(tournament.matchups).toHaveLength((count * (count - 1)) / 2);
      expect(new Set(pairKeys).size).toBe(pairKeys.length);
      expect(tournament.activeMatchupId).toBe("puljekamp-1");
      expect(calculateTeamVsTeamStandings(tournament)).toHaveLength(count);
    }
  });

  it("creates Team vs. Team setup with 6 players and 2 rounds", () => {
    const tournament = createTeamVsTeamTournamentFromSetup({
      name: "Klubkamp 6",
      scoringMode: "Fri scoring",
      teamCount: 2,
      playersPerTeam: 6,
      matchFormat: "bestOfThree",
      teams: [createTeam("a", "Hold A", 6), createTeam("b", "Hold B", 6)],
    });

    expect(tournament.playersPerTeam).toBe(6);
    expect(tournament.matchFormat).toBe("bestOfThree");
    expect(tournament.maxRounds).toBe(2);
  });

  it("uses manual team order for knockout pairings", () => {
    const tournament = createTeamVsTeamTournamentFromSetup({
      name: "Klubfinaler",
      scoringMode: "Fri scoring",
      teamCount: 4,
      competitionMode: "knockout",
      drawMode: "manual",
      playersPerTeam: 4,
      matchFormat: "oneSet",
      teams: [teamA, teamB, teamC, teamD],
    });

    expect(tournament.knockoutGroups?.[0].teamIds).toEqual(["team-a", "team-b", "team-c", "team-d"]);
    expect(tournament.matchups).toMatchObject([
      { id: "knockout-1-kamp-1", teamAId: "team-a", teamBId: "team-b" },
      { id: "knockout-1-kamp-2", teamAId: "team-c", teamBId: "team-d" },
    ]);
  });

  it("randomizes knockout distribution when selected", () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);

    try {
      const teams = [teamA, teamB, teamC, teamD, createTeam("e", "Hold E")];
      const tournament = createTeamVsTeamTournamentFromSetup({
        name: "Tilfældig knockout",
        scoringMode: "Fri scoring",
        teamCount: 5,
        competitionMode: "knockout",
        drawMode: "random",
        playersPerTeam: 4,
        matchFormat: "oneSet",
        teams,
      });

      expect(tournament.knockoutGroups?.[0].teamIds).not.toEqual(teams.map((team) => team.id));
    } finally {
      randomSpy.mockRestore();
    }
  });

  it("decides every placement in knockout tournaments with 2 to 8 teams", () => {
    for (let count = 2; count <= 8; count += 1) {
      const teams = Array.from({ length: count }, (_, index) => createTeam(`ko-${index + 1}`, `Knockouthold ${index + 1}`));
      const tournament = createTeamVsTeamTournamentFromSetup({
        name: `${count} hold knockout`,
        scoringMode: "Fri scoring",
        teamCount: count as 2 | 3 | 4 | 5 | 6 | 7 | 8,
        competitionMode: "knockout",
        drawMode: "manual",
        playersPerTeam: 4,
        matchFormat: "oneSet",
        teams,
      });
      const completed = completeKnockoutWithTeamAWins(tournament);
      const placements = calculateTeamVsTeamPlacements(completed);

      expect(placements.map((placement) => placement.rank)).toEqual(Array.from({ length: count }, (_, index) => index + 1));
      expect(new Set(placements.map((placement) => placement.teamId)).size).toBe(count);
    }
  });

  it("finishes Team vs. Team and keeps a complete team standing", () => {
    const tournament = createTeamVsTeamTournamentFromSetup({
      name: "Klubkamp",
      scoringMode: "Fri scoring",
      teamCount: 2,
      playersPerTeam: 4,
      matchFormat: "oneSet",
      teams: [teamA, teamB],
    });
    const decidedTournament = {
      ...tournament,
      matchups: [{ ...tournament.matchups[0], roundResults: createStraightTeamAWinResults() }],
    };

    const finished = finishTeamVsTeamTournament(decidedTournament, "2026-08-05T18:30:00.000Z");
    const standings = calculateTeamVsTeamStandings(finished);

    expect(finished).toMatchObject({ status: "finished", finishedAt: "2026-08-05T18:30:00.000Z" });
    expect(standings).toEqual([
      { rank: 1, teamId: "team-a", teamName: "Hold A", played: 1, won: 1, lost: 0, matchWins: 6, matchLosses: 0 },
      { rank: 2, teamId: "team-b", teamName: "Hold B", played: 1, won: 0, lost: 1, matchWins: 0, matchLosses: 6 },
    ]);
  });
  it("saves Team vs. Team Match Tie-break on the active holdkamp", () => {
    const tournament = createTeamVsTeamTournamentFromSetup({
      name: "Klubkamp",
      scoringMode: "Fri scoring",
      teamCount: 2,
      playersPerTeam: 4,
      matchFormat: "oneSet",
      teams: [teamA, teamB],
    });
    const match = tournament.matchups[0];
    const stateWithTiedMatch = {
      ...tournament,
      matchups: [
        {
          ...match,
          roundResults: [
            round(1, 6, 4, 3, 6),
            round(2, 7, 5, 4, 6),
            round(3, 7, 6, 2, 6),
          ],
        },
      ],
    };

    const updatedState = saveTeamVsTeamTieBreak(
      stateWithTiedMatch,
      { id: match.id, teamA, teamB },
      { teamAPlayerIds: ["a1", "a2"], teamBPlayerIds: ["b1", "b2"], result: { teamAPoints: 11, teamBPoints: 9 } },
    );

    expect(updatedState.matchups[0].tieBreak).toMatchObject({ result: { teamAPoints: 11, teamBPoints: 9 } });
  });

  it("rejects duplicate player names", () => {
    expect(() => parsePlayers("Anna\nanna")).toThrow("Spillernavn skal være unikt: anna");
  });

});

function createTeam(idPrefix: string, name: string, count = 4): TeamVsTeamTeam {
  return {
    id: `team-${idPrefix}`,
    name,
    captainPlayerId: `${idPrefix}1`,
    players: Array.from({ length: count }, (_, index) => ({ id: `${idPrefix}${index + 1}`, name: `${name} spiller ${index + 1}` })),
  };
}

function round(roundNumber: 1 | 2 | 3, match1TeamAPoints: number, match1TeamBPoints: number, match2TeamAPoints: number, match2TeamBPoints: number): TeamVsTeamRoundResult {
  return {
    roundNumber,
    match1: { sets: [{ teamAPoints: match1TeamAPoints, teamBPoints: match1TeamBPoints }] },
    match2: { sets: [{ teamAPoints: match2TeamAPoints, teamBPoints: match2TeamBPoints }] },
  };
}

function createStraightTeamAWinResults(): TeamVsTeamRoundResult[] {
  return [
    round(1, 6, 4, 6, 3),
    round(2, 6, 2, 6, 1),
    round(3, 6, 5, 6, 4),
  ];
}

function completeKnockoutWithTeamAWins(initialState: TeamVsTeamTournamentState): TeamVsTeamTournamentState {
  let state = initialState;

  for (let step = 0; step < 10; step += 1) {
    if (calculateTeamVsTeamPlacements(state).length === state.teamCount) {
      return state;
    }

    const activeMatchIds = new Set(
      state.knockoutGroups
        ?.filter((group) => group.status === "active")
        .flatMap((group) => group.matchIds) ?? [],
    );

    state = {
      ...state,
      matchups: state.matchups.map((match) => (
        activeMatchIds.has(match.id) ? { ...match, roundResults: createStraightTeamAWinResults() } : match
      )),
    };

    expect(canAdvanceTeamVsTeamKnockout(state)).toBe(true);
    state = advanceTeamVsTeamKnockout(state);
  }

  throw new Error("Knockoutturneringen blev ikke færdig inden for 10 trin.");
}
