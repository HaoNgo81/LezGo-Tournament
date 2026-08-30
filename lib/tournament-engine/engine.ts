import type { Team, TournamentEngineConfig, TournamentPlayer, TournamentRound } from "./types";
import {
  assertCourts,
  assertMixedPlayers,
  assertPlayerCount,
  assertRounds,
  assertUniquePlayerIds,
} from "./validation";
import { createAmericanoCycleRounds, getAmericanoCycleLength } from "./americano-cycle";
import {
  createFixedPartnerAmericanoRound,
  createFixedPartnerRound,
  createFixedPartnerTeams,
  createMexicanoRoundFromRanking,
  createMixedAmericanoRound,
} from "./round-generation";
import { seededShuffle, shuffleItems } from "./utils";

interface ByeTracker {
  pauseCounts: Map<string, number>;
  previousByeIds: Set<string>;
}

interface CourtBalanceTracker {
  courtCounts: Map<string, Map<number, number>>;
  recentCourts: Map<string, number[]>;
}

interface CourtPermutationEvaluation {
  penalty: number;
  maxProjectedSpread: number;
  sameCourtHits: number;
}

export function createTournamentRounds(config: TournamentEngineConfig): TournamentRound[] {
  assertRounds(config.rounds);
  assertPlayerCount(config.players);
  assertCourts(config.courts);
  assertUniquePlayerIds(config.players);

  const firstRoundOrder = config.firstRoundOrder ?? "random";
  const players = seedPlayers(config.players, firstRoundOrder, config.randomSeed);

  switch (config.format) {
    case "americano":
      return createAmericanoRounds(players, config.rounds, config.courts);
    case "mexicano":
      return [createNextMexicanoRoundFromPlayerRanking(players, 1, config.courts)];
    case "fixed-partner-americano":
      return createFixedPartnerRounds(seedTeams(createFixedPartnerTeams(config.players), firstRoundOrder, config.randomSeed), config.rounds, false, config.courts);
    case "fixed-partner-mexicano":
      return [createNextFixedMexicanoRoundFromTeamRanking(seedTeams(createFixedPartnerTeams(config.players), firstRoundOrder, config.randomSeed), 1, config.courts)];
    case "mixed-americano":
      return createMixedAmericanoRounds(config.players, config.rounds, config.courts, firstRoundOrder, config.randomSeed);
    case "pool-play":
      throw new Error("Puljespil opretter runder via puljemotoren.");
    default:
      return assertNever(config.format);
  }
}

function seedPlayers(players: TournamentPlayer[], firstRoundOrder: "manual" | "random", randomSeed?: number): TournamentPlayer[] {
  if (firstRoundOrder !== "random") {
    return [...players];
  }

  return randomSeed === undefined ? shuffleItems(players) : seededShuffle(players, randomSeed);
}

function seedTeams(teams: Team[], firstRoundOrder: "manual" | "random", randomSeed?: number): Team[] {
  if (firstRoundOrder !== "random") {
    return [...teams];
  }

  return randomSeed === undefined ? shuffleItems(teams) : seededShuffle(teams, randomSeed);
}

export function createNextMexicanoRoundFromPlayerRanking(playersByRanking: TournamentEngineConfig["players"], roundNumber: number, courts?: number): TournamentRound {
  assertPlayerCount(playersByRanking);
  assertUniquePlayerIds(playersByRanking);
  const activeCount = getActivePlayerCount(playersByRanking.length, courts ?? Math.floor(playersByRanking.length / 4));
  const activePlayers = playersByRanking.slice(0, activeCount);
  const byePlayerIds = playersByRanking.slice(activeCount).map((player) => player.id);
  return withByes(createMexicanoRoundFromRanking(activePlayers, roundNumber), byePlayerIds);
}

export function createNextFixedMexicanoRoundFromTeamRanking(teamsByRanking: Team[], roundNumber: number, courts?: number): TournamentRound {
  const activeTeamCount = getActiveTeamCount(teamsByRanking.length, courts ?? Math.floor(teamsByRanking.length / 2));
  const activeTeams = teamsByRanking.slice(0, activeTeamCount);
  const byePlayerIds = teamsByRanking.slice(activeTeamCount).flatMap((team) => team.playerIds);
  return withByes(createFixedPartnerRound(activeTeams, roundNumber, true), byePlayerIds);
}

