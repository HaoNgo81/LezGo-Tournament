import { describe, expect, it } from "vitest";
import { mapLiveTournamentToPersistencePayload } from "../lib/database";
import {
  calculateLiveStandings,
  canGoToNextRound,
  finishTournament,
  getLiveAmericanoCycleStatus,
  getLiveMatches,
  getRoundProgress,
  goToNextRound,
  saveMatchResult,
  type LiveTournamentState,
} from "../lib/live-scoring";
import {
  createFixedPartnerTeams,
  createTournamentRounds,
  getFixedPartnerAmericanoActivePairCount,
  getFixedPartnerAmericanoCycleLength,
  type Team,
  type TournamentPlayer,
  type TournamentRound,
} from "../lib/tournament-engine";
import { createTournamentFromSetup, loadActiveTournament, saveActiveTournament } from "../lib/tournament-setup";
import { analyzeFixedPairSchedule } from "./support/fairness-proof";

describe("Fast Makker Americano automatic cycles", () => {
  it.each([
    [1, 2, 2, 0, 1, 0, 0, 0],
    [1, 3, 2, 1, 3, 0, 0, 1],
    [1, 4, 2, 2, 6, 0, 0, 2],
    [2, 4, 4, 0, 3, 0, 0, 0],
    [2, 5, 4, 1, 8, 1, 1, 1],
    [2, 6, 4, 2, 15, 0, 0, 1],
    [2, 7, 4, 3, 16, 1, 1, 1],
    [4, 8, 8, 0, 7, 0, 0, 0],
    [4, 9, 8, 1, 13, 1, 1, 1],
    [4, 10, 8, 2, 16, 1, 1, 1],
  ] as const)(
    "uses the production fixed-pair scheduler for %i courts / %i pairs",
    (courts, pairCount, expectedActivePairs, expectedByePairs, expectedCycleLength, expectedMatchSpread, expectedByeSpread, expectedMaxConsecutiveByes) => {
      const players = createPlayers(pairCount * 2);
      const teams = createFixedPartnerTeams(players);
      const cycleLength = getFixedPartnerAmericanoCycleLength(teams, courts);
      const rounds = createTournamentRounds({
        format: "fixed-partner-americano",
        players,
        rounds: cycleLength,
        courts,
        firstRoundOrder: "manual",
      });
      const analysis = analyzeFixedPairSchedule(teams, rounds);

      expect(getFixedPartnerAmericanoActivePairCount(pairCount, courts)).toBe(expectedActivePairs);
      expect(cycleLength).toBe(expectedCycleLength);
      expect(rounds).toHaveLength(expectedCycleLength);
      expect(analysis.metrics.matchSpread).toBe(expectedMatchSpread);
      expect(analysis.metrics.byeSpread).toBe(expectedByeSpread);
      expect(analysis.metrics.maxConsecutiveByes).toBe(expectedMaxConsecutiveByes);
      expect(analysis.metrics.cycleOpponentCoverage).toBe(1);

      for (const round of rounds) {
        expect(round.matches).toHaveLength(expectedActivePairs / 2);
        expect(round.byePlayerIds ?? []).toHaveLength(expectedByePairs * 2);
        expect(getRoundPairIds(round)).toHaveLength(expectedActivePairs);
        expect(new Set(getRoundPairIds(round)).size).toBe(expectedActivePairs);
        expect(getRoundPairIds(round).every((teamId) => teams.some((team) => team.id === teamId))).toBe(true);
        expect(getByePairIds(teams, round)).toHaveLength(expectedByePairs);
      }
    },
  );

  it.each([
    ["manual", undefined],
    ["random", 1],
    ["random", 7],
    ["random", 30],
  ] as const)("uses the improved 4-pair / 1-court bye ordering for %s seed %s", (firstRoundOrder, randomSeed) => {
    const players = createPlayers(8);
    const teams = createFixedPartnerTeams(players);
    const cycleLength = getFixedPartnerAmericanoCycleLength(teams, 1);
    const rounds = createTournamentRounds({
      format: "fixed-partner-americano",
      players,
      rounds: cycleLength,
      courts: 1,
      firstRoundOrder,
      randomSeed,
    });
    const analysis = analyzeFixedPairSchedule(teams, rounds);
    const byeDetails = analyzePairByeDetails(teams, rounds);
    const roundOneByePairIds = getByePairIds(teams, rounds[0]);
    const roundTwoActivePairIds = getRoundPairIds(rounds[1]);

    expect(cycleLength).toBe(6);
    expect(analysis.metrics.cycleOpponentCoverage).toBe(1);
    expect(analysis.metrics.matchSpread).toBe(0);
    expect(analysis.metrics.byeSpread).toBe(0);
    expect(analysis.metrics.maxConsecutiveByes).toBe(2);
    expect(byeDetails.totalConsecutiveByeOccurrences).toBe(2);
    expect(byeDetails.firstConsecutiveByeRound).toBeGreaterThanOrEqual(3);
    expect(roundTwoActivePairIds.sort()).toEqual(roundOneByePairIds.sort());
  });

  it("creates new Fast Makker Americano tournaments without manual configured rounds", () => {
    const state = createFastPartnerTournament(10, 2);

    expect(state.format).toBe("fixed-partner-americano");
    expect(state.configuredRounds).toBeUndefined();
    expect(state.automaticCycle).toEqual({ type: "automatic-cycle", cycleLength: 8 });
    expect(state.rounds).toHaveLength(8);
    expect(getLiveAmericanoCycleStatus(state)).toEqual({
      cycleNumber: 1,
      roundInCycle: 1,
      cycleLength: 8,
      isCycleComplete: false,
    });
  });

  it.each([
    [6, 1, 3],
    [8, 1, 6],
    [10, 2, 8],
  ] as const)("continues into later rotations and saves generated fixed-pair scores for %i players / %i courts", (playerCount, courts, expectedCycleLength) => {
    let state = createFastPartnerTournament(playerCount, courts);

    expect(state.automaticCycle?.cycleLength).toBe(expectedCycleLength);

    for (let roundNumber = 1; roundNumber <= expectedCycleLength; roundNumber += 1) {
      state = scoreActiveRound(state);
      expect(canGoToNextRound(state)).toBe(true);
      state = goToNextRound(state);
    }

    expect(state.activeRoundNumber).toBe(expectedCycleLength + 1);
    expect(state.rounds).toHaveLength(expectedCycleLength + 1);
    expect(getLiveAmericanoCycleStatus(state)).toMatchObject({
      cycleNumber: 2,
      roundInCycle: 1,
      cycleLength: expectedCycleLength,
    });

    const generatedRound = state.rounds[state.activeRoundNumber - 1];
    const generatedMatchIds = generatedRound.matches.map((match) => match.id);

    state = scoreActiveRound(state, [[16, 11], [12, 12]]);

    expect(getRoundProgress(state)).toMatchObject({ completedMatches: generatedRound.matches.length, isComplete: true });
    expect(state.results.filter((result) => generatedMatchIds.includes(result.matchId))).toHaveLength(generatedMatchIds.length);
    expect(calculateLiveStandings(state)).toHaveLength(playerCount / 2);
    expect(mapLiveTournamentToPersistencePayload(state).rounds).toHaveLength(expectedCycleLength + 1);

    saveActiveTournament(state);
    const reloadedState = loadActiveTournament();

    expect(reloadedState?.activeRoundNumber).toBe(expectedCycleLength + 1);
    expect(reloadedState?.results.filter((result) => generatedMatchIds.includes(result.matchId))).toHaveLength(generatedMatchIds.length);
    expect(reloadedState ? calculateLiveStandings(reloadedState) : []).toHaveLength(playerCount / 2);
  });

  it("keeps the 4-pair special-case ordering valid through three complete rotations", () => {
    let state = createFastPartnerTournament(8, 1);
    const teams = createFixedPartnerTeams(state.players);
    const cycleLength = 6;

    for (let roundNumber = 1; roundNumber <= cycleLength * 3; roundNumber += 1) {
      expect(state.activeRoundNumber).toBe(roundNumber);
      expect(getLiveAmericanoCycleStatus(state)).toMatchObject({
        cycleLength,
        cycleNumber: Math.floor((roundNumber - 1) / cycleLength) + 1,
        roundInCycle: ((roundNumber - 1) % cycleLength) + 1,
      });

      state = scoreActiveRound(state);

      if (roundNumber < cycleLength * 3) {
        expect(canGoToNextRound(state)).toBe(true);
        state = goToNextRound(state);
      }
    }

    expect(state.rounds).toHaveLength(cycleLength * 3);
    expect(state.rounds.map((round) => round.roundNumber)).toEqual(Array.from({ length: cycleLength * 3 }, (_, index) => index + 1));
    expect(calculateLiveStandings(state)).toHaveLength(4);

    for (let start = 0; start < state.rounds.length; start += cycleLength) {
      const cycleRounds = state.rounds.slice(start, start + cycleLength);
      const analysis = analyzeFixedPairSchedule(teams, cycleRounds);
      const byeDetails = analyzePairByeDetails(teams, cycleRounds);

      expect(analysis.metrics.cycleOpponentCoverage).toBe(1);
      expect(analysis.metrics.matchSpread).toBe(0);
      expect(analysis.metrics.byeSpread).toBe(0);
      expect(analysis.metrics.maxConsecutiveByes).toBe(2);
      expect(byeDetails.totalConsecutiveByeOccurrences).toBe(2);
      expect(byeDetails.firstConsecutiveByeRound).toBeGreaterThanOrEqual(cycleRounds[0].roundNumber + 2);
      expect(getRoundPairIds(cycleRounds[1]).sort()).toEqual(getByePairIds(teams, cycleRounds[0]).sort());
    }

    const fullAnalysis = analyzeFixedPairSchedule(teams, state.rounds);

    expect(fullAnalysis.metrics.matchSpread).toBe(0);
    expect(fullAnalysis.metrics.byeSpread).toBe(0);
    expect(fullAnalysis.metrics.opponentFrequencySpread).toBe(0);
  });

  it("allows mid-cycle finish without bye stats affecting standings", () => {
    let state = createFastPartnerTournament(10, 2);

    state = scoreActiveRound(state);
    state = goToNextRound(state);
    state = scoreActiveRound(state);

    const completedState = finishTournament(state);
    const standings = calculateLiveStandings(completedState);

    expect(completedState.status).toBe("finished");
    expect(completedState.rounds).toHaveLength(8);
    expect(completedState.results).toHaveLength(4);
    expect(standings).toHaveLength(5);
    expect(standings.reduce((sum, row) => sum + row.wins + row.draws + row.losses, 0)).toBe(8);
  });
});

