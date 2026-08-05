import type { LiveTournamentState } from "../live-scoring";
import type { TeamVsTeamTournamentState } from "./team-vs-team-setup";

const activeTournamentStorageKey = "lezgo.activeTournament.v1";
const activeTeamVsTeamStorageKey = "lezgo.activeTeamVsTeam.v1";
const completedTournamentsStorageKey = "lezgo.completedTournaments.v1";

export interface CompletedTournament {
  id: string;
  finishedAt: string;
  state: LiveTournamentState;
}

export function saveActiveTournament(state: LiveTournamentState): void {
  window.localStorage.setItem(activeTournamentStorageKey, JSON.stringify(state));
}

export function loadActiveTournament(): LiveTournamentState | null {
  if (typeof window === "undefined") {
    return null;
  }

  const savedState = window.localStorage.getItem(activeTournamentStorageKey);

  if (!savedState) {
    return null;
  }

  try {
    return JSON.parse(savedState) as LiveTournamentState;
  } catch {
    window.localStorage.removeItem(activeTournamentStorageKey);
    return null;
  }
}

export function saveActiveTeamVsTeamTournament(state: TeamVsTeamTournamentState): void {
  window.localStorage.setItem(activeTeamVsTeamStorageKey, JSON.stringify(state));
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
    return JSON.parse(savedState) as TeamVsTeamTournamentState;
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
    return JSON.parse(savedTournaments) as CompletedTournament[];
  } catch {
    window.localStorage.removeItem(completedTournamentsStorageKey);
    return [];
  }
}

function createCompletedTournamentId(state: LiveTournamentState): string {
  return `${state.tournamentName.trim().toLocaleLowerCase("da")}-${state.finishedAt ?? "active"}`;
}