export function rebalanceMixedAmericanoCourts(rounds: TournamentRound[]): TournamentRound[] {
  const courtTracker = createCourtBalanceTracker();

  return rounds.map((round) => assignBalancedCourts(round, courtTracker, (match) => [...match.teamA.playerIds, ...match.teamB.playerIds], true));
}

export function rebalanceFixedPartnerAmericanoCourts(rounds: TournamentRound[]): TournamentRound[] {
  const courtTracker = createCourtBalanceTracker();

  return rounds.map((round) => assignBalancedCourts(round, courtTracker, (match) => [match.teamA.id, match.teamB.id], true));
}

function createAmericanoRounds(players: TournamentEngineConfig["players"], rounds: number, courts: number): TournamentRound[] {
  const cycleLength = getAmericanoCycleLength(players, courts);
  const cycleCount = Math.ceil(rounds / cycleLength);

  return Array.from({ length: cycleCount }, (_, cycleIndex) => createAmericanoCycleRounds(players, courts, cycleLength, cycleIndex))
    .flat()
    .slice(0, rounds);
}

export function getFixedPartnerAmericanoActivePairCount(pairCount: number, courts: number): number {
  return getActiveTeamCount(pairCount, courts);
}

export function getFixedPartnerAmericanoCycleLength(teams: Team[], courts: number): number {
  const activePairsPerRound = getFixedPartnerAmericanoActivePairCount(teams.length, courts);
  const lowerBound = Math.ceil(totalUnorderedPairs(teams.length) / (activePairsPerRound / 2));
  const upperBound = Math.max(lowerBound + teams.length * 3, teams.length * 6);
  const allowedConsecutiveByes = getAllowedFixedPartnerConsecutiveByes(teams.length, courts);

  for (let cycleLength = lowerBound; cycleLength <= upperBound; cycleLength += 1) {
    const rounds = buildFixedPartnerAmericanoCycle(teams, courts, cycleLength, 0);

    if (passesFixedPartnerAmericanoCycle(teams, rounds, allowedConsecutiveByes)) {
      return cycleLength;
    }
  }

  throw new Error("Fast Makker Americano-rotationen kunne ikke planlaegges med fair oversidderpar.");
}

export function createFixedPartnerAmericanoCycleRounds(
  teams: Team[],
  courts: number,
  cycleLength = getFixedPartnerAmericanoCycleLength(teams, courts),
  cycleIndex = 0,
): TournamentRound[] {
  return buildFixedPartnerAmericanoCycle(teams, courts, cycleLength, cycleIndex);
}

export function createNextFixedPartnerAmericanoCycleRound(state: {
  players: TournamentPlayer[];
  rounds: TournamentRound[];
  courtCount?: number;
  automaticCycle?: { cycleLength: number };
}, roundNumber: number): TournamentRound {
  const courts = state.courtCount ?? Math.floor(state.players.length / 4);
  const teams = getFixedPartnerTeamsInCycleOrder(state.players, state.rounds);
  const cycleLength = state.automaticCycle?.cycleLength ?? getFixedPartnerAmericanoCycleLength(teams, courts);
  const cycleIndex = Math.floor((roundNumber - 1) / cycleLength);
  const roundIndex = (roundNumber - 1) % cycleLength;
  return createFixedPartnerAmericanoCycleRounds(teams, courts, cycleLength, cycleIndex)[roundIndex];
}

function createFixedPartnerAmericanoRounds(teams: Team[], rounds: number, courts: number): TournamentRound[] {
  const cycleLength = getFixedPartnerAmericanoCycleLength(teams, courts);
  const cycleCount = Math.ceil(rounds / cycleLength);

  return Array.from({ length: cycleCount }, (_, cycleIndex) => createFixedPartnerAmericanoCycleRounds(teams, courts, cycleLength, cycleIndex))
    .flat()
    .slice(0, rounds);
}

