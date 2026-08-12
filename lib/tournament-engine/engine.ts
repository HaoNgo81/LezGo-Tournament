import type { Team, TournamentEngineConfig, TournamentPlayer, TournamentRound } from "./types";
import {
  assertCourts,
  assertMixedPlayers,
  assertPlayerCount,
  assertRounds,
  assertUniquePlayerIds,
} from "./validation";
import {
  createAmericanoOpeningRound,
  createCycledAmericanoRound,
  createFixedPartnerAmericanoRound,
  createFixedPartnerRound,
  createFixedPartnerTeams,
  createGreedyAmericanoRound,
  createMexicanoRoundFromRanking,
  createMixedAmericanoRound,
} from "./round-generation";
import { canonicalPairKey } from "./utils";

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

  const players = [...config.players];

  switch (config.format) {
    case "americano":
      return createAmericanoRounds(players, config.rounds, config.courts);
    case "mexicano":
      return [createNextMexicanoRoundFromPlayerRanking(players, 1, config.courts)];
    case "fixed-partner-americano":
      return createFixedPartnerRounds(createFixedPartnerTeams(players), config.rounds, false, config.courts);
    case "fixed-partner-mexicano":
      return [createNextFixedMexicanoRoundFromTeamRanking(createFixedPartnerTeams(players), 1, config.courts)];
    case "mixed-americano":
      return createMixedAmericanoRounds(players, config.rounds, config.courts);
    case "pool-play":
      throw new Error("Puljespil opretter runder via puljemotoren.");
    default:
      return assertNever(config.format);
  }
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
  const generatedRounds: TournamentRound[] = [];
  const previousPairKeys = new Set<string>();
  const byeTracker = createByeTracker(players.map((player) => player.id));
  const courtTracker = createCourtBalanceTracker();

  for (let roundNumber = 1; roundNumber <= rounds; roundNumber += 1) {
    const selection = selectActivePlayers(players, getActivePlayerCount(players.length, courts), byeTracker, roundNumber);
    const generatedRound = selection.activePlayers.length % 2 === 0
      ? createCycledAmericanoRound(selection.activePlayers, roundNumber)
      : roundNumber === 1 ? createAmericanoOpeningRound(selection.activePlayers, 1) : createGreedyAmericanoRound(selection.activePlayers, roundNumber, previousPairKeys);
    const round = assignBalancedCourts(generatedRound, courtTracker, (match) => [...match.teamA.playerIds, ...match.teamB.playerIds]);

    for (const match of round.matches) {
      previousPairKeys.add(canonicalPairKey(match.teamA.playerIds));
      previousPairKeys.add(canonicalPairKey(match.teamB.playerIds));
    }

    generatedRounds.push(withByes(round, selection.byePlayerIds));
  }

  return generatedRounds;
}

function createFixedPartnerRounds(teams: Team[], rounds: number, mexicanoRanking: boolean, courts: number): TournamentRound[] {
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

function createMixedAmericanoRounds(players: TournamentEngineConfig["players"], rounds: number, courts: number): TournamentRound[] {
  assertMixedPlayers(players);

  const females = players.filter((player) => player.gender === "female");
  const males = players.filter((player) => player.gender === "male");
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

function assertNever(value: never): never {
  throw new Error(`Ukendt turneringsformat: ${value}`);
}
