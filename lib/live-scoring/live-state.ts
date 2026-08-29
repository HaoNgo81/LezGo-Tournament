import {
  calculatePlayerStandings,
  calculateTeamStandings,
  createNextAmericanoCycleRound,
  createFixedPartnerTeams,
  createNextFixedMexicanoRoundFromTeamRanking,
  createNextMexicanoRoundFromPlayerRanking,
  createTournamentRounds,
  getAmericanoCycleStatus,
  type AutomaticCycleState,
  type MatchResult,
  type StandingRow,
  type StandingsRankingMode,
  type Team,
  type TournamentFormat,
  type TournamentMatch,
  type TournamentPlayer,
  type TournamentRound,
} from "../tournament-engine";
import { validateScoreForScoringMode, type FixedScoreRule, type ScoringMode } from "../tournament-setup/scoring";
import type { LivePoolPlayState } from "./pool-play-state";

export interface LiveTournamentState {
  tournamentName: string;
  format: TournamentFormat;
  status: "active" | "finished";
  finishedAt?: string;
  players: TournamentPlayer[];
  rounds: TournamentRound[];
  configuredRounds?: number;
  automaticCycle?: AutomaticCycleState;
  courtCount?: number;
  activeRoundNumber: number;
  results: MatchResult[];
  startedMatchIds: string[];
  scoringMode: ScoringMode;
  fixedScoreRule?: FixedScoreRule;
  fixedScorePoints?: number;
  timeLimitMinutes?: number;
  roundTimer?: RoundTimerState;
  rankingMode: StandingsRankingMode;
  poolPlay?: LivePoolPlayState;
}

export type LiveMatchStatus = "Klar" | "I gang" | "Afsluttet";

export type RoundTimerStatus = "idle" | "countdown" | "running" | "paused" | "expired";

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
    configuredRounds: 2,
    courtCount: 2,
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
  return (isOpenEndedAmericano(state) || state.activeRoundNumber < getConfiguredRoundCount(state)) && getRoundProgress(state).isComplete;
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
  const nextRoundNumber = state.activeRoundNumber + 1;

  if (!isOpenEndedAmericano(state) && state.activeRoundNumber >= getConfiguredRoundCount(state)) {
    return state;
  }

  if (!getRoundProgress(state).isComplete) {
    throw new Error("Alle kampe i runden skal være gemt, før næste runde kan åbnes.");
  }

  const rounds = state.rounds.some((round) => round.roundNumber === nextRoundNumber)
    ? state.rounds
    : [...state.rounds, createNextDynamicRound(state, nextRoundNumber)];

  return {
    ...state,
    rounds,
    activeRoundNumber: nextRoundNumber,
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
  validateScoreForScoringMode(state.scoringMode, result.teamAPoints, result.teamBPoints, state);

  assertMatchExists(state, result.matchId);

  const results = state.results.filter((savedResult) => savedResult.matchId !== result.matchId);
  const nextState = {
    ...state,
    startedMatchIds: (state.startedMatchIds ?? []).filter((matchId) => matchId !== result.matchId),
    results: [...results, result],
  };

  return refreshUnplayedMexicanoRounds(nextState, result.matchId);
}

