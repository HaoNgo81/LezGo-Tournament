import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FinishTournamentApp } from "../components/tournament/finish-tournament-app";
import { advanceLivePoolPlayState, createMockLiveTournamentState, finishTournament, saveNextPoolPhaseResult } from "../lib/live-scoring";
import { createPoolTournamentFromSetup, saveActiveTournament } from "../lib/tournament-setup";

describe("FinishTournamentApp pool play", () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
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
      resultUrl: "https://lez-go-tournament.vercel.app/result/ABCDEFGHJKLM2345",
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

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
    expect(await screen.findByText("https://lez-go-tournament.vercel.app/result/ABCDEFGHJKLM2345")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "QR-kode til offentligt slutresultat" })).toBeInTheDocument();
    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)).toMatchObject({
      kind: "standard",
      legacyLocalId: "mock americano-americano",
      tournamentId: "00000000-0000-4000-8000-000000000271",
      organizerToken: "ORGANIZER_TOKEN",
    });
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
