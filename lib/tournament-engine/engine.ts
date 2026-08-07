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
  createFixedPartnerRound,
  createFixedPartnerTeams,
  createGreedyAmericanoRound,
  createMexicanoRoundFromRanking,
  createMixedAmericanoRound,
  orderedPlayers,
} from "./round-generation";
import { canonicalPairKey, seededShuffle } from "./utils";

interface ByeTracker {
  pauseCounts: Map<string, number>;
  previousByeIds: Set<string>;
}

export function createTournamentRounds(config: TournamentEngineConfig): TournamentRound[] {
  assertRounds(config.rounds);
  assertPlayerCount(config.players);
  assertCourts(config.courts);
  assertUniquePlayerIds(config.players);

  const players = orderedPlayers(config.players, config.firstRoundOrder, config.randomSeed);

  switch (config.format) {
    case "americano":
      return createAmericanoRounds(players, config.rounds, config.courts);
    case "mexicano":
      return [createNextMexicanoRoundFromPlayerRanking(players, 1, config.courts)];
    case "fixed-partner-americano":
      return createFixedPartnerRounds(orderedFixedPartnerTeams(config), config.rounds, false, config.courts);
    case "fixed-partner-mexicano":
      return [createNextFixedMexicanoRoundFromTeamRanking(orderedFixedPartnerTeams(config), 1, config.courts)];
    case "mixed-americano":
      return createMixedAmericanoRounds(players, config.rounds, config.courts);
    case "pool-play":
      throw new Error("Puljespil opretter runder via puljemotoren.");
    default:
      return assertNever(config.format);
  }
}

function orderedFixedPartnerTeams(config: TournamentEngineConfig): Team[] {
  const teams = createFixedPartnerTeams(config.players);

  return config.firstRoundOrder === "random" ? seededShuffle(teams, config.randomSeed) : teams;
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

function createAmericanoRounds(players: TournamentEngineConfig["players"], rounds: number, courts: number): TournamentRound[] {
  const generatedRounds: TournamentRound[] = [];
  const previousPairKeys = new Set<string>();
  const byeTracker = createByeTracker(players.map((player) => player.id));

  for (let roundNumber = 1; roundNumber <= rounds; roundNumber += 1) {
    const selection = selectActivePlayers(players, getActivePlayerCount(players.length, courts), byeTracker, roundNumber);
    const round = roundNumber === 1 ? createAmericanoOpeningRound(selection.activePlayers, 1) : createGreedyAmericanoRound(selection.activePlayers, roundNumber, previousPairKeys);

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

  for (let roundNumber = 1; roundNumber <= rounds; roundNumber += 1) {
    const selection = selectActiveTeams(teams, getActiveTeamCount(teams.length, courts), byeTracker, roundNumber);
    generatedRounds.push(withByes(createFixedPartnerRound(selection.activeTeams, roundNumber, mexicanoRanking), selection.byePlayerIds));
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

  return Array.from({ length: rounds }, (_, index) => {
    const roundNumber = index + 1;
    const femaleSelection = selectActivePlayers(females, playablePairCount, femaleByeTracker, roundNumber);
    const maleSelection = selectActivePlayers(males, playablePairCount, maleByeTracker, roundNumber);
    return withByes(createMixedAmericanoRound(femaleSelection.activePlayers, maleSelection.activePlayers, roundNumber), [...femaleSelection.byePlayerIds, ...maleSelection.byePlayerIds]);
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

function assertNever(value: never): never {
  throw new Error(`Ukendt turneringsformat: ${value}`);
}
