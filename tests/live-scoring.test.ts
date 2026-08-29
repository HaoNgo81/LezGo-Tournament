import { describe, expect, it } from "vitest";
import { createTournamentRounds } from "../lib/tournament-engine";
import {
  calculateLiveStandings,
  canGoToNextRound,
  createMockLiveTournamentState,
  finishTournament,
  getLiveMatches,
  getRoundProgress,
  goToNextRound,
  goToPreviousRound,
  resetRoundTimer,
  saveMatchResult,
  setLiveRankingMode,
  startMatch,
  startRoundTimer,
  stopRoundTimer,
  tickRoundTimer,
  type LiveTournamentState,
} from "../lib/live-scoring";
import { createTournamentFromSetup, type ScoringMode, type TournamentSetupFormat } from "../lib/tournament-setup";
import { calculateFixedTotalScore } from "../lib/tournament-setup/scoring";

const sixteenPlayerText = Array.from({ length: 16 }, (_, index) => `Spiller ${index + 1}`).join("\n");
const eightFemalePlayerText = Array.from({ length: 8 }, (_, index) => `Kvinde ${index + 1}`).join("\n");
const eightMalePlayerText = Array.from({ length: 8 }, (_, index) => `Mand ${index + 1}`).join("\n");
const sixteenPlayers = Array.from({ length: 16 }, (_, index) => ({ id: `p${index + 1}`, name: `Spiller ${index + 1}` }));