function createFixedPartnerRounds(teams: Team[], rounds: number, mexicanoRanking: boolean, courts: number): TournamentRound[] {
  if (!mexicanoRanking) {
    return createFixedPartnerAmericanoRounds(teams, rounds, courts);
  }

  const generatedRounds: TournamentRound[] = [];
  const byeTracker = createByeTracker(teams.map((team) => team.id));
  const courtTracker = createCourtBalanceTracker();

  for (let roundNumber = 1; roundNumber <= rounds; roundNumber += 1) {
    const selection = selectActiveTeams(teams, getActiveTeamCount(teams.length, courts), byeTracker, roundNumber);
    const generatedRound = mexicanoRanking ? createFixedPartnerRound(selection.activeTeams, roundNumber, true) : createFixedPartnerAmericanoRound(selection.activeTeams, roundNumber);
    const round = mexicanoRanking ? generatedRound : assignBalancedCourts(generatedRound, courtTracker, (match) => [match.teamA.id, match.teamB.id]);
    generatedRounds.push(withByes(round, selection.byePlayerIds));
  }

  return generatedRounds;
}

interface FixedPairFairnessState {
  matches: Map<string, number>;
  byes: Map<string, number>;
  previousByes: Set<string>;
  consecutiveByes: Map<string, number>;
  maxConsecutiveByes: Map<string, number>;
  opponents: Map<string, number>;
}

function buildFixedPartnerAmericanoCycle(teams: Team[], courts: number, cycleLength: number, cycleIndex: number): TournamentRound[] {
  const teamOrderOffset = teams.length === 4 && courts === 1 ? cycleIndex * 2 : cycleIndex;
  const orderedTeams = rotateIds(teams.map((team) => team.id), teamOrderOffset).map((teamId) => teams.find((team) => team.id === teamId) ?? fail(`Ukendt par: ${teamId}`));

  if (orderedTeams.length === 4 && courts === 1 && cycleLength === 6) {
    return buildFourPairSingleCourtCycle(orderedTeams, cycleIndex);
  }

  const teamById = new Map(orderedTeams.map((team) => [team.id, team]));
  const ids = orderedTeams.map((team) => team.id);
  const activeCount = getFixedPartnerAmericanoActivePairCount(orderedTeams.length, courts);
  const state = createFixedPairFairnessState(ids);
  const courtTracker = createCourtBalanceTracker();

  return Array.from({ length: cycleLength }, (_, index) => {
    const roundNumber = cycleIndex * cycleLength + index + 1;
    const activeIds = chooseFixedPartnerActiveIds(ids, activeCount, state, index + 1);
    const generatedRound: TournamentRound = {
      roundNumber,
      matches: chooseFixedPartnerOpponentMatches(activeIds, state).map(([teamAId, teamBId], matchIndex) => ({
        id: `r${roundNumber}-c${matchIndex + 1}`,
        roundNumber,
        courtNumber: matchIndex + 1,
        teamA: teamById.get(teamAId) ?? fail(`Ukendt par: ${teamAId}`),
        teamB: teamById.get(teamBId) ?? fail(`Ukendt par: ${teamBId}`),
      })),
    };
    const round = assignBalancedCourts(generatedRound, courtTracker, (match) => [match.teamA.id, match.teamB.id]);
    updateFixedPairFairnessState(ids, activeIds, round.matches, state);
    return withByes(round, ids.filter((id) => !activeIds.includes(id)).flatMap((id) => teamById.get(id)?.playerIds ?? []));
  });
}

function buildFourPairSingleCourtCycle(teams: Team[], cycleIndex: number): TournamentRound[] {
  const matchupIndexes: Array<[number, number]> = [
    [3, 0],
    [1, 2],
    [0, 1],
    [2, 3],
    [0, 2],
    [1, 3],
  ];

  return matchupIndexes.map(([teamAIndex, teamBIndex], index) => {
    const roundNumber = cycleIndex * matchupIndexes.length + index + 1;
    const teamA = teams[teamAIndex];
    const teamB = teams[teamBIndex];
    const activeIds = new Set([teamA.id, teamB.id]);
    const byePlayerIds = teams.filter((team) => !activeIds.has(team.id)).flatMap((team) => team.playerIds);

    return withByes({
      roundNumber,
      matches: [{
        id: `r${roundNumber}-c1`,
        roundNumber,
        courtNumber: 1,
        teamA,
        teamB,
      }],
    }, byePlayerIds);
  });
}

