import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RemoteTournamentApp } from "../components/tournament/remote-tournament-app";
import { SyncStatusPanel } from "../components/tournament/sync-status-panel";
import { createMockLiveTournamentState, saveMatchResult, type LiveTournamentState } from "../lib/live-scoring";
import { createPoolTournamentFromSetup, createTeamVsTeamTournamentFromSetup, loadActiveTournament, saveActiveTournament, type TeamVsTeamTournamentState } from "../lib/tournament-setup";

describe("STEP 13 remote read-only UI", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    window.localStorage.clear();
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
    expect(screen.getByRole("button", { name: "Indtast score" })).toBeDisabled();
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
});

function createReadResponse(kind: "standard", state: LiveTournamentState): Response;
function createReadResponse(kind: "team-vs-team", state: TeamVsTeamTournamentState): Response;
function createReadResponse(kind: "standard" | "team-vs-team", state: LiveTournamentState | TeamVsTeamTournamentState): Response {
  return new Response(JSON.stringify({ ok: true, kind, state, updatedAt: "2026-08-13T12:00:00.000Z" }), { status: 200 });
}

function scoreMockState(name: string): LiveTournamentState {
  const state = { ...createMockLiveTournamentState(), tournamentName: name };
  return saveMatchResult(state, { matchId: state.rounds[0].matches[0].id, teamAPoints: 17, teamBPoints: 7 });
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
