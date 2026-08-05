import {
  calculatePlayerStandings,
  createTournamentRounds,
  type MatchResult,
  type StandingRow,
  type StandingsRankingMode,
  type TournamentFormat,
  type TournamentMatch,
  type TournamentPlayer,
  type TournamentRound,
} from "../tournament-engine";
import type { ScoringMode } from "../tournament-setup/team-vs-team-setup";

export interface LiveTournamentState {
  tournamentName: string;
  format: TournamentFormat;
  status: "active" | "finished";
  finishedAt?: string;
  players: TournamentPlayer[];
  rounds: TournamentRound[];
  activeRoundNumber: number;
  results: MatchResult[];
  startedMatchIds: string[];
  scoringMode: ScoringMode;
  timeLimitMinutes?: number;
  roundTimer?: RoundTimerState;
  rankingMode: StandingsRankingMode;
}

export type LiveMatchStatus = "Klar" | "I gang" | "Afsluttet";

export type RoundTimerStatus = "idle" | "countdown" | "running" | "expired";

export interface RoundTimerState {
  roundNumber: number;
  status: RoundTimerStatus;
  countdownSeconds: number;
  remainingSeconds: number;
  durationSeconds: number;
}
export interface LiveMatchView {
  match: TournamentMatch;
  status: LiveMatchStatus;
  result?: MatchResult;
}

export interface RoundProgress {
  roundNumber: number;
  completedMatches: number;
  totalMatches: number;
  isComplete: boolean;
}

export function createMockLiveTournamentState(rankingMode: StandingsRankingMode = "matchPointsFirst"): LiveTournamentState {
  const players: TournamentPlayer[] = [
    { id: "p1", name: "Anna" },
    { id: "p2", name: "Hassan" },
    { id: "p3", name: "Maja" },
    { id: "p4", name: "Noah" },
    { id: "p5", name: "Sofia" },
    { id: "p6", name: "Emil" },
    { id: "p7", name: "Clara" },
    { id: "p8", name: "Jonas" },
  ];

  return {
    tournamentName: "Mock Americano",
    format: "americano",
    status: "active",
    players,
    rounds: createTournamentRounds({ format: "americano", players, rounds: 2, courts: 2, firstRoundOrder: "manual" }),
    activeRoundNumber: 1,
    results: [],
    startedMatchIds: [],
    scoringMode: "Fri scoring",
    rankingMode,
  };
}

export function getActiveRound(state: LiveTournamentState): TournamentRound {
  return getRound(state, state.activeRoundNumber);
}

export function getRound(state: LiveTournamentState, roundNumber: number): TournamentRound {
  const round = state.rounds.find((candidate) => candidate.roundNumber === roundNumber);

  if (!round) {
    throw new Error(`Runde findes ikke: ${roundNumber}`);
  }

  return round;
}

export function getLiveMatches(state: LiveTournamentState): LiveMatchView[] {
  const resultByMatchId = new Map(state.results.map((result) => [result.matchId, result]));
  const startedMatchIds = new Set(state.startedMatchIds ?? []);

  return getActiveRound(state).matches.map((match) => {
    const result = resultByMatchId.get(match.id);

    return {
      match,
      status: result ? "Afsluttet" : startedMatchIds.has(match.id) ? "I gang" : "Klar",
      result,
    };
  });
}

export function getRoundProgress(state: LiveTournamentState, roundNumber = state.activeRoundNumber): RoundProgress {
  const round = getRound(state, roundNumber);
  const savedMatchIds = new Set(state.results.map((result) => result.matchId));
  const completedMatches = round.matches.filter((match) => savedMatchIds.has(match.id)).length;

  return {
    roundNumber,
    completedMatches,
    totalMatches: round.matches.length,
    isComplete: completedMatches === round.matches.length,
  };
}

export function canGoToNextRound(state: LiveTournamentState): boolean {
  return state.activeRoundNumber < state.rounds.length && getRoundProgress(state).isComplete;
}

export function goToPreviousRound(state: LiveTournamentState): LiveTournamentState {
  if (state.activeRoundNumber <= 1) {
    return state;
  }

  return {
    ...state,
    activeRoundNumber: state.activeRoundNumber - 1,
  };
}