function createFixedPairFairnessState(ids: string[]): FixedPairFairnessState {
  return {
    matches: new Map(ids.map((id) => [id, 0])),
    byes: new Map(ids.map((id) => [id, 0])),
    previousByes: new Set<string>(),
    consecutiveByes: new Map(ids.map((id) => [id, 0])),
    maxConsecutiveByes: new Map(ids.map((id) => [id, 0])),
    opponents: new Map(),
  };
}

function chooseFixedPartnerActiveIds(ids: string[], activeCount: number, state: FixedPairFairnessState, roundNumber: number): string[] {
  if (activeCount >= ids.length) {
    state.previousByes = new Set<string>();
    return [...ids];
  }

  const rotated = rotateIds(ids, roundNumber - 1);
  const selected = [...rotated]
    .sort((left, right) => (
      (state.previousByes.has(left) ? -1 : 0) - (state.previousByes.has(right) ? -1 : 0) ||
      (state.matches.get(left) ?? 0) - (state.matches.get(right) ?? 0) ||
      (state.byes.get(right) ?? 0) - (state.byes.get(left) ?? 0) ||
      rotated.indexOf(left) - rotated.indexOf(right)
    ))
    .slice(0, activeCount);

  state.previousByes = new Set(ids.filter((id) => !selected.includes(id)));
  return selected;
}

function chooseFixedPartnerOpponentMatches(activeIds: string[], state: FixedPairFairnessState): Array<[string, string]> {
  const remaining = [...activeIds];
  const matches: Array<[string, string]> = [];

  while (remaining.length >= 2) {
    const left = remaining.shift() ?? fail("Mangler fast makkerpar.");
    const right = [...remaining].sort((a, b) => (
      getPairFrequency(state.opponents, left, a) - getPairFrequency(state.opponents, left, b) ||
      remaining.indexOf(a) - remaining.indexOf(b)
    ))[0];
    remaining.splice(remaining.indexOf(right), 1);
    matches.push([left, right]);
  }

  return matches;
}

function updateFixedPairFairnessState(ids: string[], activeIds: string[], matches: TournamentRound["matches"], state: FixedPairFairnessState): void {
  for (const id of ids) {
    if (activeIds.includes(id)) {
      state.matches.set(id, (state.matches.get(id) ?? 0) + 1);
      state.consecutiveByes.set(id, 0);
    } else {
      state.byes.set(id, (state.byes.get(id) ?? 0) + 1);
      const consecutive = (state.consecutiveByes.get(id) ?? 0) + 1;
      state.consecutiveByes.set(id, consecutive);
      state.maxConsecutiveByes.set(id, Math.max(state.maxConsecutiveByes.get(id) ?? 0, consecutive));
    }
  }

  for (const match of matches) {
    incrementPairFrequency(state.opponents, match.teamA.id, match.teamB.id);
  }
}

function passesFixedPartnerAmericanoCycle(teams: Team[], rounds: TournamentRound[], allowedConsecutiveByes: number): boolean {
  const ids = teams.map((team) => team.id);
  const state = createFixedPairFairnessState(ids);

  for (const round of rounds) {
    const activeTeamIds = round.matches.flatMap((match) => [match.teamA.id, match.teamB.id]);

    if (activeTeamIds.length !== new Set(activeTeamIds).size) {
      return false;
    }

    if (round.matches.some((match) => match.teamA.id === match.teamB.id || new Set([...match.teamA.playerIds, ...match.teamB.playerIds]).size !== 4)) {
      return false;
    }

    updateFixedPairFairnessState(ids, activeTeamIds, round.matches, state);
  }

  return (
    spread([...state.matches.values()]) <= 1 &&
    spread([...state.byes.values()]) <= 1 &&
    Math.max(...state.maxConsecutiveByes.values()) <= allowedConsecutiveByes &&
    [...createUnorderedUniverse(ids)].every((key) => (state.opponents.get(key) ?? 0) > 0)
  );
}

function getAllowedFixedPartnerConsecutiveByes(pairCount: number, courts: number): number {
  return pairCount === 4 && courts === 1 ? 2 : 1;
}

