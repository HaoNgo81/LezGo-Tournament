import type { LiveTournamentState, RoundTimerState } from "../live-scoring";
import type { Gender, MatchResult, StandingsRankingMode, Team, TournamentFormat, TournamentMatch, TournamentPlayer, TournamentRound } from "../tournament-engine";
import type { FixedScoreRule, ScoringMode } from "../tournament-setup";
import type { JsonRecord, PersistedMatchStatus, PersistedTournamentStatus } from "./persistence-payloads";

export interface TournamentReadRow {
  id: string;
  name: string;
  format: TournamentFormat;
  status: PersistedTournamentStatus;
  scoring_mode: ScoringMode;
  fixed_score_rule: FixedScoreRule | null;
  fixed_score_points: number | null;
  ranking_mode: StandingsRankingMode | null;
  court_count: number | null;
  configured_rounds: number | null;
  active_round_number: number | null;
  time_limit_minutes: number | null;
  timer_state: JsonRecord | null;
  finished_at: string | null;
}

export interface TournamentPlayerReadRow {
  id: string;
  legacy_player_id: string;
  name: string;
  gender: Gender | null;
  display_order: number;
}

export interface RoundReadRow {
  id: string;
  round_number: number;
  bye_player_ids: string[] | null;
  metadata: JsonRecord;
}

export interface MatchReadRow {
  id: string;
  round_id: string;
  legacy_match_id: string;
  court_number: number | null;
  status: PersistedMatchStatus;
  metadata: JsonRecord;
}

export interface MatchSideReadRow {
  id: string;
  match_id: string;
  side_number: 1 | 2;
  score: number | null;
  tie_break_winner: boolean;
  metadata: JsonRecord;
}

export interface MatchSidePlayerReadRow {
  match_side_id: string;
  tournament_player_id: string;
  display_order: number;
}

export interface StandardTournamentReadModel {
  tournament: TournamentReadRow;
  players: TournamentPlayerReadRow[];
  rounds: RoundReadRow[];
  matches: MatchReadRow[];
  matchSides: MatchSideReadRow[];
  matchSidePlayers: MatchSidePlayerReadRow[];
}

export function mapPersistenceRowsToLiveTournamentState(readModel: StandardTournamentReadModel): LiveTournamentState {
  const playerByDatabaseId = new Map(readModel.players.map((player) => [player.id, player]));
  const players = [...readModel.players]
    .sort((left, right) => left.display_order - right.display_order)
    .map<TournamentPlayer>((player) => ({
      id: player.legacy_player_id,
      name: player.name,
      ...(player.gender ? { gender: player.gender } : {}),
    }));
  const rounds = [...readModel.rounds]
    .sort((left, right) => left.round_number - right.round_number)
    .map<TournamentRound>((round) => ({
      roundNumber: round.round_number,
      matches: getRoundMatches(round, readModel, playerByDatabaseId),
      ...getByePlayerIds(round, playerByDatabaseId),
    }));
  const results = readModel.matches.flatMap((match) => getMatchResult(match, readModel.matchSides));

  return {
    tournamentName: readModel.tournament.name,
    format: readModel.tournament.format,
    status: readModel.tournament.status === "finished" ? "finished" : "active",
    ...(readModel.tournament.finished_at ? { finishedAt: readModel.tournament.finished_at } : {}),
    players,
    rounds,
    configuredRounds: readModel.tournament.configured_rounds ?? undefined,
    courtCount: readModel.tournament.court_count ?? undefined,
    activeRoundNumber: readModel.tournament.active_round_number ?? 1,
    results,
    startedMatchIds: readModel.matches.filter((match) => match.status === "running").map((match) => match.legacy_match_id),
    scoringMode: readModel.tournament.scoring_mode,
    fixedScoreRule: readModel.tournament.fixed_score_rule ?? undefined,
    fixedScorePoints: readModel.tournament.fixed_score_points ?? undefined,
    timeLimitMinutes: readModel.tournament.time_limit_minutes ?? undefined,
    roundTimer: toRoundTimerState(readModel.tournament.timer_state),
    rankingMode: readModel.tournament.ranking_mode ?? "matchPointsFirst",
  };
}

