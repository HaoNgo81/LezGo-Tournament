import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RemoteTournamentApp } from "../components/tournament/remote-tournament-app";
import { SyncStatusPanel } from "../components/tournament/sync-status-panel";
import { calculateLiveStandings, createMockLiveTournamentState, saveMatchResult, type LiveTournamentState } from "../lib/live-scoring";
import { createPoolTournamentFromSetup, createTeamVsTeamTournamentFromSetup, createTournamentFromSetup, loadActiveTournament, saveActiveTournament, type TeamVsTeamTournamentState } from "../lib/tournament-setup";

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
    fireEvent.change(screen.getByLabelText("Adgangskode"), { target: { value: " 0427 " } });
    fireEvent.click(screen.getByRole("button", { name: "Åbn turnering fra anden enhed" }));

    expect(await screen.findByText("Visning fra anden enhed - skrivebeskyttet")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "STEP_13_TEST Remote" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "TV-visning" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Scoreboard-visning" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Live score" })).toBeInTheDocument();
    expect(screen.getByText("Spiller")).toBeInTheDocument();
    expect(screen.getByText("MP")).toBeInTheDocument();
    expect(screen.getByText("Point")).toBeInTheDocument();
    expect(screen.queryByText("Alle spillere")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Indtast score" })).not.toBeInTheDocument();
    expect(loadActiveTournament()).toEqual(localState);

    const payload = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string) as { tournamentCode: string; shareToken: string };
    expect(payload).toEqual({ tournamentCode: "AB12CD", shareToken: "0427" });
  });

  it("removes all-player cards from the actual production /remote render path", async () => {
    const remoteState = scoreAdaptiveScoreboardState("STEP_22U_TEST Actual Remote Path", 16, 4);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(createReadResponse("standard", remoteState)));

    render(<RemoteTournamentApp />);
    fireEvent.change(screen.getByLabelText("Turneringskode"), { target: { value: "K7M4XP" } });
    fireEvent.change(screen.getByLabelText("Adgangskode"), { target: { value: "2222" } });
    fireEvent.click(screen.getByRole("button", { name: "Åbn turnering fra anden enhed" }));

    expect(await screen.findByRole("heading", { name: "STEP_22U_TEST Actual Remote Path" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Live score" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Stilling" })).toBeInTheDocument();
    expect(screen.getAllByText("Spiller 1").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Spiller 16").length).toBeGreaterThan(0);
    expect(screen.queryByText("Alle spillere")).not.toBeInTheDocument();
    expect(screen.queryByText("Placering #1")).not.toBeInTheDocument();
    expect(screen.queryByText("Makker:")).not.toBeInTheDocument();
    expect(screen.queryByText("Modstandere:")).not.toBeInTheDocument();
  });

  it("keeps standard remote court cards readable and symmetric on narrow layouts", async () => {
    const remoteState = createLongNameStandardState("STEP_22Y_TEST Responsive Remote");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(createReadResponse("standard", remoteState)));

    render(<RemoteTournamentApp />);
    fireEvent.change(screen.getByLabelText("Turneringskode"), { target: { value: "K7M4XP" } });
    fireEvent.change(screen.getByLabelText("Adgangskode"), { target: { value: "2222" } });
    fireEvent.click(screen.getByRole("button", { name: "Åbn turnering fra anden enhed" }));

    expect(await screen.findByRole("heading", { name: "STEP_22Y_TEST Responsive Remote" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Live score" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Stilling" })).toBeInTheDocument();

    const courtGrid = screen.getByTestId("standard-remote-court-grid");
    expect(courtGrid).toHaveClass("md:grid-cols-2");
    expect(screen.getAllByTestId("standard-remote-court-card")).toHaveLength(2);
    expect(screen.getAllByTestId("standard-remote-matchup")).toHaveLength(2);
    expect(screen.getAllByTestId("standard-remote-vs")).toHaveLength(2);
    expect(screen.getAllByTestId("standard-remote-unsaved")).toHaveLength(2);
    expect(screen.getAllByText("Ikke gemt")).toHaveLength(2);
    expect(screen.getByTestId("standard-remote-standings")).toBeInTheDocument();

    const firstCard = screen.getAllByTestId("standard-remote-court-card")[0];
    expect(within(firstCard).getByText("Martin Langgaard")).toBeInTheDocument();
    expect(within(firstCard).getByText("Lindon West")).toBeInTheDocument();
    expect(within(firstCard).getByText("Klaus Nord")).toBeInTheDocument();
    expect(within(firstCard).getByText("Aqeel Sønder")).toBeInTheDocument();
    expect(within(firstCard).getByText("Martin Langgaard")).toHaveStyle({ wordBreak: "normal" });
    expect(within(firstCard).getByText("Klaus Nord")).toHaveStyle({ wordBreak: "normal" });
    expect(screen.queryByText("Alle spillere")).not.toBeInTheDocument();
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
    fireEvent.change(screen.getByLabelText("Adgangskode"), { target: { value: "4827" } });
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
    fireEvent.change(screen.getByLabelText("Adgangskode"), { target: { value: "9999" } });
    fireEvent.click(screen.getByRole("button", { name: "Åbn turnering fra anden enhed" }));

    expect(await screen.findByText("Turneringen kunne ikke åbnes. Kontrollér kode og adgangskode.")).toBeInTheDocument();
  });

  it("closes remote preview without promoting it to primary localStorage", async () => {
    const localState = createMockLiveTournamentState();
    saveActiveTournament(localState);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(createReadResponse("standard", scoreMockState("STEP_13_TEST Remote"))));

    render(<RemoteTournamentApp />);
    fireEvent.change(screen.getByLabelText("Turneringskode"), { target: { value: "K7M4XP" } });
    fireEvent.change(screen.getByLabelText("Adgangskode"), { target: { value: "4827" } });
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
    fireEvent.change(screen.getByLabelText("Adgangskode"), { target: { value: "1234" } });
    fireEvent.click(screen.getByRole("button", { name: "Åbn turnering fra anden enhed" }));
    expect(await screen.findByRole("heading", { name: "STEP_13_TEST Pool" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Puljestillinger" })).toBeInTheDocument();
    unmount();

    render(<RemoteTournamentApp />);
    fireEvent.change(screen.getByLabelText("Turneringskode"), { target: { value: "K7M4XP" } });
    fireEvent.change(screen.getByLabelText("Adgangskode"), { target: { value: "5678" } });
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

    expect(await screen.findByText("Enter the code and 4-digit access code from a tournament already shared from another device.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open tournament from another device" })).toBeInTheDocument();
  });

  it("switches the remote display into scoreboard mode for passive TV viewing", async () => {
    const remoteState = scoreMockState("STEP_19_TEST Scoreboard", 17, 7);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(createReadResponse("standard", remoteState)));

    render(<RemoteTournamentApp />);
    fireEvent.change(screen.getByLabelText("Turneringskode"), { target: { value: "K7M4XP" } });
    fireEvent.change(screen.getByLabelText("Adgangskode"), { target: { value: "1919" } });
    fireEvent.click(screen.getByRole("button", { name: "Åbn turnering fra anden enhed" }));

    expect(await screen.findByRole("heading", { name: "STEP_19_TEST Scoreboard" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Scoreboard-visning" }));

    expect(screen.getByRole("heading", { name: /LEZGO PADEL/ })).toBeInTheDocument();
    expect(screen.getByText("Americano")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Standardvisning" })).toBeInTheDocument();
    const liveScoreHeading = screen.getByRole("heading", { name: "Live score" });
    const standingsHeading = screen.getByRole("heading", { name: "Stilling" });
    expect(liveScoreHeading.compareDocumentPosition(standingsHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Kampe" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Næste kampe" })).not.toBeInTheDocument();
    expect(screen.getByText("Spiller")).toBeInTheDocument();
    expect(screen.getByText("MP")).toBeInTheDocument();
    expect(screen.getByText("Point")).toBeInTheDocument();
    expect(screen.getByText("17 - 7")).toBeInTheDocument();
    const firstCourtCard = screen.getAllByTestId("scoreboard-court-card")[0];
    expect(within(firstCourtCard).getByTestId("scoreboard-player-grid")).toHaveAttribute("data-match-area", "centered");
    expect(within(firstCourtCard).getByTestId("scoreboard-player-grid")).toHaveAttribute("data-match-area-width", "large");
    expect(within(firstCourtCard).getByTestId("scoreboard-player-grid")).toHaveAttribute("data-horizontal-layout", "33-50-67");
    expect(within(firstCourtCard).getByTestId("scoreboard-player-grid")).toHaveAttribute("data-player-size", "enlarged");
    expect(within(firstCourtCard).getByTestId("scoreboard-player-grid")).toHaveAttribute("data-vertical-position", "centered-in-card");
    expect(within(firstCourtCard).getByTestId("scoreboard-left-player-1")).toHaveTextContent("Anna");
    expect(within(firstCourtCard).getByTestId("scoreboard-left-player-1")).toHaveAttribute("data-position", "left-top");
    expect(within(firstCourtCard).getByTestId("scoreboard-left-player-1")).toHaveAttribute("data-team-align", "centered-at-left-third");
    expect(within(firstCourtCard).getByTestId("scoreboard-left-player-2")).toHaveTextContent("Hassan");
    expect(within(firstCourtCard).getByTestId("scoreboard-left-player-2")).toHaveAttribute("data-position", "left-bottom");
    expect(within(firstCourtCard).getByTestId("scoreboard-left-player-2")).toHaveAttribute("data-team-align", "centered-at-left-third");
    expect(within(firstCourtCard).getByTestId("scoreboard-vs")).toHaveTextContent("VS");
    expect(within(firstCourtCard).getByTestId("scoreboard-vs")).toHaveAttribute("data-position", "center-middle");
    expect(within(firstCourtCard).getByTestId("scoreboard-right-player-1")).toHaveTextContent("Maja");
    expect(within(firstCourtCard).getByTestId("scoreboard-right-player-1")).toHaveAttribute("data-position", "right-top");
    expect(within(firstCourtCard).getByTestId("scoreboard-right-player-1")).toHaveAttribute("data-team-align", "centered-at-right-third");
    expect(within(firstCourtCard).getByTestId("scoreboard-right-player-2")).toHaveTextContent("Noah");
    expect(within(firstCourtCard).getByTestId("scoreboard-right-player-2")).toHaveAttribute("data-position", "right-bottom");
    expect(within(firstCourtCard).getByTestId("scoreboard-right-player-2")).toHaveAttribute("data-team-align", "centered-at-right-third");
    expect(within(firstCourtCard).getByTestId("scoreboard-left-score")).toHaveTextContent("17");
    expect(within(firstCourtCard).getByTestId("scoreboard-left-score")).toHaveAttribute("data-score-align", "left-third-center");
    expect(within(firstCourtCard).getByTestId("scoreboard-left-score")).toHaveAttribute("data-name-score-spacing", "increased");
    expect(within(firstCourtCard).getByTestId("scoreboard-right-score")).toHaveTextContent("7");
    expect(within(firstCourtCard).getByTestId("scoreboard-right-score")).toHaveAttribute("data-score-align", "right-third-center");
    expect(within(firstCourtCard).getByTestId("scoreboard-right-score")).toHaveAttribute("data-name-score-spacing", "increased");
    expect(screen.queryByText("Alle spillere")).not.toBeInTheDocument();
    expect(screen.queryByText("Visning fra anden enhed - skrivebeskyttet")).not.toBeInTheDocument();
  });

  it.each([
    { courts: 2, density: "large", players: 8, standingsDensity: "large", title: "STEP_22E_TEST 8 players 2 courts" },
    { courts: 4, density: "medium", players: 16, standingsDensity: "medium", title: "STEP_22E_TEST 16 players 4 courts" },
    { courts: 6, density: "compact", players: 24, standingsDensity: "compact", title: "STEP_22E_TEST 24 players 6 courts" },
    { courts: 8, density: "high", players: 32, standingsDensity: "compact", title: "STEP_22E_TEST 32 players 8 courts" },
  ])("renders adaptive one-screen scoreboard density for $players players and $courts courts", async ({ courts, density, players, standingsDensity, title }) => {
    const remoteState = scoreAdaptiveScoreboardState(title, players, courts);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(createReadResponse("standard", remoteState)));

    render(<RemoteTournamentApp />);
    fireEvent.change(screen.getByLabelText("Turneringskode"), { target: { value: "K7M4XP" } });
    fireEvent.change(screen.getByLabelText("Adgangskode"), { target: { value: "2222" } });
    fireEvent.click(screen.getByRole("button", { name: "Åbn turnering fra anden enhed" }));

    expect(await screen.findByRole("heading", { name: title })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Scoreboard-visning" }));

    expect(screen.getByTestId("scoreboard-dashboard")).toHaveAttribute("data-layout-density", density);
    expect(screen.getByTestId("scoreboard-dashboard")).toHaveAttribute("data-standings-space", density === "high" ? "maximum" : "standard");
    expect(screen.getByTestId("scoreboard-dashboard")).toHaveAttribute("data-vertical-spacing", "tight");
    expect(screen.getByTestId("scoreboard-court-grid")).toHaveAttribute("data-density", density);
    expect(screen.getAllByTestId("scoreboard-court-card")).toHaveLength(courts);
    expect(screen.getAllByTestId("scoreboard-court-card").every((card) => card.getAttribute("data-card-vertical-density") === (density === "high" ? "final-compressed" : "standard"))).toBe(true);
    expect(screen.getAllByTestId("scoreboard-player-grid").every((grid) => grid.getAttribute("data-match-area") === "centered")).toBe(true);
    expect(screen.getAllByTestId("scoreboard-player-grid").every((grid) => grid.getAttribute("data-match-area-width") === density)).toBe(true);
    expect(screen.getAllByTestId("scoreboard-player-grid").every((grid) => grid.getAttribute("data-horizontal-layout") === "33-50-67")).toBe(true);
    expect(screen.getAllByTestId("scoreboard-player-grid").every((grid) => grid.getAttribute("data-player-size") === "enlarged")).toBe(true);
    expect(screen.getAllByTestId("scoreboard-player-grid").every((grid) => grid.getAttribute("data-vertical-position") === "centered-in-card")).toBe(true);
    expect(screen.getAllByTestId("scoreboard-vs")).toHaveLength(courts);
    for (let courtNumber = 1; courtNumber <= courts; courtNumber += 1) {
      expect(screen.getByText(`Bane ${courtNumber}`)).toBeInTheDocument();
    }
    expect(screen.getByTestId("scoreboard-standings-grid")).toHaveAttribute("data-density", standingsDensity);
    expect(screen.getByLabelText("Stilling")).toHaveAttribute("data-bottom-safe", "true");
    expect(screen.queryByText("Alle spillere")).not.toBeInTheDocument();
    expect(screen.queryByText("Visning fra anden enhed - skrivebeskyttet")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Indtast score" })).not.toBeInTheDocument();
  });

  it("keeps all 16 fixed-partner standings rows visible in the 8-court high-density structure", async () => {
    const remoteState = scoreFixedPartnerScoreboardState("STEP_22K_TEST 16 pairs 8 courts");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(createReadResponse("standard", remoteState)));

    render(<RemoteTournamentApp />);
    fireEvent.change(screen.getByLabelText("Turneringskode"), { target: { value: "K7M4XP" } });
    fireEvent.change(screen.getByLabelText("Adgangskode"), { target: { value: "2222" } });
    fireEvent.click(screen.getByRole("button", { name: "Åbn turnering fra anden enhed" }));

    expect(await screen.findByRole("heading", { name: "STEP_22K_TEST 16 pairs 8 courts" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Scoreboard-visning" }));

    expect(screen.getByTestId("scoreboard-dashboard")).toHaveAttribute("data-layout-density", "high");
    expect(screen.getByTestId("scoreboard-dashboard")).toHaveAttribute("data-standings-space", "maximum");
    expect(screen.getByTestId("scoreboard-court-grid")).toHaveAttribute("data-density", "high");
    expect(screen.getAllByTestId("scoreboard-court-card")).toHaveLength(8);
    expect(screen.getAllByTestId("scoreboard-court-card").every((card) => card.getAttribute("data-card-density") === "high")).toBe(true);
    expect(screen.getAllByTestId("scoreboard-court-card").every((card) => card.getAttribute("data-card-vertical-density") === "final-compressed")).toBe(true);
    expect(screen.getAllByTestId("scoreboard-player-grid").every((grid) => grid.getAttribute("data-match-area-width") === "high")).toBe(true);

    const standingsRows = screen.getAllByTestId("scoreboard-standings-row");
    expect(standingsRows).toHaveLength(16);
    for (let rank = 1; rank <= 16; rank += 1) {
      expect(screen.getByLabelText(new RegExp(`^${rank} .+ V \\d+ U \\d+ T \\d+ MP \\d+ Point \\d+$`))).toBeInTheDocument();
    }

    const standingsColumns = screen.getAllByTestId("scoreboard-standings-column");
    expect(standingsColumns).toHaveLength(2);
    expect(within(standingsColumns[0]).getAllByTestId("scoreboard-standings-row")).toHaveLength(8);
    expect(within(standingsColumns[1]).getAllByTestId("scoreboard-standings-row")).toHaveLength(8);
    expect(screen.queryByRole("button", { name: "Indtast score" })).not.toBeInTheDocument();
  });

  it("shows wins, draws and losses in TV standings without changing ranking, match points or scorepoints", async () => {
    const remoteState = scoreWdlScoreboardState("STEP_22F_TEST WDL");
    const expectedRows = calculateLiveStandings(remoteState).map((row) => `${row.rank} ${row.name} V ${row.wins} U ${row.draws} T ${row.losses} MP ${row.matchPoints} Point ${row.pointsFor}`);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(createReadResponse("standard", remoteState)));

    render(<RemoteTournamentApp />);
    fireEvent.change(screen.getByLabelText("Turneringskode"), { target: { value: "K7M4XP" } });
    fireEvent.change(screen.getByLabelText("Adgangskode"), { target: { value: "2222" } });
    fireEvent.click(screen.getByRole("button", { name: "Åbn turnering fra anden enhed" }));

    expect(await screen.findByRole("heading", { name: "STEP_22F_TEST WDL" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Scoreboard-visning" }));

    const standingsGrid = screen.getByTestId("scoreboard-standings-grid");
    expect(standingsGrid).toHaveTextContent("V");
    expect(standingsGrid).toHaveTextContent("U");
    expect(standingsGrid).toHaveTextContent("T");
    expectedRows.forEach((label) => {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    });
    expect(screen.getAllByLabelText(/^\d+ .+ V \d+ U \d+ T \d+ MP \d+ Point \d+$/).map((row) => row.getAttribute("aria-label"))).toEqual(expectedRows);
    expect(screen.queryByRole("button", { name: "Indtast score" })).not.toBeInTheDocument();
  });

  it("updates the scoreboard through the existing remote polling flow", async () => {
    vi.useFakeTimers();
    const initialRemoteState = scoreThreeRoundState("STEP_20_TEST Next Match", 17, 7);
    const updatedBaseState = {
      ...scoreThreeRoundState("STEP_20_TEST Next Match", 17, 7),
      activeRoundNumber: 2,
    };
    const updatedRemoteState = saveMatchResult(updatedBaseState, {
      matchId: updatedBaseState.rounds[1].matches[0].id,
      teamAPoints: 20,
      teamBPoints: 4,
    });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(createReadResponse("standard", initialRemoteState, "2026-08-13T12:00:00.000Z"))
      .mockResolvedValueOnce(createReadResponse("standard", updatedRemoteState, "2026-08-13T12:00:05.000Z")));

    render(<RemoteTournamentApp initialHandoffReference="STEP_20_TEST_REFERENCE_WITH_ENTROPY_1234567890" />);

    await flushPromises();
    fireEvent.click(screen.getByRole("button", { name: "Scoreboard-visning" }));
    expect(screen.getByText("17 - 7")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });

    expect(screen.getByText("20 - 4")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Runde 2 \/ 3/ })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Næste kampe" })).not.toBeInTheDocument();
    vi.useRealTimers();
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
    fireEvent.change(screen.getByLabelText("Adgangskode"), { target: { value: "1818" } });
    fireEvent.click(screen.getByRole("button", { name: "Åbn turnering fra anden enhed" }));

    expect(await screen.findByRole("heading", { name: "STEP_18_TEST TV Display" })).toBeInTheDocument();
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

  it("shows unsaved remote scores as a clear read-only status", async () => {
    const remoteState = { ...createMockLiveTournamentState(), tournamentName: "STEP_22D_TEST Unsaved" };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(createReadResponse("standard", remoteState)));

    render(<RemoteTournamentApp />);
    fireEvent.change(screen.getByLabelText("Turneringskode"), { target: { value: "K7M4XP" } });
    fireEvent.change(screen.getByLabelText("Adgangskode"), { target: { value: "2222" } });
    fireEvent.click(screen.getByRole("button", { name: "Åbn turnering fra anden enhed" }));

    expect(await screen.findByRole("heading", { name: "STEP_22D_TEST Unsaved" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Scoreboard-visning" }));

    const firstCourtCard = screen.getAllByTestId("scoreboard-court-card")[0];
    expect(within(firstCourtCard).getByTestId("scoreboard-left-player-1")).toHaveTextContent("Anna");
    expect(within(firstCourtCard).getByTestId("scoreboard-left-player-2")).toHaveTextContent("Hassan");
    expect(within(firstCourtCard).getByTestId("scoreboard-vs")).toHaveTextContent("VS");
    expect(within(firstCourtCard).getByTestId("scoreboard-right-player-1")).toHaveTextContent("Maja");
    expect(within(firstCourtCard).getByTestId("scoreboard-right-player-2")).toHaveTextContent("Noah");
    expect(within(firstCourtCard).getByTestId("scoreboard-unsaved-status")).toHaveTextContent("Ikke gemt");
    expect(within(firstCourtCard).getByTestId("scoreboard-unsaved-status")).toHaveAttribute("data-badge-position", "under-vs");
    expect(within(firstCourtCard).getByTestId("scoreboard-unsaved-status")).toHaveAttribute("data-name-score-spacing", "increased");
    expect(screen.queryByRole("button", { name: "Indtast score" })).not.toBeInTheDocument();
  });

  it("opens directly in scoreboard mode when the remote URL requests scoreboard display", async () => {
    window.history.pushState({}, "", "/remote/handoff/STEP_19_TEST_REFERENCE_WITH_ENTROPY_1234567890?display=scoreboard");
    const remoteState = scoreMockState("STEP_19_TEST Direct Scoreboard", 17, 7);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(createReadResponse("standard", remoteState, "2026-08-13T12:00:00.000Z", {
      remoteSessionToken: "STEP_19_REMOTE_SESSION_TOKEN",
      remoteSessionExpiresAt: "2026-08-14T00:00:00.000Z",
    })));

    render(<RemoteTournamentApp initialHandoffReference="STEP_19_TEST_REFERENCE_WITH_ENTROPY_1234567890" />);

    expect(await screen.findByRole("heading", { name: /STEP_19_TEST Direct Scoreboard/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Standardvisning" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Live score" })).toBeInTheDocument();
    expect(screen.queryByText("Visning fra anden enhed - skrivebeskyttet")).not.toBeInTheDocument();
  });

  it("provisions access from Device A with a visible 4-digit access code", async () => {
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
      shareToken: "0427",
    }), { status: 200 })));
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(<SyncStatusPanel kind="standard" localId="mock americano-americano" state={state} />);
    fireEvent.click(screen.getByRole("button", { name: "Adgang til anden enhed" }));

    expect(await screen.findByText("K7M4XP")).toBeInTheDocument();
    expect(screen.getByText("0427")).toBeInTheDocument();
    expect(screen.queryByText("************")).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Kopiér" })[1]);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("0427"));
  });

  it("renews access from Device A when an existing PIN cannot be shown again", async () => {
    const state = createMockLiveTournamentState();
    window.localStorage.setItem("lezgo.shadowSaveMetadata.v1", JSON.stringify({
      "mock americano-americano": {
        localId: "mock americano-americano",
        kind: "standard",
        status: "synced",
        supabaseTournamentId: "00000000-0000-4000-8000-000000000013",
      },
    }));
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        tournamentCode: "SXVQUX",
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        tournamentCode: "SXVQUX",
        shareToken: "4827",
      }), { status: 200 })));

    render(<SyncStatusPanel kind="standard" localId="mock americano-americano" state={state} />);
    fireEvent.click(screen.getByRole("button", { name: "Adgang til anden enhed" }));

    expect(await screen.findByText("SXVQUX")).toBeInTheDocument();
    expect(screen.getAllByText("Adgangskoden kunne ikke vises igen. Opret en ny adgang senere, hvis den er væk.").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Generér ny adgangskode" }));

    expect(await screen.findByText("4827")).toBeInTheDocument();
    expect(screen.queryByText("Adgangskoden kunne ikke vises igen. Opret en ny adgang senere, hvis den er væk.")).not.toBeInTheDocument();
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
    expect(screen.getByLabelText("Live-sync status")).toHaveTextContent("Genopretter forbindelse...");
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
      remoteSessionExpiresAt: "2099-08-14T00:00:00.000Z",
    }));
    const fetchMock = vi.fn().mockResolvedValueOnce(createReadResponse("standard", remoteState, "2026-08-13T12:00:05.000Z", {
      remoteSessionToken: "STEP_17_STORED_REMOTE_SESSION_TOKEN",
      remoteSessionExpiresAt: "2099-08-14T00:00:00.000Z",
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

function scoreThreeRoundState(name: string, teamAPoints = 17, teamBPoints = 7): LiveTournamentState {
  const state = createTournamentFromSetup({
    name,
    format: "Americano",
    playerText: Array.from({ length: 8 }, (_, index) => `Spiller ${index + 1}`).join("\n"),
    femalePlayerText: "",
    malePlayerText: "",
    courts: 2,
    rounds: 3,
    scoringMode: "Fast antal point",
    fixedScoreRule: "total",
    fixedScorePoints: 24,
    firstRoundOrder: "manual",
    rankingMode: "matchPointsFirst",
  });

  return saveMatchResult(state, { matchId: state.rounds[0].matches[0].id, teamAPoints, teamBPoints });
}

function createLongNameStandardState(name: string): LiveTournamentState {
  return createTournamentFromSetup({
    name,
    format: "Americano",
    playerText: [
      "Martin Langgaard",
      "Klaus Nord",
      "Lindon West",
      "Aqeel Sønder",
      "Ronni Vester",
      "Daniel Øster",
      "Hao Trinh",
      "Johnnie Midt",
    ].join("\n"),
    femalePlayerText: "",
    malePlayerText: "",
    courts: 2,
    rounds: 2,
    scoringMode: "Fast antal point",
    fixedScoreRule: "total",
    fixedScorePoints: 24,
    firstRoundOrder: "manual",
    rankingMode: "matchPointsFirst",
  });
}

function scoreAdaptiveScoreboardState(name: string, playerCount: number, courts: number): LiveTournamentState {
  const state = createTournamentFromSetup({
    name,
    format: "Americano",
    playerText: Array.from({ length: playerCount }, (_, index) => `Spiller ${index + 1}`).join("\n"),
    femalePlayerText: "",
    malePlayerText: "",
    courts,
    rounds: 2,
    scoringMode: "Fast antal point",
    fixedScoreRule: "total",
    fixedScorePoints: 24,
    firstRoundOrder: "manual",
    rankingMode: "matchPointsFirst",
  });

  return state.rounds[0].matches.reduce((currentState, match, index) => {
    const teamAPoints = 12 + index;
    const teamBPoints = 24 - teamAPoints;
    return saveMatchResult(currentState, { matchId: match.id, teamAPoints, teamBPoints });
  }, state);
}

function scoreFixedPartnerScoreboardState(name: string): LiveTournamentState {
  const state = createTournamentFromSetup({
    name,
    format: "Fast Makker Americano",
    playerText: Array.from({ length: 32 }, (_, index) => `Parspiller ${index + 1}`).join("\n"),
    femalePlayerText: "",
    malePlayerText: "",
    courts: 8,
    rounds: 2,
    scoringMode: "Fast antal point",
    fixedScoreRule: "total",
    fixedScorePoints: 24,
    firstRoundOrder: "manual",
    rankingMode: "matchPointsFirst",
  });

  return state.rounds[0].matches.reduce((currentState, match, index) => {
    const teamAPoints = 16 + index;
    const teamBPoints = 24 - teamAPoints;
    return saveMatchResult(currentState, { matchId: match.id, teamAPoints, teamBPoints });
  }, state);
}

function scoreWdlScoreboardState(name: string): LiveTournamentState {
  const state = createTournamentFromSetup({
    name,
    format: "Americano",
    playerText: Array.from({ length: 8 }, (_, index) => `Spiller ${index + 1}`).join("\n"),
    femalePlayerText: "",
    malePlayerText: "",
    courts: 2,
    rounds: 2,
    scoringMode: "Fri scoring",
    firstRoundOrder: "manual",
    rankingMode: "matchPointsFirst",
  });

  const firstRoundMatches = state.rounds[0].matches;
  const winLossState = saveMatchResult(state, { matchId: firstRoundMatches[0].id, teamAPoints: 12, teamBPoints: 9 });
  return saveMatchResult(winLossState, { matchId: firstRoundMatches[1].id, teamAPoints: 10, teamBPoints: 10 });
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
