import { beforeEach, describe, expect, it } from "vitest";
import { createMockLiveTournamentState, finishTournament } from "../lib/live-scoring";
import {
  deleteCompletedTournament,
  loadActiveTournament,
  loadCompletedTournaments,
  reopenCompletedTournament,
  restoreCompletedTournament,
  saveCompletedTournament,
} from "../lib/tournament-setup";

describe("tournament storage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("stores completed tournaments with finished state", () => {
    const finishedState = finishTournament(createMockLiveTournamentState(), "2026-08-04T18:00:00.000Z");
    const completedTournament = saveCompletedTournament(finishedState);

    expect(completedTournament.finishedAt).toBe("2026-08-04T18:00:00.000Z");
    expect(loadCompletedTournaments()).toHaveLength(1);
    expect(loadCompletedTournaments()[0].state.status).toBe("finished");
  });

  it("restores a completed tournament as the active selected tournament for final standings", () => {
    const finishedState = finishTournament(createMockLiveTournamentState(), "2026-08-04T18:00:00.000Z");
    const completedTournament = saveCompletedTournament(finishedState);
    const restoredState = restoreCompletedTournament(completedTournament.id);

    expect(restoredState?.status).toBe("finished");
    expect(loadActiveTournament()?.finishedAt).toBe("2026-08-04T18:00:00.000Z");
  });

  it("reopens a completed tournament so results can be edited", () => {
    const finishedState = finishTournament(createMockLiveTournamentState(), "2026-08-04T18:00:00.000Z");
    const completedTournament = saveCompletedTournament(finishedState);
    const reopenedState = reopenCompletedTournament(completedTournament.id);

    expect(reopenedState?.status).toBe("active");
    expect(reopenedState?.finishedAt).toBe("2026-08-04T18:00:00.000Z");
    expect(loadActiveTournament()?.status).toBe("active");
  });

  it("deletes a completed tournament from local history", () => {
    const firstState = finishTournament(createMockLiveTournamentState(), "2026-08-04T18:00:00.000Z");
    const secondState = finishTournament({ ...createMockLiveTournamentState(), tournamentName: "Aften Americano" }, "2026-08-04T19:00:00.000Z");
    const firstCompletedTournament = saveCompletedTournament(firstState);
    saveCompletedTournament(secondState);

    const remainingTournaments = deleteCompletedTournament(firstCompletedTournament.id);

    expect(remainingTournaments).toHaveLength(1);
    expect(loadCompletedTournaments()).toHaveLength(1);
    expect(loadCompletedTournaments()[0].state.tournamentName).toBe("Aften Americano");
  });
});
