import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FinishTournamentApp } from "../components/tournament/finish-tournament-app";
import { advanceLivePoolPlayState, createMockLiveTournamentState, finishTournament, saveNextPoolPhaseResult } from "../lib/live-scoring";
import { createStandardShadowSaveLocalId, createPoolTournamentFromSetup, loadActiveTournament, loadShadowSaveMetadata, markActiveCloudTournamentAuthority, saveActiveTournament, saveActiveTournamentFromRemoteSync } from "../lib/tournament-setup";

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

  it("publishes a completed tournament result and renders the public result QR", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      resultId: "ABCDEFGHJKLM2345",
      resultUrl: "https://app.lezgopadel.dk/result/ABCDEFGHJKLM2345",
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const writeText = vi.fn().mockResolvedValue(undefined);
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: share,
    });

    const finishedState = finishTournament(createMockLiveTournamentState(), "2026-08-19T18:30:00.000Z");
    window.localStorage.setItem("lezgo.activeTournament.v1", JSON.stringify(finishedState));
    window.localStorage.setItem("lezgo.shadowSaveMetadata.v1", JSON.stringify({
      "mock americano-americano": {
        localId: "mock americano-americano",
        kind: "standard",
        status: "synced",
        supabaseTournamentId: "00000000-0000-4000-8000-000000000271",
        organizerToken: "ORGANIZER_TOKEN",
      },
    }));

    render(<FinishTournamentApp />);

    expect(await screen.findByRole("heading", { name: "Slutresultat" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Vis QR" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/supabase/result-snapshots/publish", expect.objectContaining({ method: "POST" })));
    expect(await screen.findByText("http://localhost:3000/result/ABCDEFGHJKLM2345")).toBeInTheDocument();
    expect(screen.queryByText("https://app.lezgopadel.dk/result/ABCDEFGHJKLM2345")).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "QR-kode til offentligt slutresultat" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Kopier link" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("http://localhost:3000/result/ABCDEFGHJKLM2345"));

    fireEvent.click(screen.getByRole("button", { name: "Del resultat" }));
    await waitFor(() => expect(share).toHaveBeenCalledWith(expect.objectContaining({
      url: "http://localhost:3000/result/ABCDEFGHJKLM2345",
    })));
    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)).toMatchObject({
      kind: "standard",
      legacyLocalId: "mock americano-americano",
      tournamentId: "00000000-0000-4000-8000-000000000271",
      organizerToken: "ORGANIZER_TOKEN",
    });
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
    expect(screen.getByRole("button", { name: "Afsluttet" })).toBeDisabled();
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
