import { describe, expect, it } from "vitest";
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
  createTournamentRounds,
  getMixedAmericanoActiveGenderCount,
  getMixedAmericanoCycleLength,
  type Gender,
  type TournamentPlayer,
  type TournamentRound,
} from "../lib/tournament-engine";
import { createTournamentFromSetup, loadActiveTournament, saveActiveTournament } from "../lib/tournament-setup";
import { analyzeIndividualSchedule } from "./support/fairness-proof";

const mixedCycleCases = [
  [1, 2, 2],
  [1, 3, 5],
  [2, 4, 4],
  [2, 5, 13],
  [2, 6, 20],
  [4, 8, 8],
  [4, 9, 47],
] as const;

describe("Mixed Americano automatic cycles", () => {
  it.each(mixedCycleCases)("uses the production Mixed scheduler for %i courts / %i women + %i men", (courts, genderCount, expectedCycleLength) => {
    const players = createMixedPlayers(genderCount);
    const cycleLength = getMixedAmericanoCycleLength(players, courts);
    const rounds = createTournamentRounds({ format: "mixed-americano", players, courts, rounds: cycleLength, firstRoundOrder: "manual" });
    const analysis = analyzeIndividualSchedule(players, rounds, createMixedPartnerUniverse(players));
    const genderMetrics = analyzeGenderMetrics(players, rounds);
    const activePerGender = getMixedAmericanoActiveGenderCount(genderCount, courts);

    expect(activePerGender).toBe(Math.min(genderCount, courts * 2) - (Math.min(genderCount, courts * 2) % 2));
    expect(cycleLength).toBe(expectedCycleLength);
    expect(rounds).toHaveLength(expectedCycleLength);
    expect(genderMetrics.femaleMatchSpread).toBeLessThanOrEqual(1);
    expect(genderMetrics.maleMatchSpread).toBeLessThanOrEqual(1);
    expect(genderMetrics.femaleByeSpread).toBeLessThanOrEqual(1);
    expect(genderMetrics.maleByeSpread).toBeLessThanOrEqual(1);
    expect(analysis.metrics.maxConsecutiveByes).toBeLessThanOrEqual(1);
    expect(analysis.metrics.cyclePartnerCoverage).toBe(1);

    for (const round of rounds) {
      assertMixedRound(round, players, courts, activePerGender);
    }
  });

  it("creates new Mixed Americano tournaments without manual configured rounds", () => {
    const state = createMixedTournament(5, 2);

    expect(state.format).toBe("mixed-americano");
    expect(state.configuredRounds).toBeUndefined();
    expect(state.automaticCycle).toEqual({ type: "automatic-cycle", cycleLength: 13 });
    expect(state.rounds).toHaveLength(13);
    expect(getLiveAmericanoCycleStatus(state)).toEqual({
      cycleNumber: 1,
      roundInCycle: 1,
      cycleLength: 13,
      isCycleComplete: false,
    });
  });

  it.each([
    [2, 1, 2],
    [3, 1, 5],
    [5, 2, 13],
  ] as const)("continues %iW + %iM on %i courts through three rotations", (genderCount, courts, cycleLength) => {
    let state = createMixedTournament(genderCount, courts);

    for (let roundNumber = 1; roundNumber <= cycleLength * 3; roundNumber += 1) {
      expect(state.activeRoundNumber).toBe(roundNumber);
      assertMixedRound(state.rounds[state.activeRoundNumber - 1], state.players, courts, getMixedAmericanoActiveGenderCount(genderCount, courts));
      state = scoreActiveRound(state);
      expect(getLiveAmericanoCycleStatus(state)).toMatchObject({
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
    expect(calculateLiveStandings(state)).toHaveLength(genderCount * 2);
  });

  it.each([
    [2, 1],
    [5, 2],
  ] as const)("saves Rotation 2 Mixed scores and survives reload for %iW + %iM on %i courts", (genderCount, courts) => {
    let state = createMixedTournament(genderCount, courts);
    const cycleLength = state.automaticCycle?.cycleLength ?? fail("Missing automatic cycle.");

    for (let roundNumber = 1; roundNumber <= cycleLength; roundNumber += 1) {
      state = scoreActiveRound(state);
      state = goToNextRound(state);
    }

    expect(state.activeRoundNumber).toBe(cycleLength + 1);
    expect(getLiveAmericanoCycleStatus(state)).toMatchObject({ cycleNumber: 2, roundInCycle: 1, cycleLength });

    const generatedRound = state.rounds[state.activeRoundNumber - 1];
    const generatedMatchIds = generatedRound.matches.map((match) => match.id);
    state = scoreActiveRound(state);

    expect(getRoundProgress(state)).toMatchObject({ completedMatches: generatedRound.matches.length, isComplete: true });
    expect(state.results.filter((result) => generatedMatchIds.includes(result.matchId))).toHaveLength(generatedMatchIds.length);
    expect(calculateLiveStandings(state)).toHaveLength(genderCount * 2);

    saveActiveTournament(state);
    const reloaded = loadActiveTournament();

    expect(reloaded?.activeRoundNumber).toBe(cycleLength + 1);
    expect(reloaded?.results.filter((result) => generatedMatchIds.includes(result.matchId))).toHaveLength(generatedMatchIds.length);
    expect(reloaded ? calculateLiveStandings(reloaded) : []).toHaveLength(genderCount * 2);
  });

  it("allows mid-cycle Mixed finish after bye rounds without scoring byes", () => {
    let state = createMixedTournament(5, 2);

    for (let roundNumber = 1; roundNumber <= 5; roundNumber += 1) {
      state = scoreActiveRound(state);
      if (roundNumber < 5) {
        state = goToNextRound(state);
      }
    }

    const finished = finishTournament(state, "2026-08-31T20:00:00.000Z");
    const standings = calculateLiveStandings(finished);

    expect(finished.status).toBe("finished");
    expect(finished.activeRoundNumber).toBe(5);
    expect(finished.rounds).toHaveLength(13);
    expect(finished.results).toHaveLength(10);
    expect(standings).toHaveLength(10);
    expect(standings.reduce((total, row) => total + row.wins + row.draws + row.losses, 0)).toBe(40);
    expect(standings.reduce((total, row) => total + row.matchPoints, 0)).toBe(60);
    expect(standings.reduce((total, row) => total + row.pointsFor, 0)).toBe(620);
    expect(standings.reduce((total, row) => total + row.pointsAgainst, 0)).toBe(620);
  });

  it.each([
    [5, 4],
    [6, 5],
    [7, 6],
  ])("rejects unequal Mixed Americano genders for %i women + %i men", (women, men) => {
    expect(() => createTournamentFromSetup({
      name: "Ulige Mixed",
      format: "Mixed Americano",
      playerText: "",
      femalePlayerText: createNames("Kvinde", women).join("\n"),
      malePlayerText: createNames("Mand", men).join("\n"),
      courts: 2,
      rounds: 1,
      scoringMode: "Fri scoring",
      firstRoundOrder: "manual",
      rankingMode: "matchPointsFirst",
    })).toThrow("Mixed Americano kraever samme antal kvinder og maend.");
  });

  it("rejects malformed Mixed Americano players without gender assignments", () => {
    expect(() => createTournamentRounds({
      format: "mixed-americano",
      players: createNames("Spiller", 8).map((name, index) => ({ id: `p${index + 1}`, name })),
      courts: 2,
      rounds: 1,
      firstRoundOrder: "manual",
    })).toThrow("Mixed Americano kraever koen paa alle spillere.");
  });
});

function createMixedTournament(genderCount: number, courts: number): LiveTournamentState {
  return createTournamentFromSetup({
    name: `Mixed ${genderCount}/${courts}`,
    format: "Mixed Americano",
    playerText: "",
    femalePlayerText: createNames("Kvinde", genderCount).join("\n"),
    malePlayerText: createNames("Mand", genderCount).join("\n"),
    courts,
    rounds: 99,
    scoringMode: "Fri scoring",
    firstRoundOrder: "manual",
    rankingMode: "matchPointsFirst",
  });
}

function createMixedPlayers(genderCount: number): TournamentPlayer[] {
  return [
    ...createGenderedPlayers("f", "Kvinde", genderCount, "female"),
    ...createGenderedPlayers("m", "Mand", genderCount, "male"),
  ];
}

function createGenderedPlayers(prefix: string, label: string, count: number, gender: Gender): TournamentPlayer[] {
  return createNames(label, count).map((name, index) => ({
    id: `${prefix}${index + 1}`,
    name,
    gender,
  }));
}

function createNames(label: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => `${label} ${index + 1}`);
}

function scoreActiveRound(state: LiveTournamentState): LiveTournamentState {
  return getLiveMatches(state).reduce((nextState, liveMatch, index) => saveMatchResult(nextState, {
    matchId: liveMatch.match.id,
    teamAPoints: 21 - (index % 2),
    teamBPoints: 10 + index,
  }), state);
}

function assertMixedRound(round: TournamentRound, players: TournamentPlayer[], courts: number, activePerGender: number): void {
  const genderById = new Map(players.map((player) => [player.id, player.gender]));
  const roundPlayerIds = round.matches.flatMap((match) => [...match.teamA.playerIds, ...match.teamB.playerIds]);
  const femaleIds = players.filter((player) => player.gender === "female").map((player) => player.id);
  const maleIds = players.filter((player) => player.gender === "male").map((player) => player.id);
  const byeIds = players.map((player) => player.id).filter((playerId) => !roundPlayerIds.includes(playerId));

  expect(round.matches).toHaveLength(Math.min(courts, activePerGender / 2));
  expect(roundPlayerIds).toHaveLength(activePerGender * 2);
  expect(new Set(roundPlayerIds).size).toBe(roundPlayerIds.length);
  expect(roundPlayerIds.filter((playerId) => genderById.get(playerId) === "female")).toHaveLength(activePerGender);
  expect(roundPlayerIds.filter((playerId) => genderById.get(playerId) === "male")).toHaveLength(activePerGender);
  expect(byeIds.filter((playerId) => femaleIds.includes(playerId))).toHaveLength(byeIds.filter((playerId) => maleIds.includes(playerId)).length);

  for (const match of round.matches) {
    const matchPlayerIds = [...match.teamA.playerIds, ...match.teamB.playerIds];
    expect(new Set(matchPlayerIds).size).toBe(4);
    expect(matchPlayerIds.filter((playerId) => genderById.get(playerId) === "female")).toHaveLength(2);
    expect(matchPlayerIds.filter((playerId) => genderById.get(playerId) === "male")).toHaveLength(2);
    expect(isMixedTeam(match.teamA.playerIds, genderById)).toBe(true);
    expect(isMixedTeam(match.teamB.playerIds, genderById)).toBe(true);
  }
}

function analyzeGenderMetrics(players: TournamentPlayer[], rounds: TournamentRound[]): {
  femaleMatchSpread: number;
  maleMatchSpread: number;
  femaleByeSpread: number;
  maleByeSpread: number;
} {
  const counts = new Map(players.map((player) => [player.id, { matches: 0, byes: 0 }]));

  for (const round of rounds) {
    const activeIds = new Set(round.matches.flatMap((match) => [...match.teamA.playerIds, ...match.teamB.playerIds]));

    for (const player of players) {
      const count = counts.get(player.id) ?? fail(`Missing player ${player.id}`);
      if (activeIds.has(player.id)) {
        count.matches += 1;
      } else {
        count.byes += 1;
      }
    }
  }

  const femaleCounts = players.filter((player) => player.gender === "female").map((player) => counts.get(player.id) ?? fail(`Missing player ${player.id}`));
  const maleCounts = players.filter((player) => player.gender === "male").map((player) => counts.get(player.id) ?? fail(`Missing player ${player.id}`));

  return {
    femaleMatchSpread: spread(femaleCounts.map((count) => count.matches)),
    maleMatchSpread: spread(maleCounts.map((count) => count.matches)),
    femaleByeSpread: spread(femaleCounts.map((count) => count.byes)),
    maleByeSpread: spread(maleCounts.map((count) => count.byes)),
  };
}

function createMixedPartnerUniverse(players: TournamentPlayer[]): Set<string> {
  const females = players.filter((player) => player.gender === "female");
  const males = players.filter((player) => player.gender === "male");
  const universe = new Set<string>();

  for (const female of females) {
    for (const male of males) {
      universe.add([female.id, male.id].sort().join("|"));
    }
  }

  return universe;
}

function isMixedTeam(playerIds: [string, string], genderById: Map<string, Gender | undefined>): boolean {
  return playerIds.some((playerId) => genderById.get(playerId) === "female") && playerIds.some((playerId) => genderById.get(playerId) === "male");
}

function spread(values: number[]): number {
  return Math.max(...values) - Math.min(...values);
}

function fail(message: string): never {
  throw new Error(message);
}
