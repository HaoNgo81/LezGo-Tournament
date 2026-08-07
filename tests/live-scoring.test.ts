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
import { createTournamentFromSetup, type TournamentSetupFormat } from "../lib/tournament-setup";

const sixteenPlayerText = Array.from({ length: 16 }, (_, index) => `Spiller ${index + 1}`).join("\n");
const eightFemalePlayerText = Array.from({ length: 8 }, (_, index) => `Kvinde ${index + 1}`).join("\n");
const eightMalePlayerText = Array.from({ length: 8 }, (_, index) => `Mand ${index + 1}`).join("\n");

describe("live scoring state", () => {
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

  it.each(["Fast Makker Americano", "Fast Makker Mexicano"] as const)(
    "keeps entered fixed partner pairs together for random %s starts",
    (format) => {
      const state = createStandardTournament(format, sixteenPlayerText, "", "", { firstRoundOrder: "random" });
      const enteredPairIds = createTournamentRounds({ format: "fixed-partner-americano", players: state.players, rounds: 1, courts: 4, firstRoundOrder: "manual" })[0]
        .matches
        .flatMap((match) => [match.teamA.id, match.teamB.id])
        .sort();
      const firstRoundPairIds = state.rounds[0].matches.flatMap((match) => [match.teamA.id, match.teamB.id]).sort();

      expect(firstRoundPairIds).toEqual(enteredPairIds);
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
        rounds: createTournamentRounds({ format, players: baseState.players, rounds: 1, courts: 2 }),
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
});

function createStandardTournament(
  format: TournamentSetupFormat,
  playerText: string,
  femalePlayerText: string,
  malePlayerText: string,
  overrides: Partial<Pick<Parameters<typeof createTournamentFromSetup>[0], "firstRoundOrder">> = {},
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
    rankingMode: "matchPointsFirst",
  });
}

function scoreActiveRound(state: LiveTournamentState): LiveTournamentState {
  return getLiveMatches(state).reduce((currentState, liveMatch, index) => (
    saveMatchResult(currentState, {
      matchId: liveMatch.match.id,
      teamAPoints: 21,
      teamBPoints: 10 + index,
    })
  ), state);
}

function scoreAllConfiguredRounds(state: LiveTournamentState): LiveTournamentState {
  let currentState = state;
  const configuredRounds = currentState.configuredRounds ?? currentState.rounds.length;

  for (let roundNumber = 1; roundNumber <= configuredRounds; roundNumber += 1) {
    currentState = scoreActiveRound(currentState);

    if (roundNumber < configuredRounds) {
      currentState = goToNextRound(currentState);
    }
  }

  return currentState;
}





