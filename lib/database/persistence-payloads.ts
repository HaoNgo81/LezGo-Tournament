import type { Gender, StandingsRankingMode, TournamentFormat } from "../tournament-engine";
import type { FixedScoreRule, ScoringMode } from "../tournament-setup";
import type {
  TeamVsTeamCompetitionMode,
  TeamVsTeamDrawMode,
  TeamVsTeamMatchFormat,
  TeamVsTeamPlayersPerTeam,
} from "../team-vs-team";

export type TournamentDatabaseFormat = TournamentFormat | "team-vs-team";
export type PersistedTournamentStatus = "setup" | "active" | "finished";
export type PersistedTournamentPrivacy = "private" | "public_result";
export type PersistedRoundStatus = "scheduled" | "active" | "completed";
export type PersistedMatchStatus = "ready" | "running" | "completed";
export type PersistedMatchScope = "standard" | "pool_initial" | "pool_placement" | "pool_cross" | "pool_final" | "pool_tiebreak";
export type PersistedPoolStage = "initial" | "placement" | "cross" | "final";
export type JsonRecord = Record<string, unknown>;

export interface TournamentRowPayload {
  clientRef: string;
  name: string;
  format: TournamentDatabaseFormat;
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
  pool_phase: string | null;
  pool_advancement_mode: string | null;
  pool_unmatched_resolution: string | null;
  team_count: number | null;
  players_per_team: TeamVsTeamPlayersPerTeam | null;
  team_match_format: TeamVsTeamMatchFormat | null;
  team_competition_mode: TeamVsTeamCompetitionMode | null;
  team_draw_mode: TeamVsTeamDrawMode | null;
  active_matchup_legacy_id: string | null;
  finished_at: string | null;
  legacy_local_id: string | null;
  privacy: PersistedTournamentPrivacy;
  metadata: JsonRecord;
}

export interface TournamentPlayerRowPayload {
  clientRef: string;
  tournamentRef: string;
  legacy_player_id: string;
  name: string;
  gender: Gender | null;
  display_order: number;
  metadata: JsonRecord;
}

export interface FixedPairRowPayload {
  clientRef: string;
  tournamentRef: string;
  legacy_team_id: string;
  player1Ref: string;
  player2Ref: string;
  display_order: number;
}

export interface RoundRowPayload {
  clientRef: string;
  tournamentRef: string;
  round_number: number;
  status: PersistedRoundStatus;
  byePlayerRefs: string[];
  metadata: JsonRecord;
}

export interface MatchRowPayload {
  clientRef: string;
  tournamentRef: string;
  roundRef: string | null;
  poolRef: string | null;
  legacy_match_id: string;
  match_scope: PersistedMatchScope;
  label: string | null;
  court_number: number | null;
  status: PersistedMatchStatus;
  metadata: JsonRecord;
}

export interface MatchSideRowPayload {
  clientRef: string;
  matchRef: string;
  side_number: 1 | 2;
  score: number | null;
  tie_break_winner: boolean;
  metadata: JsonRecord;
}

export interface MatchSidePlayerRowPayload {
  clientRef: string;
  matchSideRef: string;
  tournamentPlayerRef: string;
  display_order: number;
}

export interface TournamentPoolRowPayload {
  clientRef: string;
  tournamentRef: string;
  legacy_pool_id: string;
  name: string;
  stage: PersistedPoolStage;
  schedule_type: "americanoRotation" | "roundRobin" | null;
  display_order: number;
  matches_per_team: 2 | 3 | null;
  metadata: JsonRecord;
}

export interface PoolParticipantRowPayload {
  clientRef: string;
  poolRef: string;
  tournamentPlayerRef: string | null;
  legacy_participant_id: string;
  display_order: number;
  metadata: JsonRecord;
}

export interface StandardTournamentPersistencePayload {
  tournament: TournamentRowPayload;
  players: TournamentPlayerRowPayload[];
  fixedPairs: FixedPairRowPayload[];
  rounds: RoundRowPayload[];
  matches: MatchRowPayload[];
  matchSides: MatchSideRowPayload[];
  matchSidePlayers: MatchSidePlayerRowPayload[];
  pools: TournamentPoolRowPayload[];
  poolParticipants: PoolParticipantRowPayload[];
}

export interface TeamVsTeamTeamRowPayload {
  clientRef: string;
  tournamentRef: string;
  legacy_team_id: string;
  name: string;
  captainPlayerRef: string | null;
  display_order: number;
}

export interface TeamVsTeamPlayerRowPayload {
  clientRef: string;
  teamRef: string;
  legacy_player_id: string;
  name: string;
  display_order: number;
}

export interface TeamVsTeamMatchupRowPayload {
  clientRef: string;
  tournamentRef: string;
  legacy_matchup_id: string;
  label: string;
  teamARef: string;
  teamBRef: string;
  status: PersistedMatchStatus;
  display_order: number;
  metadata: JsonRecord;
}

export interface TeamVsTeamLineupRowPayload {
  clientRef: string;
  matchupRef: string;
  round_number: 1 | 2 | 3;
  match_number: 1 | 2;
  teamAPlayer1Ref: string;
  teamAPlayer2Ref: string;
  teamBPlayer1Ref: string;
  teamBPlayer2Ref: string;
  override_repeated_pairs: boolean;
}

export interface TeamVsTeamRoundResultRowPayload {
  clientRef: string;
  matchupRef: string;
  round_number: 1 | 2 | 3;
  match_number: 1 | 2;
  set_number: 1 | 2 | 3;
  team_a_points: number;
  team_b_points: number;
}

export interface TeamVsTeamTieBreakRowPayload {
  clientRef: string;
  matchupRef: string;
  teamAPlayer1Ref: string;
  teamAPlayer2Ref: string;
  teamBPlayer1Ref: string;
  teamBPlayer2Ref: string;
  team_a_points: number;
  team_b_points: number;
}

export interface TeamVsTeamPersistencePayload {
  tournament: TournamentRowPayload;
  teams: TeamVsTeamTeamRowPayload[];
  players: TeamVsTeamPlayerRowPayload[];
  matchups: TeamVsTeamMatchupRowPayload[];
  lineups: TeamVsTeamLineupRowPayload[];
  roundResults: TeamVsTeamRoundResultRowPayload[];
  tieBreaks: TeamVsTeamTieBreakRowPayload[];
}
