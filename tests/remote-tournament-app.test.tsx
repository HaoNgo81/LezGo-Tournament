import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RemoteTournamentApp } from "../components/tournament/remote-tournament-app";
import { SyncStatusPanel } from "../components/tournament/sync-status-panel";
import { createMockLiveTournamentState, saveMatchResult, type LiveTournamentState } from "../lib/live-scoring";
import { createPoolTournamentFromSetup, createTeamVsTeamTournamentFromSetup, loadActiveTournament, saveActiveTournament, type TeamVsTeamTournamentState } from "../lib/tournament-setup";

describe("STEP 13 remote read-only UI", () => {
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
    vi.restoreAllMocks();
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.history.pushState({}, "", "/");
  });

  it("opens a standard remote tournament as read-only without changing localStorage", async () => {
    const localState = createMockLiveTournamentState();
    const remoteState = scoreMockState("STEP_13_TEST Remote");
    saveActiveTournament(localState);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(createReadResponse("standard", remoteState)));

    render(<RemoteTournamentApp />);
    fireEvent.change(screen.getByLabelText("Turneringskode"), { target: { value: " ab12cd " } });
    fireEvent.change(screen.getByLabelText("Adgangskode / Share token"), { target: { value: " step-13-token " } });
    fireEvent.click(screen.getByRole("button", { name: "Åbn turnering fra anden enhed" }));

    expect(await screen.findByText("Visning fra anden enhed - skrivebeskyttet")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "STEP_13_TEST Remote" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "TV-visning" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Indtast score" })).not.toBeInTheDocument();
    expect(loadActiveTournament()).toEqual(localState);

    const payload = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string) as { tournamentCode: string; shareToken: string };
    expect(payload).toEqual({ tournamentCode: "AB12CD", shareToken: "step-13-token" });
  });

  it("keeps the last remote snapshot in memory when refresh fails", async () => {
    const firstState = scoreMockState("STEP_13_TEST First");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createReadResponse("standard", firstState))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: false }), { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<RemoteTournamentApp />);
    fireEvent.change(screen.getByLabelText("Turneringskode"), { target: { value: "K7M4XP" } });
    fireEvent.change(screen.getByLabelText("Adgangskode / Share token"), { target: { value: "step-13-token" } });
    fireEvent.click(screen.getByRole("button", { name: "Åbn turnering fra anden enhed" }));

    expect(await screen.findByRole("heading", { name: "STEP_13_TEST First" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Opdater" }));

    expect(await screen.findByText("Forbindelsen kunne ikke opdateres. Seneste viste turnering er bevaret.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "STEP_13_TEST First" })).toBeInTheDocument();
  });

  it("shows a generic access error for wrong credentials", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: false }), { status: 403 })));

    render(<RemoteTournamentApp />);
    fireEvent.change(screen.getByLabelText("Turneringskode"), { target: { value: "K7M4XP" } });
    fireEvent.change(screen.getByLabelText("Adgangskode / Share token"), { target: { value: "wrong-token" } });
    fireEvent.click(screen.getByRole("button", { name: "Åbn turnering fra anden enhed" }));

    expect(await screen.findByText("Turneringen kunne ikke åbnes. Kontrollér kode og adgangskode.")).toBeInTheDocument();
  });

  it("closes remote preview without promoting it to primary localStorage", async () => {
    const localState = createMockLiveTournamentState();
    saveActiveTournament(localState);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(createReadResponse("standard", scoreMockState("STEP_13_TEST Remote"))));

    render(<RemoteTournamentApp />);
    fireEvent.change(screen.getByLabelText("Turneringskode"), { target: { value: "K7M4XP" } });
    fireEvent.change(screen.getByLabelText("Adgangskode / Share token"), { target: { value: "step-13-token" } });
    fireEvent.click(screen.getByRole("button", { name: "Åbn turnering fra anden enhed" }));

    expect(await screen.findByRole("heading", { name: "STEP_13_TEST Remote" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Luk visning" }));

    expect(screen.getByText("Indtast koden og adgangskoden fra en turnering, der allerede er delt fra en anden enhed.")).toBeInTheDocument();
    expect(loadActiveTournament()).toEqual(localState);
  });

  it("renders pool and Team vs Team remote snapshots", async () => {
    const poolState = createPoolTournamentFromSetup({
      name: "STEP_13_TEST Pool",
      participantType: "pair",
      participantText: ["Par A", "Par B", "Par C", "Par D"].join("\n"),
      poolCount: 2,
      participantsPerPool: 2,
      advancementMode: "crossMatches",
      unmatchedResolution: "bye",
      scoringMode: "Fri scoring",
      rankingMode: "matchPointsFirst",
    });
    const teamState = createTeamState();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createReadResponse("standard", poolState))
      .mockResolvedValueOnce(createReadResponse("team-vs-team", teamState));
    vi.stubGlobal("fetch", fetchMock);

    const { unmount } = render(<RemoteTournamentApp />);
    fireEvent.change(screen.getByLabelText("Turneringskode"), { target: { value: "K7M4XP" } });
    fireEvent.change(screen.getByLabelText("Adgangskode / Share token"), { target: { value: "pool-token" } });
    fireEvent.click(screen.getByRole("button", { name: "Åbn turnering fra anden enhed" }));
    expect(await screen.findByRole("heading", { name: "STEP_13_TEST Pool" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Puljestillinger" })).toBeInTheDocument();
    unmount();

    render(<RemoteTournamentApp />);
    fireEvent.change(screen.getByLabelText("Turneringskode"), { target: { value: "K7M4XP" } });
    fireEvent.change(screen.getByLabelText("Adgangskode / Share token"), { target: { value: "team-token" } });
    fireEvent.click(screen.getByRole("button", { name: "Åbn turnering fra anden enhed" }));
    expect(await screen.findByRole("heading", { name: "STEP_13_TEST Team" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Hold og kaptajner" })).toBeInTheDocument();
  });

  it("renders English remote UI when English is selected", async () => {
    window.localStorage.setItem("lezgo.tournamentSettings.v1", JSON.stringify({
      language: "en",
      scoringMode: "Fri scoring",
      courts: 2,
      rounds: 2,
      rankingMode: "matchPointsFirst",
      timeLimitMinutes: 15,
      alarmSound: "standard",
    }));

    render(<RemoteTournamentApp />);

    expect(await screen.findByText("Enter the code and share token from a tournament already shared from another device.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open tournament from another device" })).toBeInTheDocument();
  });

  it("switches the remote display into TV mode with fullscreen control", async () => {
    const remoteState = scoreMockState("STEP_18_TEST TV Display", 17, 7);
    const requestFullscreen = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(document.documentElement, "requestFullscreen", {
      configurable: true,
      value: requestFullscreen,
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(createReadResponse("standard", remoteState)));

    render(<RemoteTournamentApp />);
    fireEvent.change(screen.getByLabelText("Turneringskode"), { target: { value: "K7M4XP" } });
    fireEvent.change(screen.getByLabelText("Adgangskode / Share token"), { target: { value: "step-18-token" } });
    fireEvent.click(screen.getByRole("button", { name: "Åbn turnering fra anden enhed" }));

    expect(await screen.findByRole("heading", { name: "STEP_18_TEST TV Display" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Kampe" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Live score" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Stilling" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "TV-visning" }));
    expect(screen.getByRole("button", { name: "Standardvisning" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Fuld skærm" }));
    expect(requestFullscreen).toHaveBeenCalledTimes(1);
  });

  it("opens directly in TV mode when the remote URL requests TV display", async () => {
    window.history.pushState({}, "", "/remote/handoff/STEP_18_TEST_REFERENCE_WITH_ENTROPY_1234567890?display=tv");
    const remoteState = scoreMockState("STEP_18_TEST Direct TV", 17, 7);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(createReadResponse("standard", remoteState, "2026-08-13T12:00:00.000Z", {
      remoteSessionToken: "STEP_18_REMOTE_SESSION_TOKEN",
      remoteSessionExpiresAt: "2026-08-14T00:00:00.000Z",
    })));

    render(<RemoteTournamentApp initialHandoffReference="STEP_18_TEST_REFERENCE_WITH_ENTROPY_1234567890" />);

    expect(await screen.findByRole("heading", { name: "STEP_18_TEST Direct TV" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Standardvisning" })).toBeInTheDocument();
  });

  it("provisions access from Device A without exposing the raw token text", async () => {
    const state = createMockLiveTournamentState();
    window.localStorage.setItem("lezgo.shadowSaveMetadata.v1", JSON.stringify({
      "mock americano-americano": {
        localId: "mock americano-americano",
        kind: "standard",
        status: "synced",
        supabaseTournamentId: "00000000-0000-4000-8000-000000000013",
      },
    }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      tournamentCode: "K7M4XP",
      shareToken: "STEP_13_TEST_SECRET_TOKEN",
    }), { status: 200 })));

    render(<SyncStatusPanel kind="standard" localId="mock americano-americano" state={state} />);
    fireEvent.click(screen.getByRole("button", { name: "Adgang til anden enhed" }));

    expect(await screen.findByText("K7M4XP")).toBeInTheDocument();
    expect(screen.getByText("************")).toBeInTheDocument();
    expect(screen.queryByText("STEP_13_TEST_SECRET_TOKEN")).not.toBeInTheDocument();
  });

  it("generates a short-lived QR handoff from Device A", async () => {
    const state = createMockLiveTournamentState();
    window.localStorage.setItem("lezgo.shadowSaveMetadata.v1", JSON.stringify({
      "mock americano-americano": {
        localId: "mock americano-americano",
        kind: "standard",
        status: "synced",
        supabaseTournamentId: "00000000-0000-4000-8000-000000000014",
      },
    }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      handoffUrl: "http://localhost/remote/handoff/STEP_14_TEST_REFERENCE_WITH_ENTROPY_1234567890",
      expiresAt: "2026-08-13T12:10:00.000Z",
    }), { status: 200 })));

    render(<SyncStatusPanel kind="standard" localId="mock americano-americano" state={state} />);
    fireEvent.click(screen.getByRole("button", { name: "Vis på anden enhed" }));

    expect(await screen.findByRole("img", { name: "QR-kode til skrivebeskyttet turnering" })).toBeInTheDocument();
    expect(screen.getByText("Scan QR-koden med en anden enhed for at åbne turneringen.")).toBeInTheDocument();
    expect(screen.getByDisplayValue("http://localhost/remote/handoff/STEP_14_TEST_REFERENCE_WITH_ENTROPY_1234567890")).toBeInTheDocument();
    expect(screen.queryByText("STEP_13_TEST_SECRET_TOKEN")).not.toBeInTheDocument();
  });

  it("auto-opens a handoff URL as remote read-only without changing localStorage", async () => {
    const localState = createMockLiveTournamentState();
    const remoteState = scoreMockState("STEP_14_TEST QR Remote");
    saveActiveTournament(localState);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(createReadResponse("standard", remoteState)));

    render(<RemoteTournamentApp initialHandoffReference="STEP_14_TEST_REFERENCE_WITH_ENTROPY_1234567890" />);

    expect(await screen.findByText("Visning fra anden enhed - skrivebeskyttet")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "STEP_14_TEST QR Remote" })).toBeInTheDocument();
    expect(loadActiveTournament()).toEqual(localState);

    const payload = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string) as { handoffReference: string };
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe("/api/supabase/tournament-handoff/redeem");
    expect(payload.handoffReference).toBe("STEP_14_TEST_REFERENCE_WITH_ENTROPY_1234567890");
  });

  it("shows expired QR UX without revealing access details", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: false }), { status: 410 })));

    render(<RemoteTournamentApp initialHandoffReference="STEP_14_TEST_EXPIRED_REFERENCE_WITH_ENTROPY_1234567890" />);

    expect(await screen.findByText("QR-koden er udløbet. Bed turneringslederen om at generere en ny.")).toBeInTheDocument();
    expect(screen.queryByText("share_token")).not.toBeInTheDocument();
  });
  it("auto-refreshes a newer remote snapshot without touching localStorage", async () => {
    vi.useFakeTimers();
    const localState = createMockLiveTournamentState();
    const initialRemoteState = scoreMockState("STEP_15_TEST Live", 17, 7);
    const updatedRemoteState = scoreMockState("STEP_15_TEST Live", 20, 4);
    saveActiveTournament(localState);
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(createReadResponse("standard", initialRemoteState, "2026-08-13T12:00:00.000Z"))
      .mockResolvedValueOnce(createReadResponse("standard", updatedRemoteState, "2026-08-13T12:00:05.000Z")));

    render(<RemoteTournamentApp initialHandoffReference="STEP_15_TEST_REFERENCE_WITH_ENTROPY_1234567890" />);

    await flushPromises();

    expect(screen.getByRole("heading", { name: "STEP_15_TEST Live" })).toBeInTheDocument();
    expect(screen.getByText("17 - 7")).toBeInTheDocument();
    expect(screen.getByLabelText("Live-sync status")).toHaveTextContent("Live");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });

    expect(screen.getByText("20 - 4")).toBeInTheDocument();
    expect(screen.queryByText("17 - 7")).not.toBeInTheDocument();
    expect(loadActiveTournament()).toEqual(localState);
    vi.useRealTimers();
  });

  it("ignores stale duplicate auto-refresh versions", async () => {
    vi.useFakeTimers();
    const initialRemoteState = scoreMockState("STEP_15_TEST Stale", 17, 7);
    const staleRemoteState = scoreMockState("STEP_15_TEST Stale", 10, 14);
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(createReadResponse("standard", initialRemoteState, "2026-08-13T12:00:05.000Z"))
      .mockResolvedValueOnce(createReadResponse("standard", staleRemoteState, "2026-08-13T12:00:01.000Z")));

    render(<RemoteTournamentApp initialHandoffReference="STEP_15_TEST_STALE_REFERENCE_WITH_ENTROPY_1234567890" />);

    await flushPromises();

    expect(screen.getByText("17 - 7")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });

    expect(screen.getByText("17 - 7")).toBeInTheDocument();
    expect(screen.queryByText("10 - 14")).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it("keeps the last snapshot and recovers after auto-sync network interruption", async () => {
    vi.useFakeTimers();
    const initialRemoteState = scoreMockState("STEP_15_TEST Offline", 17, 7);
    const recoveredRemoteState = scoreMockState("STEP_15_TEST Offline", 19, 5);
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(createReadResponse("standard", initialRemoteState, "2026-08-13T12:00:00.000Z"))
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce(createReadResponse("standard", recoveredRemoteState, "2026-08-13T12:00:08.000Z")));

    render(<RemoteTournamentApp initialHandoffReference="STEP_15_TEST_OFFLINE_REFERENCE_WITH_ENTROPY_1234567890" />);

    await flushPromises();

    expect(screen.getByText("17 - 7")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });

    expect(screen.getByText("Live-opdatering kunne ikke hente nyeste version. Seneste viste turnering er bevaret.")).toBeInTheDocument();
    expect(screen.getByText("17 - 7")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });

    expect(screen.getByText("19 - 5")).toBeInTheDocument();
    expect(screen.getByLabelText("Live-sync status")).toHaveTextContent("Live");
    vi.useRealTimers();
  });

  it("backs off after repeated temporary auto-sync failures without showing manual loading", async () => {
    vi.useFakeTimers();
    const initialRemoteState = scoreMockState("STEP_16_TEST Backoff", 17, 7);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(createReadResponse("standard", initialRemoteState, "2026-08-13T12:00:00.000Z"))
      .mockRejectedValueOnce(new TypeError("network down"))
      .mockRejectedValueOnce(new TypeError("network still down"));
    vi.stubGlobal("fetch", fetchMock);

    render(<RemoteTournamentApp initialHandoffReference="STEP_16_TEST_BACKOFF_REFERENCE_WITH_ENTROPY_1234567890" />);

    await flushPromises();
    expect(screen.getByText("17 - 7")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: "Opdater" })).toBeInTheDocument();
    expect(screen.getByLabelText("Live-sync status")).toHaveTextContent("Forbinder igen");
    expect(screen.getByText(/Næste forsøg:/)).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3999);
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it("recovers immediately when the browser comes back online", async () => {
    vi.useFakeTimers();
    const initialRemoteState = scoreMockState("STEP_16_TEST Online", 17, 7);
    const recoveredRemoteState = scoreMockState("STEP_16_TEST Online", 18, 6);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(createReadResponse("standard", initialRemoteState, "2026-08-13T12:00:00.000Z"))
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce(createReadResponse("standard", recoveredRemoteState, "2026-08-13T12:00:05.000Z"));
    vi.stubGlobal("fetch", fetchMock);

    render(<RemoteTournamentApp initialHandoffReference="STEP_16_TEST_ONLINE_REFERENCE_WITH_ENTROPY_1234567890" />);

    await flushPromises();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });

    expect(screen.getByText("17 - 7")).toBeInTheDocument();

    await act(async () => {
      window.dispatchEvent(new Event("online"));
      await Promise.resolve();
    });

    expect(screen.getByText("18 - 6")).toBeInTheDocument();
    expect(screen.getByLabelText("Live-sync status")).toHaveTextContent("Live");
    vi.useRealTimers();
  });

  it("stops automatic polling when a handoff expires", async () => {
    vi.useFakeTimers();
    const initialRemoteState = scoreMockState("STEP_16_TEST Expired", 17, 7);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(createReadResponse("standard", initialRemoteState, "2026-08-13T12:00:00.000Z"))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: false }), { status: 410 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<RemoteTournamentApp initialHandoffReference="STEP_16_TEST_EXPIRED_REFERENCE_WITH_ENTROPY_1234567890" />);

    await flushPromises();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });

    expect(screen.getByText("TV-forbindelsen er udløbet eller ikke længere gyldig.")).toBeInTheDocument();
    expect(screen.getByLabelText("Live-sync status")).toHaveTextContent("Fejl");
    expect(screen.getAllByRole("button", { name: "Ny forbindelse" }).length).toBeGreaterThan(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000);
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("continues polling through the established remote session after a handoff opens", async () => {
    vi.useFakeTimers();
    const initialRemoteState = scoreMockState("STEP_17_TEST Session", 17, 7);
    const updatedRemoteState = scoreMockState("STEP_17_TEST Session", 20, 4);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(createReadResponse("standard", initialRemoteState, "2026-08-13T12:00:00.000Z", {
        remoteSessionToken: "STEP_17_REMOTE_SESSION_TOKEN",
        remoteSessionExpiresAt: "2026-08-14T00:00:00.000Z",
      }))
      .mockResolvedValueOnce(createReadResponse("standard", updatedRemoteState, "2026-08-13T12:00:05.000Z", {
        remoteSessionToken: "STEP_17_REMOTE_SESSION_TOKEN",
        remoteSessionExpiresAt: "2026-08-14T00:00:00.000Z",
      }));
    vi.stubGlobal("fetch", fetchMock);

    render(<RemoteTournamentApp initialHandoffReference="STEP_17_TEST_REFERENCE_WITH_ENTROPY_1234567890" />);

    await flushPromises();
    expect(screen.getByText("17 - 7")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });

    expect(screen.getByText("20 - 4")).toBeInTheDocument();
    expect(fetchMock.mock.calls[0][0]).toBe("/api/supabase/tournament-handoff/redeem");
    expect(fetchMock.mock.calls[1][0]).toBe("/api/supabase/remote-session/read");
    expect(JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string)).toEqual({ remoteSessionToken: "STEP_17_REMOTE_SESSION_TOKEN" });
    vi.useRealTimers();
  });

  it("restores an established remote session after a Device B refresh without redeeming QR again", async () => {
    const remoteState = scoreMockState("STEP_17_TEST Restored", 18, 6);
    window.sessionStorage.setItem("lezgo.remoteSession.v1", JSON.stringify({
      handoffReference: "STEP_17_TEST_RESTORE_REFERENCE_WITH_ENTROPY_1234567890",
      remoteSessionToken: "STEP_17_STORED_REMOTE_SESSION_TOKEN",
      remoteSessionExpiresAt: "2026-08-14T00:00:00.000Z",
    }));
    const fetchMock = vi.fn().mockResolvedValueOnce(createReadResponse("standard", remoteState, "2026-08-13T12:00:05.000Z", {
      remoteSessionToken: "STEP_17_STORED_REMOTE_SESSION_TOKEN",
      remoteSessionExpiresAt: "2026-08-14T00:00:00.000Z",
    }));
    vi.stubGlobal("fetch", fetchMock);

    render(<RemoteTournamentApp initialHandoffReference="STEP_17_TEST_RESTORE_REFERENCE_WITH_ENTROPY_1234567890" />);

    expect(await screen.findByRole("heading", { name: "STEP_17_TEST Restored" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/supabase/remote-session/read");
  });

  it("stops automatic polling when an established remote session expires", async () => {
    vi.useFakeTimers();
    const initialRemoteState = scoreMockState("STEP_17_TEST Expired Session", 17, 7);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(createReadResponse("standard", initialRemoteState, "2026-08-13T12:00:00.000Z", {
        remoteSessionToken: "STEP_17_EXPIRING_REMOTE_SESSION_TOKEN",
        remoteSessionExpiresAt: "2026-08-14T00:00:00.000Z",
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: false }), { status: 410 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<RemoteTournamentApp initialHandoffReference="STEP_17_TEST_EXPIRING_REFERENCE_WITH_ENTROPY_1234567890" />);

    await flushPromises();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });

    expect(screen.getByText("TV-forbindelsen er udløbet eller ikke længere gyldig.")).toBeInTheDocument();
    expect(screen.getByLabelText("Live-sync status")).toHaveTextContent("Fejl");
    expect(screen.getAllByRole("button", { name: "Ny forbindelse" }).length).toBeGreaterThan(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000);
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});

async function flushPromises(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function createReadResponse(kind: "standard", state: LiveTournamentState, updatedAt?: string, session?: { remoteSessionToken: string; remoteSessionExpiresAt: string }): Response;
function createReadResponse(kind: "team-vs-team", state: TeamVsTeamTournamentState, updatedAt?: string, session?: { remoteSessionToken: string; remoteSessionExpiresAt: string }): Response;
function createReadResponse(kind: "standard" | "team-vs-team", state: LiveTournamentState | TeamVsTeamTournamentState, updatedAt = "2026-08-13T12:00:00.000Z", session?: { remoteSessionToken: string; remoteSessionExpiresAt: string }): Response {
  return new Response(JSON.stringify({ ok: true, kind, state, updatedAt, ...session }), { status: 200 });
}

function scoreMockState(name: string, teamAPoints = 17, teamBPoints = 7): LiveTournamentState {
  const state = { ...createMockLiveTournamentState(), tournamentName: name };
  return saveMatchResult(state, { matchId: state.rounds[0].matches[0].id, teamAPoints, teamBPoints });
}

function createTeamState(): TeamVsTeamTournamentState {
  const state = createTeamVsTeamTournamentFromSetup({
    name: "STEP_13_TEST Team",
    scoringMode: "Fri scoring",
    teamCount: 2,
    competitionMode: "knockout",
    drawMode: "manual",
    playersPerTeam: 4,
    matchFormat: "oneSet",
    teams: [
      { id: "team-a", name: "Hold A", captainPlayerId: "a1", players: createPlayers("a", "A") },
      { id: "team-b", name: "Hold B", captainPlayerId: "b1", players: createPlayers("b", "B") },
    ],
  });

  return {
    ...state,
    status: "active",
    matchups: [
      {
        ...state.matchups[0],
        lineups: [
          {
            roundNumber: 1,
            match1: { teamAPlayerIds: ["a1", "a2"], teamBPlayerIds: ["b1", "b2"] },
            match2: { teamAPlayerIds: ["a3", "a4"], teamBPlayerIds: ["b3", "b4"] },
          },
        ],
      },
    ],
  };
}

function createPlayers(prefix: string, label: string) {
  return Array.from({ length: 4 }, (_, index) => ({ id: `${prefix}${index + 1}`, name: `${label} ${index + 1}` }));
}
