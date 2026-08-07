import {
  calculateLiveStandings,
  createPoolPlaySummary,
  getLiveMatches,
  getPlayerName,
  getRoundProgress,
  type LiveMatchView,
  type LiveTournamentState,
  type PoolPlaySummary,
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
  format: "standard" | "pool-play";
  activeRoundNumber: number;
  totalRounds: number;
  courts: number;
  players: number;
  playerInfo: ReadOnlyPlayerInfo[];
  matches: ReadOnlyMatchCard[];
  standings: StandingRow[];
  byePlayers: string[];
  rounds: ReadOnlyRoundStatus[];
  poolPlay?: ReadOnlyPoolPlayView;
}

export interface ReadOnlyPoolPlayView {
  phase: "Puljer" | "Placering" | "Krydskampe" | "Finaler";
  participantCount: number;
  poolCount: number;
  initialStandings: PoolPlaySummary["initialStandings"];
  nextPhaseMatches: ReadOnlyMatchCard[];
  finalMatches: ReadOnlyMatchCard[];
  placementTiebreakMatches: ReadOnlyMatchCard[];
  finalPlacements: PoolPlaySummary["finalPlacements"];
  automaticAdvances: PoolPlaySummary["automaticAdvances"];
}

export function createReadOnlyTournamentView(state: LiveTournamentState): ReadOnlyTournamentView {
  if (state.poolPlay) {
    const poolSummary = createPoolPlaySummary(state.poolPlay, state.rankingMode);

    return {
      tournamentName: state.tournamentName,
      format: "pool-play",
      activeRoundNumber: 0,
      totalRounds: 0,
      courts: poolSummary.finalMatches.length || poolSummary.nextPhaseMatches.length,
      players: state.poolPlay.initialStage.participants.length,
      playerInfo: [],
      matches: [],
      standings: [],
      byePlayers: [],
      rounds: [],
      poolPlay: {
        phase: formatPoolPhase(state.poolPlay.phase),
        participantCount: state.poolPlay.initialStage.participants.length,
        poolCount: state.poolPlay.initialStage.pools.length,
        initialStandings: poolSummary.initialStandings,
        nextPhaseMatches: poolSummary.nextPhaseMatches.map(createPoolReadOnlyMatchCard),
        finalMatches: poolSummary.finalMatches.map(createPoolReadOnlyMatchCard),
        placementTiebreakMatches: poolSummary.placementTiebreakMatches.map(createPoolReadOnlyMatchCard),
        finalPlacements: poolSummary.finalPlacements,
        automaticAdvances: poolSummary.automaticAdvances,
      },
    };
  }

  const standings = calculateLiveStandings(state);
  const liveMatches = getLiveMatches(state);
  const activeRound = state.rounds.find((round) => round.roundNumber === state.activeRoundNumber);
  const byePlayers = (activeRound?.byePlayerIds ?? []).map((playerId) => getPlayerName(state.players, playerId));

  return {
    tournamentName: state.tournamentName,
    format: "standard",
    activeRoundNumber: state.activeRoundNumber,
    totalRounds: state.configuredRounds ?? state.rounds.length,
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

function createPoolReadOnlyMatchCard(match: PoolPlaySummary["nextPhaseMatches"][number]): ReadOnlyMatchCard {
  return {
    id: match.id,
    court: `${match.groupName} · ${match.label}`,
    teamA: match.teamAName,
    teamB: match.teamBName,
    score: match.result ? formatPoolResultScore(match.result) : "Ikke gemt",
    status: match.result ? "Afsluttet" : "Klar",
  };
}

function formatPoolResultScore(result: NonNullable<PoolPlaySummary["nextPhaseMatches"][number]["result"]>): string {
  const baseScore = `${result.teamAPoints} - ${result.teamBPoints}`;

  return result.tieBreakWinner ? `${baseScore} (MTB: ${result.tieBreakWinner === "teamA" ? "hold A" : "hold B"})` : baseScore;
}

function formatPoolPhase(phase: NonNullable<LiveTournamentState["poolPlay"]>["phase"]): ReadOnlyPoolPlayView["phase"] {
  switch (phase) {
    case "initial":
      return "Puljer";
    case "placementPools":
      return "Placering";
    case "crossMatches":
      return "Krydskampe";
    case "finals":
      return "Finaler";
  }
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

