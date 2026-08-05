import { getTeamVsTeamCaptainName, type TeamVsTeamMatchResult, type TeamVsTeamPairing, type TeamVsTeamTeam } from "../team-vs-team";
import { calculateTeamVsTeamStandings, type TeamVsTeamMatchState, type TeamVsTeamTournamentState } from "../tournament-setup";

export interface TeamVsTeamReadOnlyTeam {
  teamId: string;
  teamName: string;
  captainName: string;
  players: string[];
}

export interface TeamVsTeamReadOnlyMatchCard {
  id: string;
  court: string;
  teamA: string;
  teamB: string;
  score: string;
  status: "Klar" | "Afsluttet";
}

export interface TeamVsTeamReadOnlyView {
  tournamentName: string;
  status: "setup" | "active" | "finished";
  activeMatchLabel: string;
  activeRoundNumber: number;
  totalRounds: number;
  teamsCount: number;
  playersPerTeam: number;
  matchFormat: string;
  scoringMode: string;
  teams: TeamVsTeamReadOnlyTeam[];
  matches: TeamVsTeamReadOnlyMatchCard[];
  standings: ReturnType<typeof calculateTeamVsTeamStandings>;
}

export function createTeamVsTeamReadOnlyView(state: TeamVsTeamTournamentState): TeamVsTeamReadOnlyView {
  const activeMatch = state.matchups.find((match) => match.id === state.activeMatchupId) ?? state.matchups[0];
  const activeRoundNumber = activeMatch ? getDisplayedRoundNumber(activeMatch, state.maxRounds) : 1;

  return {
    tournamentName: state.name,
    status: state.status,
    activeMatchLabel: activeMatch?.label ?? "Holdkamp",
    activeRoundNumber,
    totalRounds: state.maxRounds,
    teamsCount: state.teams.length,
    playersPerTeam: state.playersPerTeam,
    matchFormat: state.matchFormat === "oneSet" ? "1 sæt" : "bedst af 3 sæt",
    scoringMode: state.scoringMode,
    teams: state.teams.map(createReadOnlyTeam),
    matches: activeMatch ? createReadOnlyMatches(state, activeMatch, activeRoundNumber) : [],
    standings: calculateTeamVsTeamStandings(state),
  };
}

function createReadOnlyTeam(team: TeamVsTeamTeam): TeamVsTeamReadOnlyTeam {
  return {
    teamId: team.id,
    teamName: team.name,
    captainName: getTeamVsTeamCaptainName(team),
    players: team.players.map((player) => player.name),
  };
}

function createReadOnlyMatches(state: TeamVsTeamTournamentState, activeMatch: TeamVsTeamMatchState, roundNumber: number): TeamVsTeamReadOnlyMatchCard[] {
  const matchup = getMatchupFromState(state, activeMatch);
  const lineup = activeMatch.lineups.find((savedLineup) => savedLineup.roundNumber === roundNumber);
  const result = activeMatch.roundResults.find((savedResult) => savedResult.roundNumber === roundNumber);

  if (!matchup || !lineup) {
    return [];
  }

  return [
    createReadOnlyMatchCard("kamp-1", "Kamp 1", matchup.teamA, matchup.teamB, lineup.match1, result?.match1),
    createReadOnlyMatchCard("kamp-2", "Kamp 2", matchup.teamA, matchup.teamB, lineup.match2, result?.match2),
  ];
}

function createReadOnlyMatchCard(
  id: string,
  court: string,
  teamA: TeamVsTeamTeam,
  teamB: TeamVsTeamTeam,
  pairing: TeamVsTeamPairing,
  result?: TeamVsTeamMatchResult,
): TeamVsTeamReadOnlyMatchCard {
  return {
    id,
    court,
    teamA: pairing.teamAPlayerIds.map((playerId) => getPlayerName(teamA, playerId)).join(" / "),
    teamB: pairing.teamBPlayerIds.map((playerId) => getPlayerName(teamB, playerId)).join(" / "),
    score: result ? result.sets.map((setResult) => `${setResult.teamAPoints}-${setResult.teamBPoints}`).join(", ") : "Ikke gemt",
    status: result ? "Afsluttet" : "Klar",
  };
}

function getDisplayedRoundNumber(activeMatch: TeamVsTeamMatchState, maxRounds: 2 | 3): number {
  return Math.min(activeMatch.roundResults.length + 1, maxRounds);
}

function getMatchupFromState(state: TeamVsTeamTournamentState, match: TeamVsTeamMatchState) {
  const teamA = state.teams.find((team) => team.id === match.teamAId);
  const teamB = state.teams.find((team) => team.id === match.teamBId);

  return teamA && teamB ? { id: match.id, teamA, teamB } : undefined;
}

function getPlayerName(team: TeamVsTeamTeam, playerId: string): string {
  return team.players.find((player) => player.id === playerId)?.name ?? playerId;
}