export function goToNextRound(state: LiveTournamentState): LiveTournamentState {
  if (state.activeRoundNumber >= state.rounds.length) {
    return state;
  }

  if (!getRoundProgress(state).isComplete) {
    throw new Error("Alle kampe i runden skal være gemt, før næste runde kan åbnes.");
  }

  return {
    ...state,
    activeRoundNumber: state.activeRoundNumber + 1,
  };
}

export function finishTournament(state: LiveTournamentState, finishedAt = new Date().toISOString()): LiveTournamentState {
  return {
    ...state,
    status: "finished",
    finishedAt,
  };
}

export function startMatch(state: LiveTournamentState, matchId: string): LiveTournamentState {
  assertMatchExists(state, matchId);
  const startedMatchIds = new Set(state.startedMatchIds ?? []);
  startedMatchIds.add(matchId);

  return {
    ...state,
    startedMatchIds: [...startedMatchIds],
  };
}

export function saveMatchResult(state: LiveTournamentState, result: MatchResult): LiveTournamentState {
  assertValidResult(result);

  assertMatchExists(state, result.matchId);

  const results = state.results.filter((savedResult) => savedResult.matchId !== result.matchId);

  return {
    ...state,
    startedMatchIds: (state.startedMatchIds ?? []).filter((matchId) => matchId !== result.matchId),
    results: [...results, result],
  };
}

export function startRoundTimer(state: LiveTournamentState): LiveTournamentState {
  if (state.scoringMode !== "Spil på tid") {
    throw new Error("Uret kan kun startes, når scoring er sat til Spil på tid.");
  }

  if (!state.timeLimitMinutes || state.timeLimitMinutes < 1) {
    throw new Error("Vælg spilletid før uret startes.");
  }

  return {
    ...state,
    roundTimer: {
      roundNumber: state.activeRoundNumber,
      status: "countdown",
      countdownSeconds: 15,
      remainingSeconds: state.timeLimitMinutes * 60,
      durationSeconds: state.timeLimitMinutes * 60,
    },
  };
}

export function tickRoundTimer(state: LiveTournamentState, elapsedSeconds = 1): LiveTournamentState {
  const timer = state.roundTimer;

  if (!timer || timer.status === "idle" || timer.status === "expired") {
    return state;
  }

  const elapsed = Math.max(0, Math.floor(elapsedSeconds));

  if (timer.status === "countdown") {
    const nextCountdownSeconds = Math.max(0, timer.countdownSeconds - elapsed);
    const overflowSeconds = Math.max(0, elapsed - timer.countdownSeconds);
    const nextRemainingSeconds = Math.max(0, timer.remainingSeconds - overflowSeconds);

    return {
      ...state,
      roundTimer: {
        ...timer,
        status: nextRemainingSeconds === 0 ? "expired" : nextCountdownSeconds === 0 ? "running" : "countdown",
        countdownSeconds: nextCountdownSeconds,
        remainingSeconds: nextRemainingSeconds,
      },
    };
  }

  const remainingSeconds = Math.max(0, timer.remainingSeconds - elapsed);

  return {
    ...state,
    roundTimer: {
      ...timer,
      status: remainingSeconds === 0 ? "expired" : "running",
      remainingSeconds,
    },
  };
}
export function setLiveRankingMode(state: LiveTournamentState, rankingMode: StandingsRankingMode): LiveTournamentState {
  return {
    ...state,
    rankingMode,
  };
}

export function calculateLiveStandings(state: LiveTournamentState): StandingRow[] {
  return calculatePlayerStandings(state.players, state.rounds, state.results, state.rankingMode);
}

export function getPlayerName(players: TournamentPlayer[], playerId: string): string {
  return players.find((player) => player.id === playerId)?.name ?? playerId;
}

function assertMatchExists(state: LiveTournamentState, matchId: string): void {
  const matchExists = state.rounds.some((round) => round.matches.some((match) => match.id === matchId));

  if (!matchExists) {
    throw new Error(`Kamp findes ikke: ${matchId}`);
  }
}

function assertValidResult(result: MatchResult): void {
  if (!Number.isInteger(result.teamAPoints) || !Number.isInteger(result.teamBPoints)) {
    throw new Error("Resultat skal være hele tal.");
  }

  if (result.teamAPoints < 0 || result.teamBPoints < 0) {
    throw new Error("Resultat må ikke være negativt.");
  }
}





