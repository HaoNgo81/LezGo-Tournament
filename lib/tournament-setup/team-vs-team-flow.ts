import { calculateTeamVsTeamMatchScore, type TeamVsTeamMatchup, type TeamVsTeamTieBreak } from "../team-vs-team";
import type { TeamVsTeamMatchState, TeamVsTeamTournamentState } from "./team-vs-team-setup";

export interface TeamVsTeamPlacement {
  rank: 1 | 2 | 3 | 4;
  teamId: string;
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
    status: "active",
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
  const teamA = state.teams.find((team) => team.id === match.teamAId);
  const teamB = state.teams.find((team) => team.id === match.teamBId);

  if (!teamA || !teamB) {
    throw new Error(`Holdkampen mangler et gyldigt hold: ${match.id}`);
  }

  const score = calculateTeamVsTeamMatchScore({ id: match.id, teamA, teamB }, match.roundResults, match.tieBreak, { playersPerTeam: state.playersPerTeam, matchFormat: state.matchFormat });

  if (!score.winnerTeamId) {
    return {};
  }

  return {
    winnerTeamId: score.winnerTeamId,
    loserTeamId: score.winnerTeamId === teamA.id ? teamB.id : teamA.id,
  };
}
