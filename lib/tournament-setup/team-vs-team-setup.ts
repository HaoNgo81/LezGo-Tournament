import {
  getTeamVsTeamMaxRounds,
  validateTeamVsTeamTeams,
  type TeamVsTeamMatchFormat,
  type TeamVsTeamCompetitionMode,
  type TeamVsTeamDrawMode,
  type TeamVsTeamPlayersPerTeam,
  type TeamVsTeamRoundLineup,
  type TeamVsTeamRoundResult,
  type TeamVsTeamTeam,
  type TeamVsTeamTeamCount,
  type TeamVsTeamTieBreak,
} from "../team-vs-team";
import { validateScoringSettings, type FixedScoreRule, type ScoringMode } from "./scoring";

export type { ScoringMode } from "./scoring";

export interface TeamVsTeamSetupInput {
  name: string;
  scoringMode: ScoringMode;
  fixedScoreRule?: FixedScoreRule;
  fixedScorePoints?: number;
  teamCount: TeamVsTeamTeamCount;
  competitionMode?: TeamVsTeamCompetitionMode;
  drawMode?: TeamVsTeamDrawMode;
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

export interface TeamVsTeamKnockoutPlacement {
  rank: number;
  teamId: string;
}

export interface TeamVsTeamKnockoutGroup {
  id: string;
  rankStart: number;
  teamIds: string[];
  matchIds: string[];
  byeTeamId?: string;
  status: "active" | "resolved";
}

export interface TeamVsTeamTournamentState extends Omit<TeamVsTeamSetupInput, "competitionMode" | "drawMode"> {
  competitionMode: TeamVsTeamCompetitionMode;
  drawMode: TeamVsTeamDrawMode;
  status: "setup" | "active" | "finished";
  activeMatchupId?: string;
  finishedAt?: string;
  maxRounds: 2 | 3;
  matchups: TeamVsTeamMatchState[];
  knockoutGroups?: TeamVsTeamKnockoutGroup[];
  knockoutPlacements?: TeamVsTeamKnockoutPlacement[];
}

export function createTeamVsTeamTournamentFromSetup(input: TeamVsTeamSetupInput): TeamVsTeamTournamentState {
  const name = input.name.trim();

  if (!name) {
    throw new Error("Turneringen skal have et navn.");
  }

  if (!Number.isInteger(input.teamCount) || input.teamCount < 2 || input.teamCount > 8) {
    throw new Error("Team vs. Team kræver mellem 2 og 8 hold.");
  }

  if (![4, 6, 8].includes(input.playersPerTeam)) {
    throw new Error("Vælg 4, 6 eller 8 spillere pr. hold.");
  }

  if (input.matchFormat !== "oneSet" && input.matchFormat !== "bestOfThree") {
    throw new Error("Vælg enten 1 sæt eller bedst af 3 sæt pr. kamp.");
  }

  validateScoringSettings(input.scoringMode, input);

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

  const competitionMode = input.competitionMode ?? "knockout";
  const drawMode = input.drawMode ?? "manual";

  if (competitionMode !== "pool" && competitionMode !== "knockout") {
    throw new Error("Vælg puljespil eller knockout.");
  }

  if (drawMode !== "manual" && drawMode !== "random") {
    throw new Error("Vælg manuel eller tilfældig fordeling.");
  }

  const knockoutTeams = drawMode === "random" ? shuffleTeams(teams) : teams;
  const initialKnockout = competitionMode === "knockout"
    ? createTeamVsTeamKnockoutGroup(knockoutTeams.map((team) => team.id), 1, "knockout-1")
    : undefined;
  const initialMatches = competitionMode === "pool"
    ? createTeamVsTeamPoolMatches(teams)
    : initialKnockout?.matches ?? [];
  const matchups = initialMatches.map((match) => ({
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
    competitionMode,
    drawMode,
    fixedScoreRule: input.scoringMode === "Fast antal point" ? input.fixedScoreRule : undefined,
    fixedScorePoints: input.scoringMode === "Fast antal point" ? input.fixedScorePoints : undefined,
    playersPerTeam: input.playersPerTeam,
    matchFormat: input.matchFormat,
    maxRounds: getTeamVsTeamMaxRounds(input.playersPerTeam),
    teams,
    status: "setup",
    activeMatchupId: matchups[0]?.id,
    matchups,
    knockoutGroups: initialKnockout ? [initialKnockout.group] : undefined,
    knockoutPlacements: initialKnockout ? [] : undefined,
  };
}

export function createTeamVsTeamPoolMatches(teams: TeamVsTeamTeam[]): Array<{ id: string; label: string; teamAId: string; teamBId: string }> {
  const matches: Array<{ id: string; label: string; teamAId: string; teamBId: string }> = [];

  for (let teamAIndex = 0; teamAIndex < teams.length - 1; teamAIndex += 1) {
    for (let teamBIndex = teamAIndex + 1; teamBIndex < teams.length; teamBIndex += 1) {
      const matchNumber = matches.length + 1;
      matches.push({
        id: `puljekamp-${matchNumber}`,
        label: `Puljekamp ${matchNumber}`,
        teamAId: teams[teamAIndex].id,
        teamBId: teams[teamBIndex].id,
      });
    }
  }

  return matches;
}

export function createTeamVsTeamKnockoutGroup(
  teamIds: string[],
  rankStart: number,
  id: string,
): { group: TeamVsTeamKnockoutGroup; matches: Array<{ id: string; label: string; teamAId: string; teamBId: string }> } {
  if (teamIds.length < 2) {
    throw new Error("En knockoutgruppe skal have mindst 2 hold.");
  }

  const byeTeamId = teamIds.length % 2 === 1 ? teamIds[0] : undefined;
  const competingTeamIds = byeTeamId ? teamIds.slice(1) : teamIds;
  const matches = Array.from({ length: competingTeamIds.length / 2 }, (_, index) => {
    const matchNumber = index + 1;
    const label = id === "knockout-1" && rankStart === 1 && teamIds.length === 2
      ? "Holdkamp"
      : getKnockoutMatchLabel(rankStart, teamIds.length, matchNumber, competingTeamIds.length / 2);

    return {
      id: `${id}-kamp-${matchNumber}`,
      label,
      teamAId: competingTeamIds[index * 2],
      teamBId: competingTeamIds[index * 2 + 1],
    };
  });

  return {
    group: {
      id,
      rankStart,
      teamIds: [...teamIds],
      matchIds: matches.map((match) => match.id),
      byeTeamId,
      status: "active",
    },
    matches,
  };
}

function getKnockoutMatchLabel(rankStart: number, teamCount: number, matchNumber: number, matchCount: number): string {
  if (teamCount === 2) {
    return rankStart === 1 ? "Finale" : `Kamp om ${rankStart}. plads`;
  }

  const rankEnd = rankStart + teamCount - 1;
  const baseLabel = rankStart === 1 ? "Knockout-runde" : `Placeringsrunde ${rankStart}-${rankEnd}`;
  return matchCount > 1 ? `${baseLabel} · Kamp ${matchNumber}` : baseLabel;
}

function shuffleTeams(teams: TeamVsTeamTeam[]): TeamVsTeamTeam[] {
  const shuffledTeams = [...teams];

  for (let index = shuffledTeams.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [shuffledTeams[index], shuffledTeams[randomIndex]] = [shuffledTeams[randomIndex], shuffledTeams[index]];
  }

  return shuffledTeams;
}