function getFixedPartnerTeamsInCycleOrder(players: TournamentPlayer[], rounds: TournamentRound[]): Team[] {
  const teams = createFixedPartnerTeams(players);
  const teamById = new Map(teams.map((team) => [team.id, team]));
  const seenIds: string[] = [];

  for (const match of rounds.flatMap((round) => round.matches)) {
    for (const teamId of [match.teamA.id, match.teamB.id]) {
      if (teamById.has(teamId) && !seenIds.includes(teamId)) {
        seenIds.push(teamId);
      }
    }
  }

  return [
    ...seenIds.map((teamId) => teamById.get(teamId) ?? fail(`Ukendt par: ${teamId}`)),
    ...teams.filter((team) => !seenIds.includes(team.id)),
  ];
}

function createMixedAmericanoRounds(
  players: TournamentEngineConfig["players"],
  rounds: number,
  courts: number,
  firstRoundOrder: "manual" | "random",
  randomSeed?: number,
): TournamentRound[] {
  assertMixedPlayers(players);

  const females = seedPlayers(players.filter((player) => player.gender === "female"), firstRoundOrder, randomSeed);
  const males = seedPlayers(players.filter((player) => player.gender === "male"), firstRoundOrder, randomSeed === undefined ? undefined : randomSeed + 1);
  const activePairCount = Math.min(females.length, Math.max(2, Math.min(courts * 2, Math.floor(players.length / 2))));
  const playablePairCount = activePairCount - (activePairCount % 2);
  const femaleByeTracker = createByeTracker(females.map((player) => player.id));
  const maleByeTracker = createByeTracker(males.map((player) => player.id));
  const courtTracker = createCourtBalanceTracker();

  return Array.from({ length: rounds }, (_, index) => {
    const roundNumber = index + 1;
    const femaleSelection = selectActivePlayers(females, playablePairCount, femaleByeTracker, roundNumber);
    const maleSelection = selectActivePlayers(males, playablePairCount, maleByeTracker, roundNumber);
    const generatedRound = createMixedAmericanoRound(femaleSelection.activePlayers, maleSelection.activePlayers, roundNumber);
    return withByes(assignBalancedCourts(generatedRound, courtTracker, (match) => [...match.teamA.playerIds, ...match.teamB.playerIds]), [...femaleSelection.byePlayerIds, ...maleSelection.byePlayerIds]);
  });
}

function createByeTracker(ids: string[]): ByeTracker {
  return {
    pauseCounts: new Map(ids.map((id) => [id, 0])),
    previousByeIds: new Set<string>(),
  };
}

function selectActivePlayers(players: TournamentPlayer[], activeCount: number, tracker: ByeTracker, roundNumber: number): { activePlayers: TournamentPlayer[]; byePlayerIds: string[] } {
  const activeIds = selectActiveIds(players.map((player) => player.id), activeCount, tracker, roundNumber);
  return {
    activePlayers: players.filter((player) => activeIds.has(player.id)),
    byePlayerIds: players.filter((player) => !activeIds.has(player.id)).map((player) => player.id),
  };
}

function selectActiveTeams(teams: Team[], activeCount: number, tracker: ByeTracker, roundNumber: number): { activeTeams: Team[]; byePlayerIds: string[] } {
  const activeIds = selectActiveIds(teams.map((team) => team.id), activeCount, tracker, roundNumber);
  return {
    activeTeams: teams.filter((team) => activeIds.has(team.id)),
    byePlayerIds: teams.filter((team) => !activeIds.has(team.id)).flatMap((team) => team.playerIds),
  };
}

function selectActiveIds(ids: string[], activeCount: number, tracker: ByeTracker, roundNumber: number): Set<string> {
  if (activeCount >= ids.length) {
    tracker.previousByeIds = new Set<string>();
    return new Set(ids);
  }

  const rotatedIds = rotateIds(ids, roundNumber - 1);
  const activeIds = new Set(
    [...rotatedIds]
      .sort((left, right) => compareActivePriority(left, right, tracker, rotatedIds))
      .slice(0, activeCount),
  );
  const byeIds = ids.filter((id) => !activeIds.has(id));

  for (const byeId of byeIds) {
    tracker.pauseCounts.set(byeId, (tracker.pauseCounts.get(byeId) ?? 0) + 1);
  }

  tracker.previousByeIds = new Set(byeIds);
  return activeIds;
}

