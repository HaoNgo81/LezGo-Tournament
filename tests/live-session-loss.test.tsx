import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FinishTournamentApp } from "../components/tournament/finish-tournament-app";
import { LiveScoringApp } from "../components/tournament/live-scoring-app";
import { createMockLiveTournamentState, saveMatchResult, type LiveTournamentState } from "../lib/live-scoring";
import { createStandardShadowSaveLocalId, loadActiveTournament, loadShadowSaveMetadata, markActiveCloudTournamentAuthority, saveActiveTournamentFromRemoteSync } from "../lib/tournament-setup";

// STEP 42A: a signed-in organizer who is logged out during a live tournament (access token expired after
// about an hour without "Husk mig", the phone dropped the session while the screen was off, or a sign-out
// in another tab) must keep control of the tournament. Only 403 means another account took over.

const tournamentId = "00000000-0000-4000-8000-0000000042a1";
const ownerId = "00000000-0000-4000-8000-00000000aaa1";
const signedOutText = /Du er blevet logget ud, så ændringen er ikke gemt/;
const account = { userId: ownerId, email: "owner@example.com", displayName: "Owner", role: "user" };

function setUpOwnedCloudTournament(state: LiveTournamentState, matchScoreVersions: Record<string, number> = {}) {
  const localId = createStandardShadowSaveLocalId(state);
  saveActiveTournamentFromRemoteSync(state);
  markActiveCloudTournamentAuthority({
    source: "server",
    kind: "standard",
    localId,
    tournamentId,
    canRead: true,
    canManage: true,
    createdByUserId: ownerId,
    controllerUserId: ownerId,
    ownerUserId: ownerId,
  });
  window.localStorage.setItem("lezgo.shadowSaveMetadata.v1", JSON.stringify({
    [localId]: {
      localId,
      kind: "standard",
      status: "synced",
      canManage: true,
      supabaseTournamentId: tournamentId,
      lastLocalSaveAt: "2026-11-06T12:00:00.000Z",
      lastShadowSaveVersion: "2026-11-06T12:00:00.000Z",
      matchScoreVersions,
    },
  }));
  return localId;
}

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

function isReconcileRead(url: string, init?: RequestInit) {
  return url === `/api/account/tournaments/${tournamentId}` && init?.method === "GET";
}

function signedOutResponse() {
  return json({ ok: false, error: "Authentication was denied." }, 401);
}

function expectStillInControl(localId: string) {
  expect(loadShadowSaveMetadata(localId)?.canManage).not.toBe(false);
  expect(JSON.parse(window.sessionStorage.getItem("lezgo.activeCloudTournamentAuthority.v1") ?? "{}")).toMatchObject({ canManage: true });
}

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
}