function getRoundMatches(
  round: RoundReadRow,
  readModel: StandardTournamentReadModel,
  playerByDatabaseId: Map<string, TournamentPlayerReadRow>,
): TournamentMatch[] {
  return readModel.matches
    .filter((match) => match.round_id === round.id)
    .sort((left, right) => (left.court_number ?? 0) - (right.court_number ?? 0))
    .map((match) => ({
      id: match.legacy_match_id,
      roundNumber: round.round_number,
      courtNumber: match.court_number ?? 0,
      teamA: getMatchTeam(match, 1, readModel.matchSides, readModel.matchSidePlayers, playerByDatabaseId),
      teamB: getMatchTeam(match, 2, readModel.matchSides, readModel.matchSidePlayers, playerByDatabaseId),
    }));
}

function getMatchTeam(
  match: MatchReadRow,
  sideNumber: 1 | 2,
  sides: MatchSideReadRow[],
  sidePlayers: MatchSidePlayerReadRow[],
  playerByDatabaseId: Map<string, TournamentPlayerReadRow>,
): Team {
  const side = sides.find((candidate) => candidate.match_id === match.id && candidate.side_number === sideNumber);

  if (!side) {
    throw new Error(`Missing side ${sideNumber} for match ${match.legacy_match_id}.`);
  }

  const playerIds = sidePlayers
    .filter((sidePlayer) => sidePlayer.match_side_id === side.id)
    .sort((left, right) => left.display_order - right.display_order)
    .map((sidePlayer) => {
      const player = playerByDatabaseId.get(sidePlayer.tournament_player_id);

      if (!player) {
        throw new Error(`Missing player for match ${match.legacy_match_id}.`);
      }

      return player.legacy_player_id;
    });

  if (playerIds.length !== 2) {
    throw new Error(`Match ${match.legacy_match_id} side ${sideNumber} must have exactly two players.`);
  }

  return {
    id: getLegacyTeamId(side, playerIds as [string, string]),
    playerIds: playerIds as [string, string],
  };
}

function getMatchResult(match: MatchReadRow, sides: MatchSideReadRow[]): MatchResult[] {
  const teamA = sides.find((side) => side.match_id === match.id && side.side_number === 1);
  const teamB = sides.find((side) => side.match_id === match.id && side.side_number === 2);

  if (!teamA || !teamB || teamA.score === null || teamB.score === null) {
    return [];
  }

  return [
    {
      matchId: match.legacy_match_id,
      teamAPoints: teamA.score,
      teamBPoints: teamB.score,
      ...(teamA.tie_break_winner ? { tieBreakWinner: "teamA" as const } : {}),
      ...(teamB.tie_break_winner ? { tieBreakWinner: "teamB" as const } : {}),
    },
  ];
}

function getByePlayerIds(round: RoundReadRow, playerByDatabaseId: Map<string, TournamentPlayerReadRow>): { byePlayerIds?: string[] } {
  const legacyByePlayerIds = round.metadata.byePlayerLegacyIds;

  if (Array.isArray(legacyByePlayerIds) && legacyByePlayerIds.every((id) => typeof id === "string")) {
    return { byePlayerIds: legacyByePlayerIds };
  }

  const byePlayerIds = (round.bye_player_ids ?? [])
    .map((playerId) => playerByDatabaseId.get(playerId)?.legacy_player_id)
    .filter((playerId): playerId is string => Boolean(playerId));

  return byePlayerIds.length ? { byePlayerIds } : {};
}

function getLegacyTeamId(side: MatchSideReadRow, playerIds: [string, string]): string {
  const legacyTeamId = side.metadata.legacyTeamId;
  return typeof legacyTeamId === "string" ? legacyTeamId : [...playerIds].sort().join("+");
}

function toRoundTimerState(value: JsonRecord | null): RoundTimerState | undefined {
  if (
    !value ||
    typeof value.roundNumber !== "number" ||
    typeof value.status !== "string" ||
    typeof value.countdownSeconds !== "number" ||
    typeof value.remainingSeconds !== "number" ||
    typeof value.durationSeconds !== "number"
  ) {
    return undefined;
  }

  if (!["idle", "countdown", "running", "paused", "expired"].includes(value.status)) {
    return undefined;
  }

  return {
    roundNumber: value.roundNumber,
    status: value.status as RoundTimerState["status"],
    countdownSeconds: value.countdownSeconds,
    remainingSeconds: value.remainingSeconds,
    durationSeconds: value.durationSeconds,
  };
}
