import { beforeEach, describe, expect, it } from "vitest";
import { createMockLiveTournamentState, finishTournament } from "../lib/live-scoring";
import {
  deleteCompletedTournament,
  loadActiveTournament,
  loadActiveTeamVsTeamTournament,
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
  it("normalizes older Team vs. Team results from local storage", () => {
    const legacyState = {
      name: "Klubkamp",
      date: "2026-08-05",
      startTime: "18:00",
      scoringMode: "Fri scoring",
      teamCount: 2,
      status: "active",
      activeMatchupId: "holdkamp-1",
      teams: [
        createTeam("a", "Hold A"),
        createTeam("b", "Hold B"),
      ],
      matchups: [
        {
          id: "holdkamp-1",
          label: "Holdkamp",
          teamAId: "team-a",
          teamBId: "team-b",
          lineups: [],
          roundResults: [
            { roundNumber: 1, match1: { teamAPoints: 6, teamBPoints: 0 }, match2: { teamAPoints: 3, teamBPoints: 6 } },
          ],
        },
      ],
    };

    window.localStorage.setItem("lezgo.activeTeamVsTeam.v1", JSON.stringify(legacyState));

    const loadedState = loadActiveTeamVsTeamTournament();

    expect(loadedState?.playersPerTeam).toBe(4);
    expect(loadedState?.matchFormat).toBe("oneSet");
    expect(loadedState?.maxRounds).toBe(3);
    expect(loadedState?.matchups[0].roundResults[0].match1.sets).toEqual([{ teamAPoints: 6, teamBPoints: 0 }]);
  });
});
function createTeam(idPrefix: string, name: string) {
  return {
    id: `team-${idPrefix}`,
    name,
    captainPlayerId: `${idPrefix}1`,
    players: Array.from({ length: 4 }, (_, index) => ({ id: `${idPrefix}${index + 1}`, name: `${name} spiller ${index + 1}` })),
  };
}