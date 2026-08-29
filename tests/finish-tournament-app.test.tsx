import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FinishTournamentApp } from "../components/tournament/finish-tournament-app";
import { ResultSharePanel } from "../components/tournament/result-share-panel";
import { advanceLivePoolPlayState, createMockLiveTournamentState, finishTournament, goToNextRound, saveMatchResult, saveNextPoolPhaseResult, type LiveTournamentState } from "../lib/live-scoring";
import { createStandardShadowSaveLocalId, createPoolTournamentFromSetup, createTournamentFromSetup, loadActiveTournament, loadShadowSaveMetadata, markActiveCloudTournamentAuthority, saveActiveTournament, saveActiveTournamentFromRemoteSync } from "../lib/tournament-setup";
import type { TournamentSetupFormat } from "../lib/tournament-setup";

describe("FinishTournamentApp pool play", () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    window.sessionStorage.clear();
    vi.unstubAllGlobals();
  });

  it("shows pool standings and next phase results for pool-play tournaments", async () => {
    const advancedState = advanceLivePoolPlayState(createCompletedInitialPoolTournament());
    const matchId = advancedState.poolPlay?.crossMatchStage?.groups[0].encounters[0].id;

    if (!matchId) {
      throw new Error("Cross-match was not created.");
    }

    saveActiveTournament(saveNextPoolPhaseResult(advancedState, { matchId, teamAPoints: 21, teamBPoints: 18 }));
    render(<FinishTournamentApp />);

    expect(await screen.findByRole("heading", { name: "Puljestillinger" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Næste fase" })).toBeInTheDocument();
    expect(screen.getAllByText("Krydsspil 1").length).toBeGreaterThan(0);
    expect(screen.getByText("21 - 18")).toBeInTheDocument();
  });

  it("shows completed tournament sharing controls without QR complexity", async () => {
    const finishedState = createFinishedHistoryTournament("Americano", "Mock Americano");
    const localId = createStandardShadowSaveLocalId(finishedState);
    window.localStorage.setItem("lezgo.shadowSaveMetadata.v1", JSON.stringify({
      [localId]: {
        localId,
        kind: "standard",
        status: "synced",
        supabaseTournamentId: "00000000-0000-4000-8000-000000000271",
        organizerToken: "ORGANIZER_TOKEN",
      },
    }));

    render(<ResultSharePanel state={finishedState} />);

    expect(screen.queryByRole("button", { name: "Vis QR" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Del turnering" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Kopier link" })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "QR-kode til offentligt slutresultat" })).not.toBeInTheDocument();
  });

  it("creates, copies, and disables a permanent completed tournament share link", async () => {
    const finishedState = createFinishedHistoryTournament("Americano", "Mock Americano");
    const localId = createStandardShadowSaveLocalId(finishedState);
    const expectedUrl = "http://localhost:3000/result/ABCDEFGHJKLM2345";
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    window.localStorage.setItem("lezgo.shadowSaveMetadata.v1", JSON.stringify({
      [localId]: {
        localId,
        kind: "standard",
        status: "synced",
        supabaseTournamentId: "00000000-0000-4000-8000-000000000272",
        organizerToken: "ORGANIZER_TOKEN",
      },
    }));
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      if (input.toString() === "/api/supabase/result-snapshots/publish") {
        return Promise.resolve(new Response(JSON.stringify({
          ok: true,
          resultId: "ABCDEFGHJKLM2345",
          resultUrl: "https://lezgotournament.vercel.app/result/ABCDEFGHJKLM2345",
        }), { status: 200 }));
      }

      if (input.toString() === "/api/supabase/result-snapshots/revoke") {
        return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
      }

      return Promise.resolve(new Response(JSON.stringify({ ok: false }), { status: 500 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ResultSharePanel state={finishedState} />);

    fireEvent.click(screen.getByRole("button", { name: "Kopier link" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expectedUrl));
    expect(screen.getByText(expectedUrl)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/supabase/result-snapshots/publish", expect.objectContaining({ method: "POST" }));

    fireEvent.click(screen.getByRole("button", { name: "Slå deling fra" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/supabase/result-snapshots/revoke", expect.objectContaining({ method: "POST" })));
    expect(screen.queryByText(expectedUrl)).not.toBeInTheDocument();
    expect(screen.getByText("Deling slået fra.")).toBeInTheDocument();
  });

  it("opens a completed tournament as a read-only final standings and round history page", async () => {
    const finishedState = createFinishedHistoryTournament("Americano", "Historik Americano");
    saveActiveTournament(finishedState);
    const before = window.localStorage.getItem("lezgo.activeTournament.v1");

    render(<FinishTournamentApp />);

    expect(await screen.findByRole("heading", { name: "Historik Americano" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Slutstilling" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Kampresultater" })).toBeInTheDocument();
    expect(screen.getByText(/Americano · 8 spillere · 7 runder/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Runde 1" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Runde 2" })).toHaveAttribute("aria-pressed", "false");
    const firstRoundCards = screen.getAllByTestId("finished-history-match-card");
    expect(firstRoundCards).toHaveLength(2);
    expect(firstRoundCards[0]).toHaveAttribute("data-card-structure", "unified-court-card");
    expect(within(firstRoundCards[0]).getByRole("heading", { name: "Bane 1" })).toBeInTheDocument();
    expect(within(firstRoundCards[0]).getByText("Afsluttet")).toBeInTheDocument();
    expect(within(firstRoundCards[0]).getByTestId("finished-history-court-left-player-1")).toHaveTextContent("Alle 1");
    expect(within(firstRoundCards[0]).getByTestId("finished-history-court-left-player-2")).toHaveTextContent("Alle 2");
    expect(within(firstRoundCards[0]).getByTestId("finished-history-court-vs")).toHaveTextContent("VS");
    expect(within(firstRoundCards[0]).getByTestId("finished-history-court-left-score")).toHaveTextContent("21");
    expect(within(firstRoundCards[0]).getByTestId("finished-history-court-score-separator")).toHaveTextContent("-");
    expect(within(firstRoundCards[0]).getByTestId("finished-history-court-right-score")).toHaveTextContent("15");

    fireEvent.click(screen.getByRole("button", { name: "Runde 2" }));

    expect(screen.getByRole("button", { name: "Runde 2" })).toHaveAttribute("aria-pressed", "true");
    const secondRoundCard = screen.getAllByTestId("finished-history-match-card")[0];
    expect(within(secondRoundCard).getByTestId("finished-history-court-left-score")).toHaveTextContent("18");
    expect(within(secondRoundCard).getByTestId("finished-history-court-right-score")).toHaveTextContent("21");
    expect(window.localStorage.getItem("lezgo.activeTournament.v1")).toBe(before);
    expect(screen.queryByRole("link", { name: "Rediger score" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Indtast score" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Afslut turnering" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Næste" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Forrige" })).not.toBeInTheDocument();
    expect(screen.queryByText("TV / Livescore")).not.toBeInTheDocument();
    expect(screen.queryByText("Scoreindtastning")).not.toBeInTheDocument();
  });

  it.each([
    ["Americano", "Historik Americano", "Alle 1 + Alle 2"],
    ["Fast Makker Americano", "Historik Fast Makker Americano", "Alle 1 + Alle 2"],
    ["Mixed Americano", "Historik Mixed Americano", "Mand 1 + Kvinde 1"],
    ["Mexicano", "Historik Mexicano", "Alle 1 + Alle 3"],
    ["Fast Makker Mexicano", "Historik Fast Makker Mexicano", "Alle 1 + Alle 2"],
  ] as const)("renders saved historical matches for %s", async (format, name, expectedTeamText) => {
    saveActiveTournament(createFinishedHistoryTournament(format, name));

    render(<FinishTournamentApp />);

    expect(await screen.findByRole("heading", { name })).toBeInTheDocument();
    const history = screen.getByTestId("finished-round-history");
    for (const playerName of expectedTeamText.split(" + ")) {
      expect(within(history).getAllByText(playerName).length).toBeGreaterThan(0);
    }
    const firstRoundCard = within(history).getAllByTestId("finished-history-match-card")[0];
    expect(firstRoundCard).toHaveAttribute("data-card-structure", "unified-court-card");
    expect(within(firstRoundCard).getByTestId("finished-history-court-left-score")).toHaveTextContent("21");
    expect(within(firstRoundCard).getByTestId("finished-history-court-right-score")).toHaveTextContent("15");

    fireEvent.click(within(history).getByRole("button", { name: "Runde 2" }));

    const secondRoundCard = within(history).getAllByTestId("finished-history-match-card")[0];
    expect(within(secondRoundCard).getByTestId("finished-history-court-left-score")).toHaveTextContent("18");
    expect(within(secondRoundCard).getByTestId("finished-history-court-right-score")).toHaveTextContent("21");
  });

  it("shows a controlled fallback when older completed history lacks detailed rounds", async () => {
    const finishedState = {
      ...finishTournament(createMockLiveTournamentState(), "2026-08-19T18:30:00.000Z"),
      results: [],
    };
    saveActiveTournament(finishedState);

    render(<FinishTournamentApp />);

    expect(await screen.findByRole("heading", { name: "Kampresultater" })).toBeInTheDocument();
    expect(screen.getByText("Detaljerede kampresultater er ikke tilgængelige for denne turnering.")).toBeInTheDocument();
  });

  it("rejects stale finish before marking the former controller tournament complete", async () => {
    const activeState = createMockLiveTournamentState();
    const localId = createStandardShadowSaveLocalId(activeState);
    saveActiveTournamentFromRemoteSync(activeState);
    markActiveCloudTournamentAuthority({
      source: "server",
      kind: "standard",
      localId,
      tournamentId: "00000000-0000-4000-8000-0000000009f1",
      canRead: true,
      canManage: true,
      createdByUserId: "00000000-0000-4000-8000-00000000aaa1",
      controllerUserId: "00000000-0000-4000-8000-00000000aaa1",
      ownerUserId: "00000000-0000-4000-8000-00000000aaa1",
    });
    window.localStorage.setItem("lezgo.shadowSaveMetadata.v1", JSON.stringify({
      [localId]: {
        localId,
        kind: "standard",
        status: "synced",
        supabaseTournamentId: "00000000-0000-4000-8000-0000000009f1",
        organizerToken: "STALE_CREATOR_ORGANIZER_TOKEN",
        lastShadowSaveVersion: "2026-08-23T12:20:00.000Z",
      },
    }));
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = input.toString();

      if (url === "/api/supabase/shadow-save") {
        return Promise.resolve(new Response(JSON.stringify({
          ok: false,
          error: "Du har ikke længere styring af denne turnering.",
        }), { status: 403 }));
      }

      if (url === "/api/account/tournaments/00000000-0000-4000-8000-0000000009f1") {
        return Promise.resolve(new Response(JSON.stringify({
          ok: true,
          kind: "standard",
          state: activeState,
          tournamentId: "00000000-0000-4000-8000-0000000009f1",
          updatedAt: "2026-08-23T12:21:00.000Z",
          canManage: false,
        }), { status: 200 }));
      }

      return Promise.resolve(new Response(JSON.stringify({ ok: false }), { status: 500 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<FinishTournamentApp />);

    expect(await screen.findByRole("heading", { name: "Mock Americano" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Afslut turnering" }));

    expect(await screen.findByText("Du har ikke længere styring af denne turnering.")).toBeInTheDocument();
    expect(loadActiveTournament()?.status).toBe("active");
    expect(fetchMock).toHaveBeenCalledWith("/api/supabase/shadow-save", expect.objectContaining({ method: "POST" }));
  });

  it("reconciles a stale same-user finish conflict to the authoritative finished state", async () => {
    const activeState = createMockLiveTournamentState();
    const finishedRemoteState = finishTournament(activeState, "2026-08-23T12:45:00.000Z");
    const localId = createStandardShadowSaveLocalId(activeState);
    saveActiveTournamentFromRemoteSync(activeState);
    markActiveCloudTournamentAuthority({
      source: "server",
      kind: "standard",
      localId,
      tournamentId: "00000000-0000-4000-8000-0000000009f2",
      canRead: true,
      canManage: true,
      createdByUserId: "00000000-0000-4000-8000-00000000aaa1",
      controllerUserId: "00000000-0000-4000-8000-00000000aaa1",
      ownerUserId: "00000000-0000-4000-8000-00000000aaa1",
    });
    window.localStorage.setItem("lezgo.shadowSaveMetadata.v1", JSON.stringify({
      [localId]: {
        localId,
        kind: "standard",
        status: "synced",
        supabaseTournamentId: "00000000-0000-4000-8000-0000000009f2",
        organizerToken: "SAME_USER_ORGANIZER_TOKEN",
        lastShadowSaveVersion: "2026-08-23T12:40:00.000Z",
      },
    }));
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      if (input.toString() === "/api/supabase/shadow-save") {
        return Promise.resolve(new Response(JSON.stringify({
          ok: false,
          conflict: true,
          kind: "standard",
          state: finishedRemoteState,
          tournamentId: "00000000-0000-4000-8000-0000000009f2",
          updatedAt: "2026-08-23T12:46:00.000Z",
        }), { status: 409 }));
      }

      return Promise.resolve(new Response(JSON.stringify({ ok: false }), { status: 500 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<FinishTournamentApp />);

    expect(await screen.findByRole("heading", { name: "Mock Americano" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Afslut turnering" }));

    expect(await screen.findByText("Turneringen blev ændret på en anden enhed. De nyeste data er hentet. Prøv igen.")).toBeInTheDocument();
    expect(loadActiveTournament()?.status).toBe("finished");
    expect(loadShadowSaveMetadata(localId)).toMatchObject({
      status: "synced",
      lastShadowSaveVersion: "2026-08-23T12:46:00.000Z",
    });
    expect(screen.queryByRole("button", { name: "Afsluttet" })).not.toBeInTheDocument();
  });

  it("blocks rapid duplicate finish clicks while the first finish write is pending", async () => {
    const activeState = createMockLiveTournamentState();
    const localId = createStandardShadowSaveLocalId(activeState);
    saveActiveTournamentFromRemoteSync(activeState);
    markActiveCloudTournamentAuthority({
      source: "server",
      kind: "standard",
      localId,
      tournamentId: "00000000-0000-4000-8000-0000000025b5",
      canRead: true,
      canManage: true,
      createdByUserId: "00000000-0000-4000-8000-00000000aaa1",
      controllerUserId: "00000000-0000-4000-8000-00000000aaa1",
      ownerUserId: "00000000-0000-4000-8000-00000000aaa1",
    });
    window.localStorage.setItem("lezgo.shadowSaveMetadata.v1", JSON.stringify({
      [localId]: {
        localId,
        kind: "standard",
        status: "synced",
        supabaseTournamentId: "00000000-0000-4000-8000-0000000025b5",
        lastShadowSaveVersion: "2026-08-24T13:30:00.000Z",
      },
    }));
    const deferredFinish = createDeferred<Response>();
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      if (input.toString() === "/api/supabase/shadow-save") {
        return deferredFinish.promise;
      }

      return Promise.resolve(new Response(JSON.stringify({ ok: false }), { status: 500 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<FinishTournamentApp />);

    expect(await screen.findByRole("heading", { name: "Mock Americano" })).toBeInTheDocument();
    const finishButton = screen.getByRole("button", { name: "Afslut turnering" });
    fireEvent.click(finishButton);
    fireEvent.click(finishButton);

    await waitFor(() => expect(fetchMock.mock.calls.filter((call) => call[0] === "/api/supabase/shadow-save")).toHaveLength(1));

    deferredFinish.resolve(new Response(JSON.stringify({
      ok: true,
      kind: "standard",
      tournamentId: "00000000-0000-4000-8000-0000000025b5",
      updatedAt: "2026-08-24T13:30:05.000Z",
    }), { status: 200 }));

    await waitFor(() => expect(loadActiveTournament()?.status).toBe("finished"));
    expect(fetchMock.mock.calls.filter((call) => call[0] === "/api/supabase/shadow-save")).toHaveLength(1);
  });
});

function createPoolTournament() {
  return createPoolTournamentFromSetup({
    name: "Lørdag Puljespil",
    participantType: "pair",
    participantText: ["Par A", "Par B", "Par C", "Par D"].join("\n"),
    poolCount: 2,
    participantsPerPool: 2,
    advancementMode: "crossMatches",
    unmatchedResolution: "bye",
    scoringMode: "Fri scoring",
    rankingMode: "matchPointsFirst",
  });
}

function createCompletedInitialPoolTournament() {
  let state = createPoolTournament();
  const poolPlay = state.poolPlay;

  if (!poolPlay) {
    throw new Error("Pool play state was not created.");
  }

  for (const pool of poolPlay.initialStage.pools) {
    for (const encounter of pool.encounters) {
      const currentPoolPlay = state.poolPlay;

      if (!currentPoolPlay) {
        throw new Error("Pool play state was removed.");
      }

      state = {
        ...state,
        poolPlay: {
          ...currentPoolPlay,
          initialResults: [
            ...currentPoolPlay.initialResults,
            { matchId: encounter.id, teamAPoints: 21, teamBPoints: 10 },
          ],
        },
      };
    }
  }

  return state;
}

function createFinishedHistoryTournament(format: TournamentSetupFormat, name: string): LiveTournamentState {
  const playerText = format === "Mixed Americano"
    ? ""
    : ["Alle 1", "Alle 2", "Alle 3", "Alle 4", "Alle 5", "Alle 6", "Alle 7", "Alle 8"].join("\n");
  const femalePlayerText = format === "Mixed Americano" ? ["Kvinde 1", "Kvinde 2", "Kvinde 3", "Kvinde 4"].join("\n") : "";
  const malePlayerText = format === "Mixed Americano" ? ["Mand 1", "Mand 2", "Mand 3", "Mand 4"].join("\n") : "";
  const initialState = createTournamentFromSetup({
    name,
    format,
    playerText,
    femalePlayerText,
    malePlayerText,
    courts: 2,
    rounds: 2,
    scoringMode: "Fri scoring",
    firstRoundOrder: "manual",
    rankingMode: "matchPointsFirst",
  });
  const firstRoundScored = initialState.rounds[0].matches.reduce((currentState, match, index) => saveMatchResult(currentState, {
    matchId: match.id,
    teamAPoints: index === 0 ? 21 : 17,
    teamBPoints: index === 0 ? 15 : 19,
  }), initialState);
  const secondRoundState = goToNextRound(firstRoundScored);
  const secondRoundScored = secondRoundState.rounds[1].matches.reduce((currentState, match, index) => saveMatchResult(currentState, {
    matchId: match.id,
    teamAPoints: index === 0 ? 18 : 20,
    teamBPoints: index === 0 ? 21 : 16,
  }), secondRoundState);

  return finishTournament(secondRoundScored, "2026-08-24T13:00:00.000Z");
}

function createDeferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (reason?: unknown) => void } {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}
