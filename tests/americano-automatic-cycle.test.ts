import { describe, expect, it } from "vitest";
import {
  calculateLiveStandings,
  canGoToNextRound,
  finishTournament,
  getLiveAmericanoCycleStatus,
  goToNextRound,
  saveMatchResult,
  type LiveTournamentState,
} from "../lib/live-scoring";
import { createTournamentFromSetup } from "../lib/tournament-setup";
import { createTournamentRounds, getAmericanoActivePlayerCount, getAmericanoCycleLength, type TournamentPlayer, type TournamentRound } from "../lib/tournament-engine";
import { analyzeIndividualSchedule } from "./support/fairness-proof";

const requiredAmericanoCycles = [
  [1, 4, 3],
  [1, 5, 8],
  [1, 6, 15],
  [1, 7, 16],
  [2, 8, 7],
  [2, 9, 13],
  [2, 10, 16],
  [2, 11, 20],
  [4, 16, 15],
  [4, 17, 25],
  [4, 18, 26],
  [4, 19, 29],
] as const;

describe("Americano automatic cycle scheduling", () => {
  it.each(requiredAmericanoCycles)("audits %i courts / %i players against the approved fairness invariants", (courts, playerCount, expectedCycleLength) => {
    const players = createPlayers(playerCount);
    const cycleLength = getAmericanoCycleLength(players, courts);
    const rounds = createTournamentRounds({ format: "americano", players, courts, rounds: cycleLength, firstRoundOrder: "manual" });
    const analysis = analyzeIndividualSchedule(players, rounds);

    expect(cycleLength).toBe(expectedCycleLength);
    expect(rounds).toHaveLength(expectedCycleLength);
    expect(analysis.metrics.matchSpread).toBeLessThanOrEqual(1);
    expect(analysis.metrics.byeSpread).toBeLessThanOrEqual(1);
    expect(analysis.metrics.maxConsecutiveByes).toBeLessThanOrEqual(1);
    expect(analysis.metrics.cyclePartnerCoverage).toBe(1);

    for (const round of rounds) {
      const roundPlayerIds = round.matches.flatMap((match) => [...match.teamA.playerIds, ...match.teamB.playerIds]);
      expect(roundPlayerIds).toHaveLength(getAmericanoActivePlayerCount(playerCount, courts));
      expect(new Set(roundPlayerIds).size).toBe(roundPlayerIds.length);
      expect(round.matches.every((match) => new Set([...match.teamA.playerIds, ...match.teamB.playerIds]).size === 4)).toBe(true);
    }
  });

  it("creates new Americano tournaments with automatic cycle metadata instead of configured rounds", () => {
    const state = createAmericanoState(9, 2);

    expect(state.configuredRounds).toBeUndefined();
    expect(state.automaticCycle).toEqual({ type: "automatic-cycle", cycleLength: 13 });
    expect(state.rounds).toHaveLength(13);
  });

  it.each([
    [4, 1, 3],
    [9, 2, 13],
    [11, 2, 20],
  ])("continues %i-player Americano through three fair cycles on %i courts", (playerCount, courts, cycleLength) => {
    let state = createAmericanoState(playerCount, courts);

    for (let roundNumber = 1; roundNumber <= cycleLength * 3; roundNumber += 1) {
      expect(state.activeRoundNumber).toBe(roundNumber);
      state = scoreActiveRound(state);

      const cycleStatus = getLiveAmericanoCycleStatus(state);
      expect(cycleStatus).toMatchObject({
        cycleLength,
        cycleNumber: Math.floor((roundNumber - 1) / cycleLength) + 1,
        roundInCycle: ((roundNumber - 1) % cycleLength) + 1,
      });

      if (roundNumber < cycleLength * 3) {
        expect(canGoToNextRound(state)).toBe(true);
        state = goToNextRound(state);
      }
    }

    expect(state.rounds).toHaveLength(cycleLength * 3);
    expect(state.rounds.map((round) => round.roundNumber)).toEqual(Array.from({ length: cycleLength * 3 }, (_, index) => index + 1));
    expect(calculateLiveStandings(state)).toHaveLength(playerCount);
    assertFairCycles(state.players, state.rounds, cycleLength);
  });

  it("allows a 9-player Americano to finish after round 5 of a 13-round cycle", () => {
    let state = createAmericanoState(9, 2);

    for (let roundNumber = 1; roundNumber <= 5; roundNumber += 1) {
      state = scoreActiveRound(state);
      if (roundNumber < 5) {
        state = goToNextRound(state);
      }
    }

    const finished = finishTournament(state, "2026-08-29T20:00:00.000Z");

    expect(finished.status).toBe("finished");
    expect(finished.activeRoundNumber).toBe(5);
    expect(finished.rounds).toHaveLength(13);
    expect(finished.results).toHaveLength(10);
    expect(calculateLiveStandings(finished).reduce((total, row) => total + row.wins + row.draws + row.losses, 0)).toBe(40);
  });

  it("preserves random first-round seeding while keeping fairness invariant-based", () => {
    const players = createPlayers(9);
    const manualRounds = createTournamentRounds({ format: "americano", players, courts: 2, rounds: 13, firstRoundOrder: "manual" });
    const randomRounds = createTournamentRounds({ format: "americano", players, courts: 2, rounds: 13, firstRoundOrder: "random", randomSeed: 7 });

    expect(randomRounds[0].matches[0].teamA.playerIds).not.toEqual(manualRounds[0].matches[0].teamA.playerIds);
    expect(analyzeIndividualSchedule(players, randomRounds).metrics.cyclePartnerCoverage).toBe(1);
  });
});

function createAmericanoState(playerCount: number, courts: number): LiveTournamentState {
  return createTournamentFromSetup({
    name: `Americano ${playerCount}/${courts}`,
    format: "Americano",
    playerText: createPlayers(playerCount).map((player) => player.name).join("\n"),
    femalePlayerText: "",
    malePlayerText: "",
    courts,
    rounds: 1,
    scoringMode: "Fri scoring",
    firstRoundOrder: "manual",
    rankingMode: "matchPointsFirst",
  });
}

function scoreActiveRound(state: LiveTournamentState): LiveTournamentState {
  return state.rounds
    .find((round) => round.roundNumber === state.activeRoundNumber)
    ?.matches.reduce((nextState, match, index) => saveMatchResult(nextState, {
      matchId: match.id,
      teamAPoints: 21 - (index % 2),
      teamBPoints: 12 + (index % 2),
    }), state) ?? state;
}

function assertFairCycles(players: TournamentPlayer[], rounds: TournamentRound[], cycleLength: number): void {
  for (let start = 0; start < rounds.length; start += cycleLength) {
    const analysis = analyzeIndividualSchedule(players, rounds.slice(start, start + cycleLength));
    expect(analysis.metrics.matchSpread).toBeLessThanOrEqual(1);
    expect(analysis.metrics.byeSpread).toBeLessThanOrEqual(1);
    expect(analysis.metrics.maxConsecutiveByes).toBeLessThanOrEqual(1);
    expect(analysis.metrics.cyclePartnerCoverage).toBe(1);
  }
}

function createPlayers(count: number): TournamentPlayer[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index + 1}`,
    name: `Player ${index + 1}`,
  }));
}
