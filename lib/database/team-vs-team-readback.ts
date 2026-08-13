import type { TeamVsTeamMatchState, TeamVsTeamTournamentState } from "../tournament-setup";
import type {
  FixedScoreRule,
  ScoringMode,
} from "../tournament-setup";
import type {
  TeamVsTeamCompetitionMode,
  TeamVsTeamDrawMode,
  TeamVsTeamMatchFormat,
  TeamVsTeamPlayersPerTeam,
  TeamVsTeamTeamCount,
} from "../team-vs-team";
import type { JsonRecord, PersistedTournamentStatus } from "./persistence-payloads";

export interface TeamVsTeamTournamentReadRow {
  id: string;
  name: string;
  status: PersistedTournamentStatus;
  scoring_mode: ScoringMode;
  fixed_score_rule: FixedScoreRule | null;
  fixed_score_points: number | null;
  team_count: TeamVsTeamTeamCount;
  players_per_team: TeamVsTeamPlayersPerTeam;
  team_match_format: TeamVsTeamMatchFormat;
  team_competition_mode: TeamVsTeamCompetitionMode;
  team_draw_mode: TeamVsTeamDrawMode;
  active_matchup_id: string | null;
  configured_rounds: 2 | 3 | null;
  finished_at: string | null;
  metadata: JsonRecord;
  updated_at?: string;
}

export interface TeamVsTeamTeamReadRow {
  id: string;
  legacy_team_id: string;
  name: string;
  captain_player_id: string | null;
  display_order: number;
}

export interface TeamVsTeamPlayerReadRow {
  id: string;
  team_id: string;
  legacy_player_id: string;
  name: string;
  display_order: number;
}

export interface TeamVsTeamMatchupReadRow {
  id: string;
  legacy_matchup_id: string;
  label: string;
  team_a_id: string;
  team_b_id: string;
  display_order: number;
}

export interface TeamVsTeamLineupReadRow {
  matchup_id: string;
  round_number: 1 | 2 | 3;
  match_number: 1 | 2;
  team_a_player_1_id: string;
  team_a_player_2_id: string;
  team_b_player_1_id: string;
  team_b_player_2_id: string;
  override_repeated_pairs: boolean;
}

export interface TeamVsTeamRoundResultReadRow {
  matchup_id: string;
  round_number: 1 | 2 | 3;
  match_number: 1 | 2;
  set_number: 1 | 2 | 3;
  team_a_points: number;
  team_b_points: number;
}

export interface TeamVsTeamTieBreakReadRow {
  matchup_id: string;
  team_a_player_1_id: string;
  team_a_player_2_id: string;
  team_b_player_1_id: string;
  team_b_player_2_id: string;
  team_a_points: number;
  team_b_points: number;
}

export interface TeamVsTeamReadModel {
  tournament: TeamVsTeamTournamentReadRow;
  teams: TeamVsTeamTeamReadRow[];
  players: TeamVsTeamPlayerReadRow[];
  matchups: TeamVsTeamMatchupReadRow[];
  lineups: TeamVsTeamLineupReadRow[];
  roundResults: TeamVsTeamRoundResultReadRow[];
  tieBreaks: TeamVsTeamTieBreakReadRow[];
}

export function mapPersistenceRowsToTeamVsTeamTournamentState(readModel: TeamVsTeamReadModel): TeamVsTeamTournamentState {
  const playerByDatabaseId = new Map(readModel.players.map((player) => [player.id, player]));
  const teamByDatabaseId = new Map(readModel.teams.map((team) => [team.id, team]));
  const teams = [...readModel.teams]
    .sort((left, right) => left.display_order - right.display_order)
    .map((team) => ({
      id: team.legacy_team_id,
      name: team.name,
      captainPlayerId: team.captain_player_id ? playerByDatabaseId.get(team.captain_player_id)?.legacy_player_id ?? "" : "",
      players: readModel.players
        .filter((player) => player.team_id === team.id)
        .sort((left, right) => left.display_order - right.display_order)
        .map((player) => ({ id: player.legacy_player_id, name: player.name })),
    }));
  const activeMatchup = readModel.tournament.active_matchup_id
    ? readModel.matchups.find((matchup) => matchup.id === readModel.tournament.active_matchup_id)
    : undefined;
  const matchups = [...readModel.matchups]
    .sort((left, right) => left.display_order - right.display_order)
    .map<TeamVsTeamMatchState>((matchup) => ({
      id: matchup.legacy_matchup_id,
      label: matchup.label,
      teamAId: teamByDatabaseId.get(matchup.team_a_id)?.legacy_team_id ?? matchup.team_a_id,
      teamBId: teamByDatabaseId.get(matchup.team_b_id)?.legacy_team_id ?? matchup.team_b_id,
      lineups: getLineups(matchup.id, readModel, playerByDatabaseId),
      roundResults: getRoundResults(matchup.id, readModel),
      ...getTieBreak(matchup.id, readModel, playerByDatabaseId),
    }));

  return {
    name: readModel.tournament.name,
    scoringMode: readModel.tournament.scoring_mode,
    fixedScoreRule: readModel.tournament.fixed_score_rule ?? undefined,
    fixedScorePoints: readModel.tournament.fixed_score_points ?? undefined,
    teamCount: readModel.tournament.team_count,
    competitionMode: readModel.tournament.team_competition_mode,
    drawMode: readModel.tournament.team_draw_mode,
    playersPerTeam: readModel.tournament.players_per_team,
    matchFormat: readModel.tournament.team_match_format,
    teams,
    status: readModel.tournament.status,
    activeMatchupId: activeMatchup?.legacy_matchup_id,
    finishedAt: readModel.tournament.finished_at ?? undefined,
    maxRounds: readModel.tournament.configured_rounds ?? 3,
    matchups,
    knockoutGroups: Array.isArray(readModel.tournament.metadata.knockoutGroups) ? readModel.tournament.metadata.knockoutGroups as TeamVsTeamTournamentState["knockoutGroups"] : undefined,
    knockoutPlacements: Array.isArray(readModel.tournament.metadata.knockoutPlacements) ? readModel.tournament.metadata.knockoutPlacements as TeamVsTeamTournamentState["knockoutPlacements"] : undefined,
  };
}