function compareActivePriority(left: string, right: string, tracker: ByeTracker, rotatedIds: string[]): number {
  const leftHadPreviousBye = tracker.previousByeIds.has(left) ? 0 : 1;
  const rightHadPreviousBye = tracker.previousByeIds.has(right) ? 0 : 1;

  return (
    leftHadPreviousBye - rightHadPreviousBye ||
    (tracker.pauseCounts.get(left) ?? 0) - (tracker.pauseCounts.get(right) ?? 0) ||
    rotatedIds.indexOf(left) - rotatedIds.indexOf(right)
  );
}

function getActivePlayerCount(playerCount: number, courts: number): number {
  const activeCount = Math.min(playerCount, courts * 4);
  const playableCount = activeCount - (activeCount % 4);

  if (playableCount < 4) {
    throw new Error("Der skal vaere mindst 4 aktive spillere i hver runde.");
  }

  return playableCount;
}

function getActiveTeamCount(teamCount: number, courts: number): number {
  const activeCount = Math.min(teamCount, courts * 2);
  const playableCount = activeCount - (activeCount % 2);

  if (playableCount < 2) {
    throw new Error("Der skal vaere mindst 2 aktive hold i hver runde.");
  }

  return playableCount;
}

function withByes(round: TournamentRound, byePlayerIds: string[]): TournamentRound {
  return byePlayerIds.length ? { ...round, byePlayerIds } : round;
}

function rotateIds(ids: string[], offset: number): string[] {
  if (ids.length === 0) {
    return [];
  }

  const normalizedOffset = offset % ids.length;
  return [...ids.slice(normalizedOffset), ...ids.slice(0, normalizedOffset)];
}

function createCourtBalanceTracker(): CourtBalanceTracker {
  return {
    courtCounts: new Map<string, Map<number, number>>(),
    recentCourts: new Map<string, number[]>(),
  };
}

function assignBalancedCourts(
  round: TournamentRound,
  tracker: CourtBalanceTracker,
  getEntityIds: (match: TournamentRound["matches"][number]) => string[],
  preserveMatchIds = false,
): TournamentRound {
  if (round.matches.length <= 1) {
    updateCourtTracker(round, tracker, getEntityIds);
    return round;
  }

  const permutations = createIndexPermutations(round.matches.length);
  let bestPermutation = permutations[0];
  let bestEvaluation: CourtPermutationEvaluation | null = null;

  for (const permutation of permutations) {
    const evaluation = evaluateCourtPermutation(round, permutation, tracker, getEntityIds);

    if (!bestEvaluation || compareCourtPermutationEvaluation(evaluation, bestEvaluation) < 0) {
      bestEvaluation = evaluation;
      bestPermutation = permutation;
    }
  }

  const matches = bestPermutation.map((matchIndex, courtIndex) => ({
    ...round.matches[matchIndex],
    id: preserveMatchIds ? round.matches[matchIndex].id : `r${round.roundNumber}-c${courtIndex + 1}`,
    courtNumber: courtIndex + 1,
  }));
  const balancedRound = { ...round, matches };
  updateCourtTracker(balancedRound, tracker, getEntityIds);
  return balancedRound;
}

function evaluateCourtPermutation(
  round: TournamentRound,
  permutation: number[],
  tracker: CourtBalanceTracker,
  getEntityIds: (match: TournamentRound["matches"][number]) => string[],
): CourtPermutationEvaluation {
  let penalty = 0;
  let sameCourtHits = 0;
  const projectedCounts = new Map<string, Map<number, number>>();

  for (let courtIndex = 0; courtIndex < permutation.length; courtIndex += 1) {
    const match = round.matches[permutation[courtIndex]];
    const courtNumber = courtIndex + 1;
    const entityIds = getEntityIds(match);
    penalty += getCourtPenalty(entityIds, courtNumber, tracker);

    for (const entityId of entityIds) {
      if (tracker.recentCourts.get(entityId)?.at(-1) === courtNumber) {
        sameCourtHits += 1;
      }

      const courtCounts = new Map(tracker.courtCounts.get(entityId) ?? []);
      courtCounts.set(courtNumber, (courtCounts.get(courtNumber) ?? 0) + 1);
      projectedCounts.set(entityId, courtCounts);
    }
  }

  return {
    penalty,
    maxProjectedSpread: Math.max(...[...projectedCounts.values()].map((counts) => getCourtSpread(counts, permutation.length)), 0),
    sameCourtHits,
  };
}

