import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountPanel } from "../components/auth/account-panel";
import { createMockLiveTournamentState } from "../lib/live-scoring";
import { createStandardShadowSaveLocalId, loadActiveTournament, loadShadowSaveMetadata, saveActiveTournament } from "../lib/tournament-setup";

const navigationMocks = vi.hoisted(() => ({
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => navigationMocks,
}));

describe("STEP 25I-B1 owner cloud tournament open UI", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    navigationMocks.push.mockReset();
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("lists an owned cloud tournament and restores server state over stale local cache before opening /live", async () => {
    const staleLocalState = { ...createMockLiveTournamentState(), tournamentName: "Stale local", activeRoundNumber: 1 };
    const serverState = { ...createMockLiveTournamentState(), tournamentName: "Cloud restored", activeRoundNumber: 2 };
    saveActiveTournament(staleLocalState);
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === "/api/auth/me") {
        return new Response(JSON.stringify({
          ok: true,
          account: {
            userId: "00000000-0000-4000-8000-0000000000a1",
            email: "owner@example.com",
            displayName: "Owner",
            role: "user",
          },
        }), { status: 200 });
      }

      if (url === "/api/account/tournaments") {
        return new Response(JSON.stringify({
          ok: true,
          tournaments: [{
            id: "00000000-0000-4000-8000-000000000101",
            name: "Cloud restored",
            format: "americano",
            status: "active",
          }],
        }), { status: 200 });
      }

      if (url === "/api/account/tournaments/00000000-0000-4000-8000-000000000101") {
        return new Response(JSON.stringify({
          ok: true,
          kind: "standard",
          state: serverState,
          tournamentId: "00000000-0000-4000-8000-000000000101",
          updatedAt: "2026-08-19T10:00:00.000Z",
          legacyLocalId: "cloud restored-americano",
          organizerToken: "OWNER_ORGANIZER_TOKEN",
          canManage: true,
          matchScoreVersions: { [serverState.rounds[0].matches[0].id]: 1 },
        }), { status: 200 });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AccountPanel />);

    const openButton = await screen.findByRole("button", { name: "Åbn turnering" });
    expect(screen.getByText("Cloud restored")).toBeInTheDocument();

    fireEvent.click(openButton);

    await waitFor(() => expect(navigationMocks.push).toHaveBeenCalledWith("/live"));
    expect(loadActiveTournament()).toMatchObject({
      tournamentName: "Cloud restored",
      activeRoundNumber: 2,
    });
    expect(loadActiveTournament()?.tournamentName).not.toBe("Stale local");
    expect(loadShadowSaveMetadata("cloud restored-americano")).toMatchObject({
      kind: "standard",
      status: "synced",
      supabaseTournamentId: "00000000-0000-4000-8000-000000000101",
      lastShadowSaveVersion: "2026-08-19T10:00:00.000Z",
      organizerToken: "OWNER_ORGANIZER_TOKEN",
      canManage: true,
      matchScoreVersions: { [serverState.rounds[0].matches[0].id]: 1 },
    });
    expect(createStandardShadowSaveLocalId(loadActiveTournament()!)).toBe("cloud restored-americano");
  });

  it("stores transferred cloud authority under the active live key and clears stale organizer access", async () => {
    const staleLocalState = { ...createMockLiveTournamentState(), tournamentName: "ADMIN TAKEOVER TEST" };
    const serverState = { ...createMockLiveTournamentState(), tournamentName: "ADMIN TAKEOVER TEST" };
    const activeLocalId = createStandardShadowSaveLocalId(serverState);
    saveActiveTournament(staleLocalState);
    window.localStorage.setItem("lezgo.shadowSaveMetadata.v1", JSON.stringify({
      [activeLocalId]: {
        localId: activeLocalId,
        kind: "standard",
        status: "synced",
        supabaseTournamentId: "00000000-0000-4000-8000-0000000008c8",
        organizerToken: "STALE_CREATOR_ORGANIZER_TOKEN",
        canManage: true,
      },
    }));
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === "/api/auth/me") {
        return new Response(JSON.stringify({
          ok: true,
          account: {
            userId: "00000000-0000-4000-8000-00000000aaa1",
            email: "creator@example.com",
            displayName: "LEZGO Takeover Test",
            username: "lezgotakeovertest",
            role: "user",
          },
        }), { status: 200 });
      }

      if (url === "/api/account/tournaments") {
        return new Response(JSON.stringify({
          ok: true,
          tournaments: [{
            id: "00000000-0000-4000-8000-0000000008c8",
            name: "ADMIN TAKEOVER TEST",
            format: "americano",
            status: "active",
          }],
        }), { status: 200 });
      }

      if (url === "/api/account/tournaments/00000000-0000-4000-8000-0000000008c8") {
        return new Response(JSON.stringify({
          ok: true,
          kind: "standard",
          state: serverState,
          tournamentId: "00000000-0000-4000-8000-0000000008c8",
          updatedAt: "2026-08-20T12:00:00.000Z",
          legacyLocalId: "mexicano-mexicano",
          canManage: false,
          matchScoreVersions: { [serverState.rounds[0].matches[0].id]: 1 },
        }), { status: 200 });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AccountPanel />);

    fireEvent.click(await screen.findByRole("button", { name: "Åbn turnering" }));

    await waitFor(() => expect(navigationMocks.push).toHaveBeenCalledWith("/live"));
    expect(loadActiveTournament()?.tournamentName).toBe("ADMIN TAKEOVER TEST");
    expect(loadShadowSaveMetadata(activeLocalId)).toMatchObject({
      kind: "standard",
      status: "synced",
      supabaseTournamentId: "00000000-0000-4000-8000-0000000008c8",
      legacyLocalId: "mexicano-mexicano",
      canManage: false,
    });
    expect(loadShadowSaveMetadata(activeLocalId)?.organizerToken).toBeUndefined();
    expect(JSON.parse(window.sessionStorage.getItem("lezgo.activeCloudTournamentAuthority.v1") ?? "{}")).toMatchObject({
      source: "server",
      kind: "standard",
      localId: activeLocalId,
      tournamentId: "00000000-0000-4000-8000-0000000008c8",
      canRead: true,
      canManage: false,
    });
  });

  it("opens a completed owned cloud tournament on the final standings route with its authoritative id", async () => {
    const serverState = { ...createMockLiveTournamentState(), tournamentName: "Finished Cloud Cup", status: "finished" as const };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === "/api/auth/me") {
        return new Response(JSON.stringify({
          ok: true,
          account: {
            userId: "00000000-0000-4000-8000-0000000000a1",
            email: "owner@example.com",
            displayName: "Owner",
            role: "user",
          },
        }), { status: 200 });
      }

      if (url === "/api/account/tournaments") {
        return new Response(JSON.stringify({
          ok: true,
          tournaments: [{
            id: "00000000-0000-4000-8000-000000000303",
            name: "Finished Cloud Cup",
            format: "americano",
            status: "finished",
            updatedAt: "2026-08-22T10:00:00.000Z",
            canManage: true,
            managementState: "completed",
          }],
        }), { status: 200 });
      }

      if (url === "/api/account/tournaments/00000000-0000-4000-8000-000000000303") {
        return new Response(JSON.stringify({
          ok: true,
          kind: "standard",
          state: serverState,
          tournamentId: "00000000-0000-4000-8000-000000000303",
          updatedAt: "2026-08-22T10:00:00.000Z",
          legacyLocalId: "finished-cloud-cup-americano",
          organizerToken: "OWNER_ORGANIZER_TOKEN",
          canManage: true,
          matchScoreVersions: { [serverState.rounds[0].matches[0].id]: 1 },
        }), { status: 200 });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AccountPanel />);

    const openButton = await screen.findByRole("button", { name: "Se slutstilling" });
    fireEvent.click(openButton);

    await waitFor(() => expect(navigationMocks.push).toHaveBeenCalledWith("/finish"));
    expect(fetchMock).toHaveBeenCalledWith("/api/account/tournaments/00000000-0000-4000-8000-000000000303", expect.any(Object));
    expect(loadActiveTournament()).toMatchObject({
      tournamentName: "Finished Cloud Cup",
      status: "finished",
    });
    expect(loadShadowSaveMetadata(createStandardShadowSaveLocalId(serverState))).toMatchObject({
      supabaseTournamentId: "00000000-0000-4000-8000-000000000303",
      canManage: true,
    });
  });
});