describe("live scoring state", () => {
  it.each([
    [0, 24],
    [1, 23],
    [6, 18],
    [10, 14],
    [12, 12],
    [13, 11],
    [17, 7],
    [18, 6],
    [23, 1],
    [24, 0],
  ])("calculates fixed total 24 score %s-%s", (enteredScore, remainingScore) => {
    expect(calculateFixedTotalScore(24, enteredScore)).toEqual({
      teamAPoints: enteredScore,
      teamBPoints: remainingScore,
    });
  });

  it.each([-1, 25, 100, 12.5])("rejects invalid fixed total input %s", (enteredScore) => {
    expect(() => calculateFixedTotalScore(24, enteredScore)).toThrow();
  });

  it.each([
    ["Americano", sixteenPlayerText, "", "", 16],
    ["Mexicano", sixteenPlayerText, "", "", 16],
    ["Mixed Americano", "", eightFemalePlayerText, eightMalePlayerText, 16],
    ["Fast Makker Americano", sixteenPlayerText, "", "", 8],
    ["Fast Makker Mexicano", sixteenPlayerText, "", "", 8],
  ] as const)("scores a full 4-court live round for %s", (format, playerText, femalePlayerText, malePlayerText, expectedStandingRows) => {
    const state = createStandardTournament(format, playerText, femalePlayerText, malePlayerText);
    const scoredState = scoreActiveRound(state);

    expect(getRoundProgress(scoredState)).toMatchObject({
      completedMatches: 4,
      totalMatches: 4,
      isComplete: true,
    });
    expect(calculateLiveStandings(scoredState)).toHaveLength(expectedStandingRows);
  });

  it("plays five 4-court Mexicano rounds from live standings", () => {
    const initialState = createStandardTournament("Mexicano", sixteenPlayerText, "", "");
    const completedState = scoreAllConfiguredRounds(initialState);

    expect(completedState.configuredRounds).toBe(5);
    expect(completedState.rounds).toHaveLength(5);
    expect(completedState.activeRoundNumber).toBe(5);
    expect(completedState.results).toHaveLength(20);
    expect(completedState.rounds.every((round) => round.matches.length === 4)).toBe(true);
    expect(getRoundProgress(completedState)).toMatchObject({ completedMatches: 4, totalMatches: 4, isComplete: true });
  });

  it("plays five 4-court Fast Makker Mexicano rounds from pair standings", () => {
    const initialState = createStandardTournament("Fast Makker Mexicano", sixteenPlayerText, "", "");
    const completedState = scoreAllConfiguredRounds(initialState);

    expect(completedState.configuredRounds).toBe(5);
    expect(completedState.rounds).toHaveLength(5);
    expect(completedState.activeRoundNumber).toBe(5);
    expect(completedState.results).toHaveLength(20);
    expect(completedState.rounds.every((round) => round.matches.length === 4)).toBe(true);
    expect(calculateLiveStandings(completedState)).toHaveLength(8);
    expect(getRoundProgress(completedState)).toMatchObject({ completedMatches: 4, totalMatches: 4, isComplete: true });
  });

  it.each([
    ["Fri scoring", undefined, undefined, [[17, 13], [10, 10], [21, 18], [8, 7]]],
    ["Fast antal point", "total", 24, [[18, 6], [13, 11], [12, 12], [0, 24]]],
    ["Spil på tid", undefined, undefined, [[11, 7], [8, 8], [15, 13], [6, 4]]],
  ] as const)("completes Americano 16 players, 4 courts, automatic cycle with %s", (scoringMode, fixedScoreRule, fixedScorePoints, roundScores) => {
    const initialState = createAmericanoTournament(scoringMode, fixedScoreRule, fixedScorePoints);
    const completedState = scoreAllConfiguredRounds(initialState, roundScores);
    const playCounts = new Map<string, number>();

    for (const round of completedState.rounds) {
      const roundPlayerIds = round.matches.flatMap((match) => [...match.teamA.playerIds, ...match.teamB.playerIds]);
      const uniqueRoundPlayerIds = new Set(roundPlayerIds);

      expect(round.matches).toHaveLength(4);
      expect(roundPlayerIds).toHaveLength(16);
      expect(uniqueRoundPlayerIds.size).toBe(16);
      expect([...uniqueRoundPlayerIds].sort()).toEqual(completedState.players.map((player) => player.id).sort());

      for (const match of round.matches) {
        expect(match.teamA.playerIds).toHaveLength(2);
        expect(match.teamB.playerIds).toHaveLength(2);
        expect(new Set([...match.teamA.playerIds, ...match.teamB.playerIds]).size).toBe(4);
      }

      for (const playerId of roundPlayerIds) {
        playCounts.set(playerId, (playCounts.get(playerId) ?? 0) + 1);
      }
    }

    expect(completedState.configuredRounds).toBeUndefined();
    expect(completedState.automaticCycle).toEqual({ type: "automatic-cycle", cycleLength: 15 });
    expect(completedState.rounds).toHaveLength(15);
    expect(completedState.results).toHaveLength(60);
    expect([...playCounts.values()]).toEqual(Array(16).fill(15));
    expect(calculateLiveStandings(completedState)).toHaveLength(16);
  });

  it("generates 20 four-court Americano rounds across partner cycles", () => {
    const state = {
      players: sixteenPlayers,
      rounds: createTournamentRounds({
        format: "americano",
        players: sixteenPlayers,
        rounds: 20,
        courts: 4,
        firstRoundOrder: "manual",
      }),
    };
    const partnerCounts = new Map<string, number>();

    for (const round of state.rounds) {
      const roundPlayerIds = round.matches.flatMap((match) => [...match.teamA.playerIds, ...match.teamB.playerIds]);
      expect(round.matches).toHaveLength(4);
      expect(roundPlayerIds).toHaveLength(16);
      expect(new Set(roundPlayerIds).size).toBe(16);

      for (const match of round.matches) {
        for (const pair of [match.teamA.playerIds, match.teamB.playerIds]) {
          const key = [...pair].sort().join("-");
          partnerCounts.set(key, (partnerCounts.get(key) ?? 0) + 1);
        }
      }
    }

    expect(state.rounds).toHaveLength(20);
    expect(partnerCounts.size).toBe(120);
    expect(Math.min(...partnerCounts.values())).toBeGreaterThanOrEqual(1);
    expect(Math.max(...partnerCounts.values())).toBeLessThanOrEqual(2);
  });

  it("generates fixed partner Americano opponent cycles for 8 pairs", () => {
    const state = createTournamentFromSetup({
      name: "Fast Makker Americano cycle test",
      format: "Fast Makker Americano",
      playerText: sixteenPlayerText,
      femalePlayerText: "",
      malePlayerText: "",
      courts: 4,
      rounds: 16,
      scoringMode: "Spil på tid",
      timeLimitMinutes: 1,
      firstRoundOrder: "manual",
      rankingMode: "matchPointsFirst",
    });
    const firstCycleCounts = countFixedPartnerOpponentPairs(state.rounds.slice(0, 7));
    const secondCycleCounts = countFixedPartnerOpponentPairs(state.rounds.slice(7, 14));
    const firstTwoCycleCounts = countFixedPartnerOpponentPairs(state.rounds.slice(0, 14));
    const firstMatchupKey = [...state.rounds[0].matches[0].teamA.playerIds, ...state.rounds[0].matches[0].teamB.playerIds].sort().join("-");
    const thirdCycleCounts = countFixedPartnerOpponentPairs(state.rounds.slice(14, 16));

    expect(state.rounds).toHaveLength(16);
    expect(firstCycleCounts.size).toBe(28);
    expect([...firstCycleCounts.values()]).toEqual(Array(28).fill(1));
    expect(secondCycleCounts.size).toBe(28);
    expect([...secondCycleCounts.values()]).toEqual(Array(28).fill(1));
    expect(firstTwoCycleCounts.size).toBe(28);
    expect([...firstTwoCycleCounts.values()]).toEqual(Array(28).fill(2));
    expect(thirdCycleCounts.get(firstMatchupKey)).toBe(1);
  });

  it("balances Americano courts for 8 players on 2 courts", () => {
    const rounds = createTournamentRounds({
      format: "americano",
      players: Array.from({ length: 8 }, (_, index) => ({ id: `p${index + 1}`, name: `Spiller ${index + 1}` })),
      courts: 2,
      rounds: 12,
      firstRoundOrder: "manual",
    });
    const histories = countPlayerCourts(rounds);

    expect(getCourtSpread(histories.get("p1") ?? new Map())).toBeLessThanOrEqual(4);
    for (const history of histories.values()) {
      expect(getCourtSpread(history)).toBeLessThanOrEqual(4);
    }
  });

  it("balances Americano courts for 16 players on 4 courts", () => {
    const state = createTournamentFromSetup({
      name: "Americano court balance 16/4",
      format: "Americano",
      playerText: sixteenPlayerText,
      femalePlayerText: "",
      malePlayerText: "",
      courts: 4,
      rounds: 16,
      scoringMode: "Fri scoring",
      firstRoundOrder: "manual",
      rankingMode: "matchPointsFirst",
    });
    const histories = countPlayerCourts(state.rounds);

    for (const history of histories.values()) {
      expect(getCourtSpread(history)).toBeLessThanOrEqual(4);
    }
  });

  it("balances Fast Makker Americano courts per fixed pair", () => {
    const state = createTournamentFromSetup({
      name: "Fast Makker Americano court balance",
      format: "Fast Makker Americano",
      playerText: sixteenPlayerText,
      femalePlayerText: "",
      malePlayerText: "",
      courts: 4,
      rounds: 16,
      scoringMode: "Fri scoring",
      firstRoundOrder: "manual",
      rankingMode: "matchPointsFirst",
    });
    const histories = countTeamCourts(state.rounds);

    for (const history of histories.values()) {
      expect(getCourtSpread(history)).toBeLessThanOrEqual(2);
    }
  });

  it("runs Fast Makker Americano court rotation for 8 pairs across 10 rounds", () => {
    const state = createFixedPartnerAmericanoTournament(10);
    const histories = countTeamCourts(state.rounds);
    const sequences = countTeamCourtSequences(state.rounds);
    const teamIds = [...histories.keys()];

    expect(teamIds).toHaveLength(8);

    for (const round of state.rounds) {
      expect(round.matches).toHaveLength(4);
      expect(new Set(round.matches.flatMap((match) => [match.teamA.id, match.teamB.id])).size).toBe(8);
      expect(round.matches.map((match) => match.courtNumber).sort()).toEqual([1, 2, 3, 4]);
    }

    for (const teamId of teamIds) {
      expect(getCourtSpread(histories.get(teamId) ?? new Map(), 4)).toBeLessThanOrEqual(2);
      expect(getLongestSameCourtStreak(sequences.get(teamId) ?? [])).toBeLessThanOrEqual(2);
    }
  });

  it("keeps Fast Makker Americano opponent and court cycles across 14 rounds", () => {
    const state = createFixedPartnerAmericanoTournament(14);
    const firstCycleCounts = countFixedPartnerOpponentPairs(state.rounds.slice(0, 7));
    const secondCycleCounts = countFixedPartnerOpponentPairs(state.rounds.slice(7, 14));
    const fullCycleCounts = countFixedPartnerOpponentPairs(state.rounds);
    const histories = countTeamCourts(state.rounds);

    expect(firstCycleCounts.size).toBe(28);
    expect([...firstCycleCounts.values()]).toEqual(Array(28).fill(1));
    expect(secondCycleCounts.size).toBe(28);
    expect([...secondCycleCounts.values()]).toEqual(Array(28).fill(1));
    expect(fullCycleCounts.size).toBe(28);
    expect([...fullCycleCounts.values()]).toEqual(Array(28).fill(2));

    for (const history of histories.values()) {
      expect(getCourtSpread(history, 4)).toBeLessThanOrEqual(2);
    }
  });

  it("runs the 10-round Mixed Americano main scenario", () => {
    const state = createMixedAmericanoTournament(10);
    const partnerCounts = countMixedPartnerPairs(state);
    const firstCyclePartners = countMixedPartnerSets(state.rounds.slice(0, 8));
    const secondCyclePartners = countMixedPartnerSets(state.rounds.slice(8, 10));
    const playCounts = countPlayerAppearances(state.rounds);
    const courtHistories = countPlayerCourts(state.rounds);
    const courtSequences = countPlayerCourtSequences(state.rounds);
    const playerById = new Map(state.players.map((player) => [player.id, player]));
    const maleIds = state.players.filter((player) => player.gender === "male").map((player) => player.id);
    const femaleIds = state.players.filter((player) => player.gender === "female").map((player) => player.id);

    expect(state.players).toHaveLength(16);
    expect(maleIds).toHaveLength(8);
    expect(femaleIds).toHaveLength(8);
    expect(state.rounds).toHaveLength(10);
    expect(state.rounds.flatMap((round) => round.matches)).toHaveLength(40);

    for (const round of state.rounds) {
      const roundPlayerIds = round.matches.flatMap((match) => [...match.teamA.playerIds, ...match.teamB.playerIds]);
      expect(round.matches).toHaveLength(4);
      expect(roundPlayerIds).toHaveLength(16);
      expect(new Set(roundPlayerIds).size).toBe(16);
      expect(roundPlayerIds.sort()).toEqual(state.players.map((player) => player.id).sort());
      expect(round.matches.map((match) => match.courtNumber).sort()).toEqual([1, 2, 3, 4]);
      expect(roundPlayerIds.filter((playerId) => playerById.get(playerId)?.gender === "male")).toHaveLength(8);
      expect(roundPlayerIds.filter((playerId) => playerById.get(playerId)?.gender === "female")).toHaveLength(8);

      for (const match of round.matches) {
        const matchPlayerIds = [...match.teamA.playerIds, ...match.teamB.playerIds];
        expect(match.roundNumber).toBe(round.roundNumber);
        expect(match.courtNumber).toBeGreaterThanOrEqual(1);
        expect(match.courtNumber).toBeLessThanOrEqual(4);
        expect(new Set(matchPlayerIds).size).toBe(4);
        expect(matchPlayerIds.filter((playerId) => playerById.get(playerId)?.gender === "male")).toHaveLength(2);
        expect(matchPlayerIds.filter((playerId) => playerById.get(playerId)?.gender === "female")).toHaveLength(2);
        expect(isMixedTeam(match.teamA.playerIds, state.players)).toBe(true);
        expect(isMixedTeam(match.teamB.playerIds, state.players)).toBe(true);
        expect(playerById.get(match.teamA.playerIds[0])?.gender).toBe("male");
        expect(playerById.get(match.teamA.playerIds[1])?.gender).toBe("female");
        expect(playerById.get(match.teamB.playerIds[0])?.gender).toBe("male");
        expect(playerById.get(match.teamB.playerIds[1])?.gender).toBe("female");
      }
    }

    expect([...playCounts.values()]).toEqual(Array(16).fill(10));
    expect(partnerCounts.size).toBe(64);
    expect(Math.min(...partnerCounts.values())).toBeGreaterThanOrEqual(1);
    expect(Math.max(...partnerCounts.values())).toBeLessThanOrEqual(2);

    for (const playerId of maleIds) {
      expect(firstCyclePartners.get(playerId)?.size).toBe(8);
      expect(secondCyclePartners.get(playerId)?.size).toBe(2);
    }

    for (const playerId of femaleIds) {
      expect(firstCyclePartners.get(playerId)?.size).toBe(8);
      expect(secondCyclePartners.get(playerId)?.size).toBe(2);
    }

    for (const player of state.players) {
      const history = courtHistories.get(player.id) ?? new Map();
      const sequence = courtSequences.get(player.id) ?? [];
      expect(getCourtSpread(history, 4)).toBeLessThanOrEqual(1);
      expect(getLongestSameCourtStreak(sequence)).toBeLessThanOrEqual(2);
    }
  });

  it.each([
    ["Fri scoring", undefined, [[17, 14], [12, 12], [24, 20], [0, 3]]],
    ["Fast antal point", "total", [[17, 7], [12, 12], [24, 0], [0, 24]]],
    ["Spil på tid", undefined, [[17, 14], [12, 12], [24, 20], [0, 3]]],
  ] as const)("completes Mixed Americano 10-round scoring with %s", (scoringMode, fixedScoreRule, roundScores) => {
    const state = createMixedAmericanoTournament(10, scoringMode, fixedScoreRule, fixedScoreRule === "total" ? 24 : undefined);
    const completedState = scoreAllConfiguredRounds(state, roundScores);

    expect(completedState.configuredRounds).toBe(10);
    expect(completedState.rounds).toHaveLength(10);
    expect(completedState.results).toHaveLength(40);
    expect(calculateLiveStandings(completedState)).toHaveLength(16);
    expect(getRoundProgress(completedState)).toMatchObject({ completedMatches: 4, totalMatches: 4, isComplete: true });
  });

  it("continues Mixed Americano into new partner cycles", () => {
    const state = createMixedAmericanoTournament(18);
    const partnerCounts = countMixedPartnerPairs(state);

    expect(state.rounds).toHaveLength(18);

    for (const round of state.rounds) {
      const roundPlayerIds = round.matches.flatMap((match) => [...match.teamA.playerIds, ...match.teamB.playerIds]);
      expect(round.matches).toHaveLength(4);
      expect(new Set(roundPlayerIds).size).toBe(16);

      for (const match of round.matches) {
        expect(isMixedTeam(match.teamA.playerIds, state.players)).toBe(true);
        expect(isMixedTeam(match.teamB.playerIds, state.players)).toBe(true);
      }
    }

    expect(partnerCounts.size).toBe(64);
    expect(Math.min(...partnerCounts.values())).toBeGreaterThanOrEqual(2);
    expect(Math.max(...partnerCounts.values())).toBeLessThanOrEqual(3);
  });

  it("scores and edits Mixed Americano results with individual standings", () => {
    const state = createMixedAmericanoTournament(8);
    const matchId = getLiveMatches(state)[0].match.id;
    const savedState = saveMatchResult(state, { matchId, teamAPoints: 15, teamBPoints: 9 });
    const editedState = saveMatchResult(savedState, { matchId, teamAPoints: 17, teamBPoints: 7 });
    const standings = calculateLiveStandings(editedState);

    expect(editedState.results).toHaveLength(1);
    expect(standings).toHaveLength(16);
    expect(standings.find((row) => row.id === "f1")).toMatchObject({ pointsFor: 17 });
    expect(standings.find((row) => row.id === "m1")).toMatchObject({ pointsFor: 17 });
    expect(standings.find((row) => row.id === "f2")).toMatchObject({ pointsFor: 7 });
    expect(standings.find((row) => row.id === "m2")).toMatchObject({ pointsFor: 7 });
  });

  it("creates the next Mexicano round from the current player standings", () => {
    const scoredState = scoreActiveRound(createStandardTournament("Mexicano", sixteenPlayerText, "", ""));
    const standings = calculateLiveStandings(scoredState);
    const nextState = goToNextRound(scoredState);
    const [firstMatch, secondMatch] = nextState.rounds[1].matches;

    expect(firstMatch).toMatchObject({
      courtNumber: 1,
      teamA: { playerIds: [standings[0].id, standings[2].id] },
      teamB: { playerIds: [standings[1].id, standings[3].id] },
    });
    expect(secondMatch).toMatchObject({
      courtNumber: 2,
      teamA: { playerIds: [standings[4].id, standings[6].id] },
      teamB: { playerIds: [standings[5].id, standings[7].id] },
    });
  });

  it("creates the next Fast Makker Mexicano round from the current pair standings", () => {
    const scoredState = scoreActiveRound(createStandardTournament("Fast Makker Mexicano", sixteenPlayerText, "", ""));
    const standings = calculateLiveStandings(scoredState);
    const nextState = goToNextRound(scoredState);
    const [firstMatch, secondMatch] = nextState.rounds[1].matches;

    expect(firstMatch).toMatchObject({
      courtNumber: 1,
      teamA: { id: standings[0].id },
      teamB: { id: standings[1].id },
    });
    expect(secondMatch).toMatchObject({
      courtNumber: 2,
      teamA: { id: standings[2].id },
      teamB: { id: standings[3].id },
    });
  });

  it.each([
    ["matchPointsFirst", ["p3+p4", "p5+p6"]],
    ["partiPointsFirst", ["p3+p4", "p1+p2"]],
  ] as const)("places Fast Makker Mexicano courts by %s ranking without court balancing", (rankingMode, expectedCourtOneTeamIds) => {
    const state = createStandardTournament("Fast Makker Mexicano", sixteenPlayerText, "", "", { rankingMode });
    const [match1, match2, match3, match4] = getLiveMatches(state);
    const scoredState = [
      { matchId: match1.match.id, teamAPoints: 40, teamBPoints: 41 },
      { matchId: match2.match.id, teamAPoints: 6, teamBPoints: 0 },
      { matchId: match3.match.id, teamAPoints: 5, teamBPoints: 0 },
      { matchId: match4.match.id, teamAPoints: 4, teamBPoints: 0 },
    ].reduce((currentState, result) => saveMatchResult(currentState, result), state);
    const standings = calculateLiveStandings(scoredState);
    const nextState = goToNextRound(scoredState);

    expect([standings[0].id, standings[1].id]).toEqual(expectedCourtOneTeamIds);
    expect(nextState.rounds[1].matches.map((match) => match.courtNumber)).toEqual([1, 2, 3, 4]);
    expect([nextState.rounds[1].matches[0].teamA.id, nextState.rounds[1].matches[0].teamB.id]).toEqual(expectedCourtOneTeamIds);

    for (let matchIndex = 0; matchIndex < nextState.rounds[1].matches.length; matchIndex += 1) {
      const match = nextState.rounds[1].matches[matchIndex];
      expect(match.teamA.id).toBe(standings[matchIndex * 2].id);
      expect(match.teamB.id).toBe(standings[matchIndex * 2 + 1].id);
    }
  });

  it.each([
    "matchPointsFirst",
    "partiPointsFirst",
  ] as const)("updates Fast Makker Mexicano standings and unplayed next round after editing a previous %s result", (rankingMode) => {
    const state = createStandardTournament("Fast Makker Mexicano", sixteenPlayerText, "", "", { rankingMode });
    const scoredState = scoreActiveRound(state, [[17, 7], [16, 8], [15, 9], [14, 10]]);
    const roundTwoState = goToNextRound(scoredState);
    const originalRoundTwoCourtOne = [roundTwoState.rounds[1].matches[0].teamA.id, roundTwoState.rounds[1].matches[0].teamB.id];
    const editedState = saveMatchResult(goToPreviousRound(roundTwoState), {
      matchId: state.rounds[0].matches[0].id,
      teamAPoints: 0,
      teamBPoints: 24,
    });
    const editedStandings = calculateLiveStandings(editedState);
    const editedRoundTwoCourtOne = [editedState.rounds[1].matches[0].teamA.id, editedState.rounds[1].matches[0].teamB.id];

    expect(editedState.results).toHaveLength(4);
    expect(editedState.results.find((result) => result.matchId === state.rounds[0].matches[0].id)).toMatchObject({ teamAPoints: 0, teamBPoints: 24 });
    expect(editedRoundTwoCourtOne).toEqual([editedStandings[0].id, editedStandings[1].id]);
    expect(editedRoundTwoCourtOne).not.toEqual(originalRoundTwoCourtOne);
  });

  it("keeps already scored Fast Makker Mexicano future rounds when an earlier result is edited", () => {
    const state = createStandardTournament("Fast Makker Mexicano", sixteenPlayerText, "", "");
    const scoredRoundOne = scoreActiveRound(state, [[17, 7], [16, 8], [15, 9], [14, 10]]);
    const roundTwoState = goToNextRound(scoredRoundOne);
    const originalRoundTwoMatches = roundTwoState.rounds[1].matches.map((match) => [match.teamA.id, match.teamB.id]);
    const scoredRoundTwo = saveMatchResult(roundTwoState, {
      matchId: roundTwoState.rounds[1].matches[0].id,
      teamAPoints: 12,
      teamBPoints: 12,
    });
    const editedState = saveMatchResult(goToPreviousRound(scoredRoundTwo), {
      matchId: state.rounds[0].matches[0].id,
      teamAPoints: 0,
      teamBPoints: 24,
    });

    expect(editedState.rounds[1].matches.map((match) => [match.teamA.id, match.teamB.id])).toEqual(originalRoundTwoMatches);
    expect(editedState.results.find((result) => result.matchId === roundTwoState.rounds[1].matches[0].id)).toMatchObject({ teamAPoints: 12, teamBPoints: 12 });
    expect(calculateLiveStandings(editedState).find((row) => row.id === roundTwoState.rounds[1].matches[0].teamA.id)?.pointsFor).toBeGreaterThanOrEqual(12);
  });

  it.each(["Fast Makker Americano", "Fast Makker Mexicano"] as const)(
    "keeps fixed partner pairs intact while allowing randomized %s starts",
    (format) => {
      const state = createStandardTournament(format, sixteenPlayerText, "", "", { firstRoundOrder: "random" });
      const enteredPairIds = createTournamentRounds({ format: "fixed-partner-americano", players: state.players, rounds: 1, courts: 4, firstRoundOrder: "manual" })[0]
        .matches
        .flatMap((match) => [match.teamA.id, match.teamB.id])
        .sort();
      const firstRoundPairIds = state.rounds[0].matches.flatMap((match) => [match.teamA.id, match.teamB.id]).sort();

      expect(firstRoundPairIds).toEqual(enteredPairIds);
      expect(state.rounds[0].matches[0].teamA.playerIds).toHaveLength(2);
      for (const team of state.rounds[0].matches.flatMap((match) => [match.teamA, match.teamB])) {
        const indexes = team.playerIds.map((playerId) => Number(playerId.replace("p", ""))).sort((left, right) => left - right);
        expect(indexes[1] - indexes[0]).toBe(1);
        expect(indexes[0] % 2).toBe(1);
      }
    },
  );

  it("marks matches as not played before scoring", () => {
    const state = createMockLiveTournamentState();

    expect(getLiveMatches(state).map((liveMatch) => liveMatch.status)).toEqual(["Klar", "Klar"]);
  });

  it("starts a match before result registration", () => {
    const state = createMockLiveTournamentState();
    const matchId = getLiveMatches(state)[0].match.id;

    const startedState = startMatch(state, matchId);
    const liveMatch = getLiveMatches(startedState)[0];

    expect(startedState.startedMatchIds).toEqual([matchId]);
    expect(liveMatch.status).toBe("I gang");
  });
  it("saves result and immediately updates match status and standings", () => {
    const state = createMockLiveTournamentState();
    const matchId = getLiveMatches(state)[0].match.id;
    const updatedState = saveMatchResult(state, { matchId, teamAPoints: 21, teamBPoints: 12 });
    const liveMatch = getLiveMatches(updatedState)[0];
    const standings = calculateLiveStandings(updatedState);

    expect(liveMatch.status).toBe("Afsluttet");
    expect(liveMatch.result).toMatchObject({ teamAPoints: 21, teamBPoints: 12 });
    expect(standings[0]).toMatchObject({ id: "p1", matchPoints: 3, pointsFor: 21 });
    expect(standings[1]).toMatchObject({ id: "p2", matchPoints: 3, pointsFor: 21 });
  });

  it.each(["fixed-partner-americano", "fixed-partner-mexicano"] as const)(
    "shows %s standings as pairs and counts each result once",
    (format) => {
      const baseState = createMockLiveTournamentState();
      const state = {
        ...baseState,
        format,
        rounds: createTournamentRounds({ format, players: baseState.players, rounds: 1, courts: 2, firstRoundOrder: "manual" }),
      };
      const matchId = state.rounds[0].matches[0].id;
      const updatedState = saveMatchResult(state, { matchId, teamAPoints: 21, teamBPoints: 12 });
      const standings = calculateLiveStandings(updatedState);
      const winningPair = standings.find((row) => row.name === "Anna / Hassan");

      expect(standings).toHaveLength(4);
      expect(winningPair).toMatchObject({ matchPoints: 3, pointsFor: 21, wins: 1 });
    },
  );

  it("keeps standard Americano standings player-based", () => {
    const standings = calculateLiveStandings(createMockLiveTournamentState());

    expect(standings).toHaveLength(8);
    expect(standings.map((row) => row.name)).toContain("Anna");
    expect(standings.map((row) => row.name)).not.toContain("Anna / Hassan");
  });

  it("removes a match from started matches when result is saved", () => {
    const state = createMockLiveTournamentState();
    const matchId = getLiveMatches(state)[0].match.id;
    const startedState = startMatch(state, matchId);
    const savedState = saveMatchResult(startedState, { matchId, teamAPoints: 21, teamBPoints: 12 });

    expect(savedState.startedMatchIds).toEqual([]);
    expect(getLiveMatches(savedState)[0].status).toBe("Afsluttet");
  });
  it("edits an already saved result instead of duplicating it", () => {
    const state = createMockLiveTournamentState();
    const matchId = getLiveMatches(state)[0].match.id;
    const firstSave = saveMatchResult(state, { matchId, teamAPoints: 21, teamBPoints: 12 });
    const secondSave = saveMatchResult(firstSave, { matchId, teamAPoints: 10, teamBPoints: 20 });
    const standings = calculateLiveStandings(secondSave);

    expect(secondSave.results).toHaveLength(1);
    expect(getLiveMatches(secondSave)[0].result).toMatchObject({ teamAPoints: 10, teamBPoints: 20 });
    expect(standings[0]).toMatchObject({ id: "p3", matchPoints: 3, pointsFor: 20 });
    expect(standings[1]).toMatchObject({ id: "p4", matchPoints: 3, pointsFor: 20 });
  });

  it.each([
    ["Fri scoring", { scoringMode: "Fri scoring" as const }],
    ["Fast scoring", { scoringMode: "Fast antal point" as const, fixedScoreRule: "total" as const, fixedScorePoints: 24 }],
    ["Spil på tid", { scoringMode: "Spil på tid" as const, timeLimitMinutes: 12 }],
  ] as const)("edits %s results without double-counting player points", (_label, overrides) => {
    const state = { ...createMockLiveTournamentState(), ...overrides };
    const matchId = getLiveMatches(state)[0].match.id;
    const firstSave = saveMatchResult(state, { matchId, teamAPoints: 15, teamBPoints: 9 });
    const secondSave = saveMatchResult(firstSave, { matchId, teamAPoints: 17, teamBPoints: 7 });
    const standings = calculateLiveStandings(secondSave);

    expect(secondSave.results).toHaveLength(1);
    expect(standings.find((row) => row.id === "p1")).toMatchObject({ pointsFor: 17 });
    expect(standings.find((row) => row.id === "p3")).toMatchObject({ pointsFor: 7 });
  });

  it("runs timed scoring with 15 second countdown before the round clock", () => {
    const state = { ...createMockLiveTournamentState(), scoringMode: "Spil på tid" as const, timeLimitMinutes: 1 };

    const countdownState = startRoundTimer(state);
    const runningState = tickRoundTimer(countdownState, 15);
    const expiredState = tickRoundTimer(runningState, 60);

    expect(countdownState.roundTimer).toMatchObject({ status: "countdown", countdownSeconds: 15, remainingSeconds: 60 });
    expect(runningState.roundTimer).toMatchObject({ status: "running", countdownSeconds: 0, remainingSeconds: 60 });
    expect(expiredState.roundTimer).toMatchObject({ status: "expired", remainingSeconds: 0 });
  });

  it("rejects timer start unless scoring mode is timed", () => {
    expect(() => startRoundTimer(createMockLiveTournamentState())).toThrow("Uret kan kun startes");
  });

  it("stops, resumes, and resets the round timer", () => {
    const state = { ...createMockLiveTournamentState(), scoringMode: "Spil på tid" as const, timeLimitMinutes: 2 };
    const runningState = tickRoundTimer(startRoundTimer(state), 45);
    const stoppedState = stopRoundTimer(runningState);
    const unchangedWhileStopped = tickRoundTimer(stoppedState, 10);
    const resumedState = startRoundTimer(stoppedState);
    const resetState = resetRoundTimer(resumedState);

    expect(stoppedState.roundTimer).toMatchObject({ status: "paused", remainingSeconds: 90 });
    expect(unchangedWhileStopped).toEqual(stoppedState);
    expect(resumedState.roundTimer).toMatchObject({ status: "running", remainingSeconds: 90 });
    expect(resetState.roundTimer).toMatchObject({ status: "idle", countdownSeconds: 15, remainingSeconds: 120 });
  });
  it("uses the selected ranking mode for live standings", () => {
    const state = createMockLiveTournamentState();
    const [firstMatch, secondMatch] = getLiveMatches(state);
    const firstSave = saveMatchResult(state, { matchId: firstMatch.match.id, teamAPoints: 8, teamBPoints: 7 });
    const secondSave = saveMatchResult(firstSave, { matchId: secondMatch.match.id, teamAPoints: 30, teamBPoints: 31 });
    const partiPointState = setLiveRankingMode(secondSave, "partiPointsFirst");

    const matchPointStandings = calculateLiveStandings(secondSave);
    const partiPointStandings = calculateLiveStandings(partiPointState);

    expect(matchPointStandings.findIndex((row) => row.id === "p1")).toBeLessThan(matchPointStandings.findIndex((row) => row.id === "p5"));
    expect(partiPointStandings.findIndex((row) => row.id === "p5")).toBeLessThan(partiPointStandings.findIndex((row) => row.id === "p1"));
  });

  it("tracks active round progress", () => {
    const state = createMockLiveTournamentState();
    const matchId = getLiveMatches(state)[0].match.id;
    const updatedState = saveMatchResult(state, { matchId, teamAPoints: 21, teamBPoints: 12 });

    expect(getRoundProgress(updatedState)).toEqual({
      roundNumber: 1,
      completedMatches: 1,
      totalMatches: 2,
      isComplete: false,
    });
  });

  it("blocks next round until every active round match is saved", () => {
    const state = createMockLiveTournamentState();

    expect(canGoToNextRound(state)).toBe(false);
    expect(() => goToNextRound(state)).toThrow("Alle kampe i runden skal være gemt, før næste runde kan åbnes.");
  });

  it("opens next round after current round is complete and can go back", () => {
    const state = createMockLiveTournamentState();
    const [firstMatch, secondMatch] = getLiveMatches(state);
    const firstSave = saveMatchResult(state, { matchId: firstMatch.match.id, teamAPoints: 21, teamBPoints: 12 });
    const completedRound = saveMatchResult(firstSave, { matchId: secondMatch.match.id, teamAPoints: 18, teamBPoints: 18 });

    const roundTwo = goToNextRound(completedRound);
    const roundOneAgain = goToPreviousRound(roundTwo);

    expect(canGoToNextRound(completedRound)).toBe(true);
    expect(roundTwo.activeRoundNumber).toBe(2);
    expect(getLiveMatches(roundTwo)).toHaveLength(2);
    expect(roundOneAgain.activeRoundNumber).toBe(1);
  });

  it("can finish immediately and still edit results afterwards", () => {
    const state = createMockLiveTournamentState();
    const finishedState = finishTournament(state, "2026-08-04T18:00:00.000Z");
    const matchId = getLiveMatches(finishedState)[0].match.id;
    const editedState = saveMatchResult(finishedState, { matchId, teamAPoints: 11, teamBPoints: 9 });

    expect(finishedState).toMatchObject({ status: "finished", finishedAt: "2026-08-04T18:00:00.000Z" });
    expect(editedState.status).toBe("finished");
    expect(editedState.results).toHaveLength(1);
  });

  it("rejects negative results", () => {
    const state = createMockLiveTournamentState();
    const matchId = getLiveMatches(state)[0].match.id;

    expect(() => saveMatchResult(state, { matchId, teamAPoints: -1, teamBPoints: 20 })).toThrow("Resultat må ikke være negativt.");
  });

  it("validates fixed target scoring when a result is saved", () => {
    const state = {
      ...createMockLiveTournamentState(),
      scoringMode: "Fast antal point" as const,
      fixedScoreRule: "target" as const,
      fixedScorePoints: 21,
    };
    const matchId = getLiveMatches(state)[0].match.id;

    expect(() => saveMatchResult(state, { matchId, teamAPoints: 20, teamBPoints: 12 })).toThrow("én score være præcis 21");
    expect(saveMatchResult(state, { matchId, teamAPoints: 21, teamBPoints: 12 }).results[0]).toMatchObject({ teamAPoints: 21, teamBPoints: 12 });
  });

  it("validates fixed total scoring when a result is saved", () => {
    const state = {
      ...createMockLiveTournamentState(),
      scoringMode: "Fast antal point" as const,
      fixedScoreRule: "total" as const,
      fixedScorePoints: 21,
    };
    const matchId = getLiveMatches(state)[0].match.id;

    expect(() => saveMatchResult(state, { matchId, teamAPoints: 12, teamBPoints: 10 })).toThrow("tilsammen være 21");
    expect(saveMatchResult(state, { matchId, teamAPoints: 11, teamBPoints: 10 }).results[0]).toMatchObject({ teamAPoints: 11, teamBPoints: 10 });
  });
  it("rejects invalid fixed total Americano scores before they reach standings", () => {
    const state = createAmericanoTournament("Fast antal point", "total", 24);
    const matchId = getLiveMatches(state)[0].match.id;

    expect(() => saveMatchResult(state, { matchId, teamAPoints: -1, teamBPoints: 25 })).toThrow("Resultat");
    expect(() => saveMatchResult(state, { matchId, teamAPoints: 25, teamBPoints: -1 })).toThrow("Resultat");
    expect(() => saveMatchResult(state, { matchId, teamAPoints: 13.5, teamBPoints: 10.5 })).toThrow("Resultat");
    expect(() => saveMatchResult(state, { matchId, teamAPoints: 25, teamBPoints: 0 })).toThrow("24");
  });
});

