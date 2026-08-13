import type { TeamVsTeamMatchState, TeamVsTeamTournamentState } from "../tournament-setup";
import type {
  PersistedMatchStatus,
  TeamVsTeamLineupRowPayload,
  TeamVsTeamMatchupRowPayload,
  TeamVsTeamPersistencePayload,
  TeamVsTeamPlayerRowPayload,
  TeamVsTeamRoundResultRowPayload,
  TeamVsTeamTeamRowPayload,
  TeamVsTeamTieBreakRowPayload,
} from "./persistence-payloads";

export interface TeamVsTeamMapperOptions {
  legacyLocalId?: string;
}

export function mapTeamVsTeamTournamentToPersistencePayload(
  state: TeamVsTeamTournamentState,
  options: TeamVsTeamMapperOptions = {},
): TeamVsTeamPersistencePayload {
  const tournamentRef = "tournament";
  const teams = state.teams.map<TeamVsTeamTeamRowPayload>((team, index) => ({
    clientRef: teamRef(team.id),
    tournamentRef,
    legacy_team_id: team.id,
    name: team.name,
    captainPlayerRef: team.captainPlayerId ? teamPlayerRef(team.id, team.captainPlayerId) : null,
    display_order: index + 1,
  }));
  const players = state.teams.flatMap((team) =>
    team.players.map<TeamVsTeamPlayerRowPayload>((player, index) => ({
      clientRef: teamPlayerRef(team.id, player.id),
      teamRef: teamRef(team.id),
      legacy_player_id: player.id,
      name: player.name,
      display_order: index + 1,
    })),
  );
  const matchups = state.matchups.map<TeamVsTeamMatchupRowPayload>((matchup, index) => ({
    clientRef: matchupRef(matchup.id),
    tournamentRef,
    legacy_matchup_id: matchup.id,
    label: matchup.label,
    teamARef: teamRef(matchup.teamAId),
    teamBRef: teamRef(matchup.teamBId),
    status: getMatchupStatus(matchup, state.activeMatchupId),
    display_order: index + 1,
    metadata: {},
  }));

  return {
    tournament: {
      clientRef: tournamentRef,
      name: state.name,
      format: "team-vs-team",
      status: state.status,
      scoring_mode: state.scoringMode,
      fixed_score_rule: state.fixedScoreRule ?? null,
      fixed_score_points: state.fixedScorePoints ?? null,
      ranking_mode: null,
      court_count: null,
      configured_rounds: state.maxRounds,
      active_round_number: null,
      time_limit_minutes: null,
      timer_state: null,
      pool_phase: null,
      pool_advancement_mode: null,
      pool_unmatched_resolution: null,
      team_count: state.teamCount,
      players_per_team: state.playersPerTeam,
      team_match_format: state.matchFormat,
      team_competition_mode: state.competitionMode,
      team_draw_mode: state.drawMode,
      active_matchup_legacy_id: state.activeMatchupId ?? null,
      finished_at: state.finishedAt ?? null,
      legacy_local_id: options.legacyLocalId ?? null,
      metadata: {
        knockoutGroups: state.knockoutGroups,
        knockoutPlacements: state.knockoutPlacements,
      },
    },
    teams,
    players,
    matchups,
    lineups: state.matchups.flatMap(mapLineups),
    roundResults: state.matchups.flatMap(mapRoundResults),
    tieBreaks: state.matchups.flatMap(mapTieBreak),
  };
}

