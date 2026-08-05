import { describe, expect, it } from "vitest";
import {
  calculateLiveStandings,
  canGoToNextRound,
  createMockLiveTournamentState,
  finishTournament,
  getLiveMatches,
  getRoundProgress,
  goToNextRound,
  goToPreviousRound,
  saveMatchResult,
  setLiveRankingMode,
  startMatch,
  startRoundTimer,
  tickRoundTimer,
} from "../lib/live-scoring";

describe("live scoring state", () => {
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
});





