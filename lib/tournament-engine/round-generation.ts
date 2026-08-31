import type { Team, TournamentMatch, TournamentPlayer, TournamentRound } from "./types";
import { canonicalPairKey, seededShuffle } from "./utils";

function teamId(roundNumber: number, playerIds: [string, string]): string {
  return `r${roundNumber}-${canonicalPairKey(playerIds)}`;
}

function makeTeam(roundNumber: number, playerA: TournamentPlayer, playerB: TournamentPlayer): Team {
  return {
    id: teamId(roundNumber, [playerA.id, playerB.id]),
    playerIds: [playerA.id, playerB.id],
  };
}

function makeMatch(roundNumber: number, courtNumber: number, teamA: Team, teamB: Team): TournamentMatch {
  return {
    id: `r${roundNumber}-c${courtNumber}`,
    roundNumber,
    courtNumber,
    teamA,
    teamB,
  };
}

export function createAmericanoOpeningRound(players: TournamentPlayer[], roundNumber = 1): TournamentRound {
  const matches: TournamentMatch[] = [];

  for (let index = 0; index < players.length; index += 4) {
    const courtNumber = index / 4 + 1;
    const teamA = makeTeam(roundNumber, players[index], players[index + 1]);
    const teamB = makeTeam(roundNumber, players[index + 2], players[index + 3]);
    matches.push(makeMatch(roundNumber, courtNumber, teamA, teamB));
  }

  return { roundNumber, matches };
}

export function createMexicanoRoundFromRanking(players: TournamentPlayer[], roundNumber: number): TournamentRound {
  const matches: TournamentMatch[] = [];

  for (let index = 0; index < players.length; index += 4) {
    const courtNumber = index / 4 + 1;
    const teamA = makeTeam(roundNumber, players[index], players[index + 2]);
    const teamB = makeTeam(roundNumber, players[index + 1], players[index + 3]);
    matches.push(makeMatch(roundNumber, courtNumber, teamA, teamB));
  }

  return { roundNumber, matches };
}

export function createFixedPartnerTeams(players: TournamentPlayer[]): Team[] {
  if (players.length % 2 !== 0) {
    throw new Error("Fast Makker kraever et lige antal spillere.");
  }

  const teams: Team[] = [];

  for (let index = 0; index < players.length; index += 2) {
    teams.push({
      id: canonicalPairKey([players[index].id, players[index + 1].id]),
      playerIds: [players[index].id, players[index + 1].id],
    });
  }

  return teams;
}

export function createFixedPartnerRound(teams: Team[], roundNumber: number, mexicanoRanking = false): TournamentRound {
  const orderedTeams = mexicanoRanking ? teams : rotateTeams(teams, roundNumber - 1);
  const matches: TournamentMatch[] = [];

  for (let index = 0; index < orderedTeams.length; index += 2) {
    matches.push(makeMatch(roundNumber, index / 2 + 1, orderedTeams[index], orderedTeams[index + 1]));
  }

  return { roundNumber, matches };
}

export function createFixedPartnerMexicanoRoundFromPairRanking(teamsByRanking: Team[], roundNumber: number): TournamentRound {
  const matches: TournamentMatch[] = [];

  for (let index = 0; index < teamsByRanking.length; index += 2) {
    matches.push(makeMatch(roundNumber, index / 2 + 1, teamsByRanking[index], teamsByRanking[index + 1]));
  }

  return { roundNumber, matches };
}

export function createFixedPartnerAmericanoRound(teams: Team[], roundNumber: number): TournamentRound {
  const pairings = createRoundRobinPairings(orderedForAdjacentOpening(teams), roundNumber);

  return {
    roundNumber,
    matches: pairings.map(([teamA, teamB], index) => makeMatch(roundNumber, index + 1, teamA, teamB)),
  };
}

export function createMixedAmericanoRound(females: TournamentPlayer[], males: TournamentPlayer[], roundNumber: number): TournamentRound {
  const rotatedMales = rotatePlayers(males, roundNumber - 1);
  const mixedTeams: Team[] = females.map((female, index) => makeTeam(roundNumber, rotatedMales[index], female));
  const matches: TournamentMatch[] = [];

  for (let index = 0; index < mixedTeams.length; index += 2) {
    matches.push(makeMatch(roundNumber, index / 2 + 1, mixedTeams[index], mixedTeams[index + 1]));
  }

  return { roundNumber, matches };
}