function mapLineups(matchup: TeamVsTeamMatchState): TeamVsTeamLineupRowPayload[] {
  return matchup.lineups.flatMap((lineup) => [
    {
      clientRef: lineupRef(matchup.id, lineup.roundNumber, 1),
      matchupRef: matchupRef(matchup.id),
      round_number: lineup.roundNumber,
      match_number: 1,
      teamAPlayer1Ref: teamPlayerRef(matchup.teamAId, lineup.match1.teamAPlayerIds[0]),
      teamAPlayer2Ref: teamPlayerRef(matchup.teamAId, lineup.match1.teamAPlayerIds[1]),
      teamBPlayer1Ref: teamPlayerRef(matchup.teamBId, lineup.match1.teamBPlayerIds[0]),
      teamBPlayer2Ref: teamPlayerRef(matchup.teamBId, lineup.match1.teamBPlayerIds[1]),
      override_repeated_pairs: lineup.overrideRepeatedPairs ?? false,
    },
    {
      clientRef: lineupRef(matchup.id, lineup.roundNumber, 2),
      matchupRef: matchupRef(matchup.id),
      round_number: lineup.roundNumber,
      match_number: 2,
      teamAPlayer1Ref: teamPlayerRef(matchup.teamAId, lineup.match2.teamAPlayerIds[0]),
      teamAPlayer2Ref: teamPlayerRef(matchup.teamAId, lineup.match2.teamAPlayerIds[1]),
      teamBPlayer1Ref: teamPlayerRef(matchup.teamBId, lineup.match2.teamBPlayerIds[0]),
      teamBPlayer2Ref: teamPlayerRef(matchup.teamBId, lineup.match2.teamBPlayerIds[1]),
      override_repeated_pairs: lineup.overrideRepeatedPairs ?? false,
    },
  ]);
}

function mapRoundResults(matchup: TeamVsTeamMatchState): TeamVsTeamRoundResultRowPayload[] {
  return matchup.roundResults.flatMap((roundResult) =>
    [roundResult.match1, roundResult.match2].flatMap((matchResult, matchIndex) =>
      matchResult.sets.map<TeamVsTeamRoundResultRowPayload>((setResult, setIndex) => ({
        clientRef: roundResultRef(matchup.id, roundResult.roundNumber, matchIndex + 1, setIndex + 1),
        matchupRef: matchupRef(matchup.id),
        round_number: roundResult.roundNumber,
        match_number: (matchIndex + 1) as 1 | 2,
        set_number: (setIndex + 1) as 1 | 2 | 3,
        team_a_points: setResult.teamAPoints,
        team_b_points: setResult.teamBPoints,
      })),
    ),
  );
}

function mapTieBreak(matchup: TeamVsTeamMatchState): TeamVsTeamTieBreakRowPayload[] {
  if (!matchup.tieBreak) {
    return [];
  }

  return [
    {
      clientRef: `team-vs-team-tiebreak:${matchup.id}`,
      matchupRef: matchupRef(matchup.id),
      teamAPlayer1Ref: teamPlayerRef(matchup.teamAId, matchup.tieBreak.teamAPlayerIds[0]),
      teamAPlayer2Ref: teamPlayerRef(matchup.teamAId, matchup.tieBreak.teamAPlayerIds[1]),
      teamBPlayer1Ref: teamPlayerRef(matchup.teamBId, matchup.tieBreak.teamBPlayerIds[0]),
      teamBPlayer2Ref: teamPlayerRef(matchup.teamBId, matchup.tieBreak.teamBPlayerIds[1]),
      team_a_points: matchup.tieBreak.result.teamAPoints,
      team_b_points: matchup.tieBreak.result.teamBPoints,
    },
  ];
}

function getMatchupStatus(matchup: TeamVsTeamMatchState, activeMatchupId?: string): PersistedMatchStatus {
  if (matchup.tieBreak || matchup.roundResults.length > 0) {
    return "completed";
  }

  return matchup.id === activeMatchupId ? "running" : "ready";
}

function teamRef(teamId: string): string {
  return `team-vs-team-team:${teamId}`;
}

function teamPlayerRef(teamId: string, playerId: string): string {
  return `team-vs-team-player:${teamId}:${playerId}`;
}

function matchupRef(matchupId: string): string {
  return `team-vs-team-matchup:${matchupId}`;
}

function lineupRef(matchupId: string, roundNumber: number, matchNumber: number): string {
  return `team-vs-team-lineup:${matchupId}:${roundNumber}:${matchNumber}`;
}

function roundResultRef(matchupId: string, roundNumber: number, matchNumber: number, setNumber: number): string {
  return `team-vs-team-round-result:${matchupId}:${roundNumber}:${matchNumber}:${setNumber}`;
}
