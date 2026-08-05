import { createTeamVsTeamBracket, validateTeamVsTeamTeams, type TeamVsTeamRoundLineup, type TeamVsTeamRoundResult, type TeamVsTeamTeam, type TeamVsTeamTieBreak } from "../team-vs-team";

export type ScoringMode = "Fri scoring" | "Fast antal point" | "Spil på tid";

export interface TeamVsTeamSetupInput {
  name: string;
  date: string;
  startTime: string;
  scoringMode: ScoringMode;
  teamCount: 2 | 4;
  teams: TeamVsTeamTeam[];
}

export interface TeamVsTeamMatchState {
  id: string;
  label: string;
  teamAId: string;
  teamBId: string;
  lineups: TeamVsTeamRoundLineup[];
  roundResults: TeamVsTeamRoundResult[];
  tieBreak?: TeamVsTeamTieBreak;
}

export interface TeamVsTeamTournamentState extends TeamVsTeamSetupInput {
  status: "setup" | "active" | "finished";
  activeMatchupId?: string;
  matchups: TeamVsTeamMatchState[];
}

export function createTeamVsTeamTournamentFromSetup(input: TeamVsTeamSetupInput): TeamVsTeamTournamentState {
  const name = input.name.trim();

  if (!name) {
    throw new Error("Turneringen skal have et navn.");
  }

  if (input.teamCount !== 2 && input.teamCount !== 4) {
    throw new Error("Team vs. Team kræver enten 2 eller 4 hold.");
  }

  if (input.teams.length !== input.teamCount) {
    throw new Error(`Der skal oprettes præcis ${input.teamCount} hold.`);
  }

  const teams = input.teams.map((team) => ({
    ...team,
    name: team.name.trim(),
    players: team.players.map((player) => ({ ...player, name: player.name.trim() })) as TeamVsTeamTeam["players"],
  }));

  teams.forEach((team) => {
    if (!team.name) {
      throw new Error("Alle hold skal have et holdnavn.");
    }

    team.players.forEach((player) => {
      if (!player.name) {
        throw new Error(`${team.name}: alle 4 spillernavne skal udfyldes.`);
      }
    });
  });

  validateTeamVsTeamTeams(teams);

  const bracket = createTeamVsTeamBracket(teams);
  const matchups = bracket.firstRound.map((match) => ({
    id: match.id,
    label: match.label,
    teamAId: match.teamAId,
    teamBId: match.teamBId,
    lineups: [],
    roundResults: [],
  }));

  return {
    ...input,
    name,
    teams,
    status: "setup",
    activeMatchupId: matchups[0]?.id,
    matchups,
  };
}
