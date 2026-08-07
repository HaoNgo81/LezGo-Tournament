import {
  calculatePlayerStandings,
  calculateTeamStandings,
  type MatchResult,
  type StandingRow,
  type StandingsRankingMode,
  type Team,
  type TournamentRound,
} from "../tournament-engine";
import type { InitialPool, InitialPoolStage, PoolParticipant, PoolParticipantType } from "./pool-play";

export type PoolMatchResult = MatchResult;

export interface PoolStandingTable {
  poolId: string;
  poolName: string;
  participantType: PoolParticipantType;
  rows: StandingRow[];
}

export function calculateInitialPoolStandings(
  stage: InitialPoolStage,
  results: PoolMatchResult[],
  rankingMode: StandingsRankingMode = "matchPointsFirst",
): PoolStandingTable[] {
  validatePoolResults(stage, results);

  const resultByMatchId = new Map(results.map((result) => [result.matchId, result]));
  const participantById = new Map(stage.participants.map((participant) => [participant.id, participant]));

  return stage.pools.map((pool) => {
    const participants = getPoolParticipants(pool, participantById);
    const poolResults = getPoolMatchIds(pool)
      .map((matchId) => resultByMatchId.get(matchId))
      .filter((result): result is PoolMatchResult => Boolean(result));
    const rows = stage.participantType === "player"
      ? calculatePlayerPoolStandings(pool, participants, poolResults, rankingMode)
      : calculateEntityPoolStandings(pool, participants, poolResults, rankingMode);

    return {
      poolId: pool.id,
      poolName: pool.name,
      participantType: stage.participantType,
      rows,
    };
  });
}

function calculatePlayerPoolStandings(
  pool: InitialPool,
  participants: PoolParticipant[],
  results: PoolMatchResult[],
  rankingMode: StandingsRankingMode,
): StandingRow[] {
  const rounds: TournamentRound[] = pool.americanoRounds.map((round) => ({
    roundNumber: round.roundNumber,
    matches: round.matches.map((match) => ({
      id: match.id,
      roundNumber: match.roundNumber,
      courtNumber: match.courtNumber,
      teamA: { id: `${match.id}-team-a`, playerIds: match.teamA.playerIds },
      teamB: { id: `${match.id}-team-b`, playerIds: match.teamB.playerIds },
    })),
    byePlayerIds: round.byeParticipantIds,
  }));

  return calculatePlayerStandings(participants, rounds, results, rankingMode);
}

function calculateEntityPoolStandings(
  pool: InitialPool,
  participants: PoolParticipant[],
  results: PoolMatchResult[],
  rankingMode: StandingsRankingMode,
): StandingRow[] {
  const teams = participants.map((participant) => ({
    team: createStandingTeam(participant.id),
    name: participant.name,
  }));
  const teamById = new Map(teams.map(({ team }) => [team.id, team]));
  const round: TournamentRound = {
    roundNumber: 1,
    matches: pool.encounters.map((encounter, index) => ({
      id: encounter.id,
      roundNumber: 1,
      courtNumber: index + 1,
      teamA: getStandingTeam(teamById, encounter.participantAId),
      teamB: getStandingTeam(teamById, encounter.participantBId),
    })),
  };

  return calculateTeamStandings(teams, [round], results, rankingMode);
}

function createStandingTeam(participantId: string): Team {
  return {
    id: participantId,
    playerIds: [`${participantId}:member-1`, `${participantId}:member-2`],
  };
}

function getStandingTeam(teams: Map<string, Team>, participantId: string): Team {
  const team = teams.get(participantId);

  if (!team) {
    throw new Error(`Puljen henviser til en ukendt deltager: ${participantId}`);
  }

  return team;
}

function getPoolParticipants(pool: InitialPool, participants: Map<string, PoolParticipant>): PoolParticipant[] {
  return pool.participantIds.map((participantId) => {
    const participant = participants.get(participantId);

    if (!participant) {
      throw new Error(`Puljen henviser til en ukendt deltager: ${participantId}`);
    }

    return participant;
  });
}

function validatePoolResults(stage: InitialPoolStage, results: PoolMatchResult[]): void {
  const scheduledMatchIds = new Set(stage.pools.flatMap(getPoolMatchIds));
  const resultMatchIds = new Set<string>();

  for (const result of results) {
    if (!scheduledMatchIds.has(result.matchId)) {
      throw new Error(`Resultatet tilhører ikke puljespillet: ${result.matchId}`);
    }

    if (resultMatchIds.has(result.matchId)) {
      throw new Error(`Kampen har mere end ét resultat: ${result.matchId}`);
    }

    if (!Number.isInteger(result.teamAPoints) || !Number.isInteger(result.teamBPoints)) {
      throw new Error("Scorepoint skal være hele tal.");
    }

    if (result.teamAPoints < 0 || result.teamBPoints < 0) {
      throw new Error("Scorepoint må ikke være negative.");
    }

    if (result.tieBreakWinner && result.teamAPoints !== result.teamBPoints) {
      throw new Error("Match tiebreak kan kun bruges ved uafgjorte scorepoint.");
    }

    resultMatchIds.add(result.matchId);
  }
}

function getPoolMatchIds(pool: InitialPool): string[] {
  return pool.scheduleType === "americanoRotation"
    ? pool.americanoRounds.flatMap((round) => round.matches.map((match) => match.id))
    : pool.encounters.map((encounter) => encounter.id);
}
