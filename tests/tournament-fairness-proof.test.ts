import { afterAll, describe, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import {
  calculatePlayerStandings,
  calculateTeamStandings,
  createFixedPartnerTeams,
  createNextFixedMexicanoRoundFromTeamRanking,
  createNextMexicanoRoundFromPlayerRanking,
  createTournamentRounds,
  getMixedAmericanoCycleLength,
  type FixedTeamStandingInput,
  type MatchResult,
  type Team,
  type TournamentPlayer,
  type TournamentRound,
} from "../lib/tournament-engine";
import {
  proveAmericanoCycle,
  proveFixedPartnerAmericanoCycle,
  proveMixedAmericanoCycle,
} from "./support/fairness-proof";

interface ProofSummary {
  format: string;
  courts: number;
  entrants: string;
  activePerRound: string;
  byesPerRound: string;
  provenCycleLength: number;
  matchSpread: number;
  byeSpread: number;
  maxConsecutiveByes: number;
  partnerCoverage: string;
  partnerRepeatSpread: number;
  opponentRepeatMetric: string;
  durationMs: number;
}

const proofSummaries: ProofSummary[] = [];

afterAll(() => {
  if (process.env.PRINT_FAIRNESS_PROOF === "1") {
    console.info(JSON.stringify(proofSummaries, null, 2));
  }

  if (process.env.FAIRNESS_PROOF_OUTPUT) {
    writeFileSync(process.env.FAIRNESS_PROOF_OUTPUT, JSON.stringify(proofSummaries, null, 2));
  }
});

describe("tournament fairness proof infrastructure", () => {
  it.each([
    [1, 4],
    [1, 5],
    [1, 6],
    [1, 7],
    [2, 8],
    [2, 9],
    [2, 10],
    [2, 11],
    [3, 12],
    [3, 13],
    [3, 14],
    [3, 15],
    [4, 16],
    [4, 17],
    [4, 18],
    [4, 19],
    [4, 20],
    [4, 24],
  ])("proves an Americano fairness cycle for %i courts / %i players", (courts, playerCount) => {
    const result = proveAmericanoCycle(createPlayers(playerCount), courts);

    proofSummaries.push({
      format: "Americano",
      courts,
      entrants: `${playerCount} players`,
      activePerRound: `${result.activePerRound}`,
      byesPerRound: `${result.byesPerRound}`,
      provenCycleLength: result.provenCycleLength,
      matchSpread: result.metrics.matchSpread,
      byeSpread: result.metrics.byeSpread,
      maxConsecutiveByes: result.metrics.maxConsecutiveByes,
      partnerCoverage: formatCoverage(result.metrics.cyclePartnerCoverage),
      partnerRepeatSpread: result.metrics.partnerFrequencySpread,
      opponentRepeatMetric: `${result.metrics.opponentFrequencyMin}-${result.metrics.opponentFrequencyMax}`,
      durationMs: result.durationMs,
    });

    expect(result.metrics.matchSpread).toBeLessThanOrEqual(1);
    expect(result.metrics.byeSpread).toBeLessThanOrEqual(1);
    expect(result.metrics.maxConsecutiveByes).toBeLessThanOrEqual(1);
    expect(result.metrics.cyclePartnerCoverage).toBe(1);
    expect(result.metrics.partnerFrequencyMin).toBeGreaterThanOrEqual(1);
    expect(result.playerRows).toHaveLength(playerCount);
  });

  it.each([
    [1, 2],
    [1, 3],
    [1, 4],
    [2, 4],
    [2, 5],
    [2, 6],
    [2, 7],
    [4, 8],
    [4, 9],
    [4, 10],
  ])("proves a Fast Makker Americano fairness cycle for %i courts / %i pairs", (courts, pairCount) => {
    const teams = createFixedPartnerTeams(createPlayers(pairCount * 2));
    const result = proveFixedPartnerAmericanoCycle(teams, courts);
    const allowedConsecutiveByes = pairCount === 4 && courts === 1 ? 2 : 1;

    proofSummaries.push({
      format: "Fast Makker Americano",
      courts,
      entrants: `${pairCount} pairs`,
      activePerRound: `${result.activePairsPerRound} pairs`,
      byesPerRound: `${result.pairByesPerRound} pairs`,
      provenCycleLength: result.provenCycleLength,
      matchSpread: result.metrics.matchSpread,
      byeSpread: result.metrics.byeSpread,
      maxConsecutiveByes: result.metrics.maxConsecutiveByes,
      partnerCoverage: "fixed",
      partnerRepeatSpread: 0,
      opponentRepeatMetric: `${result.metrics.opponentFrequencyMin}-${result.metrics.opponentFrequencyMax}`,
      durationMs: result.durationMs,
    });

    expect(result.metrics.matchSpread).toBeLessThanOrEqual(1);
    expect(result.metrics.byeSpread).toBeLessThanOrEqual(1);
    expect(result.metrics.maxConsecutiveByes).toBeLessThanOrEqual(allowedConsecutiveByes);
    expect(result.metrics.cycleOpponentCoverage).toBe(1);
    expect(result.pairRows).toHaveLength(pairCount);
  });

  it.each([
    [1, 2],
    [1, 3],
    [2, 4],
    [2, 5],
    [2, 6],
    [4, 8],
    [4, 9],
  ] as const)("proves a Mixed Americano fairness cycle for %i courts / %i women + %i men", (courts, genderCount) => {
    const females = createGenderedPlayers("f", genderCount, "female");
    const males = createGenderedPlayers("m", genderCount, "male");
    const result = proveMixedAmericanoCycle(females, males, courts);
    const productionCycleLength = getMixedAmericanoCycleLength([...females, ...males], courts);
    const expectedCycleLengths = new Map<string, number>([
      ["1/2", 2],
      ["1/3", 5],
      ["2/4", 4],
      ["2/5", 13],
      ["2/6", 20],
      ["4/8", 8],
      ["4/9", 47],
    ]);

    proofSummaries.push({
      format: "Mixed Americano",
      courts,
      entrants: `${genderCount}W + ${genderCount}M`,
      activePerRound: `${result.activeWomenPerRound}W + ${result.activeMenPerRound}M`,
      byesPerRound: `${result.byesPerGenderPerRound}W + ${result.byesPerGenderPerRound}M`,
      provenCycleLength: result.provenCycleLength,
      matchSpread: result.metrics.matchSpread,
      byeSpread: result.metrics.byeSpread,
      maxConsecutiveByes: result.metrics.maxConsecutiveByes,
      partnerCoverage: formatCoverage(result.metrics.cyclePartnerCoverage),
      partnerRepeatSpread: result.metrics.partnerFrequencySpread,
      opponentRepeatMetric: `${result.metrics.opponentFrequencyMin}-${result.metrics.opponentFrequencyMax}`,
      durationMs: result.durationMs,
    });

    expect(productionCycleLength).toBe(result.provenCycleLength);
    expect(result.provenCycleLength).toBe(expectedCycleLengths.get(`${courts}/${genderCount}`));
    expect(result.metrics.matchSpread).toBeLessThanOrEqual(1);
    expect(result.metrics.byeSpread).toBeLessThanOrEqual(1);
    expect(result.metrics.maxConsecutiveByes).toBeLessThanOrEqual(1);
    expect(result.metrics.cyclePartnerCoverage).toBe(1);
    expect(result.playerRows).toHaveLength(genderCount * 2);
  });

  it.each([
    [5, 4],
    [6, 5],
    [7, 6],
  ])("keeps unequal Mixed Americano genders invalid for %i women + %i men", (women, men) => {
    const players = [
      ...createGenderedPlayers("f", women, "female"),
      ...createGenderedPlayers("m", men, "male"),
    ];

    expect(() => createTournamentRounds({ format: "mixed-americano", players, rounds: 1, courts: 2, firstRoundOrder: "manual" })).toThrow();
  });

  it.each([1, 2, 4])("stress-tests Mexicano generation for %i courts / 50 rounds", (courts) => {
    const result = runMexicanoStress(courts);

    expect(result.generatedRounds).toBe(50);
    expect(result.generatorExhaustion).toBe(false);
  });

  it.each([1, 2, 4])("stress-tests Fast Makker Mexicano generation for %i courts / 50 rounds", (courts) => {
    const result = runFixedMexicanoStress(courts);

    expect(result.generatedRounds).toBe(50);
    expect(result.fixedPairsPreserved).toBe(true);
    expect(result.generatorExhaustion).toBe(false);
  });

  it("collects machine-readable proof summaries", () => {
    expect(proofSummaries.length).toBeGreaterThan(0);
    expect(Math.max(...proofSummaries.map((summary) => summary.durationMs))).toBeLessThan(1000);
  });
});

function runMexicanoStress(courts: number): { generatedRounds: number; generatorExhaustion: boolean } {
  const players = createPlayers(courts * 4);
  const rounds: TournamentRound[] = [];
  const results: MatchResult[] = [];
  let ranking = players;

  for (let roundNumber = 1; roundNumber <= 50; roundNumber += 1) {
    const round = createNextMexicanoRoundFromPlayerRanking(ranking, roundNumber, courts);
    assertValidIndividualRound(round, players, courts);
    rounds.push(round);
    results.push(...scoreRound(round));
    ranking = calculatePlayerStandings(players, rounds, results).map((row) => players.find((player) => player.id === row.id) ?? fail(`Unknown player ${row.id}`));
  }

  return { generatedRounds: rounds.length, generatorExhaustion: false };
}

function runFixedMexicanoStress(courts: number): { generatedRounds: number; fixedPairsPreserved: boolean; generatorExhaustion: boolean } {
  const players = createPlayers(courts * 4);
  const teams = createFixedPartnerTeams(players);
  const teamInputs = teams.map((team) => ({ team, name: team.playerIds.join(" / ") }));
  const rounds: TournamentRound[] = [];
  const results: MatchResult[] = [];
  let ranking: Team[] = teams;

  for (let roundNumber = 1; roundNumber <= 50; roundNumber += 1) {
    const round = createNextFixedMexicanoRoundFromTeamRanking(ranking, roundNumber, courts);
    assertValidFixedRound(round, teams, courts);
    rounds.push(round);
    results.push(...scoreRound(round));
    ranking = calculateTeamStandings(teamInputsForRanking(teamInputs, ranking), rounds, results).map((row) => teams.find((team) => team.id === row.id) ?? fail(`Unknown team ${row.id}`));
  }

  return {
    generatedRounds: rounds.length,
    fixedPairsPreserved: rounds.every((round) => round.matches.every((match) => teams.some((team) => team.id === match.teamA.id) && teams.some((team) => team.id === match.teamB.id))),
    generatorExhaustion: false,
  };
}

function createPlayers(count: number): TournamentPlayer[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index + 1}`,
    name: `Player ${index + 1}`,
  }));
}

function createGenderedPlayers(prefix: string, count: number, gender: "female" | "male"): TournamentPlayer[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${prefix}${index + 1}`,
    name: `${prefix.toUpperCase()} ${index + 1}`,
    gender,
  }));
}

