import type { MatchResult, StandingRow, StandingsRankingMode, Team, TournamentMatch, TournamentPlayer, TournamentRound } from "./types";

interface Accumulator {
  id: string;
  name: string;
  matchPoints: number;
  pointsFor: number;
  pointsAgainst: number;
  wins: number;
  draws: number;
  losses: number;
  headToHeadMatchPoints: number;
  headToHeadPointDifference: number;
  pauseCount: number;
}

interface ParticipantScore {
  id: string;
  pointsFor: number;
  pointsAgainst: number;
  matchPoints: number;
  won: boolean;
  draw: boolean;
}

export function calculatePlayerStandings(
  players: TournamentPlayer[],
  rounds: TournamentRound[],
  results: MatchResult[],
  rankingMode: StandingsRankingMode = "matchPointsFirst",
): StandingRow[] {
  const rows = new Map(players.map((player) => [player.id, createAccumulator(player.id, player.name)]));
  const resultMap = new Map(results.map((result) => [result.matchId, result]));
  const completedMatches = collectCompletedMatches(rounds, resultMap);

  applyPlayerByes(rows, rounds);

  for (const completedMatch of completedMatches) {
    const scores = getPlayerScores(completedMatch.match, completedMatch.result);
    applyScores(rows, scores);
  }

  applyHeadToHead(rows, completedMatches, (match, result) => getPlayerScores(match, result));

  return rankRows([...rows.values()], rankingMode);
}

export function calculateTeamStandings(
  teams: Team[],
  rounds: TournamentRound[],
  results: MatchResult[],
  rankingMode: StandingsRankingMode = "matchPointsFirst",
): StandingRow[] {
  const rows = new Map(teams.map((team) => [team.id, createAccumulator(team.id, team.id)]));
  const resultMap = new Map(results.map((result) => [result.matchId, result]));
  const completedMatches = collectCompletedMatches(rounds, resultMap);

  applyTeamByes(rows, rounds);

  for (const completedMatch of completedMatches) {
    const scores = getTeamScores(completedMatch.match, completedMatch.result);
    applyScores(rows, scores);
  }

  applyHeadToHead(rows, completedMatches, (match, result) => getTeamScores(match, result));

  return rankRows([...rows.values()], rankingMode);
}

function createAccumulator(id: string, name: string): Accumulator {
  return {
    id,
    name,
    matchPoints: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    headToHeadMatchPoints: 0,
    headToHeadPointDifference: 0,
    pauseCount: 0,
  };
}

function applyPlayerByes(rows: Map<string, Accumulator>, rounds: TournamentRound[]): void {
  for (const round of rounds) {
    for (const playerId of round.byePlayerIds ?? []) {
      const row = rows.get(playerId);

      if (row) {
        row.pauseCount += 1;
      }
    }
  }
}

function applyTeamByes(rows: Map<string, Accumulator>, rounds: TournamentRound[]): void {
  const teamIdsByPlayerId = new Map<string, string>();

  for (const rowId of rows.keys()) {
    for (const playerId of rowId.split("+")) {
      teamIdsByPlayerId.set(playerId, rowId);
    }
  }

  for (const round of rounds) {
    const pausedTeamIds = new Set((round.byePlayerIds ?? []).map((playerId) => teamIdsByPlayerId.get(playerId)).filter((teamId): teamId is string => Boolean(teamId)));

    for (const teamId of pausedTeamIds) {
      const row = rows.get(teamId);

      if (row) {
        row.pauseCount += 1;
      }
    }
  }
}

function collectCompletedMatches(rounds: TournamentRound[], resultMap: Map<string, MatchResult>): Array<{ match: TournamentMatch; result: MatchResult }> {
  return rounds.flatMap((round) =>
    round.matches.flatMap((match) => {
      const result = resultMap.get(match.id);
      return result ? [{ match, result }] : [];
    }),
  );
}

function getTeamScores(match: TournamentMatch, result: MatchResult): ParticipantScore[] {
  const teamAMatchPoints = getMatchPoints(result.teamAPoints, result.teamBPoints);
  const teamBMatchPoints = getMatchPoints(result.teamBPoints, result.teamAPoints);

  return [
    {
      id: match.teamA.id,
      pointsFor: result.teamAPoints,
      pointsAgainst: result.teamBPoints,
      matchPoints: teamAMatchPoints,
      won: teamAMatchPoints === 3,
      draw: teamAMatchPoints === 1,
    },
    {
      id: match.teamB.id,
      pointsFor: result.teamBPoints,
      pointsAgainst: result.teamAPoints,
      matchPoints: teamBMatchPoints,
      won: teamBMatchPoints === 3,
      draw: teamBMatchPoints === 1,
    },
  ];
}