function createAmericanoTournament(scoringMode: ScoringMode, fixedScoreRule?: "total", fixedScorePoints?: number): LiveTournamentState {
  return createTournamentFromSetup({
    name: `Americano 16/4/8 ${scoringMode}`,
    format: "Americano",
    playerText: sixteenPlayerText,
    femalePlayerText: "",
    malePlayerText: "",
    courts: 4,
    rounds: 8,
    scoringMode,
    fixedScoreRule,
    fixedScorePoints,
    timeLimitMinutes: scoringMode === "Spil på tid" ? 12 : undefined,
    firstRoundOrder: "manual",
    rankingMode: "partiPointsFirst",
  });
}

function createFixedPartnerAmericanoTournament(rounds: number): LiveTournamentState {
  return createTournamentFromSetup({
    name: `Fast Makker Americano 8 pairs/${rounds}`,
    format: "Fast Makker Americano",
    playerText: sixteenPlayerText,
    femalePlayerText: "",
    malePlayerText: "",
    courts: 4,
    rounds,
    scoringMode: "Fri scoring",
    firstRoundOrder: "manual",
    rankingMode: "matchPointsFirst",
  });
}

function createMixedAmericanoTournament(
  rounds: number,
  scoringMode: ScoringMode = "Fri scoring",
  fixedScoreRule?: "total",
  fixedScorePoints?: number,
): LiveTournamentState {
  return createTournamentFromSetup({
    name: `Mixed Americano 16/4/${rounds}`,
    format: "Mixed Americano",
    playerText: "",
    femalePlayerText: eightFemalePlayerText,
    malePlayerText: eightMalePlayerText,
    courts: 4,
    rounds,
    scoringMode,
    fixedScoreRule,
    fixedScorePoints,
    timeLimitMinutes: scoringMode === "Spil på tid" ? 1 : undefined,
    firstRoundOrder: "manual",
    rankingMode: "matchPointsFirst",
  });
}

