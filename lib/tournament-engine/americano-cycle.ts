import type { TournamentMatch, TournamentPlayer, TournamentRound } from "./types";
import { canonicalPairKey } from "./utils";

interface FairnessState {
  matches: Map<string, number>;
  byes: Map<string, number>;
  previousByes: Set<string>;
  consecutiveByes: Map<string, number>;
  maxConsecutiveByes: Map<string, number>;
  partners: Map<string, number>;
  opponents: Map<string, number>;
}

interface CandidateMatch {
  teamAIds: [string, string];
  teamBIds: [string, string];
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

export interface AmericanoCycleMetadata {
  type: "automatic-cycle";
  cycleLength: number;
}

export interface AmericanoCycleStatus {
  cycleLength: number;
  cycleNumber: number;
  roundInCycle: number;
  isCycleComplete: boolean;
}

export function getAmericanoCycleLength(players: TournamentPlayer[], courts: number): number {
  const activePerRound = getAmericanoActivePlayerCount(players.length, courts);
  const lowerBound = Math.ceil(totalUnorderedPairs(players.length) / (activePerRound / 2));
  const upperBound = Math.max(lowerBound + players.length * 3, players.length * 6);

  for (let cycleLength = lowerBound; cycleLength <= upperBound; cycleLength += 1) {
    const rounds = buildAmericanoCycle(players, courts, cycleLength, 0);

    if (passesAmericanoCycle(players, rounds)) {
      return cycleLength;
    }
  }

  throw new Error("Americano-rotationen kunne ikke planlægges med fair oversidning.");
}

export function createAmericanoCycleRounds(
  players: TournamentPlayer[],
  courts: number,
  cycleLength = getAmericanoCycleLength(players, courts),
  cycleIndex = 0,
): TournamentRound[] {
  return buildAmericanoCycle(players, courts, cycleLength, cycleIndex);
}

export function createNextAmericanoCycleRound(state: {
  players: TournamentPlayer[];
  rounds: TournamentRound[];
  courtCount?: number;
  automaticCycle?: AmericanoCycleMetadata;
}, roundNumber: number): TournamentRound {
  const courts = state.courtCount ?? Math.floor(state.players.length / 4);
  const cycleLength = state.automaticCycle?.cycleLength ?? getAmericanoCycleLength(state.players, courts);
  const cycleIndex = Math.floor((roundNumber - 1) / cycleLength);
  const roundIndex = (roundNumber - 1) % cycleLength;
  return createAmericanoCycleRounds(state.players, courts, cycleLength, cycleIndex)[roundIndex];
}

export function getAmericanoCycleStatus(state: {
  format: string;
  activeRoundNumber: number;
  rounds: TournamentRound[];
  automaticCycle?: AmericanoCycleMetadata;
}): AmericanoCycleStatus | null {
  if ((state.format !== "americano" && state.format !== "fixed-partner-americano" && state.format !== "mixed-americano") || !state.automaticCycle) {
    return null;
  }

  const cycleLength = state.automaticCycle.cycleLength;
  const cycleNumber = Math.floor((state.activeRoundNumber - 1) / cycleLength) + 1;
  const roundInCycle = ((state.activeRoundNumber - 1) % cycleLength) + 1;

  return {
    cycleLength,
    cycleNumber,
    roundInCycle,
    isCycleComplete: roundInCycle === cycleLength,
  };
}

export function getAmericanoActivePlayerCount(playerCount: number, courts: number): number {
  const activeCount = Math.min(playerCount, courts * 4);
  const playableCount = activeCount - (activeCount % 4);

  if (playableCount < 4) {
    throw new Error("Der skal være mindst 4 aktive spillere i hver runde.");
  }

  return playableCount;
}

function buildAmericanoCycle(players: TournamentPlayer[], courts: number, cycleLength: number, cycleIndex: number): TournamentRound[] {
  const ids = rotate(players.map((player) => player.id), cycleIndex).map((id) => players.find((player) => player.id === id) ?? fail(`Ukendt spiller: ${id}`));
  const activeCount = getAmericanoActivePlayerCount(players.length, courts);
  const state = createFairnessState(ids.map((player) => player.id));
  const courtTracker = createCourtBalanceTracker();

  return Array.from({ length: cycleLength }, (_, index) => {
    const roundNumber = cycleIndex * cycleLength + index + 1;
    const activeIds = chooseActiveIds(ids.map((player) => player.id), activeCount, state, index + 1);
    const generatedRound = {
      roundNumber,
      matches: chooseMatches(activeIds, courts, state).map((match, matchIndex) => createMatch(roundNumber, matchIndex + 1, match)),
    };
    const balancedRound = assignBalancedCourts(generatedRound, courtTracker);
    const matches = balancedRound.matches;
    updateState(ids.map((player) => player.id), matches, state);
    return withByes({ roundNumber, matches }, ids.map((player) => player.id).filter((id) => !activeIds.includes(id)));
  });
}

function passesAmericanoCycle(players: TournamentPlayer[], rounds: TournamentRound[]): boolean {
  const ids = players.map((player) => player.id);
  const universe = createUnorderedUniverse(ids);
  const state = createFairnessState(ids);

  for (const round of rounds) {
    const roundPlayerIds = round.matches.flatMap((match) => allMatchPlayerIds(match));

    if (roundPlayerIds.length !== new Set(roundPlayerIds).size) {
      return false;
    }

    updateState(ids, round.matches, state);
  }

  return (
    spread([...state.matches.values()]) <= 1 &&
    spread([...state.byes.values()]) <= 1 &&
    Math.max(...state.maxConsecutiveByes.values()) <= 1 &&
    [...universe].every((key) => (state.partners.get(key) ?? 0) > 0)
  );
}

function chooseActiveIds(ids: string[], activeCount: number, state: FairnessState, roundNumber: number): string[] {
  if (activeCount >= ids.length) {
    state.previousByes = new Set<string>();
    return [...ids];
  }

  const rotated = rotate(ids, roundNumber - 1);
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

function chooseMatches(activeIds: string[], courts: number, state: FairnessState): CandidateMatch[] {
  const teams = choosePartnerTeams(activeIds, state);
  return pairTeamsIntoMatches(teams.slice(0, courts * 2), state);
}

function choosePartnerTeams(activeIds: string[], state: FairnessState): Array<[string, string]> {
  const remaining = [...activeIds];
  const teams: Array<[string, string]> = [];

  while (remaining.length >= 2) {
    const left = remaining
      .map((id) => ({ id, candidateCount: remaining.filter((otherId) => otherId !== id).length }))
      .sort((a, b) => a.candidateCount - b.candidateCount || activeIds.indexOf(a.id) - activeIds.indexOf(b.id))[0].id;
    remaining.splice(remaining.indexOf(left), 1);

    const right = [...remaining].sort((a, b) => (
      getPairFrequency(state.partners, left, a) - getPairFrequency(state.partners, left, b) ||
      (state.matches.get(a) ?? 0) - (state.matches.get(b) ?? 0) ||
      activeIds.indexOf(a) - activeIds.indexOf(b)
    ))[0];
    remaining.splice(remaining.indexOf(right), 1);
    teams.push([left, right]);
  }

  return teams;
}

function pairTeamsIntoMatches(teams: Array<[string, string]>, state: FairnessState): CandidateMatch[] {
  const remaining = [...teams];
  const matches: CandidateMatch[] = [];

  while (remaining.length >= 2) {
    const teamA = remaining.shift() ?? fail("Mangler hold A.");
    const teamBIndex = remaining
      .map((team, index) => ({ index, score: opponentScore(teamA, team, state) }))
      .sort((left, right) => left.score - right.score || left.index - right.index)[0].index;
    const teamB = remaining.splice(teamBIndex, 1)[0];
    matches.push({ teamAIds: teamA, teamBIds: teamB });
  }

  return matches;
}

function updateState(ids: string[], matches: TournamentMatch[], state: FairnessState): void {
  const activeIds = new Set(matches.flatMap((match) => allMatchPlayerIds(match)));

  for (const id of ids) {
    if (activeIds.has(id)) {
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
    incrementPairFrequency(state.partners, match.teamA.playerIds[0], match.teamA.playerIds[1]);
    incrementPairFrequency(state.partners, match.teamB.playerIds[0], match.teamB.playerIds[1]);

    for (const left of match.teamA.playerIds) {
      for (const right of match.teamB.playerIds) {
        incrementPairFrequency(state.opponents, left, right);
      }
    }
  }
}

function createMatch(roundNumber: number, courtNumber: number, match: CandidateMatch): TournamentMatch {
  return {
    id: `r${roundNumber}-c${courtNumber}`,
    roundNumber,
    courtNumber,
    teamA: {
      id: `r${roundNumber}-${canonicalPairKey(match.teamAIds)}`,
      playerIds: match.teamAIds,
    },
    teamB: {
      id: `r${roundNumber}-${canonicalPairKey(match.teamBIds)}`,
      playerIds: match.teamBIds,
    },
  };
}

function createFairnessState(ids: string[]): FairnessState {
  return {
    matches: new Map(ids.map((id) => [id, 0])),
    byes: new Map(ids.map((id) => [id, 0])),
    previousByes: new Set<string>(),
    consecutiveByes: new Map(ids.map((id) => [id, 0])),
    maxConsecutiveByes: new Map(ids.map((id) => [id, 0])),
    partners: new Map(),
    opponents: new Map(),
  };
}

function createCourtBalanceTracker(): CourtBalanceTracker {
  return {
    courtCounts: new Map<string, Map<number, number>>(),
    recentCourts: new Map<string, number[]>(),
  };
}

function assignBalancedCourts(round: TournamentRound, tracker: CourtBalanceTracker): TournamentRound {
  if (round.matches.length <= 1) {
    updateCourtTracker(round, tracker);
    return round;
  }

  const permutations = createIndexPermutations(round.matches.length);
  let bestPermutation = permutations[0];
  let bestEvaluation: CourtPermutationEvaluation | null = null;

  for (const permutation of permutations) {
    const evaluation = evaluateCourtPermutation(round, permutation, tracker);

    if (!bestEvaluation || compareCourtPermutationEvaluation(evaluation, bestEvaluation) < 0) {
      bestEvaluation = evaluation;
      bestPermutation = permutation;
    }
  }

  const matches = bestPermutation.map((matchIndex, courtIndex) => ({
    ...round.matches[matchIndex],
    id: `r${round.roundNumber}-c${courtIndex + 1}`,
    courtNumber: courtIndex + 1,
  }));
  const balancedRound = { ...round, matches };
  updateCourtTracker(balancedRound, tracker);
  return balancedRound;
}

function evaluateCourtPermutation(round: TournamentRound, permutation: number[], tracker: CourtBalanceTracker): CourtPermutationEvaluation {
  let penalty = 0;
  let sameCourtHits = 0;
  const projectedCounts = new Map<string, Map<number, number>>();

  for (let courtIndex = 0; courtIndex < permutation.length; courtIndex += 1) {
    const match = round.matches[permutation[courtIndex]];
    const courtNumber = courtIndex + 1;
    const playerIds = allMatchPlayerIds(match);
    penalty += getCourtPenalty(playerIds, courtNumber, tracker);

    for (const playerId of playerIds) {
      if (tracker.recentCourts.get(playerId)?.at(-1) === courtNumber) {
        sameCourtHits += 1;
      }

      const courtCounts = new Map(tracker.courtCounts.get(playerId) ?? []);
      courtCounts.set(courtNumber, (courtCounts.get(courtNumber) ?? 0) + 1);
      projectedCounts.set(playerId, courtCounts);
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

function getCourtPenalty(playerIds: string[], courtNumber: number, tracker: CourtBalanceTracker): number {
  return playerIds.reduce((totalPenalty, playerId) => {
    const courtCount = tracker.courtCounts.get(playerId)?.get(courtNumber) ?? 0;
    const recentCourts = tracker.recentCourts.get(playerId) ?? [];
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

function updateCourtTracker(round: TournamentRound, tracker: CourtBalanceTracker): void {
  for (const match of round.matches) {
    for (const playerId of allMatchPlayerIds(match)) {
      const courtCounts = tracker.courtCounts.get(playerId) ?? new Map<number, number>();
      courtCounts.set(match.courtNumber, (courtCounts.get(match.courtNumber) ?? 0) + 1);
      tracker.courtCounts.set(playerId, courtCounts);

      const recentCourts = [...(tracker.recentCourts.get(playerId) ?? []), match.courtNumber].slice(-2);
      tracker.recentCourts.set(playerId, recentCourts);
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

function opponentScore(teamA: [string, string], teamB: [string, string], state: FairnessState): number {
  return teamA.reduce((total, left) => (
    total + teamB.reduce((teamTotal, right) => teamTotal + getPairFrequency(state.opponents, left, right), 0)
  ), 0);
}

function withByes(round: TournamentRound, byePlayerIds: string[]): TournamentRound {
  return byePlayerIds.length ? { ...round, byePlayerIds } : round;
}

function allMatchPlayerIds(match: TournamentMatch): string[] {
  return [...match.teamA.playerIds, ...match.teamB.playerIds];
}

function incrementPairFrequency(frequencies: Map<string, number>, left: string, right: string): void {
  const key = canonicalPairKey([left, right]);
  frequencies.set(key, (frequencies.get(key) ?? 0) + 1);
}

function getPairFrequency(frequencies: Map<string, number>, left: string, right: string): number {
  return frequencies.get(canonicalPairKey([left, right])) ?? 0;
}

function createUnorderedUniverse(ids: string[]): Set<string> {
  const universe = new Set<string>();

  for (let leftIndex = 0; leftIndex < ids.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < ids.length; rightIndex += 1) {
      universe.add(canonicalPairKey([ids[leftIndex], ids[rightIndex]]));
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

function rotate<T>(items: T[], offset: number): T[] {
  const normalizedOffset = offset % items.length;
  return [...items.slice(normalizedOffset), ...items.slice(0, normalizedOffset)];
}

function fail(message: string): never {
  throw new Error(message);
}
