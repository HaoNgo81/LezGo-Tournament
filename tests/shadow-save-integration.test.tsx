import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMockLiveTournamentState } from "../lib/live-scoring";
import {
  analyzeLocalStorageMigrationReadiness,
  loadActiveTournament,
  loadShadowSaveMetadata,
  retryStandardTournamentShadowSave,
  saveActiveTeamVsTeamTournament,
  saveActiveTournament,
} from "../lib/tournament-setup";
import type { TeamVsTeamTournamentState } from "../lib/tournament-setup";

describe("STEP 10 shadow-save integration", () => {
  const originalFlag = process.env.NEXT_PUBLIC_LEZGO_SUPABASE_SHADOW_SAVE;

  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
    delete process.env.NEXT_PUBLIC_LEZGO_SUPABASE_SHADOW_SAVE;
  });

  afterEach(() => {
    if (originalFlag === undefined) {
      delete process.env.NEXT_PUBLIC_LEZGO_SUPABASE_SHADOW_SAVE;
    } else {
      process.env.NEXT_PUBLIC_LEZGO_SUPABASE_SHADOW_SAVE = originalFlag;
    }
    cleanup();
    vi.restoreAllMocks();
  });

  it("keeps localStorage primary and leaves shadow-save local-only when the flag is disabled", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const state = createMockLiveTournamentState();

    saveActiveTournament(state);
    await flushShadowSaveQueue();

    expect(loadActiveTournament()).toMatchObject({ tournamentName: state.tournamentName });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(loadShadowSaveMetadata("mock americano-americano")).toMatchObject({
      status: "local-only",
    });
    expect(loadShadowSaveMetadata("mock americano-americano")?.supabaseTournamentId).toBeUndefined();
  });

  it("stores Supabase mapping and reuses the same tournament id on later saves", async () => {
    process.env.NEXT_PUBLIC_LEZGO_SUPABASE_SHADOW_SAVE = "1";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createShadowSaveResponse({ tournamentId: "00000000-0000-4000-8000-000000000010", updatedAt: "2026-08-13T08:00:00.000Z" }))
      .mockResolvedValueOnce(createShadowSaveResponse({ tournamentId: "00000000-0000-4000-8000-000000000010", updatedAt: "2026-08-13T08:01:00.000Z" }));
    vi.stubGlobal("fetch", fetchMock);
    const state = createMockLiveTournamentState();

    saveActiveTournament(state);
    await flushShadowSaveQueue();
    saveActiveTournament({ ...state, activeRoundNumber: 2 });
    await flushShadowSaveQueue();

    const firstPayload = JSON.parse(fetchMock.mock.calls[0][1].body as string) as Record<string, unknown>;
    const secondPayload = JSON.parse(fetchMock.mock.calls[1][1].body as string) as Record<string, unknown>;

    expect(firstPayload.tournamentId).toBeUndefined();
    expect(secondPayload.tournamentId).toBe("00000000-0000-4000-8000-000000000010");
    expect(secondPayload.expectedUpdatedAt).toBe("2026-08-13T08:00:00.000Z");
    expect(loadShadowSaveMetadata("mock americano-americano")).toMatchObject({
      status: "synced",
      supabaseTournamentId: "00000000-0000-4000-8000-000000000010",
      lastShadowSaveVersion: "2026-08-13T08:01:00.000Z",
      organizerToken: "STEP_24B_ORGANIZER_TOKEN",
    });
  });

  it("keeps local tournament intact when shadow-save fails", async () => {
    process.env.NEXT_PUBLIC_LEZGO_SUPABASE_SHADOW_SAVE = "1";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: false,
      error: "null value in column 'privacy' of relation 'tournaments' violates not-null constraint",
    }), { status: 500 })));
    const state = createMockLiveTournamentState();

    saveActiveTournament(state);
    await flushShadowSaveQueue();

    expect(loadActiveTournament()).toEqual(state);
    expect(loadShadowSaveMetadata("mock americano-americano")).toMatchObject({
      status: "error",
      lastError: "Synchronization failed. Local tournament is preserved.",
    });
    expect(loadShadowSaveMetadata("mock americano-americano")?.lastError).not.toMatch(/Supabase|relation|constraint|null value/i);
  });

  it("retries a failed shadow-save with the existing mapping", async () => {
    process.env.NEXT_PUBLIC_LEZGO_SUPABASE_SHADOW_SAVE = "1";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: false, error: "offline" }), { status: 500 }))
      .mockResolvedValueOnce(createShadowSaveResponse({ tournamentId: "00000000-0000-4000-8000-000000000050", updatedAt: "2026-08-13T09:00:00.000Z" }));
    vi.stubGlobal("fetch", fetchMock);
    const state = createMockLiveTournamentState();

    saveActiveTournament(state);
    await flushShadowSaveQueue();
    retryStandardTournamentShadowSave("mock americano-americano", state);
    await flushShadowSaveQueue();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(loadShadowSaveMetadata("mock americano-americano")).toMatchObject({
      status: "synced",
      supabaseTournamentId: "00000000-0000-4000-8000-000000000050",
    });
    expect(loadActiveTournament()).toEqual(state);
  });

  it("marks conflicts without changing localStorage or overwriting the mapping", async () => {
    process.env.NEXT_PUBLIC_LEZGO_SUPABASE_SHADOW_SAVE = "1";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createShadowSaveResponse({ tournamentId: "00000000-0000-4000-8000-000000000020", updatedAt: "2026-08-13T08:00:00.000Z" }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: false, error: "Tournament snapshot conflict." }), { status: 409 }));
    vi.stubGlobal("fetch", fetchMock);
    const state = createMockLiveTournamentState();
    const updatedState = { ...state, activeRoundNumber: 2 };

    saveActiveTournament(state);
    await flushShadowSaveQueue();
    saveActiveTournament(updatedState);
    await flushShadowSaveQueue();

    expect(loadActiveTournament()).toEqual(updatedState);
    expect(loadShadowSaveMetadata("mock americano-americano")).toMatchObject({
      status: "conflict",
      supabaseTournamentId: "00000000-0000-4000-8000-000000000020",
      lastShadowSaveVersion: "2026-08-13T08:00:00.000Z",
    });
  });

  it("does not create duplicate initial shadow-save requests while one is in flight", async () => {
    process.env.NEXT_PUBLIC_LEZGO_SUPABASE_SHADOW_SAVE = "1";
    const deferred = createDeferred<Response>();
    const fetchMock = vi.fn().mockReturnValue(deferred.promise);
    vi.stubGlobal("fetch", fetchMock);
    const state = createMockLiveTournamentState();

    saveActiveTournament(state);
    saveActiveTournament({ ...state, activeRoundNumber: 2 });
    await new Promise((resolve) => window.setTimeout(resolve, 0));

    expect(fetchMock).toHaveBeenCalledTimes(1);

    deferred.resolve(createShadowSaveResponse({ tournamentId: "00000000-0000-4000-8000-000000000030", updatedAt: "2026-08-13T08:00:00.000Z" }));
    await flushShadowSaveQueue();

    expect(loadShadowSaveMetadata("mock americano-americano")).toMatchObject({
      status: "synced",
      supabaseTournamentId: "00000000-0000-4000-8000-000000000030",
    });
  });

  it("tracks Team vs Team shadow-save metadata without changing the runtime state", async () => {
    process.env.NEXT_PUBLIC_LEZGO_SUPABASE_SHADOW_SAVE = "1";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(createShadowSaveResponse({
      tournamentId: "00000000-0000-4000-8000-000000000040",
      updatedAt: "2026-08-13T08:00:00.000Z",
    })));
    const state = createTeamVsTeamState();

    saveActiveTeamVsTeamTournament(state);
    await flushShadowSaveQueue();

    expect(loadShadowSaveMetadata("step 10 team-team-vs-team")).toMatchObject({
      kind: "team-vs-team",
      status: "synced",
      supabaseTournamentId: "00000000-0000-4000-8000-000000000040",
    });
  });

  it("runs a zero-write migration dry-run across local tournaments", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    saveActiveTournament(createMockLiveTournamentState());

    const report = analyzeLocalStorageMigrationReadiness("2026-08-13T09:00:00.000Z");

    expect(report.totals).toMatchObject({
      localTournaments: 1,
      canMigrateSafely: 1,
      alreadyInSupabase: 0,
      conflicts: 0,
      invalid: 0,
    });
    expect(report.entries[0]).toMatchObject({
      classification: "local-only",
      localId: "mock americano-americano",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("classifies corrupt shadow-save mappings without attempting recovery", () => {
    saveActiveTournament(createMockLiveTournamentState());
    window.localStorage.setItem("lezgo.shadowSaveMetadata.v1", JSON.stringify({
      "mock americano-americano": {
        localId: "mock americano-americano",
        kind: "standard",
        status: "synced",
        lastLocalSaveAt: "2026-08-13T09:00:00.000Z",
        lastSuccessfulShadowSaveAt: "2026-08-13T09:00:00.000Z",
      },
    }));

    const report = analyzeLocalStorageMigrationReadiness("2026-08-13T09:00:00.000Z");

    expect(report.totals.invalid).toBe(1);
    expect(report.entries[0]).toMatchObject({
      classification: "invalid/unmappable",
      reason: "Mapping mangler eller er korrupt.",
    });
  });
});

function createShadowSaveResponse(body: { tournamentId: string; updatedAt: string }): Response {
  return new Response(JSON.stringify({ ok: true, saveMode: "insert", organizerToken: "STEP_24B_ORGANIZER_TOKEN", ...body }), { status: 200 });
}

async function flushShadowSaveQueue(): Promise<void> {
  await new Promise((resolve) => window.setTimeout(resolve, 0));
  await Promise.resolve();
  await new Promise((resolve) => window.setTimeout(resolve, 0));
}

function createDeferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function createTeamVsTeamState(): TeamVsTeamTournamentState {
  return {
    name: "STEP 10 Team",
    scoringMode: "Fri scoring",
    teamCount: 2,
    competitionMode: "knockout",
    drawMode: "manual",
    playersPerTeam: 4,
    matchFormat: "oneSet",
    status: "active",
    maxRounds: 3,
    activeMatchupId: "match-1",
    teams: [
      { id: "team-a", name: "Hold A", captainPlayerId: "a1", players: createPlayers("a", "A") },
      { id: "team-b", name: "Hold B", captainPlayerId: "b1", players: createPlayers("b", "B") },
    ],
    matchups: [
      {
        id: "match-1",
        label: "Holdkamp",
        teamAId: "team-a",
        teamBId: "team-b",
        lineups: [],
        roundResults: [],
      },
    ],
  };
}

function createPlayers(prefix: string, label: string) {
  return Array.from({ length: 4 }, (_, index) => ({ id: `${prefix}${index + 1}`, name: `${label} ${index + 1}` }));
}