function createStandardTournament(
  format: TournamentSetupFormat,
  playerText: string,
  femalePlayerText: string,
  malePlayerText: string,
  overrides: Partial<Pick<Parameters<typeof createTournamentFromSetup>[0], "firstRoundOrder" | "rankingMode">> = {},
): LiveTournamentState {
  return createTournamentFromSetup({
    name: `${format} 16/4`,
    format,
    playerText,
    femalePlayerText,
    malePlayerText,
    courts: 4,
    rounds: 5,
    scoringMode: "Fri scoring",
    firstRoundOrder: overrides.firstRoundOrder ?? "manual",
    rankingMode: overrides.rankingMode ?? "matchPointsFirst",
  });
}

function scoreActiveRound(state: LiveTournamentState, scores: ReadonlyArray<readonly [number, number]> = [[21, 10], [21, 11], [21, 12], [21, 13]]): LiveTournamentState {
  return getLiveMatches(state).reduce((currentState, liveMatch, index) => (
    saveMatchResult(currentState, {
      matchId: liveMatch.match.id,
      teamAPoints: scores[index % scores.length][0],
      teamBPoints: scores[index % scores.length][1],
    })
  ), state);
}

function scoreAllConfiguredRounds(state: LiveTournamentState, scores: ReadonlyArray<readonly [number, number]> = [[21, 10], [21, 11], [21, 12], [21, 13]]): LiveTournamentState {
  let currentState = state;
  const configuredRounds = currentState.configuredRounds ?? currentState.rounds.length;

  for (let roundNumber = 1; roundNumber <= configuredRounds; roundNumber += 1) {
    currentState = scoreActiveRound(currentState, scores);

    if (roundNumber < configuredRounds) {
      currentState = goToNextRound(currentState);
    }
  }

  return currentState;
}

