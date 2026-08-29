import type { Team, TournamentMatch, TournamentPlayer, TournamentRound } from "../../lib/tournament-engine";

export interface PlayerFairnessRow {
  id: string;
  name: string;
  roundsPlayed: number;
  matchesPlayed: number;
  byeCount: number;
  uniquePartners: number;
  partnerFrequencies: Record<string, number>;
  repeatedPartners: number;
  uniqueOpponents: number;
  opponentFrequencies: Record<string, number>;
  repeatedOpponents: number;
  consecutiveByes: number;
}

export interface PairFairnessRow {
  id: string;
  matchesPlayed: number;
  byeCount: number;
  opponentsFaced: number;
  opponentFrequencies: Record<string, number>;
  repeatedOpponents: number;
  consecutiveByes: number;
}

export interface FairnessGlobalMetrics {
  minMatches: number;
  maxMatches: number;
  matchSpread: number;
  minByes: number;
  maxByes: number;
  byeSpread: number;
  maxConsecutiveByes: number;
  partnerFrequencyMin: number;
  partnerFrequencyMax: number;
  partnerFrequencySpread: number;
  opponentFrequencyMin: number;
  opponentFrequencyMax: number;
  opponentFrequencySpread: number;
  cyclePartnerCoverage: number;
  cycleOpponentCoverage: number;
}

export interface IndividualProofResult {
  kind: "americano";
  courts: number;
  players: number;
  activePerRound: number;
  byesPerRound: number;
  provenCycleLength: number;
  playerRows: PlayerFairnessRow[];
  metrics: FairnessGlobalMetrics;
  durationMs: number;
  iterationCount: number;
}

export interface FixedPairProofResult {
  kind: "fixed-partner-americano";
  courts: number;
  pairs: number;
  activePairsPerRound: number;
  pairByesPerRound: number;
  provenCycleLength: number;
  pairRows: PairFairnessRow[];
  metrics: FairnessGlobalMetrics;
  durationMs: number;
  iterationCount: number;
}

export interface MixedProofResult {
  kind: "mixed-americano";
  courts: number;
  women: number;
  men: number;
  activeWomenPerRound: number;
  activeMenPerRound: number;
  byesPerGenderPerRound: number;
  provenCycleLength: number;
  playerRows: PlayerFairnessRow[];
  metrics: FairnessGlobalMetrics;
  durationMs: number;
  iterationCount: number;
}