function getPlayerScores(match: TournamentMatch, result: MatchResult): ParticipantScore[] {
  const teamScores = getTeamScores(match, result);

  return [
    ...match.teamA.playerIds.map((playerId) => ({ ...teamScores[0], id: playerId })),
    ...match.teamB.playerIds.map((playerId) => ({ ...teamScores[1], id: playerId })),
  ];
}

function getMatchPoints(pointsFor: number, pointsAgainst: number): number {
  if (pointsFor > pointsAgainst) {
    return 3;
  }

  if (pointsFor === pointsAgainst) {
    return 1;
  }

  return 0;
}

function applyScores(rows: Map<string, Accumulator>, scores: ParticipantScore[]): void {
  for (const score of scores) {
    const row = rows.get(score.id);

    if (!row) {
      continue;
    }

    row.matchPoints += score.matchPoints;
    row.pointsFor += score.pointsFor;
    row.pointsAgainst += score.pointsAgainst;

    if (score.won) {
      row.wins += 1;
    } else if (score.draw) {
      row.draws += 1;
    } else {
      row.losses += 1;
    }
  }
}

function applyHeadToHead(
  rows: Map<string, Accumulator>,
  completedMatches: Array<{ match: TournamentMatch; result: MatchResult }>,
  scoreFactory: (match: TournamentMatch, result: MatchResult) => ParticipantScore[],
): void {
  const tiedIdsByMatchPoints = groupTiedIdsByMatchPoints(rows);

  for (const tiedIds of tiedIdsByMatchPoints) {
    for (const completedMatch of completedMatches) {
      const scores = scoreFactory(completedMatch.match, completedMatch.result).filter((score) => tiedIds.has(score.id));

      if (scores.length < 2) {
        continue;
      }

      for (const score of scores) {
        const row = rows.get(score.id);

        if (!row) {
          continue;
        }

        row.headToHeadMatchPoints += score.matchPoints;
        row.headToHeadPointDifference += score.pointsFor - score.pointsAgainst;
      }
    }
  }
}

function groupTiedIdsByMatchPoints(rows: Map<string, Accumulator>): Set<string>[] {
  const groups = new Map<number, string[]>();

  for (const row of rows.values()) {
    const group = groups.get(row.matchPoints) ?? [];
    group.push(row.id);
    groups.set(row.matchPoints, group);
  }

  return [...groups.values()].filter((ids) => ids.length > 1).map((ids) => new Set(ids));
}

function rankRows(rows: Accumulator[], rankingMode: StandingsRankingMode): StandingRow[] {
  const sortedRows = [...rows].sort((left, right) => compareRows(left, right, rankingMode));

  return sortedRows.map((row, index) => ({
    id: row.id,
    name: row.name,
    rank: index + 1,
    matchPoints: row.matchPoints,
    pointsFor: row.pointsFor,
    pointsAgainst: row.pointsAgainst,
    pointDifference: row.pointsFor - row.pointsAgainst,
    wins: row.wins,
    draws: row.draws,
    losses: row.losses,
    headToHeadMatchPoints: row.headToHeadMatchPoints,
    headToHeadPointDifference: row.headToHeadPointDifference,
    pauseCount: row.pauseCount,
  }));
}

function compareRows(left: Accumulator, right: Accumulator, rankingMode: StandingsRankingMode): number {
  const leftDifference = left.pointsFor - left.pointsAgainst;
  const rightDifference = right.pointsFor - right.pointsAgainst;
  const sharedTieBreakers =
    right.headToHeadMatchPoints - left.headToHeadMatchPoints ||
    right.headToHeadPointDifference - left.headToHeadPointDifference ||
    rightDifference - leftDifference ||
    left.name.localeCompare(right.name, "da");

  if (rankingMode === "partiPointsFirst") {
    return right.pointsFor - left.pointsFor || right.matchPoints - left.matchPoints || sharedTieBreakers;
  }

  return right.matchPoints - left.matchPoints || right.pointsFor - left.pointsFor || sharedTieBreakers;
}
