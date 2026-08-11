import { beforeEach, describe, expect, it } from "vitest";
import { createMockLiveTournamentState, finishTournament } from "../lib/live-scoring";
import {
  deleteCompletedTeamVsTeamTournament,
  deleteCompletedTournament,
  loadActiveTeamVsTeamTournament,
  loadActiveTournament,
  loadActiveTournaments,
  loadCompletedTeamVsTeamTournaments,
  loadCompletedTournaments,
  reopenCompletedTeamVsTeamTournament,
  reopenCompletedTournament,
  saveActiveTeamVsTeamTournament,
  saveActiveTournament,
  restoreCompletedTeamVsTeamTournament,
  restoreCompletedTournament,
  selectActiveTournament,
  saveCompletedTeamVsTeamTournament,
  saveCompletedTournament,
} from "../lib/tournament-setup";

const finishedTeamVsTeamState = {
  name: "Klubkamp",
  date: "2026-08-05",
  startTime: "18:00",
  scoringMode: "Fri scoring" as const,
  teamCount: 2 as const,
  competitionMode: "knockout" as const,
  drawMode: "manual" as const,
  playersPerTeam: 4 as const,
  matchFormat: "oneSet" as const,
  teams: [createTeam("a", "Hold A"), createTeam("b", "Hold B")],
  status: "finished" as const,
  activeMatchupId: "holdkamp-1",
  finishedAt: "2026-08-05T18:30:00.000Z",
  maxRounds: 3 as const,
  matchups: [
    {
      id: "holdkamp-1",
      label: "Holdkamp",
      teamAId: "team-a",
      teamBId: "team-b",
      lineups: [],
      roundResults: [],
    },
  ],
};

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

  it("normalizes older active pool-play tournaments from local storage", () => {
    const legacyState = createLegacyPoolPlayState("Legacy pulje");

    window.localStorage.setItem("lezgo.activeTournament.v1", JSON.stringify(legacyState));

    const loadedState = loadActiveTournament();

    expect(loadedState?.poolPlay?.initialResults).toEqual([]);
    expect(loadedState?.poolPlay?.nextStageResults).toEqual([]);
    expect(loadedState?.poolPlay?.finalResults).toEqual([]);
  });

  it("normalizes older completed pool-play tournaments from local storage", () => {
    const legacyState = createLegacyPoolPlayState("Legacy afsluttet");

    window.localStorage.setItem("lezgo.completedTournaments.v1", JSON.stringify([
      {
        id: "legacy-afsluttet",
        finishedAt: "2026-08-04T18:00:00.000Z",
        state: {
          ...legacyState,
          status: "finished",
          finishedAt: "2026-08-04T18:00:00.000Z",
        },
      },
    ]));

    const [completedTournament] = loadCompletedTournaments();

    expect(completedTournament.state.poolPlay?.initialResults).toEqual([]);
    expect(completedTournament.state.poolPlay?.nextStageResults).toEqual([]);
    expect(completedTournament.state.poolPlay?.finalResults).toEqual([]);
  });

  it("stores, restores, reopens, and deletes completed Team vs. Team tournaments", () => {
    const completedTournament = saveCompletedTeamVsTeamTournament(finishedTeamVsTeamState);
    const restoredState = restoreCompletedTeamVsTeamTournament(completedTournament.id);
    const reopenedState = reopenCompletedTeamVsTeamTournament(completedTournament.id);
    const remainingTournaments = deleteCompletedTeamVsTeamTournament(completedTournament.id);

    expect(loadCompletedTeamVsTeamTournaments()).toHaveLength(0);
    expect(completedTournament.finishedAt).toBe("2026-08-05T18:30:00.000Z");
    expect(restoredState?.status).toBe("finished");
    expect(reopenedState?.status).toBe("active");
    expect(loadActiveTeamVsTeamTournament()?.name).toBe("Klubkamp");
    expect(remainingTournaments).toEqual([]);
  });

  it("keeps only one active tournament type at a time", () => {
    saveActiveTeamVsTeamTournament({ ...finishedTeamVsTeamState, status: "active" });
    saveActiveTournament(createMockLiveTournamentState());

    expect(loadActiveTournament()?.tournamentName).toBe("Mock Americano");
    expect(loadActiveTeamVsTeamTournament()).toBeNull();

    saveActiveTeamVsTeamTournament({ ...finishedTeamVsTeamState, status: "active" });

    expect(loadActiveTournament()).toBeNull();
    expect(loadActiveTeamVsTeamTournament()?.name).toBe("Klubkamp");
  });

  it("stores up to five active standard tournaments and selects one for live scoring", () => {
    Array.from({ length: 6 }, (_, index) => ({
      ...createMockLiveTournamentState(),
      tournamentName: `Aktiv ${index + 1}`,
    })).forEach(saveActiveTournament);

    const activeTournaments = loadActiveTournaments();

    expect(activeTournaments).toHaveLength(5);
    expect(activeTournaments.map((tournament) => tournament.tournamentName)).toEqual(["Aktiv 6", "Aktiv 5", "Aktiv 4", "Aktiv 3", "Aktiv 2"]);

    selectActiveTournament("aktiv 3-americano");

    expect(loadActiveTournament()?.tournamentName).toBe("Aktiv 3");
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
    expect(loadedState?.competitionMode).toBe("knockout");
    expect(loadedState?.drawMode).toBe("manual");
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

function createLegacyPoolPlayState(name: string) {
  const participants = [
    { id: "participant-1", name: "Par A" },
    { id: "participant-2", name: "Par B" },
    { id: "participant-3", name: "Par C" },
    { id: "participant-4", name: "Par D" },
  ];

  return {
    tournamentName: name,
    format: "pool-play",
    status: "active",
    players: participants,
    rounds: [],
    activeRoundNumber: 1,
    results: [],
    scoringMode: "Fri scoring",
    rankingMode: "matchPointsFirst",
    poolPlay: {
      phase: "initial",
      advancementMode: "crossMatches",
      unmatchedResolution: "bye",
      initialStage: {
        participantType: "pair",
        participants,
        pools: [
          {
            id: "pool-1",
            name: "Pulje 1",
            participantIds: ["participant-1", "participant-2"],
            scheduleType: "roundRobin",
            encounters: [{ id: "pool-1-match-1", poolId: "pool-1", participantAId: "participant-1", participantBId: "participant-2" }],
            americanoRounds: [],
          },
          {
            id: "pool-2",
            name: "Pulje 2",
            participantIds: ["participant-3", "participant-4"],
            scheduleType: "roundRobin",
            encounters: [{ id: "pool-2-match-1", poolId: "pool-2", participantAId: "participant-3", participantBId: "participant-4" }],
            americanoRounds: [],
          },
        ],
      },
    },
  };
}