function createPlayers(count: number): TournamentPlayer[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index + 1}`,
    name: `Spiller ${index + 1}`,
  }));
}

function createFastPartnerTournament(playerCount: number, courts: number): LiveTournamentState {
  return createTournamentFromSetup({
    name: `Fast Makker Americano ${playerCount}/${courts}`,
    format: "Fast Makker Americano",
    playerText: createPlayers(playerCount).map((player) => player.name).join("\n"),
    femalePlayerText: "",
    malePlayerText: "",
    courts,
    rounds: 99,
    scoringMode: "Fri scoring",
    firstRoundOrder: "manual",
    rankingMode: "matchPointsFirst",
  });
}

function scoreActiveRound(
  state: LiveTournamentState,
  scores: ReadonlyArray<readonly [number, number]> = [[21, 10], [20, 12], [19, 13], [18, 14]],
): LiveTournamentState {
  return getLiveMatches(state).reduce((currentState, liveMatch, index) => saveMatchResult(currentState, {
    matchId: liveMatch.match.id,
    teamAPoints: scores[index % scores.length][0],
    teamBPoints: scores[index % scores.length][1],
  }), state);
}

function getRoundPairIds(round: TournamentRound): string[] {
  return round.matches.flatMap((match) => [match.teamA.id, match.teamB.id]);
}

function getByePairIds(teams: Team[], round: TournamentRound): string[] {
  const byePlayerIds = new Set(round.byePlayerIds ?? []);
  return teams
    .filter((team) => team.playerIds.every((playerId) => byePlayerIds.has(playerId)))
    .map((team) => team.id);
}

function analyzePairByeDetails(teams: Team[], rounds: TournamentRound[]): {
  firstConsecutiveByeRound: number | null;
  totalConsecutiveByeOccurrences: number;
} {
  const activePairIdsByRound = rounds.map((round) => new Set(getRoundPairIds(round)));
  const byeRunLengths = new Map(teams.map((team) => [team.id, 0]));
  let firstConsecutiveByeRound: number | null = null;
  let totalConsecutiveByeOccurrences = 0;

  for (let index = 0; index < rounds.length; index += 1) {
    for (const team of teams) {
      if (activePairIdsByRound[index].has(team.id)) {
        byeRunLengths.set(team.id, 0);
        continue;
      }

      const byeRunLength = (byeRunLengths.get(team.id) ?? 0) + 1;
      byeRunLengths.set(team.id, byeRunLength);

      if (byeRunLength > 1) {
        totalConsecutiveByeOccurrences += 1;
        firstConsecutiveByeRound ??= rounds[index].roundNumber;
      }
    }
  }

  return {
    firstConsecutiveByeRound,
    totalConsecutiveByeOccurrences,
  };
}
