import {
  createTeamVsTeamBracket,
  getTeamVsTeamMaxRounds,
  validateTeamVsTeamTeams,
  type TeamVsTeamMatchFormat,
  type TeamVsTeamPlayersPerTeam,
  type TeamVsTeamRoundLineup,
  type TeamVsTeamRoundResult,
  type TeamVsTeamTeam,
  type TeamVsTeamTieBreak,
} from "../team-vs-team";

export type ScoringMode = "Fri scoring" | "Fast antal point" | "Spil på tid";

export interface TeamVsTeamSetupInput {
  name: string;
  date: string;
  startTime: string;
  scoringMode: ScoringMode;
  teamCount: 2 | 4;
  playersPerTeam: TeamVsTeamPlayersPerTeam;
  matchFormat: TeamVsTeamMatchFormat;
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
  finishedAt?: string;
  maxRounds: 2 | 3;
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

  if (![4, 6, 8].includes(input.playersPerTeam)) {
    throw new Error("Vælg 4, 6 eller 8 spillere pr. hold.");
  }

  if (input.matchFormat !== "oneSet" && input.matchFormat !== "bestOfThree") {
    throw new Error("Vælg enten 1 sæt eller bedst af 3 sæt pr. kamp.");
  }

  if (input.teams.length !== input.teamCount) {
    throw new Error(`Der skal oprettes præcis ${input.teamCount} hold.`);
  }

  const teams = input.teams.map((team) => ({
    ...team,
    name: team.name.trim(),
    players: team.players.slice(0, input.playersPerTeam).map((player) => ({ ...player, name: player.name.trim() })),
  }));

  teams.forEach((team) => {
    if (!team.name) {
      throw new Error("Alle hold skal have et holdnavn.");
    }

    team.players.forEach((player) => {
      if (!player.name) {
        throw new Error(`${team.name}: alle ${input.playersPerTeam} spillernavne skal udfyldes.`);
      }
    });
  });

  validateTeamVsTeamTeams(teams, input.playersPerTeam);

  const bracket = createTeamVsTeamBracket(teams, input.playersPerTeam);
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
    playersPerTeam: input.playersPerTeam,
    matchFormat: input.matchFormat,
    maxRounds: getTeamVsTeamMaxRounds(input.playersPerTeam),
    teams,
    status: "setup",
    activeMatchupId: matchups[0]?.id,
    matchups,
  };
}