describe("Live tournament when the organizer is logged out", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    window.localStorage.clear();
    window.sessionStorage.clear();
    setVisibility("visible");
  });

  it("keeps control and the typed score when a score save finds the login expired", async () => {
    const state = createMockLiveTournamentState();
    const matchId = state.rounds[0].matches[0].id;
    const localId = setUpOwnedCloudTournament(state, { [matchId]: 1 });
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = input.toString();
      if (url === `/api/account/tournaments/${tournamentId}/score`) return signedOutResponse();
      if (url === "/api/auth/me") return signedOutResponse();
      if (url === `/api/account/tournaments/${tournamentId}`) return signedOutResponse();
      return json({ ok: false, error: `Unexpected URL ${url}` }, 500);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<LiveScoringApp />);
    expect(await screen.findByText("Mock Americano")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Indtast score" })[0]);
    fireEvent.change(screen.getByRole("textbox", { name: "Hold A scorepoint" }), { target: { value: "14" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Hold B scorepoint" }), { target: { value: "9" } });
    fireEvent.click(screen.getByRole("button", { name: "Gem" }));

    // The score sheet stays open with the typed score and says why it was not saved.
    expect(await screen.findByTestId("score-sheet-session-notice")).toHaveTextContent(signedOutText);
    expect(screen.getByRole("textbox", { name: "Hold A scorepoint" })).toHaveValue("14");
    expect(screen.getByRole("textbox", { name: "Hold B scorepoint" })).toHaveValue("9");
    expect(screen.getByTestId("live-session-notice")).toHaveTextContent(signedOutText);
    expect(screen.queryByText("Du har ikke længere styring af denne turnering.")).not.toBeInTheDocument();

    // It tried to renew the login once, and did not treat the 401 as a takeover.
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/me", { cache: "no-store" });
    expect(fetchMock).not.toHaveBeenCalledWith(`/api/account/tournaments/${tournamentId}`, expect.objectContaining({ method: "GET" }));
    expectStillInControl(localId);
    expect(loadActiveTournament()?.rounds[0].matches[0].id).toBe(matchId);
  }, 10000);

  it("saves the same score after signing in again, and clears the notice", async () => {
    const state = createMockLiveTournamentState();
    const matchId = state.rounds[0].matches[0].id;
    const remoteState = saveMatchResult(state, { matchId, teamAPoints: 14, teamBPoints: 9 });
    setUpOwnedCloudTournament(state, { [matchId]: 1 });
    let signedIn = false;
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = input.toString();
      if (url === `/api/account/tournaments/${tournamentId}/score`) {
        return signedIn
          ? json({ ok: true, kind: "standard", state: remoteState, tournamentId, updatedAt: "2026-11-06T12:05:00.000Z", matchScoreVersions: { [matchId]: 2 } })
          : signedOutResponse();
      }
      if (url === "/api/auth/me") return signedIn ? json({ ok: true, account }) : signedOutResponse();
      return json({ ok: false, error: `Unexpected URL ${url}` }, 500);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<LiveScoringApp />);
    expect(await screen.findByText("Mock Americano")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Indtast score" })[0]);
    fireEvent.change(screen.getByRole("textbox", { name: "Hold A scorepoint" }), { target: { value: "14" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Hold B scorepoint" }), { target: { value: "9" } });
    fireEvent.click(screen.getByRole("button", { name: "Gem" }));
    expect(await screen.findByTestId("score-sheet-session-notice")).toBeInTheDocument();

    // The organizer signs in again (for example in another tab) and presses Gem once more.
    signedIn = true;
    fireEvent.click(screen.getByRole("button", { name: "Gem" }));

    await waitFor(() => expect(screen.queryByRole("textbox", { name: "Hold A scorepoint" })).not.toBeInTheDocument());
    const scoreRow = within(screen.getAllByTestId("live-court-card")[0]).getByTestId("live-court-score-row");
    expect(within(scoreRow).getByTestId("live-court-left-score")).toHaveTextContent("14");
    expect(within(scoreRow).getByTestId("live-court-right-score")).toHaveTextContent("9");
    expect(screen.queryByTestId("live-session-notice")).not.toBeInTheDocument();
    expect(screen.getByText("Resultat gemt.")).toBeInTheDocument();
  }, 10000);

  it("does not lock the tournament or change round when going to the next round finds the login expired", async () => {
    let state = createMockLiveTournamentState();
    for (const match of state.rounds[0].matches) {
      state = saveMatchResult(state, { matchId: match.id, teamAPoints: 21, teamBPoints: 15 });
    }
    const localId = setUpOwnedCloudTournament(state);
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = input.toString();
      if (url === "/api/supabase/shadow-save") return signedOutResponse();
      if (url === "/api/auth/me") return signedOutResponse();
      if (url === `/api/account/tournaments/${tournamentId}`) return signedOutResponse();
      return json({ ok: false, error: `Unexpected URL ${url}` }, 500);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<LiveScoringApp />);
    // Wait for the stored tournament (all round 1 scores saved), not the placeholder shown before loading.
    expect((await screen.findAllByRole("button", { name: /Rediger score/ })).length).toBe(state.rounds[0].matches.length);
    fireEvent.click(within(screen.getByTestId("live-bottom-round-navigation")).getByRole("button", { name: "Næste" }));

    expect(await screen.findByTestId("live-session-notice")).toHaveTextContent(signedOutText);
    expect(loadActiveTournament()?.activeRoundNumber).toBe(1);
    // Still the controller: round buttons and score buttons remain.
    expect(screen.getAllByRole("button", { name: "Næste" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /Rediger score|Indtast score/ }).length).toBeGreaterThan(0);
    expect(fetchMock).not.toHaveBeenCalledWith(`/api/account/tournaments/${tournamentId}`, expect.objectContaining({ method: "GET" }));
    expectStillInControl(localId);
  }, 10000);

  it("checks the login when the screen is turned on again and warns before any score is typed", async () => {
    const state = createMockLiveTournamentState();
    setUpOwnedCloudTournament(state);
    // Signed in when the page loads; the login is gone while the screen is off.
    let signedIn = true;
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = input.toString();
      if (url === "/api/auth/me") return signedIn ? json({ ok: true, account }) : signedOutResponse();
      if (url === `/api/account/tournaments/${tournamentId}`) {
        return signedIn ? json({ ok: true, kind: "standard", state, tournamentId, updatedAt: "2026-11-06T12:00:00.000Z", canManage: true }) : signedOutResponse();
      }
      return json({ ok: false, error: `Unexpected URL ${url}` }, 500);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<LiveScoringApp />);
    expect(await screen.findByText("Mock Americano")).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(`/api/account/tournaments/${tournamentId}`, { cache: "no-store" }));
    expect(screen.queryByTestId("live-session-notice")).not.toBeInTheDocument();
    signedIn = false;

    // Screen off, then on again.
    setVisibility("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    setVisibility("visible");
    document.dispatchEvent(new Event("visibilitychange"));

    expect(await screen.findByTestId("live-session-notice")).toHaveTextContent(signedOutText);
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/me", { cache: "no-store" });
    expect(screen.getAllByRole("button", { name: "Indtast score" }).length).toBeGreaterThan(0);
  }, 10000);

  it("renews a remembered login silently when the screen is turned on again", async () => {
    const state = createMockLiveTournamentState();
    setUpOwnedCloudTournament(state);
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = input.toString();
      if (url === "/api/auth/me") return json({ ok: true, account, remembered: true });
      return json({ ok: false, error: `Unexpected URL ${url}` }, 500);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<LiveScoringApp />);
    expect(await screen.findByText("Mock Americano")).toBeInTheDocument();
    setVisibility("visible");
    document.dispatchEvent(new Event("visibilitychange"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/auth/me", { cache: "no-store" }));
    expect(screen.queryByTestId("live-session-notice")).not.toBeInTheDocument();
  }, 10000);

  it("background sync notices the lost login without any screen event, and clears it after signing in again", async () => {
    const state = createMockLiveTournamentState();
    setUpOwnedCloudTournament(state);
    let signedIn = true;
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = input.toString();
      if (url === "/api/auth/me") return signedIn ? json({ ok: true, account }) : signedOutResponse();
      if (url === `/api/account/tournaments/${tournamentId}`) {
        return signedIn ? json({ ok: true, kind: "standard", state, tournamentId, updatedAt: "2026-11-06T12:00:00.000Z", canManage: true }) : signedOutResponse();
      }
      return json({ ok: false, error: `Unexpected URL ${url}` }, 500);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<LiveScoringApp />);
    expect(await screen.findByText("Mock Americano")).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(`/api/account/tournaments/${tournamentId}`, { cache: "no-store" }));
    expect(screen.queryByTestId("live-session-notice")).not.toBeInTheDocument();

    // The login expires; the next background sync (here triggered by the network coming back) finds it.
    signedIn = false;
    window.dispatchEvent(new Event("online"));
    expect(await screen.findByTestId("live-session-notice")).toHaveTextContent(signedOutText);

    // Signed in again: the next sync clears the notice, and no green copy of it is left behind.
    signedIn = true;
    window.dispatchEvent(new Event("online"));
    await waitFor(() => expect(screen.queryByTestId("live-session-notice")).not.toBeInTheDocument());
    expect(screen.queryByText(signedOutText)).not.toBeInTheDocument();
  }, 10000);

  it("does not check any login for a guest tournament", async () => {
    saveActiveTournamentFromRemoteSync(createMockLiveTournamentState());
    const fetchMock = vi.fn(() => json({ ok: false }, 500));
    vi.stubGlobal("fetch", fetchMock);

    render(<LiveScoringApp />);
    expect(await screen.findByText("Mock Americano")).toBeInTheDocument();
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("focus"));

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fetchMock).not.toHaveBeenCalledWith("/api/auth/me", expect.anything());
  });

  it("still locks the tournament when another account has taken over (403)", async () => {
    const state = createMockLiveTournamentState();
    const matchId = state.rounds[0].matches[0].id;
    const localId = setUpOwnedCloudTournament(state, { [matchId]: 1 });
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === `/api/account/tournaments/${tournamentId}/score`) return json({ ok: false, error: "Du har ikke længere styring af denne turnering." }, 403);
      if (isReconcileRead(url, init)) return json({ ok: true, kind: "standard", state, tournamentId, updatedAt: "2026-11-06T12:00:00.000Z", canManage: false });
      if (url === `/api/account/tournaments/${tournamentId}`) return json({ ok: true, kind: "standard", state, tournamentId, updatedAt: "2026-11-06T12:00:00.000Z", canManage: true, matchScoreVersions: { [matchId]: 1 } });
      return json({ ok: false }, 500);
    }));

    render(<LiveScoringApp />);
    expect(await screen.findByText("Mock Americano")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Indtast score" })[0]);
    fireEvent.change(screen.getByRole("textbox", { name: "Hold A scorepoint" }), { target: { value: "14" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Hold B scorepoint" }), { target: { value: "9" } });
    fireEvent.click(screen.getByRole("button", { name: "Gem" }));

    await waitFor(() => expect(screen.getAllByText("Du har ikke længere styring af denne turnering.").length).toBeGreaterThan(0));
    await waitFor(() => expect(loadShadowSaveMetadata(localId)?.canManage).toBe(false));
    expect(screen.queryByTestId("live-session-notice")).not.toBeInTheDocument();
  }, 10000);
});

describe("Finishing a tournament when the organizer is logged out", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("tries to renew the login, then keeps the tournament active and in the organizer's control", async () => {
    const state = createMockLiveTournamentState();
    const localId = setUpOwnedCloudTournament(state);
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = input.toString();
      if (url === "/api/supabase/shadow-save") return signedOutResponse();
      if (url === "/api/auth/me") return signedOutResponse();
      if (url === `/api/account/tournaments/${tournamentId}`) return signedOutResponse();
      return json({ ok: false, error: `Unexpected URL ${url}` }, 500);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<FinishTournamentApp />);
    expect(await screen.findByRole("heading", { name: "Mock Americano" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Afslut turnering" }));

    expect(await screen.findByText(signedOutText)).toBeInTheDocument();
    expect(loadActiveTournament()?.status).toBe("active");
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/me", { cache: "no-store" });
    expect(fetchMock).not.toHaveBeenCalledWith(`/api/account/tournaments/${tournamentId}`, expect.objectContaining({ method: "GET" }));
    expectStillInControl(localId);
  });
});