function compareCourtPermutationEvaluation(left: CourtPermutationEvaluation, right: CourtPermutationEvaluation): number {
  return (
    left.penalty - right.penalty ||
    left.maxProjectedSpread - right.maxProjectedSpread ||
    left.sameCourtHits - right.sameCourtHits
  );
}

function getCourtPenalty(entityIds: string[], courtNumber: number, tracker: CourtBalanceTracker): number {
  return entityIds.reduce((totalPenalty, entityId) => {
    const courtCount = tracker.courtCounts.get(entityId)?.get(courtNumber) ?? 0;
    const recentCourts = tracker.recentCourts.get(entityId) ?? [];
    const consecutivePenalty = recentCourts.reduceRight((penalty, recentCourt, index) => (
      recentCourt === courtNumber && recentCourts.slice(index + 1).every((court) => court === courtNumber) ? penalty + 40 : penalty
    ), 0);

    return totalPenalty + courtCount * courtCount * courtCount * 30 + consecutivePenalty;
  }, 0);
}

function getCourtSpread(history: Map<number, number>, courts: number): number {
  const counts = Array.from({ length: courts }, (_, index) => history.get(index + 1) ?? 0);
  return Math.max(...counts) - Math.min(...counts);
}

function updateCourtTracker(round: TournamentRound, tracker: CourtBalanceTracker, getEntityIds: (match: TournamentRound["matches"][number]) => string[]): void {
  for (const match of round.matches) {
    for (const entityId of getEntityIds(match)) {
      const courtCounts = tracker.courtCounts.get(entityId) ?? new Map<number, number>();
      courtCounts.set(match.courtNumber, (courtCounts.get(match.courtNumber) ?? 0) + 1);
      tracker.courtCounts.set(entityId, courtCounts);

      const recentCourts = [...(tracker.recentCourts.get(entityId) ?? []), match.courtNumber].slice(-2);
      tracker.recentCourts.set(entityId, recentCourts);
    }
  }
}

function createIndexPermutations(length: number): number[][] {
  const indexes = Array.from({ length }, (_, index) => index);

  if (length > 7) {
    return [indexes];
  }

  const permutations: number[][] = [];

  function permute(remaining: number[], selected: number[]) {
    if (remaining.length === 0) {
      permutations.push(selected);
      return;
    }

    for (let index = 0; index < remaining.length; index += 1) {
      permute([...remaining.slice(0, index), ...remaining.slice(index + 1)], [...selected, remaining[index]]);
    }
  }

  permute(indexes, []);
  return permutations;
}

function incrementPairFrequency(frequencies: Map<string, number>, left: string, right: string): void {
  const key = [left, right].sort().join("|");
  frequencies.set(key, (frequencies.get(key) ?? 0) + 1);
}

function getPairFrequency(frequencies: Map<string, number>, left: string, right: string): number {
  return frequencies.get([left, right].sort().join("|")) ?? 0;
}

function createUnorderedUniverse(ids: string[]): Set<string> {
  const universe = new Set<string>();

  for (let leftIndex = 0; leftIndex < ids.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < ids.length; rightIndex += 1) {
      universe.add([ids[leftIndex], ids[rightIndex]].sort().join("|"));
    }
  }

  return universe;
}

function totalUnorderedPairs(count: number): number {
  return (count * (count - 1)) / 2;
}

function spread(values: number[]): number {
  return values.length ? Math.max(...values) - Math.min(...values) : 0;
}

function fail(message: string): never {
  throw new Error(message);
}

function assertNever(value: never): never {
  throw new Error(`Ukendt turneringsformat: ${value}`);
}
