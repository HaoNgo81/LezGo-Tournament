import type { LiveTournamentState } from "../live-scoring";
import { rebalanceFixedPartnerAmericanoCourts, rebalanceMixedAmericanoCourts } from "../tournament-engine";
import { getTeamVsTeamMaxRounds, teamVsTeamPlayerOptions, type TeamVsTeamMatchFormat, type TeamVsTeamMatchResult, type TeamVsTeamPlayersPerTeam, type TeamVsTeamRoundResult, type TeamVsTeamSetResult } from "../team-vs-team";
import type { TeamVsTeamTournamentState } from "./team-vs-team-setup";
import { createStandardShadowSaveLocalId, createTeamVsTeamShadowSaveLocalId, markLocalShadowSave, queueStandardTournamentShadowSave, queueTeamVsTeamShadowSave } from "./shadow-save";

const activeTournamentStorageKey = "lezgo.activeTournament.v1";
const activeTournamentsStorageKey = "lezgo.activeTournaments.v1";
const activeTeamVsTeamStorageKey = "lezgo.activeTeamVsTeam.v1";
const completedTournamentsStorageKey = "lezgo.completedTournaments.v1";
const completedTeamVsTeamTournamentsStorageKey = "lezgo.completedTeamVsTeamTournaments.v1";
const maxActiveTournaments = 5;

export interface CompletedTournament {
  id: string;
  finishedAt: string;
  state: LiveTournamentState;
}

export interface CompletedTeamVsTeamTournament {
  id: string;
  finishedAt: string;
  state: TeamVsTeamTournamentState;
}

export function saveActiveTournament(state: LiveTournamentState): void {
  window.localStorage.setItem(activeTournamentStorageKey, JSON.stringify(state));
  window.localStorage.removeItem(activeTeamVsTeamStorageKey);

  if (state.status !== "active") {
    return;
  }

  const tournamentId = createActiveTournamentId(state);
  const activeTournaments = loadActiveTournaments().filter((tournament) => createActiveTournamentId(tournament) !== tournamentId);
  window.localStorage.setItem(activeTournamentsStorageKey, JSON.stringify([state, ...activeTournaments].slice(0, maxActiveTournaments)));
  markLocalShadowSave(tournamentId, "standard");
  queueStandardTournamentShadowSave(tournamentId, state);
}

export function saveActiveTournamentFromRemoteSync(state: LiveTournamentState): void {
  window.localStorage.setItem(activeTournamentStorageKey, JSON.stringify(state));
  window.localStorage.removeItem(activeTeamVsTeamStorageKey);

  if (state.status !== "active") {
    return;
  }

  const tournamentId = createActiveTournamentId(state);
  const activeTournaments = loadActiveTournaments().filter((tournament) => createActiveTournamentId(tournament) !== tournamentId);
  window.localStorage.setItem(activeTournamentsStorageKey, JSON.stringify([state, ...activeTournaments].slice(0, maxActiveTournaments)));
}

export function loadActiveTournament(): LiveTournamentState | null {
  if (typeof window === "undefined") {
    return null;
  }

  const savedState = window.localStorage.getItem(activeTournamentStorageKey);

  if (!savedState) {
    return loadActiveTournaments()[0] ?? null;
  }

  try {
    const parsedState = JSON.parse(savedState) as unknown;

    if (!isLoadableStandardTournamentState(parsedState)) {
      window.localStorage.removeItem(activeTournamentStorageKey);
      return loadActiveTournaments()[0] ?? null;
    }

    return normalizeActiveTournamentState(parsedState);
  } catch {
    window.localStorage.removeItem(activeTournamentStorageKey);
    return null;
  }
}

export function loadActiveTournaments(): LiveTournamentState[] {
  if (typeof window === "undefined") {
    return [];
  }

  const savedTournaments = window.localStorage.getItem(activeTournamentsStorageKey);

  if (!savedTournaments) {
    const selectedTournament = loadSelectedActiveTournament();
    return selectedTournament?.status === "active" ? [selectedTournament] : [];
  }

  try {
    const parsedTournaments = JSON.parse(savedTournaments) as unknown;

    if (!Array.isArray(parsedTournaments)) {
      window.localStorage.removeItem(activeTournamentsStorageKey);
      return [];
    }

    return parsedTournaments
      .filter(isLoadableStandardTournamentState)
      .map(normalizeActiveTournamentState)
      .filter((state) => state.status === "active")
      .slice(0, maxActiveTournaments);
  } catch {
    window.localStorage.removeItem(activeTournamentsStorageKey);
    return [];
  }
}

