import {
  calculateLiveStandings,
  getLiveMatches,
  getPlayerName,
  getRoundProgress,
  type LiveMatchView,
  type LiveTournamentState,
} from "../live-scoring";
import type { StandingRow } from "../tournament-engine";

export interface ReadOnlyMatchCard {
  id: string;
  court: string;
  teamA: string;
  teamB: string;
  score: string;
  status: "Klar" | "I gang" | "Afsluttet";
}

export interface ReadOnlyRoundStatus {
  roundNumber: number;
  label: "afsluttet" | "live" | "kommende";
}

export interface ReadOnlyPlayerInfo {
  playerId: string;
  playerName: string;
  rank: number;
  court: string;
  partnerName: string;
  opponents: string;
  pauseCount: number;
}

export interface ReadOnlyTournamentView {
  tournamentName: string;
  activeRoundNumber: number;
  totalRounds: number;
  courts: number;
  players: number;
  playerInfo: ReadOnlyPlayerInfo[];
  matches: ReadOnlyMatchCard[];
  standings: StandingRow[];
  byePlayers: string[];
  rounds: ReadOnlyRoundStatus[];
}

export function createReadOnlyTournamentView(state: LiveTournamentState): ReadOnlyTournamentView {
  const standings = calculateLiveStandings(state);
  const liveMatches = getLiveMatches(state);
  const activeRound = state.rounds.find((round) => round.roundNumber === state.activeRoundNumber);
  const byePlayers = (activeRound?.byePlayerIds ?? []).map((playerId) => getPlayerName(state.players, playerId));

  return {
    tournamentName: state.tournamentName,
    activeRoundNumber: state.activeRoundNumber,
    totalRounds: state.rounds.length,
    courts: liveMatches.length,
    players: state.players.length,
    playerInfo: createReadOnlyPlayerInfo(liveMatches, state, standings),
    matches: liveMatches.map((liveMatch) => createReadOnlyMatchCard(liveMatch, state)),
    standings,
    byePlayers,
    rounds: state.rounds.map((round) => {
      const progress = getRoundProgress(state, round.roundNumber);

      return {
        roundNumber: round.roundNumber,
        label: progress.isComplete ? "afsluttet" : round.roundNumber === state.activeRoundNumber ? "live" : "kommende",
      };
    }),
  };
}

function createReadOnlyPlayerInfo(liveMatches: LiveMatchView[], state: LiveTournamentState, standings: StandingRow[]): ReadOnlyPlayerInfo[] {
  const standingByPlayerId = new Map(standings.map((standing) => [standing.id, standing]));

  return state.players.map((player) => {
    const liveMatch = liveMatches.find((candidate) => [...candidate.match.teamA.playerIds, ...candidate.match.teamB.playerIds].includes(player.id));
    const standing = standingByPlayerId.get(player.id);

    if (!liveMatch) {
      return {
        playerId: player.id,
        playerName: player.name,
        rank: standing?.rank ?? 0,
        court: "Pause",
        partnerName: "-",
        opponents: "-",
        pauseCount: standing?.pauseCount ?? 0,
      };
    }

    const isTeamA = liveMatch.match.teamA.playerIds.includes(player.id);
    const ownTeam = isTeamA ? liveMatch.match.teamA : liveMatch.match.teamB;
    const opponentTeam = isTeamA ? liveMatch.match.teamB : liveMatch.match.teamA;
    const partnerId = ownTeam.playerIds.find((playerId) => playerId !== player.id) ?? "";

    return {
      playerId: player.id,
      playerName: player.name,
      rank: standing?.rank ?? 0,
      court: `Bane ${liveMatch.match.courtNumber}`,
      partnerName: getPlayerName(state.players, partnerId),
      opponents: opponentTeam.playerIds.map((playerId) => getPlayerName(state.players, playerId)).join(" / "),
      pauseCount: standing?.pauseCount ?? 0,
    };
  });
}

function createReadOnlyMatchCard(liveMatch: LiveMatchView, state: LiveTournamentState): ReadOnlyMatchCard {
  return {
    id: liveMatch.match.id,
    court: `Bane ${liveMatch.match.courtNumber}`,
    teamA: liveMatch.match.teamA.playerIds.map((playerId) => getPlayerName(state.players, playerId)).join(" / "),
    teamB: liveMatch.match.teamB.playerIds.map((playerId) => getPlayerName(state.players, playerId)).join(" / "),
    score: liveMatch.result ? `${liveMatch.result.teamAPoints} - ${liveMatch.result.teamBPoints}` : "Ikke gemt",
    status: liveMatch.status,
  };
}

