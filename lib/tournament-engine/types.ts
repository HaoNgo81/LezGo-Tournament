export type TournamentFormat =
  | "americano"
  | "mexicano"
  | "mixed-americano"
  | "fixed-partner-americano"
  | "fixed-partner-mexicano";

export type Gender = "female" | "male";

export type StandingsRankingMode = "matchPointsFirst" | "partiPointsFirst";

export interface TournamentPlayer {
  id: string;
  name: string;
  gender?: Gender;
}

export interface Team {
  id: string;
  playerIds: [string, string];
}

export interface TournamentMatch {
  id: string;
  roundNumber: number;
  courtNumber: number;
  teamA: Team;
  teamB: Team;
}

export interface TournamentRound {
  roundNumber: number;
  matches: TournamentMatch[];
  byePlayerIds?: string[];
}

export interface MatchResult {
  matchId: string;
  teamAPoints: number;
  teamBPoints: number;
}

export interface StandingRow {
  id: string;
  name: string;
  rank: number;
  matchPoints: number;
  pointsFor: number;
  pointsAgainst: number;
  pointDifference: number;
  wins: number;
  draws: number;
  losses: number;
  headToHeadMatchPoints: number;
  headToHeadPointDifference: number;
  pauseCount: number;
}

export interface TournamentEngineConfig {
  format: TournamentFormat;
  players: TournamentPlayer[];
  rounds: number;
  courts: number;
  firstRoundOrder?: "manual" | "random";
  randomSeed?: number;
}

export interface FixedTeamStandingInput {
  team: Team;
  name: string;
}