interface FrequencyState {
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

export function proveAmericanoCycle(players: TournamentPlayer[], courts: number): IndividualProofResult {
  const activePerRound = getActivePlayerCount(players.length, courts);
  const byesPerRound = players.length - activePerRound;
  const lowerBound = Math.ceil(totalUnorderedPairs(players.length) / (activePerRound / 2));

  return measureDuration(() => {
    const rounds = findShortestPassingSchedule(
      lowerBound,
      Math.max(lowerBound + players.length * 3, players.length * 6),
      (cycleLength) => buildIndividualSchedule(players, courts, cycleLength),
      (roundsToAnalyze) => {
        const metrics = analyzeIndividualSchedule(players, roundsToAnalyze).metrics;
        return hasBalancedCycle(metrics) && metrics.cyclePartnerCoverage === 1;
      },
    );
    const analysis = analyzeIndividualSchedule(players, rounds);
    return {
      kind: "americano" as const,
      courts,
      players: players.length,
      activePerRound,
      byesPerRound,
      provenCycleLength: rounds.length,
      playerRows: analysis.playerRows,
      metrics: analysis.metrics,
      iterationCount: rounds.length,
    };
  });
}

export function proveFixedPartnerAmericanoCycle(teams: Team[], courts: number): FixedPairProofResult {
  const activePairsPerRound = getActiveTeamCount(teams.length, courts);
  const pairByesPerRound = teams.length - activePairsPerRound;
  const lowerBound = Math.ceil(totalUnorderedPairs(teams.length) / (activePairsPerRound / 2));

  return measureDuration(() => {
    const rounds = findShortestPassingSchedule(
      lowerBound,
      Math.max(lowerBound + teams.length * 3, teams.length * 6),
      (cycleLength) => buildFixedPairSchedule(teams, courts, cycleLength),
      (roundsToAnalyze) => {
        const metrics = analyzeFixedPairSchedule(teams, roundsToAnalyze).metrics;
        const allowedConsecutiveByes = teams.length === 4 && courts === 1 ? 2 : 1;
        return hasBalancedCycle(metrics, allowedConsecutiveByes) && metrics.cycleOpponentCoverage === 1;
      },
    );
    const analysis = analyzeFixedPairSchedule(teams, rounds);
    return {
      kind: "fixed-partner-americano" as const,
      courts,
      pairs: teams.length,
      activePairsPerRound,
      pairByesPerRound,
      provenCycleLength: rounds.length,
      pairRows: analysis.pairRows,
      metrics: analysis.metrics,
      iterationCount: rounds.length,
    };
  });
}

export function proveMixedAmericanoCycle(females: TournamentPlayer[], males: TournamentPlayer[], courts: number): MixedProofResult {
  if (females.length !== males.length) {
    throw new Error("Mixed Americano proof requires equal female and male counts.");
  }

  const activePerGender = getActiveMixedGenderCount(females.length, courts);
  const lowerBound = Math.ceil((females.length * males.length) / activePerGender);

  return measureDuration(() => {
    const partnerUniverse = createMixedPartnerUniverse(females, males);
    const rounds = findShortestPassingSchedule(
      lowerBound,
      Math.max(lowerBound + females.length * 3, females.length * 6),
      (cycleLength) => buildMixedSchedule(females, males, courts, cycleLength),
      (roundsToAnalyze) => {
        const metrics = analyzeIndividualSchedule([...females, ...males], roundsToAnalyze, partnerUniverse).metrics;
        return hasBalancedCycle(metrics) && metrics.cyclePartnerCoverage === 1;
      },
    );
    const analysis = analyzeIndividualSchedule([...females, ...males], rounds, partnerUniverse);
    return {
      kind: "mixed-americano" as const,
      courts,
      women: females.length,
      men: males.length,
      activeWomenPerRound: activePerGender,
      activeMenPerRound: activePerGender,
      byesPerGenderPerRound: females.length - activePerGender,
      provenCycleLength: rounds.length,
      playerRows: analysis.playerRows,
      metrics: analysis.metrics,
      iterationCount: rounds.length,
    };
  });
}

export function analyzeIndividualSchedule(
  players: TournamentPlayer[],
  rounds: TournamentRound[],
  partnerUniverse = createUnorderedUniverse(players.map((player) => player.id)),
): { playerRows: PlayerFairnessRow[]; metrics: FairnessGlobalMetrics } {
  const ids = players.map((player) => player.id);
  const names = new Map(players.map((player) => [player.id, player.name]));
  const state = createFrequencyState(ids);
  const playedRounds = new Map(ids.map((id) => [id, 0]));
  const presentPairs = new Set<string>();

  for (const round of rounds) {
    const roundPlayerIds = new Set(round.matches.flatMap((match) => allMatchPlayerIds(match)));

    for (const id of ids) {
      if (roundPlayerIds.has(id)) {
        playedRounds.set(id, (playedRounds.get(id) ?? 0) + 1);
        state.matches.set(id, (state.matches.get(id) ?? 0) + 1);
        state.consecutiveByes.set(id, 0);
      } else {
        state.byes.set(id, (state.byes.get(id) ?? 0) + 1);
        const consecutive = (state.consecutiveByes.get(id) ?? 0) + 1;
        state.consecutiveByes.set(id, consecutive);
        state.maxConsecutiveByes.set(id, Math.max(state.maxConsecutiveByes.get(id) ?? 0, consecutive));
      }
    }

    for (const match of round.matches) {
      const partnerPairs = [match.teamA.playerIds, match.teamB.playerIds] as const;
      for (const pair of partnerPairs) {
        const key = pairKey(pair[0], pair[1]);
        presentPairs.add(key);
        incrementPairFrequency(state.partners, pair[0], pair[1]);
      }

      for (const left of match.teamA.playerIds) {
        for (const right of match.teamB.playerIds) {
          incrementPairFrequency(state.opponents, left, right);
        }
      }
    }
  }

  const playerRows = ids.map((id) => {
    const partnerFrequencies = frequenciesForId(state.partners, id);
    const opponentFrequencies = frequenciesForId(state.opponents, id);
    return {
      id,
      name: names.get(id) ?? id,
      roundsPlayed: playedRounds.get(id) ?? 0,
      matchesPlayed: state.matches.get(id) ?? 0,
      byeCount: state.byes.get(id) ?? 0,
      uniquePartners: Object.keys(partnerFrequencies).length,
      partnerFrequencies,
      repeatedPartners: repeatedRelationshipCount(partnerFrequencies),
      uniqueOpponents: Object.keys(opponentFrequencies).length,
      opponentFrequencies,
      repeatedOpponents: repeatedRelationshipCount(opponentFrequencies),
      consecutiveByes: state.maxConsecutiveByes.get(id) ?? 0,
    };
  });

  return {
    playerRows,
    metrics: createGlobalMetrics(playerRows, state.partners, state.opponents, partnerUniverse, createUnorderedUniverse(ids)),
  };
}

export function analyzeFixedPairSchedule(teams: Team[], rounds: TournamentRound[]): { pairRows: PairFairnessRow[]; metrics: FairnessGlobalMetrics } {
  const ids = teams.map((team) => team.id);
  const playerIdsByTeamId = new Map(teams.map((team) => [team.id, team.playerIds]));
  const matches = new Map(ids.map((id) => [id, 0]));
  const byes = new Map(ids.map((id) => [id, 0]));
  const consecutiveByes = new Map(ids.map((id) => [id, 0]));
  const maxConsecutiveByes = new Map(ids.map((id) => [id, 0]));
  const opponents = new Map<string, number>();

  for (const round of rounds) {
    const activeTeamIds = new Set(round.matches.flatMap((match) => [match.teamA.id, match.teamB.id]));

    for (const id of ids) {
      if (activeTeamIds.has(id)) {
        matches.set(id, (matches.get(id) ?? 0) + 1);
        consecutiveByes.set(id, 0);
      } else {
        byes.set(id, (byes.get(id) ?? 0) + 1);
        const consecutive = (consecutiveByes.get(id) ?? 0) + 1;
        consecutiveByes.set(id, consecutive);
        maxConsecutiveByes.set(id, Math.max(maxConsecutiveByes.get(id) ?? 0, consecutive));
      }
    }

    for (const match of round.matches) {
      incrementPairFrequency(opponents, match.teamA.id, match.teamB.id);
    }
  }

  const pairRows = ids.map((id) => {
    const opponentFrequencies = frequenciesForId(opponents, id);
    return {
      id,
      matchesPlayed: matches.get(id) ?? 0,
      byeCount: byes.get(id) ?? 0,
      opponentsFaced: Object.keys(opponentFrequencies).length,
      opponentFrequencies,
      repeatedOpponents: repeatedRelationshipCount(opponentFrequencies),
      consecutiveByes: maxConsecutiveByes.get(id) ?? 0,
    };
  });

  const playerLikeRows = pairRows.map((row) => ({
    id: row.id,
    name: row.id,
    roundsPlayed: row.matchesPlayed,
    matchesPlayed: row.matchesPlayed,
    byeCount: row.byeCount,
    uniquePartners: 1,
    partnerFrequencies: playerIdsByTeamId.get(row.id) ? { [row.id]: row.matchesPlayed } : {},
    repeatedPartners: 0,
    uniqueOpponents: row.opponentsFaced,
    opponentFrequencies: row.opponentFrequencies,
    repeatedOpponents: row.repeatedOpponents,
    consecutiveByes: row.consecutiveByes,
  }));

  return {
    pairRows,
    metrics: createGlobalMetrics(playerLikeRows, new Map(), opponents, new Set(), createUnorderedUniverse(ids)),
  };
}

function buildIndividualSchedule(players: TournamentPlayer[], courts: number, cycleLength: number): TournamentRound[] {
  const ids = players.map((player) => player.id);
  const activeCount = getActivePlayerCount(ids.length, courts);
  const state = createFrequencyState(ids);

  return Array.from({ length: cycleLength }, (_, index) => {
    const roundNumber = index + 1;
    const activeIds = chooseActiveIds(ids, activeCount, state, roundNumber);
    const matches = chooseIndividualMatches(activeIds, courts, state).map((match, matchIndex) => createMatch(roundNumber, matchIndex + 1, match));
    updateIndividualState(ids, matches, state);
    return withByes({ roundNumber, matches }, ids.filter((id) => !activeIds.includes(id)));
  });
}

function buildFixedPairSchedule(teams: Team[], courts: number, cycleLength: number): TournamentRound[] {
  const ids = teams.map((team) => team.id);
  const teamById = new Map(teams.map((team) => [team.id, team]));
  const activeCount = getActiveTeamCount(ids.length, courts);
  const state = createFrequencyState(ids);

  return Array.from({ length: cycleLength }, (_, index) => {
    const roundNumber = index + 1;
    const activeIds = chooseActiveIds(ids, activeCount, state, roundNumber);
    const matches = chooseFixedPairMatches(activeIds, state).map(([teamAId, teamBId], matchIndex) => ({
      id: `r${roundNumber}-c${matchIndex + 1}`,
      roundNumber,
      courtNumber: matchIndex + 1,
      teamA: teamById.get(teamAId) ?? fail(`Unknown team ${teamAId}`),
      teamB: teamById.get(teamBId) ?? fail(`Unknown team ${teamBId}`),
    }));
    updateFixedPairState(ids, activeIds, matches, state);
    return withByes({ roundNumber, matches }, ids.filter((id) => !activeIds.includes(id)).flatMap((id) => teamById.get(id)?.playerIds ?? []));
  });
}

function buildMixedSchedule(females: TournamentPlayer[], males: TournamentPlayer[], courts: number, cycleLength: number): TournamentRound[] {
  const femaleIds = females.map((player) => player.id);
  const maleIds = males.map((player) => player.id);
  const ids = [...femaleIds, ...maleIds];
  const activePerGender = getActiveMixedGenderCount(femaleIds.length, courts);
  const state = createFrequencyState(ids);
  let previousFemaleByes = new Set<string>();
  let previousMaleByes = new Set<string>();

  return Array.from({ length: cycleLength }, (_, index) => {
    const roundNumber = index + 1;
    state.previousByes = previousFemaleByes;
    const activeFemaleIds = chooseActiveIds(femaleIds, activePerGender, state, roundNumber);
    previousFemaleByes = new Set(femaleIds.filter((id) => !activeFemaleIds.includes(id)));
    state.previousByes = previousMaleByes;
    const activeMaleIds = chooseActiveIds(maleIds, activePerGender, state, roundNumber);
    previousMaleByes = new Set(maleIds.filter((id) => !activeMaleIds.includes(id)));
    const mixedTeams = chooseMixedTeams(activeFemaleIds, activeMaleIds, state);
    const matches = pairMixedTeamsIntoMatches(mixedTeams, state).map((match, matchIndex) => createMatch(roundNumber, matchIndex + 1, match));
    updateIndividualState(ids, matches, state);
    return withByes({ roundNumber, matches }, ids.filter((id) => !activeFemaleIds.includes(id) && !activeMaleIds.includes(id)));
  });
}

function findShortestPassingSchedule(
  lowerBound: number,
  upperBound: number,
  build: (cycleLength: number) => TournamentRound[],
  passes: (rounds: TournamentRound[]) => boolean,
): TournamentRound[] {
  for (let cycleLength = lowerBound; cycleLength <= upperBound; cycleLength += 1) {
    const rounds = build(cycleLength);

    if (passes(rounds)) {
      return rounds;
    }
  }

  throw new Error(`No passing fairness cycle found between ${lowerBound} and ${upperBound} rounds.`);
}

function hasBalancedCycle(metrics: FairnessGlobalMetrics, allowedConsecutiveByes = 1): boolean {
  return metrics.matchSpread <= 1 && metrics.byeSpread <= 1 && metrics.maxConsecutiveByes <= allowedConsecutiveByes;
}

function chooseActiveIds(ids: string[], activeCount: number, state: FrequencyState, roundNumber: number): string[] {
  if (activeCount >= ids.length) {
    state.previousByes = new Set<string>();
    return [...ids];
  }

  const rotated = rotate(ids, roundNumber - 1);
  const selected = [...rotated]
    .sort((left, right) => (
      previousByePriority(left, right, state) ||
      (state.matches.get(left) ?? 0) - (state.matches.get(right) ?? 0) ||
      (state.byes.get(right) ?? 0) - (state.byes.get(left) ?? 0) ||
      rotated.indexOf(left) - rotated.indexOf(right)
    ))
    .slice(0, activeCount);

  state.previousByes = new Set(ids.filter((id) => !selected.includes(id)));
  return selected;
}

function chooseIndividualMatches(activeIds: string[], courts: number, state: FrequencyState): CandidateMatch[] {
  const targetMatches = Math.min(courts, activeIds.length / 4);
  const teams = choosePartnerTeams(activeIds, state, samePoolPartnerCandidates);
  return pairTeamsIntoMatches(teams.slice(0, targetMatches * 2), state);
}

function choosePartnerTeams(
  activeIds: string[],
  state: FrequencyState,
  getCandidates: (id: string, remaining: string[]) => string[],
): Array<[string, string]> {
  const remaining = [...activeIds];
  const teams: Array<[string, string]> = [];

  while (remaining.length >= 2) {
    const left = remaining
      .map((id) => ({ id, candidates: getCandidates(id, remaining.filter((otherId) => otherId !== id)) }))
      .sort((a, b) => a.candidates.length - b.candidates.length || activeIds.indexOf(a.id) - activeIds.indexOf(b.id))[0].id;
    const leftIndex = remaining.indexOf(left);
    remaining.splice(leftIndex, 1);

    const right = getCandidates(left, remaining)
      .sort((a, b) => (
        getPairFrequency(state.partners, left, a) - getPairFrequency(state.partners, left, b) ||
        (state.matches.get(a) ?? 0) - (state.matches.get(b) ?? 0) ||
        activeIds.indexOf(a) - activeIds.indexOf(b)
      ))[0] ?? remaining[0];
    remaining.splice(remaining.indexOf(right), 1);
    teams.push([left, right]);
  }

  return teams;
}

function samePoolPartnerCandidates(_id: string, remaining: string[]): string[] {
  return remaining;
}

function chooseMixedTeams(femaleIds: string[], maleIds: string[], state: FrequencyState): Array<[string, string]> {
  const remainingFemales = [...femaleIds];
  const remainingMales = [...maleIds];
  const teams: Array<[string, string]> = [];

  while (remainingFemales.length > 0 && remainingMales.length > 0) {
    const female = remainingFemales.shift() ?? fail("Missing female player");
    const male = [...remainingMales].sort((left, right) => (
      getPairFrequency(state.partners, female, left) - getPairFrequency(state.partners, female, right) ||
      remainingMales.indexOf(left) - remainingMales.indexOf(right)
    ))[0];
    remainingMales.splice(remainingMales.indexOf(male), 1);
    teams.push([male, female]);
  }

  return teams;
}

function pairTeamsIntoMatches(teams: Array<[string, string]>, state: FrequencyState): CandidateMatch[] {
  const remaining = [...teams];
  const matches: CandidateMatch[] = [];

  while (remaining.length >= 2) {
    const teamA = remaining.shift() ?? fail("Missing team A");
    const teamBIndex = remaining
      .map((team, index) => ({ index, score: opponentScore(teamA, team, state) }))
      .sort((left, right) => left.score - right.score || left.index - right.index)[0].index;
    const teamB = remaining.splice(teamBIndex, 1)[0];
    matches.push({ teamAIds: teamA, teamBIds: teamB });
  }

  return matches;
}

function pairMixedTeamsIntoMatches(teams: Array<[string, string]>, state: FrequencyState): CandidateMatch[] {
  return pairTeamsIntoMatches(teams, state);
}

function chooseFixedPairMatches(activeIds: string[], state: FrequencyState): Array<[string, string]> {
  const remaining = [...activeIds];
  const matches: Array<[string, string]> = [];

  while (remaining.length >= 2) {
    const left = remaining.shift() ?? fail("Missing fixed pair");
    const right = [...remaining].sort((a, b) => (
      getPairFrequency(state.opponents, left, a) - getPairFrequency(state.opponents, left, b) ||
      remaining.indexOf(a) - remaining.indexOf(b)
    ))[0];
    remaining.splice(remaining.indexOf(right), 1);
    matches.push([left, right]);
  }

  return matches;
}

function updateIndividualState(ids: string[], matches: TournamentMatch[], state: FrequencyState): void {
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

function updateFixedPairState(ids: string[], activeIds: string[], matches: TournamentMatch[], state: FrequencyState): void {
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

function createMatch(roundNumber: number, courtNumber: number, match: CandidateMatch): TournamentMatch {
  return {
    id: `r${roundNumber}-c${courtNumber}`,
    roundNumber,
    courtNumber,
    teamA: {
      id: `r${roundNumber}-${pairKey(match.teamAIds[0], match.teamAIds[1])}`,
      playerIds: match.teamAIds,
    },
    teamB: {
      id: `r${roundNumber}-${pairKey(match.teamBIds[0], match.teamBIds[1])}`,
      playerIds: match.teamBIds,
    },
  };
}

function createGlobalMetrics(
  rows: PlayerFairnessRow[],
  partnerFrequencies: Map<string, number>,
  opponentFrequencies: Map<string, number>,
  partnerUniverse: Set<string>,
  opponentUniverse: Set<string>,
): FairnessGlobalMetrics {
  const matchCounts = rows.map((row) => row.matchesPlayed);
  const byeCounts = rows.map((row) => row.byeCount);
  const partnerValues = valuesForUniverse(partnerFrequencies, partnerUniverse);
  const opponentValues = valuesForUniverse(opponentFrequencies, opponentUniverse);

  return {
    minMatches: Math.min(...matchCounts),
    maxMatches: Math.max(...matchCounts),
    matchSpread: spread(matchCounts),
    minByes: Math.min(...byeCounts),
    maxByes: Math.max(...byeCounts),
    byeSpread: spread(byeCounts),
    maxConsecutiveByes: Math.max(...rows.map((row) => row.consecutiveByes)),
    partnerFrequencyMin: partnerValues.length ? Math.min(...partnerValues) : 0,
    partnerFrequencyMax: partnerValues.length ? Math.max(...partnerValues) : 0,
    partnerFrequencySpread: spread(partnerValues),
    opponentFrequencyMin: opponentValues.length ? Math.min(...opponentValues) : 0,
    opponentFrequencyMax: opponentValues.length ? Math.max(...opponentValues) : 0,
    opponentFrequencySpread: spread(opponentValues),
    cyclePartnerCoverage: coverage(partnerFrequencies, partnerUniverse),
    cycleOpponentCoverage: coverage(opponentFrequencies, opponentUniverse),
  };
}

function createFrequencyState(ids: string[]): FrequencyState {
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

function getActivePlayerCount(playerCount: number, courts: number): number {
  const activeCount = Math.min(playerCount, courts * 4);
  const playableCount = activeCount - (activeCount % 4);

  if (playableCount < 4) {
    throw new Error("At least four active players are required.");
  }

  return playableCount;
}

function getActiveTeamCount(teamCount: number, courts: number): number {
  const activeCount = Math.min(teamCount, courts * 2);
  const playableCount = activeCount - (activeCount % 2);

  if (playableCount < 2) {
    throw new Error("At least two active pairs are required.");
  }

  return playableCount;
}

function getActiveMixedGenderCount(playerCountPerGender: number, courts: number): number {
  const activeCount = Math.min(playerCountPerGender, courts * 2);
  const playableCount = activeCount - (activeCount % 2);

  if (playableCount < 2) {
    throw new Error("At least two active players per gender are required.");
  }

  return playableCount;
}

function previousByePriority(left: string, right: string, state: FrequencyState): number {
  return (state.previousByes.has(left) ? -1 : 0) - (state.previousByes.has(right) ? -1 : 0);
}

function opponentScore(teamA: [string, string], teamB: [string, string], state: FrequencyState): number {
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
  const key = pairKey(left, right);
  frequencies.set(key, (frequencies.get(key) ?? 0) + 1);
}

function getPairFrequency(frequencies: Map<string, number>, left: string, right: string): number {
  return frequencies.get(pairKey(left, right)) ?? 0;
}

function frequenciesForId(frequencies: Map<string, number>, id: string): Record<string, number> {
  const entries = [...frequencies.entries()]
    .filter(([key]) => key.split("|").includes(id))
    .map(([key, count]) => [key.split("|").find((otherId) => otherId !== id) ?? id, count] as const);

  return Object.fromEntries(entries);
}

function repeatedRelationshipCount(frequencies: Record<string, number>): number {
  return Object.values(frequencies).filter((count) => count > 1).length;
}

function createUnorderedUniverse(ids: string[]): Set<string> {
  const universe = new Set<string>();

  for (let leftIndex = 0; leftIndex < ids.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < ids.length; rightIndex += 1) {
      universe.add(pairKey(ids[leftIndex], ids[rightIndex]));
    }
  }

  return universe;
}

function createMixedPartnerUniverse(females: TournamentPlayer[], males: TournamentPlayer[]): Set<string> {
  const universe = new Set<string>();

  for (const female of females) {
    for (const male of males) {
      universe.add(pairKey(female.id, male.id));
    }
  }

  return universe;
}

function valuesForUniverse(frequencies: Map<string, number>, universe: Set<string>): number[] {
  return [...universe].map((key) => frequencies.get(key) ?? 0);
}

function coverage(frequencies: Map<string, number>, universe: Set<string>): number {
  if (universe.size === 0) {
    return 1;
  }

  return [...universe].filter((key) => (frequencies.get(key) ?? 0) > 0).length / universe.size;
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

function pairKey(left: string, right: string): string {
  return [left, right].sort().join("|");
}

function measureDuration<T extends object>(work: () => T): T & { durationMs: number } {
  const start = performance.now();
  const result = work();
  return { ...result, durationMs: Math.round((performance.now() - start) * 100) / 100 };
}

function fail(message: string): never {
  throw new Error(message);
}
