import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
  markActiveCloudTournamentAuthority,
  loadActiveCloudTournamentAuthority,
  createTournamentFromSetup,
} from "../lib/tournament-setup";
import { createTournamentRounds } from "../lib/tournament-engine";
import type { LiveTournamentState } from "../lib/live-scoring";

const originalLocalStorage = window.localStorage;
const originalSessionStorage = window.sessionStorage;

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
    window.sessionStorage.clear();
  });

  afterEach(() => {
    Object.defineProperty(window, "localStorage", {
      value: originalLocalStorage,
      configurable: true,
    });
    Object.defineProperty(window, "sessionStorage", {
      value: originalSessionStorage,
      configurable: true,
    });
  });

  it("stores completed tournaments with finished state", () => {
    const finishedState = finishTournament(createMockLiveTournamentState(), "2026-08-04T18:00:00.000Z");
    const completedTournament = saveCompletedTournament(finishedState);

    expect(completedTournament.finishedAt).toBe("2026-08-04T18:00:00.000Z");
    expect(loadCompletedTournaments()).toHaveLength(1);
    expect(loadCompletedTournaments()[0].state.status).toBe("finished");
  });

  it("removes a tournament from active storage when it is saved as completed", () => {
    const activeState = {
      ...createMockLiveTournamentState(),
      tournamentName: "FIX 6",
    };

    saveActiveTournament(activeState);
    saveCompletedTournament(finishTournament(activeState, "2026-08-24T12:00:00.000Z"));

    expect(loadActiveTournaments().map((tournament) => tournament.tournamentName)).not.toContain("FIX 6");
    expect(loadCompletedTournaments().map((tournament) => tournament.state.tournamentName)).toContain("FIX 6");
  });

  it("persists an already generated randomized first round without regenerating it on reload", () => {
    const state = createTournamentFromSetup({
      name: "Random seed persistence",
      format: "Mexicano",
      playerText: Array.from({ length: 16 }, (_, index) => `Spiller ${index + 1}`).join("\n"),
      femalePlayerText: "",
      malePlayerText: "",
      courts: 4,
      rounds: 10,
      scoringMode: "Fri scoring",
      firstRoundOrder: "random",
      rankingMode: "matchPointsFirst",
    });
    const generatedRoundOne = state.rounds[0];

    saveActiveTournament(state);

    expect(loadActiveTournament()?.rounds[0]).toEqual(generatedRoundOne);
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

  it("rebalances older saved Mixed Americano court assignments on load", () => {
    const legacyState = createLegacyLockedMixedAmericanoState();
    const beforeHistories = countPlayerCourts(legacyState);

    expect(getCourtSpread(beforeHistories.get("f1") ?? new Map(), 4)).toBe(10);
    expect(getLongestSameCourtStreak(getPlayerCourtSequence(legacyState, "f1"))).toBe(10);

    window.localStorage.setItem("lezgo.activeTournament.v1", JSON.stringify(legacyState));

    const loadedState = loadActiveTournament();
    const afterHistories = countPlayerCourts(loadedState as LiveTournamentState);

    expect(loadedState?.format).toBe("mixed-americano");
    expect(loadedState?.results[0]).toEqual(legacyState.results[0]);

    for (const player of loadedState?.players ?? []) {
      expect(getCourtSpread(afterHistories.get(player.id) ?? new Map(), 4)).toBeLessThanOrEqual(1);
      expect(getLongestSameCourtStreak(getPlayerCourtSequence(loadedState as LiveTournamentState, player.id))).toBeLessThanOrEqual(2);
    }
  });

  it("rebalances older saved Fast Makker Americano court assignments on load without changing pairs", () => {
    const legacyState = createLegacyLockedFixedPartnerAmericanoState();
    const lockedTeamId = getFixedPartnerTeamIds(legacyState)[0];
    const beforeHistories = countTeamCourts(legacyState);

    expect(getCourtSpread(beforeHistories.get(lockedTeamId) ?? new Map(), 4)).toBe(10);
    expect(getLongestSameCourtStreak(getTeamCourtSequence(legacyState, lockedTeamId))).toBe(10);

    window.localStorage.setItem("lezgo.activeTournament.v1", JSON.stringify(legacyState));

    const loadedState = loadActiveTournament();
    const afterHistories = countTeamCourts(loadedState as LiveTournamentState);

    expect(loadedState?.format).toBe("fixed-partner-americano");
    expect(loadedState?.results[0]).toEqual(legacyState.results[0]);

    for (const teamId of getFixedPartnerTeamIds(loadedState as LiveTournamentState)) {
      expect(getCourtSpread(afterHistories.get(teamId) ?? new Map(), 4)).toBeLessThanOrEqual(2);
      expect(getLongestSameCourtStreak(getTeamCourtSequence(loadedState as LiveTournamentState, teamId))).toBeLessThanOrEqual(2);
    }
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

  it("drops malformed selected standard tournament state and falls back to the active list", () => {
    const fallbackState = {
      ...createMockLiveTournamentState(),
      tournamentName: "Fallback aktiv",
    };

    window.localStorage.setItem("lezgo.activeTournament.v1", JSON.stringify({
      tournamentName: "Partial stale state",
      format: "americano",
      status: "active",
    }));
    window.localStorage.setItem("lezgo.activeTournaments.v1", JSON.stringify([fallbackState]));

    expect(loadActiveTournament()?.tournamentName).toBe("Fallback aktiv");
    expect(window.localStorage.getItem("lezgo.activeTournament.v1")).toBeNull();
  });

  it("does not crash or clear valid active state when localStorage.setItem throws a quota error", () => {
    const existingState = {
      ...createMockLiveTournamentState(),
      tournamentName: "Before quota failure",
    };
    const backingStorage = createMemoryStorage({
      "lezgo.activeTournament.v1": JSON.stringify(existingState),
      "lezgo.activeTeamVsTeam.v1": JSON.stringify({ name: "Do not clear if primary save fails" }),
    }, {
      setItem: () => {
        throw new DOMException("Quota exceeded.", "QuotaExceededError");
      },
    });

    replaceWindowStorage("localStorage", backingStorage);

    expect(() => saveActiveTournament({ ...existingState, tournamentName: "After quota failure" })).not.toThrow();
    expect(loadActiveTournament()?.tournamentName).toBe("Before quota failure");
    expect(window.localStorage.getItem("lezgo.activeTeamVsTeam.v1")).not.toBeNull();
  });

  it("does not crash when localStorage.setItem throws SecurityError", () => {
    replaceWindowStorage("localStorage", createMemoryStorage({}, {
      setItem: () => {
        throw new DOMException("Storage blocked.", "SecurityError");
      },
    }));

    expect(() => saveActiveTournament(createMockLiveTournamentState())).not.toThrow();
    expect(() => loadActiveTournament()).not.toThrow();
  });

  it("does not crash when localStorage is unavailable", () => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new DOMException("Storage unavailable.", "SecurityError");
      },
    });

    expect(() => saveActiveTournament(createMockLiveTournamentState())).not.toThrow();
    expect(loadActiveTournament()).toBeNull();
    expect(loadCompletedTournaments()).toEqual([]);
  });

  it("does not crash when sessionStorage rejects active cloud authority writes", () => {
    replaceWindowStorage("sessionStorage", createMemoryStorage({}, {
      setItem: () => {
        throw new DOMException("Session storage blocked.", "SecurityError");
      },
    }));

    expect(() => markActiveCloudTournamentAuthority({
      source: "server",
      kind: "standard",
      localId: "session-failure-americano",
      tournamentId: "tournament-1",
      canRead: true,
      canManage: true,
    })).not.toThrow();
    expect(loadActiveCloudTournamentAuthority("standard", "session-failure-americano")).toBeNull();
  });

  it("continues to recover safely when storage is cleared during a session", () => {
    saveActiveTournament(createMockLiveTournamentState());

    window.localStorage.clear();

    expect(loadActiveTournament()).toBeNull();
    expect(() => saveActiveTournament({ ...createMockLiveTournamentState(), tournamentName: "After cleared storage" })).not.toThrow();
    expect(loadActiveTournament()?.tournamentName).toBe("After cleared storage");
  });

  it("drops stale selected standard tournament state when the active round is missing", () => {
    const staleState = {
      ...createMockLiveTournamentState(),
      activeRoundNumber: 99,
    };

    window.localStorage.setItem("lezgo.activeTournament.v1", JSON.stringify(staleState));

    expect(loadActiveTournament()).toBeNull();
    expect(window.localStorage.getItem("lezgo.activeTournament.v1")).toBeNull();
  });

  it("drops stale selected standard tournament state when a round has malformed matches", () => {
    const staleState = {
      ...createMockLiveTournamentState(),
      rounds: [{ roundNumber: 1, matches: [{ id: "broken-match" }] }],
    };

    window.localStorage.setItem("lezgo.activeTournament.v1", JSON.stringify(staleState));

    expect(loadActiveTournament()).toBeNull();
    expect(window.localStorage.getItem("lezgo.activeTournament.v1")).toBeNull();
  });

  it("drops legacy-domain selected state when its active round no longer exists", () => {
    const staleState = {
      ...createMockLiveTournamentState(),
      legacyOrigin: "https://lez-go-tournament.vercel.app",
      tvUrl: "https://lez-go-tournament.vercel.app/live",
      activeRoundNumber: 4,
    };

    window.localStorage.setItem("lezgo.activeTournament.v1", JSON.stringify(staleState));

    expect(loadActiveTournament()).toBeNull();
    expect(window.localStorage.getItem("lezgo.activeTournament.v1")).toBeNull();
  });

  it("filters malformed entries out of the active standard tournament list", () => {
    const validState = {
      ...createMockLiveTournamentState(),
      tournamentName: "Valid aktiv",
    };

    window.localStorage.setItem("lezgo.activeTournaments.v1", JSON.stringify([
      { tournamentName: "Partial stale list state", format: "americano", status: "active" },
      validState,
    ]));

    expect(loadActiveTournaments().map((tournament) => tournament.tournamentName)).toEqual(["Valid aktiv"]);
  });

  it("filters stale active-list entries when the same tournament is already completed", () => {
    const staleState = {
      ...createMockLiveTournamentState(),
      tournamentName: "Stale completed active copy",
    };

    saveCompletedTournament(finishTournament(staleState, "2026-08-24T12:15:00.000Z"));
    window.localStorage.setItem("lezgo.activeTournaments.v1", JSON.stringify([staleState]));

    expect(loadActiveTournaments()).toEqual([]);
    expect(loadCompletedTournaments().map((tournament) => tournament.state.tournamentName)).toEqual(["Stale completed active copy"]);
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

function createLegacyLockedMixedAmericanoState(): LiveTournamentState {
  const state = createTournamentFromSetup({
    name: "Legacy mixed",
    format: "Mixed Americano",
    playerText: "",
    femalePlayerText: Array.from({ length: 8 }, (_, index) => `Kvinde ${index + 1}`).join("\n"),
    malePlayerText: Array.from({ length: 8 }, (_, index) => `Mand ${index + 1}`).join("\n"),
    courts: 4,
    rounds: 10,
    scoringMode: "Fri scoring",
    firstRoundOrder: "manual",
    rankingMode: "matchPointsFirst",
  });

  const lockedRounds = state.rounds.map((round) => ({
    ...round,
    matches: round.matches.map((match) => {
      const femaleIndex = Math.min(...[...match.teamA.playerIds, ...match.teamB.playerIds]
        .filter((playerId) => playerId.startsWith("f"))
        .map((playerId) => Number(playerId.slice(1))));
      const lockedCourtNumber = Math.ceil(femaleIndex / 2);

      return {
        ...match,
        id: `legacy-r${round.roundNumber}-c${lockedCourtNumber}`,
        courtNumber: lockedCourtNumber,
      };
    }),
  }));

  return {
    ...state,
    rounds: lockedRounds,
    results: [{ matchId: lockedRounds[0].matches[0].id, teamAPoints: 17, teamBPoints: 7 }],
  };
}

function createLegacyLockedFixedPartnerAmericanoState(): LiveTournamentState {
  const state = createTournamentFromSetup({
    name: "Legacy fast makker",
    format: "Fast Makker Americano",
    playerText: Array.from({ length: 16 }, (_, index) => `Spiller ${index + 1}`).join("\n"),
    femalePlayerText: "",
    malePlayerText: "",
    courts: 4,
    rounds: 10,
    scoringMode: "Fri scoring",
    firstRoundOrder: "manual",
    rankingMode: "matchPointsFirst",
  });

  const legacyRounds = createTournamentRounds({
    format: "fixed-partner-americano",
    players: state.players,
    courts: 4,
    rounds: 10,
    firstRoundOrder: "manual",
  });
  const lockedRounds = legacyRounds.map((round) => ({
    ...round,
    matches: round.matches.map((match) => {
      const firstTeamIndex = Math.min(Number(match.teamA.playerIds[0].slice(1)), Number(match.teamB.playerIds[0].slice(1)));
      const lockedCourtNumber = Math.ceil(firstTeamIndex / 4);

      return {
        ...match,
        id: `legacy-fixed-r${round.roundNumber}-c${lockedCourtNumber}`,
        courtNumber: lockedCourtNumber,
      };
    }),
  }));

  return {
    ...state,
    rounds: lockedRounds,
    configuredRounds: 10,
    automaticCycle: undefined,
    results: [{ matchId: lockedRounds[0].matches[0].id, teamAPoints: 17, teamBPoints: 7 }],
  };
}

function countPlayerCourts(state: LiveTournamentState): Map<string, Map<number, number>> {
  const histories = new Map<string, Map<number, number>>();

  for (const round of state.rounds) {
    for (const match of round.matches) {
      for (const playerId of [...match.teamA.playerIds, ...match.teamB.playerIds]) {
        const history = histories.get(playerId) ?? new Map<number, number>();
        history.set(match.courtNumber, (history.get(match.courtNumber) ?? 0) + 1);
        histories.set(playerId, history);
      }
    }
  }

  return histories;
}

function countTeamCourts(state: LiveTournamentState): Map<string, Map<number, number>> {
  const histories = new Map<string, Map<number, number>>();

  for (const round of state.rounds) {
    for (const match of round.matches) {
      for (const teamId of [match.teamA.id, match.teamB.id]) {
        const history = histories.get(teamId) ?? new Map<number, number>();
        history.set(match.courtNumber, (history.get(match.courtNumber) ?? 0) + 1);
        histories.set(teamId, history);
      }
    }
  }

  return histories;
}

function getFixedPartnerTeamIds(state: LiveTournamentState): string[] {
  return Array.from(new Set(state.rounds.flatMap((round) => round.matches.flatMap((match) => [match.teamA.id, match.teamB.id]))));
}

function getPlayerCourtSequence(state: LiveTournamentState, playerId: string): number[] {
  const sequence: number[] = [];

  for (const round of state.rounds) {
    const match = round.matches.find((candidate) => [...candidate.teamA.playerIds, ...candidate.teamB.playerIds].includes(playerId));

    if (match) {
      sequence.push(match.courtNumber);
    }
  }

  return sequence;
}

function getTeamCourtSequence(state: LiveTournamentState, teamId: string): number[] {
  const sequence: number[] = [];

  for (const round of state.rounds) {
    const match = round.matches.find((candidate) => candidate.teamA.id === teamId || candidate.teamB.id === teamId);

    if (match) {
      sequence.push(match.courtNumber);
    }
  }

  return sequence;
}

function getCourtSpread(history: Map<number, number>, courts: number): number {
  const counts = Array.from({ length: courts }, (_, index) => history.get(index + 1) ?? 0);
  return Math.max(...counts) - Math.min(...counts);
}

function getLongestSameCourtStreak(sequence: number[]): number {
  let longestStreak = 0;
  let currentStreak = 0;
  let previousCourt = 0;

  for (const court of sequence) {
    currentStreak = court === previousCourt ? currentStreak + 1 : 1;
    longestStreak = Math.max(longestStreak, currentStreak);
    previousCourt = court;
  }

  return longestStreak;
}

function replaceWindowStorage(area: "localStorage" | "sessionStorage", storage: Storage): void {
  Object.defineProperty(window, area, {
    value: storage,
    configurable: true,
  });
}

function createMemoryStorage(
  initialValues: Record<string, string> = {},
  overrides: Partial<Pick<Storage, "getItem" | "setItem" | "removeItem" | "clear">> = {},
): Storage {
  const values = new Map(Object.entries(initialValues));

  return {
    get length() {
      return values.size;
    },
    clear: overrides.clear ?? (() => values.clear()),
    getItem: overrides.getItem ?? ((key: string) => values.get(key) ?? null),
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    removeItem: overrides.removeItem ?? ((key: string) => {
      values.delete(key);
    }),
    setItem: overrides.setItem ?? ((key: string, value: string) => {
      values.set(key, value);
    }),
  };
}
