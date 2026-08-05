import { calculateTeamVsTeamMatchScore, type TeamVsTeamMatchup, type TeamVsTeamTieBreak } from "../team-vs-team";
import type { TeamVsTeamMatchState, TeamVsTeamTournamentState } from "./team-vs-team-setup";

export interface TeamVsTeamPlacement {
  rank: 1 | 2 | 3 | 4;
  teamId: string;
}

export interface TeamVsTeamStanding {
  rank: number;
  teamId: string;
  teamName: string;
  played: number;
  won: number;
  lost: number;
  matchWins: number;
  matchLosses: number;
}

export function finishTeamVsTeamTournament(state: TeamVsTeamTournamentState, finishedAt = new Date().toISOString()): TeamVsTeamTournamentState {
  return {
    ...state,
    status: "finished",
    finishedAt,
  };
}

export function saveTeamVsTeamTieBreak(
  state: TeamVsTeamTournamentState,
  matchup: TeamVsTeamMatchup,
  tieBreak: TeamVsTeamTieBreak,
): TeamVsTeamTournamentState {
  const activeMatch = state.matchups.find((match) => match.id === matchup.id);

  if (!activeMatch) {
    throw new Error(`Holdkamp findes ikke: ${matchup.id}`);
  }

  calculateTeamVsTeamMatchScore(matchup, activeMatch.roundResults, tieBreak, { playersPerTeam: state.playersPerTeam, matchFormat: state.matchFormat });

  return {
    ...state,
    matchups: state.matchups.map((match) => (match.id === matchup.id ? saveTieBreakOnMatch(match, tieBreak) : match)),
  };
}

export function advanceTeamVsTeamFourTeamBracket(state: TeamVsTeamTournamentState): TeamVsTeamTournamentState {
  if (state.teamCount !== 4) {
    return state;
  }

  if (state.matchups.some((match) => match.id === "finale" || match.id === "placeringskamp")) {
    return state;
  }

  const firstSemi = state.matchups.find((match) => match.id === "semifinale-1");
  const secondSemi = state.matchups.find((match) => match.id === "semifinale-2");

  if (!firstSemi || !secondSemi) {
    throw new Error("Første holdrunde mangler semifinaler.");
  }

  const firstResult = getMatchOutcome(state, firstSemi);
  const secondResult = getMatchOutcome(state, secondSemi);

  if (!firstResult.winnerTeamId || !firstResult.loserTeamId || !secondResult.winnerTeamId || !secondResult.loserTeamId) {
    throw new Error("Begge første holdkampe skal være afgjort, før finale og placeringskamp kan dannes.");
  }

  const nextMatchups: TeamVsTeamMatchState[] = [
    {
      id: "finale",
      label: "Finale",
      teamAId: firstResult.winnerTeamId,
      teamBId: secondResult.winnerTeamId,
      lineups: [],
      roundResults: [],
    },
    {
      id: "placeringskamp",
      label: "Placeringskamp",
      teamAId: firstResult.loserTeamId,
      teamBId: secondResult.loserTeamId,
      lineups: [],
      roundResults: [],
    },
  ];

  return {
    ...state,
    activeMatchupId: "finale",
    matchups: [...state.matchups, ...nextMatchups],
  };
}

export function calculateTeamVsTeamPlacements(state: TeamVsTeamTournamentState): TeamVsTeamPlacement[] {
  if (state.teamCount !== 4) {
    return [];
  }

  const finalMatch = state.matchups.find((match) => match.id === "finale");
  const placementMatch = state.matchups.find((match) => match.id === "placeringskamp");

  if (!finalMatch || !placementMatch) {
    return [];
  }

  const finalOutcome = getMatchOutcome(state, finalMatch);
  const placementOutcome = getMatchOutcome(state, placementMatch);

  if (!finalOutcome.winnerTeamId || !finalOutcome.loserTeamId || !placementOutcome.winnerTeamId || !placementOutcome.loserTeamId) {
    return [];
  }

  return [
    { rank: 1, teamId: finalOutcome.winnerTeamId },
    { rank: 2, teamId: finalOutcome.loserTeamId },
    { rank: 3, teamId: placementOutcome.winnerTeamId },
    { rank: 4, teamId: placementOutcome.loserTeamId },
  ];
}

export function calculateTeamVsTeamStandings(state: TeamVsTeamTournamentState): TeamVsTeamStanding[] {
  const standings = state.teams.map((team) => ({
    rank: 0,
    teamId: team.id,
    teamName: team.name,
    played: 0,
    won: 0,
    lost: 0,
    matchWins: 0,
    matchLosses: 0,
  }));

  state.matchups.forEach((match) => {
    const teamAStanding = standings.find((standing) => standing.teamId === match.teamAId);
    const teamBStanding = standings.find((standing) => standing.teamId === match.teamBId);
    const matchup = getMatchupFromState(state, match);

    if (!teamAStanding || !teamBStanding || !matchup) {
      return;
    }

    const score = calculateTeamVsTeamMatchScore(matchup, match.roundResults, match.tieBreak, { playersPerTeam: state.playersPerTeam, matchFormat: state.matchFormat });

    teamAStanding.matchWins += score.teamAWins;
    teamAStanding.matchLosses += score.teamBWins;
    teamBStanding.matchWins += score.teamBWins;
    teamBStanding.matchLosses += score.teamAWins;

    if (!score.winnerTeamId) {
      return;
    }

    teamAStanding.played += 1;
    teamBStanding.played += 1;

    if (score.winnerTeamId === match.teamAId) {
      teamAStanding.won += 1;
      teamBStanding.lost += 1;
      return;
    }

    teamBStanding.won += 1;
    teamAStanding.lost += 1;
  });

  return standings
    .sort((left, right) => {
      if (right.won !== left.won) {
        return right.won - left.won;
      }

      if (right.matchWins !== left.matchWins) {
        return right.matchWins - left.matchWins;
      }

      return left.teamName.localeCompare(right.teamName, "da");
    })
    .map((standing, index) => ({ ...standing, rank: index + 1 }));
}

export function getTeamVsTeamMatchWinnerTeamId(state: TeamVsTeamTournamentState, match: TeamVsTeamMatchState): string | undefined {
  return getMatchOutcome(state, match).winnerTeamId;
}

function saveTieBreakOnMatch(match: TeamVsTeamMatchState, tieBreak: TeamVsTeamTieBreak): TeamVsTeamMatchState {
  return {
    ...match,
    tieBreak,
  };
}

function getMatchOutcome(state: TeamVsTeamTournamentState, match: TeamVsTeamMatchState): { winnerTeamId?: string; loserTeamId?: string } {
  const matchup = getMatchupFromState(state, match);

  if (!matchup) {
    throw new Error(`Holdkampen mangler et gyldigt hold: ${match.id}`);
  }

  const score = calculateTeamVsTeamMatchScore(matchup, match.roundResults, match.tieBreak, { playersPerTeam: state.playersPerTeam, matchFormat: state.matchFormat });

  if (!score.winnerTeamId) {
    return {};
  }

  return {
    winnerTeamId: score.winnerTeamId,
    loserTeamId: score.winnerTeamId === matchup.teamA.id ? matchup.teamB.id : matchup.teamA.id,
  };
}

function getMatchupFromState(state: TeamVsTeamTournamentState, match: TeamVsTeamMatchState): TeamVsTeamMatchup | undefined {
  const teamA = state.teams.find((team) => team.id === match.teamAId);
  const teamB = state.teams.find((team) => team.id === match.teamBId);

  return teamA && teamB ? { id: match.id, teamA, teamB } : undefined;
}