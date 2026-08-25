import type { LiveTournamentState } from "../live-scoring";
import { safeLocalStorageGetItem, safeLocalStorageRemoveItem, safeLocalStorageSetItem } from "../browser-storage";
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
  const tournamentId = createActiveTournamentId(state);
  const selectedTournamentSaved = safeLocalStorageSetItem(activeTournamentStorageKey, JSON.stringify(state));

  if (!selectedTournamentSaved) {
    return;
  }

  safeLocalStorageRemoveItem(activeTeamVsTeamStorageKey);

  if (state.status !== "active") {
    removeActiveTournamentFromList(tournamentId);
    return;
  }

  const activeTournaments = loadActiveTournaments().filter((tournament) => createActiveTournamentId(tournament) !== tournamentId);
  safeLocalStorageSetItem(activeTournamentsStorageKey, JSON.stringify([state, ...activeTournaments].slice(0, maxActiveTournaments)));
  markLocalShadowSave(tournamentId, "standard");
  queueStandardTournamentShadowSave(tournamentId, state);
}

export function saveActiveTournamentFromRemoteSync(state: LiveTournamentState): void {
  const tournamentId = createActiveTournamentId(state);
  const selectedTournamentSaved = safeLocalStorageSetItem(activeTournamentStorageKey, JSON.stringify(state));

  if (!selectedTournamentSaved) {
    return;
  }

  safeLocalStorageRemoveItem(activeTeamVsTeamStorageKey);

  if (state.status !== "active") {
    removeActiveTournamentFromList(tournamentId);
    return;
  }

  const activeTournaments = loadActiveTournaments().filter((tournament) => createActiveTournamentId(tournament) !== tournamentId);
  safeLocalStorageSetItem(activeTournamentsStorageKey, JSON.stringify([state, ...activeTournaments].slice(0, maxActiveTournaments)));
}

export function loadActiveTournament(): LiveTournamentState | null {
  if (typeof window === "undefined") {
    return null;
  }

  const savedState = safeLocalStorageGetItem(activeTournamentStorageKey);

  if (!savedState) {
    return loadActiveTournaments()[0] ?? null;
  }

  try {
    const parsedState = JSON.parse(savedState) as unknown;

    if (!isLoadableStandardTournamentState(parsedState)) {
      safeLocalStorageRemoveItem(activeTournamentStorageKey);
      return loadActiveTournaments()[0] ?? null;
    }

    const normalizedState = normalizeActiveTournamentState(parsedState);
    const completedTournament = normalizedState.status === "active" ? findCompletedTournamentByActiveId(createActiveTournamentId(normalizedState)) : null;

    if (completedTournament) {
      safeLocalStorageSetItem(activeTournamentStorageKey, JSON.stringify(completedTournament.state));
      return completedTournament.state;
    }

    return normalizedState;
  } catch {
    safeLocalStorageRemoveItem(activeTournamentStorageKey);
    return null;
  }
}

export function loadActiveTournaments(): LiveTournamentState[] {
  if (typeof window === "undefined") {
    return [];
  }

  const savedTournaments = safeLocalStorageGetItem(activeTournamentsStorageKey);

  if (!savedTournaments) {
    const selectedTournament = loadSelectedActiveTournament();
    return selectedTournament?.status === "active" ? [selectedTournament] : [];
  }

  try {
    const parsedTournaments = JSON.parse(savedTournaments) as unknown;

    if (!Array.isArray(parsedTournaments)) {
      safeLocalStorageRemoveItem(activeTournamentsStorageKey);
      return [];
    }

    const completedActiveIds = new Set(loadCompletedTournaments().map((tournament) => createActiveTournamentId(tournament.state)));

    return parsedTournaments
      .filter(isLoadableStandardTournamentState)
      .map(normalizeActiveTournamentState)
      .filter((state) => state.status === "active" && !completedActiveIds.has(createActiveTournamentId(state)))
      .slice(0, maxActiveTournaments);
  } catch {
    safeLocalStorageRemoveItem(activeTournamentsStorageKey);
    return [];
  }
}

export function selectActiveTournament(id: string): LiveTournamentState | null {
  const tournament = loadActiveTournaments().find((state) => createActiveTournamentId(state) === id);

  if (!tournament) {
    return null;
  }

  if (!safeLocalStorageSetItem(activeTournamentStorageKey, JSON.stringify(tournament))) {
    return null;
  }

  safeLocalStorageRemoveItem(activeTeamVsTeamStorageKey);
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

  const completedTournamentSaved = safeLocalStorageSetItem(completedTournamentsStorageKey, JSON.stringify([completedTournament, ...completedTournaments]));

  if (!completedTournamentSaved) {
    return completedTournament;
  }
  replaceSelectedActiveTournamentIfSameId(createActiveTournamentId(completedTournament.state), completedTournament.state);
  removeActiveTournamentFromList(createActiveTournamentId(completedTournament.state));

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

  deleteCompletedTournament(id);
  saveActiveTournament(activeState);

  return activeState;
}

export function deleteCompletedTournament(id: string): CompletedTournament[] {
  const completedTournaments = loadCompletedTournaments().filter((tournament) => tournament.id !== id);

  safeLocalStorageSetItem(completedTournamentsStorageKey, JSON.stringify(completedTournaments));

  return completedTournaments;
}

