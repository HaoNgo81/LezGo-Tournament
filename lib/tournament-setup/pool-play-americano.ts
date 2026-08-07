export interface PoolAmericanoTeam {
  playerIds: [string, string];
}

export interface PoolAmericanoMatch {
  id: string;
  poolId: string;
  roundNumber: number;
  courtNumber: number;
  teamA: PoolAmericanoTeam;
  teamB: PoolAmericanoTeam;
}

export interface PoolAmericanoRound {
  roundNumber: number;
  matches: PoolAmericanoMatch[];
  byeParticipantIds: string[];
}

export function createPoolAmericanoRounds(poolId: string, participantIds: string[]): PoolAmericanoRound[] {
  if (participantIds.length < 4) {
    throw new Error("En Americano-pulje kræver mindst 4 spillere.");
  }

  if (new Set(participantIds).size !== participantIds.length) {
    throw new Error("Spiller-id skal være unikke i en Americano-pulje.");
  }

  const partnerRounds = createUniquePartnerRounds(participantIds);
  const opponentCounts = new Map<string, number>();
  const rounds: PoolAmericanoRound[] = [];

  for (let roundIndex = 0; roundIndex < partnerRounds.length; roundIndex += 1) {
    const { teams, byeParticipantIds } = partnerRounds[roundIndex];
    const teamPairings = findBalancedPairings(
      teams,
      opponentRepeatScore,
      (team) => pairKey(...team.playerIds),
    );
    const roundNumber = roundIndex + 1;
    const matches = teamPairings.map(([teamA, teamB], matchIndex) => {
      for (const playerAId of teamA.playerIds) {
        for (const playerBId of teamB.playerIds) {
          incrementCount(opponentCounts, pairKey(playerAId, playerBId));
        }
      }

      return {
        id: `${poolId}-round-${roundNumber}-court-${matchIndex + 1}`,
        poolId,
        roundNumber,
        courtNumber: matchIndex + 1,
        teamA,
        teamB,
      };
    });

    rounds.push({ roundNumber, matches, byeParticipantIds });
  }

  return rounds;

  function opponentRepeatScore(teamA: PoolAmericanoTeam, teamB: PoolAmericanoTeam): number {
    return teamA.playerIds.reduce((total, playerAId) => (
      total + teamB.playerIds.reduce((teamTotal, playerBId) => (
        teamTotal + (opponentCounts.get(pairKey(playerAId, playerBId)) ?? 0)
      ), 0)
    ), 0);
  }
}

function createUniquePartnerRounds(participantIds: string[]): Array<{
  teams: PoolAmericanoTeam[];
  byeParticipantIds: string[];
}> {
  const remainder = participantIds.length % 4;
  const dummyCount = remainder === 0 ? 0 : remainder === 2 ? 2 : 1;
  const dummyIds = Array.from({ length: dummyCount }, (_, index) => `__pool_bye_${index + 1}__`);

  if (dummyIds.some((dummyId) => participantIds.includes(dummyId))) {
    throw new Error("Spiller-id bruger et reserveret oversidder-id.");
  }

  let factorRounds = createCirclePairingRounds([...participantIds, ...dummyIds]);

  if (remainder === 2) {
    factorRounds = factorRounds.filter((pairings) => !pairings.some(([firstId, secondId]) => (
      dummyIds.includes(firstId) && dummyIds.includes(secondId)
    )));
  }

  const additionalByeTeams = remainder === 3
    ? selectBalancedByeTeams(factorRounds, participantIds, dummyIds)
    : factorRounds.map(() => null);

  return factorRounds.map((pairings, roundIndex) => {
    const additionalByeTeam = additionalByeTeams[roundIndex];
    const teams: PoolAmericanoTeam[] = [];
    const byeParticipantIds: string[] = [];

    for (const [firstId, secondId] of pairings) {
      const firstIsDummy = dummyIds.includes(firstId);
      const secondIsDummy = dummyIds.includes(secondId);

      if (firstIsDummy || secondIsDummy) {
        if (!firstIsDummy) {
          byeParticipantIds.push(firstId);
        }
        if (!secondIsDummy) {
          byeParticipantIds.push(secondId);
        }
        continue;
      }

      if (additionalByeTeam && pairKey(firstId, secondId) === pairKey(...additionalByeTeam.playerIds)) {
        byeParticipantIds.push(firstId, secondId);
        continue;
      }

      teams.push({ playerIds: [firstId, secondId] });
    }

    return { teams, byeParticipantIds };
  });
}