function assertValidIndividualRound(round: TournamentRound, players: TournamentPlayer[], courts: number): void {
  const activeIds = round.matches.flatMap((match) => [...match.teamA.playerIds, ...match.teamB.playerIds]);

  expect(round.matches).toHaveLength(courts);
  expect(activeIds).toHaveLength(courts * 4);
  expect(new Set(activeIds).size).toBe(activeIds.length);
  expect(activeIds.every((id) => players.some((player) => player.id === id))).toBe(true);
}

function assertValidFixedRound(round: TournamentRound, teams: Team[], courts: number): void {
  const activeTeamIds = round.matches.flatMap((match) => [match.teamA.id, match.teamB.id]);

  expect(round.matches).toHaveLength(courts);
  expect(activeTeamIds).toHaveLength(courts * 2);
  expect(new Set(activeTeamIds).size).toBe(activeTeamIds.length);
  expect(activeTeamIds.every((id) => teams.some((team) => team.id === id))).toBe(true);
}

function scoreRound(round: TournamentRound): MatchResult[] {
  return round.matches.map((match, index) => ({
    matchId: match.id,
    teamAPoints: 21 - (index % 3),
    teamBPoints: 10 + (index % 4),
  }));
}

function teamInputsForRanking(teamInputs: FixedTeamStandingInput[], ranking: Team[]): FixedTeamStandingInput[] {
  const inputById = new Map(teamInputs.map((input) => [input.team.id, input]));
  return ranking.map((team) => inputById.get(team.id) ?? fail(`Unknown team input ${team.id}`));
}

function formatCoverage(value: number): string {
  return `${Math.round(value * 10000) / 100}%`;
}

function fail(message: string): never {
  throw new Error(message);
}