export function startRoundTimer(state: LiveTournamentState): LiveTournamentState {
  if (state.scoringMode !== "Spil på tid") {
    throw new Error("Uret kan kun startes, når scoring er sat til Spil på tid.");
  }

  if (!state.timeLimitMinutes || state.timeLimitMinutes < 1) {
    throw new Error("Vælg spilletid før uret startes.");
  }

  if (state.roundTimer?.roundNumber === state.activeRoundNumber && state.roundTimer.status === "paused") {
    return {
      ...state,
      roundTimer: {
        ...state.roundTimer,
        status: state.roundTimer.countdownSeconds > 0 ? "countdown" : "running",
      },
    };
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

  if (!timer || timer.status === "idle" || timer.status === "paused" || timer.status === "expired") {
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

export function stopRoundTimer(state: LiveTournamentState): LiveTournamentState {
  const timer = state.roundTimer;

  if (!timer || (timer.status !== "countdown" && timer.status !== "running")) {
    return state;
  }

  return {
    ...state,
    roundTimer: {
      ...timer,
      status: "paused",
    },
  };
}

export function resetRoundTimer(state: LiveTournamentState): LiveTournamentState {
  if (state.scoringMode !== "Spil på tid" || !state.timeLimitMinutes || state.timeLimitMinutes < 1) {
    return state;
  }

  const durationSeconds = state.timeLimitMinutes * 60;

  return {
    ...state,
    roundTimer: {
      roundNumber: state.activeRoundNumber,
      status: "idle",
      countdownSeconds: 15,
      remainingSeconds: durationSeconds,
      durationSeconds,
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
  if (state.format === "fixed-partner-americano" || state.format === "fixed-partner-mexicano") {
    const teams = createFixedPartnerTeams(state.players).map((team) => ({
      team,
      name: team.playerIds.map((playerId) => getPlayerName(state.players, playerId)).join(" / "),
    }));

    return calculateTeamStandings(teams, state.rounds, state.results, state.rankingMode);
  }

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

function getConfiguredRoundCount(state: LiveTournamentState): number {
  return state.configuredRounds ?? state.rounds.length;
}

function createNextDynamicRound(state: LiveTournamentState, roundNumber: number): TournamentRound {
  if (isOpenEndedAmericano(state)) {
    return createNextAmericanoCycleRound(state, roundNumber);
  }

  if (state.format === "mexicano") {
    const standings = calculatePlayerStandings(state.players, state.rounds, state.results, state.rankingMode);
    const playerById = new Map(state.players.map((player) => [player.id, player]));
    const rankedPlayers = standings.map((row) => playerById.get(row.id)).filter((player): player is TournamentPlayer => Boolean(player));

    return createNextMexicanoRoundFromPlayerRanking(rankedPlayers, roundNumber, state.courtCount);
  }

  if (state.format === "fixed-partner-mexicano") {
    const teams = createFixedPartnerTeams(state.players);
    const standings = calculateTeamStandings(teams, state.rounds, state.results, state.rankingMode);
    const teamById = new Map(teams.map((team) => [team.id, team]));
    const rankedTeams = standings.map((row) => teamById.get(row.id)).filter((team): team is Team => Boolean(team));

    return createNextFixedMexicanoRoundFromTeamRanking(rankedTeams, roundNumber, state.courtCount);
  }

  throw new Error(`Runde ${roundNumber} er ikke oprettet.`);
}

function isOpenEndedAmericano(state: LiveTournamentState): boolean {
  return state.format === "americano" && Boolean(state.automaticCycle);
}

export function getLiveAmericanoCycleStatus(state: LiveTournamentState) {
  return getAmericanoCycleStatus(state);
}

function refreshUnplayedMexicanoRounds(state: LiveTournamentState, editedMatchId: string): LiveTournamentState {
  if (state.format !== "mexicano" && state.format !== "fixed-partner-mexicano") {
    return state;
  }

  const editedRoundNumber = state.rounds.find((round) => round.matches.some((match) => match.id === editedMatchId))?.roundNumber;

  if (!editedRoundNumber) {
    return state;
  }

  const resultMatchIds = new Set(state.results.map((result) => result.matchId));
  const rounds: TournamentRound[] = [];
  let workingState = state;
  let preserveRemainingRounds = false;

  for (const round of state.rounds) {
    if (round.roundNumber <= editedRoundNumber || preserveRemainingRounds) {
      rounds.push(round);
      continue;
    }

    if (round.matches.some((match) => resultMatchIds.has(match.id))) {
      preserveRemainingRounds = true;
      rounds.push(round);
      continue;
    }

    workingState = { ...workingState, rounds };
    rounds.push(createNextDynamicRound(workingState, round.roundNumber));
  }

  return {
    ...state,
    rounds,
  };
}