function createCirclePairingRounds(participantIds: string[]): Array<Array<[string, string]>> {
  let rotation = [...participantIds];
  const rounds: Array<Array<[string, string]>> = [];

  for (let roundIndex = 0; roundIndex < participantIds.length - 1; roundIndex += 1) {
    const pairings: Array<[string, string]> = [];

    for (let pairIndex = 0; pairIndex < rotation.length / 2; pairIndex += 1) {
      pairings.push([rotation[pairIndex], rotation[rotation.length - 1 - pairIndex]]);
    }

    rounds.push(pairings);
    rotation = [rotation[0], rotation[rotation.length - 1], ...rotation.slice(1, -1)];
  }

  return rounds;
}

function selectBalancedByeTeams(
  factorRounds: Array<Array<[string, string]>>,
  participantIds: string[],
  dummyIds: string[],
): PoolAmericanoTeam[] {
  const candidatesByRound = factorRounds.map((round) => (
    round
      .filter(([firstId, secondId]) => !dummyIds.includes(firstId) && !dummyIds.includes(secondId))
      .map(([firstId, secondId]) => ({ playerIds: [firstId, secondId] as [string, string] }))
      .sort((left, right) => pairKey(...left.playerIds).localeCompare(pairKey(...right.playerIds), "da"))
  ));
  const random = createSeededRandom(participantIds.length * 9_973);

  for (let restart = 0; restart < 64; restart += 1) {
    const selectedTeams = candidatesByRound.map((candidates) => (
      candidates[Math.floor(random() * candidates.length)]
    ));
    const byeCounts = new Map(participantIds.map((participantId) => [participantId, 0]));

    for (const team of selectedTeams) {
      incrementCount(byeCounts, team.playerIds[0]);
      incrementCount(byeCounts, team.playerIds[1]);
    }

    let imbalance = calculateByeImbalance(byeCounts);

    for (let iteration = 0; iteration < 30_000; iteration += 1) {
      if (imbalance === 0) {
        return selectedTeams;
      }

      const roundIndex = Math.floor(random() * selectedTeams.length);
      const previousTeam = selectedTeams[roundIndex];
      const candidates = candidatesByRound[roundIndex];
      const nextTeam = candidates[Math.floor(random() * candidates.length)];

      if (pairKey(...previousTeam.playerIds) === pairKey(...nextTeam.playerIds)) {
        continue;
      }

      decrementCount(byeCounts, previousTeam.playerIds[0]);
      decrementCount(byeCounts, previousTeam.playerIds[1]);
      incrementCount(byeCounts, nextTeam.playerIds[0]);
      incrementCount(byeCounts, nextTeam.playerIds[1]);

      const nextImbalance = calculateByeImbalance(byeCounts);

      if (nextImbalance <= imbalance || random() < 0.005) {
        selectedTeams[roundIndex] = nextTeam;
        imbalance = nextImbalance;
      } else {
        decrementCount(byeCounts, nextTeam.playerIds[0]);
        decrementCount(byeCounts, nextTeam.playerIds[1]);
        incrementCount(byeCounts, previousTeam.playerIds[0]);
        incrementCount(byeCounts, previousTeam.playerIds[1]);
      }
    }
  }

  throw new Error("Americano-oversiddere kunne ikke fordeles ligeligt.");
}

function calculateByeImbalance(byeCounts: Map<string, number>): number {
  return [...byeCounts.values()].reduce((total, byeCount) => total + (byeCount - 2) ** 2, 0);
}