export function selectActiveTournament(id: string): LiveTournamentState | null {
  const tournament = loadActiveTournaments().find((state) => createActiveTournamentId(state) === id);

  if (!tournament) {
    return null;
  }

  window.localStorage.setItem(activeTournamentStorageKey, JSON.stringify(tournament));
  window.localStorage.removeItem(activeTeamVsTeamStorageKey);
  return tournament;
}

export function saveActiveTeamVsTeamTournament(state: TeamVsTeamTournamentState): void {
  const tournamentId = createTeamVsTeamShadowSaveLocalId(state);

  window.localStorage.setItem(activeTeamVsTeamStorageKey, JSON.stringify(state));
  window.localStorage.removeItem(activeTournamentStorageKey);
  window.localStorage.removeItem(activeTournamentsStorageKey);
  markLocalShadowSave(tournamentId, "team-vs-team");
  queueTeamVsTeamShadowSave(tournamentId, state);
}

export function saveActiveTeamVsTeamTournamentFromRemoteSync(state: TeamVsTeamTournamentState): void {
  window.localStorage.setItem(activeTeamVsTeamStorageKey, JSON.stringify(state));
  window.localStorage.removeItem(activeTournamentStorageKey);
  window.localStorage.removeItem(activeTournamentsStorageKey);
}

export function loadActiveTeamVsTeamTournament(): TeamVsTeamTournamentState | null {
  if (typeof window === "undefined") {
    return null;
  }

  const savedState = window.localStorage.getItem(activeTeamVsTeamStorageKey);

  if (!savedState) {
    return null;
  }

  try {
    return normalizeActiveTeamVsTeamState(JSON.parse(savedState) as TeamVsTeamTournamentState);
  } catch {
    window.localStorage.removeItem(activeTeamVsTeamStorageKey);
    return null;
  }
}

export function saveCompletedTournament(state: LiveTournamentState): CompletedTournament {
  const finishedAt = state.finishedAt ?? new Date().toISOString();
  const completedTournament: CompletedTournament = {
    id: createCompletedTournamentId(state),
    finishedAt,
    state: {
      ...state,
      status: "finished",
      finishedAt,
    },
  };
  const completedTournaments = loadCompletedTournaments().filter((tournament) => tournament.id !== completedTournament.id);

  window.localStorage.setItem(completedTournamentsStorageKey, JSON.stringify([completedTournament, ...completedTournaments]));

  return completedTournament;
}

export function restoreCompletedTournament(id: string): LiveTournamentState | null {
  const completedTournament = loadCompletedTournaments().find((tournament) => tournament.id === id);

  if (!completedTournament) {
    return null;
  }

  saveActiveTournament(completedTournament.state);

  return completedTournament.state;
}

export function reopenCompletedTournament(id: string): LiveTournamentState | null {
  const completedTournament = loadCompletedTournaments().find((tournament) => tournament.id === id);

  if (!completedTournament) {
    return null;
  }

  const activeState: LiveTournamentState = {
    ...completedTournament.state,
    status: "active",
  };

  saveActiveTournament(activeState);

  return activeState;
}

export function deleteCompletedTournament(id: string): CompletedTournament[] {
  const completedTournaments = loadCompletedTournaments().filter((tournament) => tournament.id !== id);

  window.localStorage.setItem(completedTournamentsStorageKey, JSON.stringify(completedTournaments));

  return completedTournaments;
}

export function loadCompletedTournaments(): CompletedTournament[] {
  if (typeof window === "undefined") {
    return [];
  }

  const savedTournaments = window.localStorage.getItem(completedTournamentsStorageKey);

  if (!savedTournaments) {
    return [];
  }

  try {
    return (JSON.parse(savedTournaments) as CompletedTournament[]).map((tournament) => ({
      ...tournament,
      state: normalizeActiveTournamentState(tournament.state),
    }));
  } catch {
    window.localStorage.removeItem(completedTournamentsStorageKey);
    return [];
  }
}