function getLineups(matchupId: string, readModel: TeamVsTeamReadModel, playerByDatabaseId: Map<string, TeamVsTeamPlayerReadRow>) {
  const rows = readModel.lineups.filter((lineup) => lineup.matchup_id === matchupId);
  const roundNumbers = Array.from(new Set(rows.map((lineup) => lineup.round_number))).sort((left, right) => left - right);

  return roundNumbers.map((roundNumber) => {
    const match1 = rows.find((lineup) => lineup.round_number === roundNumber && lineup.match_number === 1);
    const match2 = rows.find((lineup) => lineup.round_number === roundNumber && lineup.match_number === 2);

    if (!match1 || !match2) {
      throw new Error(`Team vs Team lineup round ${roundNumber} is incomplete.`);
    }

    return {
      roundNumber,
      match1: toPairing(match1, playerByDatabaseId),
      match2: toPairing(match2, playerByDatabaseId),
      overrideRepeatedPairs: match1.override_repeated_pairs || match2.override_repeated_pairs || undefined,
    };
  });
}

function toPairing(row: TeamVsTeamLineupReadRow, playerByDatabaseId: Map<string, TeamVsTeamPlayerReadRow>) {
  return {
    teamAPlayerIds: [resolvePlayer(row.team_a_player_1_id, playerByDatabaseId), resolvePlayer(row.team_a_player_2_id, playerByDatabaseId)] as [string, string],
    teamBPlayerIds: [resolvePlayer(row.team_b_player_1_id, playerByDatabaseId), resolvePlayer(row.team_b_player_2_id, playerByDatabaseId)] as [string, string],
  };
}

function getRoundResults(matchupId: string, readModel: TeamVsTeamReadModel) {
  const rows = readModel.roundResults.filter((result) => result.matchup_id === matchupId);
  const roundNumbers = Array.from(new Set(rows.map((row) => row.round_number))).sort((left, right) => left - right);

  return roundNumbers.map((roundNumber) => ({
    roundNumber,
    match1: { sets: toSets(rows, roundNumber, 1) },
    match2: { sets: toSets(rows, roundNumber, 2) },
  }));
}

function toSets(rows: TeamVsTeamRoundResultReadRow[], roundNumber: 1 | 2 | 3, matchNumber: 1 | 2) {
  return rows
    .filter((row) => row.round_number === roundNumber && row.match_number === matchNumber)
    .sort((left, right) => left.set_number - right.set_number)
    .map((row) => ({ teamAPoints: row.team_a_points, teamBPoints: row.team_b_points }));
}

function getTieBreak(matchupId: string, readModel: TeamVsTeamReadModel, playerByDatabaseId: Map<string, TeamVsTeamPlayerReadRow>) {
  const tieBreak = readModel.tieBreaks.find((row) => row.matchup_id === matchupId);

  if (!tieBreak) {
    return {};
  }

  return {
    tieBreak: {
      teamAPlayerIds: [resolvePlayer(tieBreak.team_a_player_1_id, playerByDatabaseId), resolvePlayer(tieBreak.team_a_player_2_id, playerByDatabaseId)] as [string, string],
      teamBPlayerIds: [resolvePlayer(tieBreak.team_b_player_1_id, playerByDatabaseId), resolvePlayer(tieBreak.team_b_player_2_id, playerByDatabaseId)] as [string, string],
      result: { teamAPoints: tieBreak.team_a_points, teamBPoints: tieBreak.team_b_points },
    },
  };
}

function resolvePlayer(playerId: string, playerByDatabaseId: Map<string, TeamVsTeamPlayerReadRow>): string {
  return playerByDatabaseId.get(playerId)?.legacy_player_id ?? playerId;
}