export function loadCompletedTournaments(): CompletedTournament[] {
  if (typeof window === "undefined") {
    return [];
  }

  const savedTournaments = safeLocalStorageGetItem(completedTournamentsStorageKey);

  if (!savedTournaments) {
    return [];
  }

  try {
    return (JSON.parse(savedTournaments) as CompletedTournament[]).map((tournament) => ({
      ...tournament,
      state: normalizeActiveTournamentState(tournament.state),
    }));
  } catch {
    safeLocalStorageRemoveItem(completedTournamentsStorageKey);
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

  deleteCompletedTeamVsTeamTournament(id);
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
  const savedState = safeLocalStorageGetItem(activeTournamentStorageKey);

  if (!savedState) {
    return null;
  }

  try {
    const parsedState = JSON.parse(savedState) as unknown;

    if (!isLoadableStandardTournamentState(parsedState)) {
      safeLocalStorageRemoveItem(activeTournamentStorageKey);
      return null;
    }

    return normalizeActiveTournamentState(parsedState);
  } catch {
    safeLocalStorageRemoveItem(activeTournamentStorageKey);
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

export function isLoadableStandardTournamentState(value: unknown): value is LiveTournamentState {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<LiveTournamentState>;

  const baseIsLoadable = typeof candidate.tournamentName === "string"
    && typeof candidate.format === "string"
    && (candidate.status === "active" || candidate.status === "finished")
    && isLoadablePlayers(candidate.players)
    && typeof candidate.activeRoundNumber === "number"
    && Number.isInteger(candidate.activeRoundNumber)
    && isLoadableResults(candidate.results)
    && typeof candidate.scoringMode === "string"
    && typeof candidate.rankingMode === "string";

  if (!baseIsLoadable) {
    return false;
  }

  if (candidate.poolPlay) {
    return true;
  }

  return isLoadableRounds(candidate.rounds)
    && candidate.rounds.some((round) => round.roundNumber === candidate.activeRoundNumber);
}

function isLoadablePlayers(value: unknown): value is LiveTournamentState["players"] {
  return Array.isArray(value)
    && value.every((player) => (
      Boolean(player)
      && typeof player === "object"
      && typeof (player as { id?: unknown }).id === "string"
      && typeof (player as { name?: unknown }).name === "string"
    ));
}

function isLoadableRounds(value: unknown): value is LiveTournamentState["rounds"] {
  return Array.isArray(value)
    && value.length > 0
    && value.every((round) => (
      Boolean(round)
      && typeof round === "object"
      && typeof (round as { roundNumber?: unknown }).roundNumber === "number"
      && Number.isInteger((round as { roundNumber?: unknown }).roundNumber)
      && Array.isArray((round as { matches?: unknown }).matches)
      && ((round as { matches: unknown[] }).matches).every(isLoadableMatch)
    ));
}

function isLoadableMatch(value: unknown): boolean {
  if (!value || typeof value !== "object") {
    return false;
  }

  const match = value as { id?: unknown; courtNumber?: unknown; teamA?: { playerIds?: unknown }; teamB?: { playerIds?: unknown } };

  return typeof match.id === "string"
    && typeof match.courtNumber === "number"
    && Array.isArray(match.teamA?.playerIds)
    && Array.isArray(match.teamB?.playerIds);
}

function isLoadableResults(value: unknown): value is LiveTournamentState["results"] {
  return Array.isArray(value)
    && value.every((result) => (
      Boolean(result)
      && typeof result === "object"
      && typeof (result as { matchId?: unknown }).matchId === "string"
      && typeof (result as { teamAPoints?: unknown }).teamAPoints === "number"
      && typeof (result as { teamBPoints?: unknown }).teamBPoints === "number"
    ));
}

function createCompletedTournamentId(state: LiveTournamentState): string {
  return `${state.tournamentName.trim().toLocaleLowerCase("da")}-${state.finishedAt ?? "active"}`;
}

function createActiveTournamentId(state: LiveTournamentState): string {
  return createStandardShadowSaveLocalId(state);
}

function removeActiveTournamentFromList(tournamentId: string): void {
  const savedTournaments = safeLocalStorageGetItem(activeTournamentsStorageKey);

  if (!savedTournaments) {
    return;
  }

  try {
    const parsedTournaments = JSON.parse(savedTournaments) as unknown;

    if (!Array.isArray(parsedTournaments)) {
      safeLocalStorageRemoveItem(activeTournamentsStorageKey);
      return;
    }

    const activeTournaments = parsedTournaments
      .filter(isLoadableStandardTournamentState)
      .map(normalizeActiveTournamentState)
      .filter((state) => state.status === "active" && createActiveTournamentId(state) !== tournamentId)
      .slice(0, maxActiveTournaments);

    safeLocalStorageSetItem(activeTournamentsStorageKey, JSON.stringify(activeTournaments));
  } catch {
    safeLocalStorageRemoveItem(activeTournamentsStorageKey);
  }
}

function replaceSelectedActiveTournamentIfSameId(tournamentId: string, state: LiveTournamentState): void {
  const savedState = safeLocalStorageGetItem(activeTournamentStorageKey);

  if (!savedState) {
    return;
  }

  try {
    const parsedState = JSON.parse(savedState) as unknown;

    if (isLoadableStandardTournamentState(parsedState) && createActiveTournamentId(normalizeActiveTournamentState(parsedState)) === tournamentId) {
      safeLocalStorageSetItem(activeTournamentStorageKey, JSON.stringify(state));
    }
  } catch {
    safeLocalStorageRemoveItem(activeTournamentStorageKey);
  }
}

function findCompletedTournamentByActiveId(tournamentId: string): CompletedTournament | null {
  return loadCompletedTournaments().find((tournament) => createActiveTournamentId(tournament.state) === tournamentId) ?? null;
}

function createCompletedTeamVsTeamTournamentId(state: TeamVsTeamTournamentState, finishedAt: string): string {
  return `${state.name.trim().toLocaleLowerCase("da")}-${finishedAt}`;
}