export function saveCompletedTeamVsTeamTournament(state: TeamVsTeamTournamentState): CompletedTeamVsTeamTournament {
  const finishedAt = state.finishedAt ?? new Date().toISOString();
  const completedTournament: CompletedTeamVsTeamTournament = {
    id: createCompletedTeamVsTeamTournamentId(state, finishedAt),
    finishedAt,
    state: {
      ...state,
      status: "finished",
      finishedAt,
    },
  };
  const completedTournaments = loadCompletedTeamVsTeamTournaments().filter((tournament) => tournament.id !== completedTournament.id);

  window.localStorage.setItem(completedTeamVsTeamTournamentsStorageKey, JSON.stringify([completedTournament, ...completedTournaments]));

  return completedTournament;
}

export function restoreCompletedTeamVsTeamTournament(id: string): TeamVsTeamTournamentState | null {
  const completedTournament = loadCompletedTeamVsTeamTournaments().find((tournament) => tournament.id === id);

  if (!completedTournament) {
    return null;
  }

  saveActiveTeamVsTeamTournament(completedTournament.state);

  return completedTournament.state;
}

export function reopenCompletedTeamVsTeamTournament(id: string): TeamVsTeamTournamentState | null {
  const completedTournament = loadCompletedTeamVsTeamTournaments().find((tournament) => tournament.id === id);

  if (!completedTournament) {
    return null;
  }

  const activeState: TeamVsTeamTournamentState = {
    ...completedTournament.state,
    status: "active",
  };

  saveActiveTeamVsTeamTournament(activeState);

  return activeState;
}

export function deleteCompletedTeamVsTeamTournament(id: string): CompletedTeamVsTeamTournament[] {
  const completedTournaments = loadCompletedTeamVsTeamTournaments().filter((tournament) => tournament.id !== id);

  window.localStorage.setItem(completedTeamVsTeamTournamentsStorageKey, JSON.stringify(completedTournaments));

  return completedTournaments;
}

export function loadCompletedTeamVsTeamTournaments(): CompletedTeamVsTeamTournament[] {
  if (typeof window === "undefined") {
    return [];
  }

  const savedTournaments = window.localStorage.getItem(completedTeamVsTeamTournamentsStorageKey);

  if (!savedTournaments) {
    return [];
  }

  try {
    return (JSON.parse(savedTournaments) as CompletedTeamVsTeamTournament[]).map((tournament) => ({
      ...tournament,
      state: normalizeActiveTeamVsTeamState(tournament.state),
    }));
  } catch {
    window.localStorage.removeItem(completedTeamVsTeamTournamentsStorageKey);
    return [];
  }
}

function normalizeActiveTournamentState(state: LiveTournamentState): LiveTournamentState {
  const normalizedState = normalizeStandardTournamentCourts(state);

  if (!normalizedState.poolPlay) {
    return normalizedState;
  }

  return {
    ...normalizedState,
    poolPlay: {
      ...normalizedState.poolPlay,
      initialResults: Array.isArray(normalizedState.poolPlay.initialResults) ? normalizedState.poolPlay.initialResults : [],
      nextStageResults: Array.isArray(normalizedState.poolPlay.nextStageResults) ? normalizedState.poolPlay.nextStageResults : [],
      finalResults: Array.isArray(normalizedState.poolPlay.finalResults) ? normalizedState.poolPlay.finalResults : [],
      placementTiebreakResults: Array.isArray(normalizedState.poolPlay.placementTiebreakResults) ? normalizedState.poolPlay.placementTiebreakResults : [],
      ...(normalizedState.poolPlay.crossMatchStage ? {
        crossMatchStage: {
          ...normalizedState.poolPlay.crossMatchStage,
          unmatchedPlacementGroups: Array.isArray(normalizedState.poolPlay.crossMatchStage.unmatchedPlacementGroups)
            ? normalizedState.poolPlay.crossMatchStage.unmatchedPlacementGroups
            : [],
        },
      } : {}),
    },
  };
}

function normalizeStandardTournamentCourts(state: LiveTournamentState): LiveTournamentState {
  if (state.format === "mixed-americano") {
    return { ...state, rounds: rebalanceMixedAmericanoCourts(state.rounds) };
  }

  if (state.format === "fixed-partner-americano") {
    return { ...state, rounds: rebalanceFixedPartnerAmericanoCourts(state.rounds) };
  }

  return state;
}