export function createGreedyAmericanoRound(players: TournamentPlayer[], roundNumber: number, previousPairKeys: Set<string>): TournamentRound {
  const availablePlayers = [...players];
  const teams: Team[] = [];

  while (availablePlayers.length > 0) {
    const first = availablePlayers.shift();

    if (!first) {
      break;
    }

    const partnerIndex = findLeastRepeatedPartnerIndex(first, availablePlayers, previousPairKeys);
    const partner = availablePlayers.splice(partnerIndex, 1)[0];
    teams.push(makeTeam(roundNumber, first, partner));
    previousPairKeys.add(canonicalPairKey([first.id, partner.id]));
  }

  const matches: TournamentMatch[] = [];

  for (let index = 0; index < teams.length; index += 2) {
    matches.push(makeMatch(roundNumber, index / 2 + 1, teams[index], teams[index + 1]));
  }

  return { roundNumber, matches };
}

export function createCycledAmericanoRound(players: TournamentPlayer[], roundNumber: number): TournamentRound {
  const pairings = createRoundRobinPairings(orderedForAdjacentOpening(players), roundNumber);
  const teams = pairings.map(([playerA, playerB]) => makeTeam(roundNumber, playerA, playerB));
  const matches: TournamentMatch[] = [];

  for (let index = 0; index < teams.length; index += 2) {
    matches.push(makeMatch(roundNumber, index / 2 + 1, teams[index], teams[index + 1]));
  }

  return { roundNumber, matches };
}

export function orderedPlayers(players: TournamentPlayer[], firstRoundOrder: "manual" | "random" = "manual", randomSeed = 1): TournamentPlayer[] {
  return firstRoundOrder === "random" ? seededShuffle(players, randomSeed) : [...players];
}

function findLeastRepeatedPartnerIndex(player: TournamentPlayer, candidates: TournamentPlayer[], previousPairKeys: Set<string>): number {
  const newPartnerIndex = candidates.findIndex((candidate) => !previousPairKeys.has(canonicalPairKey([player.id, candidate.id])));
  return newPartnerIndex >= 0 ? newPartnerIndex : 0;
}

function rotatePlayers(players: TournamentPlayer[], offset: number): TournamentPlayer[] {
  if (players.length === 0) {
    return [];
  }

  const normalizedOffset = offset % players.length;
  return [...players.slice(normalizedOffset), ...players.slice(0, normalizedOffset)];
}

function rotateTeams(teams: Team[], roundOffset: number): Team[] {
  if (teams.length <= 2) {
    return [...teams];
  }

  const fixed = teams[0];
  const rotating = teams.slice(1);
  const normalizedOffset = roundOffset % rotating.length;
  return [fixed, ...rotating.slice(normalizedOffset), ...rotating.slice(0, normalizedOffset)];
}

function orderedForAdjacentOpening<T>(items: T[]): T[] {
  const left: T[] = [];
  const right: T[] = [];

  for (let index = 0; index < items.length; index += 2) {
    left.push(items[index]);
    if (items[index + 1]) {
      right.unshift(items[index + 1]);
    }
  }

  return [...left, ...right];
}

function createRoundRobinPairings<T>(items: T[], roundNumber: number): Array<[T, T]> {
  if (items.length % 2 !== 0) {
    throw new Error("Round-robin rotation kraever et lige antal deltagere.");
  }

  if (items.length < 2) {
    return [];
  }

  const cycleLength = items.length - 1;
  const normalizedOffset = (roundNumber - 1) % cycleLength;
  const fixed = items[0];
  const rotating = items.slice(1);
  const rotated = [
    fixed,
    ...rotating.slice(normalizedOffset),
    ...rotating.slice(0, normalizedOffset),
  ];
  const pairings: Array<[T, T]> = [];

  for (let index = 0; index < rotated.length / 2; index += 1) {
    pairings.push([rotated[index], rotated[rotated.length - 1 - index]]);
  }

  return pairings;
}