function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 4_294_967_296;
  };
}

function findBalancedPairings<T>(
  items: T[],
  repeatScore: (itemA: T, itemB: T) => number,
  identity: (item: T) => string,
): Array<[T, T]> {
  if (items.length % 2 !== 0) {
    throw new Error("Balanceret parring kræver et lige antal deltagere.");
  }

  if (items.length === 0) {
    return [];
  }

  const highestScore = items.reduce((highest, itemA, firstIndex) => (
    items.slice(firstIndex + 1).reduce((innerHighest, itemB) => (
      Math.max(innerHighest, repeatScore(itemA, itemB))
    ), highest)
  ), 0);

  for (let allowedScore = 0; allowedScore <= highestScore; allowedScore += 1) {
    const search = { attempts: 0, maxAttempts: 200_000 };
    const pairings = findPairingsAtScore(items, repeatScore, identity, allowedScore, search);

    if (pairings) {
      return pairings;
    }
  }

  return createGreedyPairings(items, repeatScore, identity);
}

function findPairingsAtScore<T>(
  items: T[],
  repeatScore: (itemA: T, itemB: T) => number,
  identity: (item: T) => string,
  allowedScore: number,
  search: { attempts: number; maxAttempts: number },
): Array<[T, T]> | null {
  search.attempts += 1;

  if (search.attempts > search.maxAttempts) {
    return null;
  }

  if (items.length === 0) {
    return [];
  }

  const pivotIndex = items.reduce((bestIndex, item, itemIndex) => {
    const eligibleCount = items.filter((candidate, candidateIndex) => (
      candidateIndex !== itemIndex && repeatScore(item, candidate) <= allowedScore
    )).length;
    const bestEligibleCount = items.filter((candidate, candidateIndex) => (
      candidateIndex !== bestIndex && repeatScore(items[bestIndex], candidate) <= allowedScore
    )).length;

    return eligibleCount < bestEligibleCount ? itemIndex : bestIndex;
  }, 0);
  const pivot = items[pivotIndex];
  const candidates = items
    .map((item, index) => ({ item, index }))
    .filter(({ index, item }) => index !== pivotIndex && repeatScore(pivot, item) <= allowedScore)
    .sort((left, right) => (
      repeatScore(pivot, left.item) - repeatScore(pivot, right.item)
      || identity(left.item).localeCompare(identity(right.item), "da")
    ));

  for (const candidate of candidates) {
    const remainingItems = items.filter((_, index) => index !== pivotIndex && index !== candidate.index);
    const remainingPairings = findPairingsAtScore(
      remainingItems,
      repeatScore,
      identity,
      allowedScore,
      search,
    );

    if (remainingPairings) {
      return [[pivot, candidate.item], ...remainingPairings];
    }
  }

  return null;
}

function createGreedyPairings<T>(
  items: T[],
  repeatScore: (itemA: T, itemB: T) => number,
  identity: (item: T) => string,
): Array<[T, T]> {
  const remainingItems = [...items];
  const pairings: Array<[T, T]> = [];

  while (remainingItems.length > 0) {
    const firstItem = remainingItems.shift() as T;
    const partnerIndex = remainingItems
      .map((item, index) => ({ item, index }))
      .sort((left, right) => (
        repeatScore(firstItem, left.item) - repeatScore(firstItem, right.item)
        || identity(left.item).localeCompare(identity(right.item), "da")
      ))[0].index;
    const partner = remainingItems.splice(partnerIndex, 1)[0];
    pairings.push([firstItem, partner]);
  }

  return pairings;
}

function pairKey(firstId: string, secondId: string): string {
  return [firstId, secondId].sort((left, right) => left.localeCompare(right, "da")).join(":");
}

function incrementCount(counts: Map<string, number>, key: string): void {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

function decrementCount(counts: Map<string, number>, key: string): void {
  counts.set(key, (counts.get(key) ?? 0) - 1);
}