function loadSelectedActiveTournament(): LiveTournamentState | null {
  const savedState = window.localStorage.getItem(activeTournamentStorageKey);

  if (!savedState) {
    return null;
  }

  try {
    const parsedState = JSON.parse(savedState) as unknown;

    if (!isLoadableStandardTournamentState(parsedState)) {
      window.localStorage.removeItem(activeTournamentStorageKey);
      return null;
    }

    return normalizeActiveTournamentState(parsedState);
  } catch {
    window.localStorage.removeItem(activeTournamentStorageKey);
    return null;
  }
}

function normalizeActiveTeamVsTeamState(state: TeamVsTeamTournamentState): TeamVsTeamTournamentState {
  const rawState = state as Partial<TeamVsTeamTournamentState>;
  const playersPerTeam = isPlayersPerTeam(rawState.playersPerTeam) ? rawState.playersPerTeam : 4;
  const matchFormat = isMatchFormat(rawState.matchFormat) ? rawState.matchFormat : "oneSet";
  const maxRounds = rawState.maxRounds === 2 || rawState.maxRounds === 3 ? rawState.maxRounds : getTeamVsTeamMaxRounds(playersPerTeam);
  const competitionMode = rawState.competitionMode === "pool" ? "pool" : "knockout";
  const drawMode = rawState.drawMode === "random" ? "random" : "manual";

  return {
    ...state,
    competitionMode,
    drawMode,
    playersPerTeam,
    matchFormat,
    maxRounds,
    matchups: Array.isArray(state.matchups)
      ? state.matchups.map((match) => ({
          ...match,
          roundResults: Array.isArray(match.roundResults) ? match.roundResults.map(normalizeTeamVsTeamRoundResult) : [],
        }))
      : [],
  };
}

function normalizeTeamVsTeamRoundResult(roundResult: TeamVsTeamRoundResult): TeamVsTeamRoundResult {
  return {
    ...roundResult,
    match1: normalizeTeamVsTeamMatchResult(roundResult.match1),
    match2: normalizeTeamVsTeamMatchResult(roundResult.match2),
  };
}

function normalizeTeamVsTeamMatchResult(matchResult: TeamVsTeamMatchResult | TeamVsTeamSetResult): TeamVsTeamMatchResult {
  if (isTeamVsTeamMatchResult(matchResult)) {
    return { sets: matchResult.sets };
  }

  return { sets: [matchResult] };
}

function isTeamVsTeamMatchResult(matchResult: TeamVsTeamMatchResult | TeamVsTeamSetResult): matchResult is TeamVsTeamMatchResult {
  return "sets" in matchResult && Array.isArray(matchResult.sets);
}

function isPlayersPerTeam(value: unknown): value is TeamVsTeamPlayersPerTeam {
  return typeof value === "number" && teamVsTeamPlayerOptions.includes(value as TeamVsTeamPlayersPerTeam);
}

function isMatchFormat(value: unknown): value is TeamVsTeamMatchFormat {
  return value === "oneSet" || value === "bestOfThree";
}

function isLoadableStandardTournamentState(value: unknown): value is LiveTournamentState {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<LiveTournamentState>;

  return typeof candidate.tournamentName === "string"
    && typeof candidate.format === "string"
    && (candidate.status === "active" || candidate.status === "finished")
    && Array.isArray(candidate.players)
    && Array.isArray(candidate.rounds)
    && Array.isArray(candidate.results)
    && typeof candidate.activeRoundNumber === "number"
    && typeof candidate.scoringMode === "string"
    && typeof candidate.rankingMode === "string";
}

function createCompletedTournamentId(state: LiveTournamentState): string {
  return `${state.tournamentName.trim().toLocaleLowerCase("da")}-${state.finishedAt ?? "active"}`;
}

function createActiveTournamentId(state: LiveTournamentState): string {
  return createStandardShadowSaveLocalId(state);
}

function createCompletedTeamVsTeamTournamentId(state: TeamVsTeamTournamentState, finishedAt: string): string {
  return `${state.name.trim().toLocaleLowerCase("da")}-${finishedAt}`;
}