function countFixedPartnerOpponentPairs(rounds: LiveTournamentState["rounds"]): Map<string, number> {
  const counts = new Map<string, number>();

  for (const round of rounds) {
    for (const match of round.matches) {
      const key = [...match.teamA.playerIds, ...match.teamB.playerIds].sort().join("-");
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  return counts;
}

function countMixedPartnerPairs(state: LiveTournamentState): Map<string, number> {
  const counts = new Map<string, number>();

  for (const round of state.rounds) {
    for (const match of round.matches) {
      for (const pair of [match.teamA.playerIds, match.teamB.playerIds]) {
        const key = [...pair].sort().join("-");
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
  }

  return counts;
}

function countMixedPartnerSets(rounds: LiveTournamentState["rounds"]): Map<string, Set<string>> {
  const partners = new Map<string, Set<string>>();

  for (const round of rounds) {
    for (const match of round.matches) {
      for (const pair of [match.teamA.playerIds, match.teamB.playerIds]) {
        const [firstPlayerId, secondPlayerId] = pair;
        const firstPartners = partners.get(firstPlayerId) ?? new Set<string>();
        const secondPartners = partners.get(secondPlayerId) ?? new Set<string>();
        firstPartners.add(secondPlayerId);
        secondPartners.add(firstPlayerId);
        partners.set(firstPlayerId, firstPartners);
        partners.set(secondPlayerId, secondPartners);
      }
    }
  }

  return partners;
}

function countPlayerAppearances(rounds: LiveTournamentState["rounds"]): Map<string, number> {
  const counts = new Map<string, number>();

  for (const round of rounds) {
    for (const match of round.matches) {
      for (const playerId of [...match.teamA.playerIds, ...match.teamB.playerIds]) {
        counts.set(playerId, (counts.get(playerId) ?? 0) + 1);
      }
    }
  }

  return counts;
}

function countPlayerCourts(rounds: LiveTournamentState["rounds"]): Map<string, Map<number, number>> {
  const histories = new Map<string, Map<number, number>>();

  for (const round of rounds) {
    for (const match of round.matches) {
      for (const playerId of [...match.teamA.playerIds, ...match.teamB.playerIds]) {
        incrementCourtHistory(histories, playerId, match.courtNumber);
      }
    }
  }

  return histories;
}

function countPlayerCourtSequences(rounds: LiveTournamentState["rounds"]): Map<string, number[]> {
  const sequences = new Map<string, number[]>();

  for (const round of rounds) {
    for (const match of round.matches) {
      for (const playerId of [...match.teamA.playerIds, ...match.teamB.playerIds]) {
        sequences.set(playerId, [...(sequences.get(playerId) ?? []), match.courtNumber]);
      }
    }
  }

  return sequences;
}

function countTeamCourts(rounds: LiveTournamentState["rounds"]): Map<string, Map<number, number>> {
  const histories = new Map<string, Map<number, number>>();

  for (const round of rounds) {
    for (const match of round.matches) {
      incrementCourtHistory(histories, match.teamA.id, match.courtNumber);
      incrementCourtHistory(histories, match.teamB.id, match.courtNumber);
    }
  }

  return histories;
}

function countTeamCourtSequences(rounds: LiveTournamentState["rounds"]): Map<string, number[]> {
  const sequences = new Map<string, number[]>();

  for (const round of rounds) {
    for (const match of round.matches) {
      sequences.set(match.teamA.id, [...(sequences.get(match.teamA.id) ?? []), match.courtNumber]);
      sequences.set(match.teamB.id, [...(sequences.get(match.teamB.id) ?? []), match.courtNumber]);
    }
  }

  return sequences;
}

function incrementCourtHistory(histories: Map<string, Map<number, number>>, id: string, courtNumber: number): void {
  const history = histories.get(id) ?? new Map<number, number>();
  history.set(courtNumber, (history.get(courtNumber) ?? 0) + 1);
  histories.set(id, history);
}

function getCourtSpread(history: Map<number, number>, courts = history.size): number {
  const counts = Array.from({ length: courts }, (_, index) => history.get(index + 1) ?? 0);
  return Math.max(...counts) - Math.min(...counts);
}

function getLongestSameCourtStreak(sequence: number[]): number {
  let longestStreak = 0;
  let currentStreak = 0;
  let previousCourt = 0;

  for (const court of sequence) {
    currentStreak = court === previousCourt ? currentStreak + 1 : 1;
    longestStreak = Math.max(longestStreak, currentStreak);
    previousCourt = court;
  }

  return longestStreak;
}

function isMixedTeam(playerIds: readonly string[], players: LiveTournamentState["players"]): boolean {
  const genders = playerIds.map((playerId) => players.find((player) => player.id === playerId)?.gender);
  return genders.filter((gender) => gender === "female").length === 1 && genders.filter((gender) => gender === "male").length === 1;
}





