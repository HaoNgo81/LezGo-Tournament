import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "../components/layout/app-shell";
import { LiveScoringApp } from "../components/tournament/live-scoring-app";
import { SyncStatusPanel } from "../components/tournament/sync-status-panel";
import { advanceLivePoolPlayState, createMockLiveTournamentState, saveMatchResult, saveNextPoolPhaseResult } from "../lib/live-scoring";
import { createPoolTournamentFromSetup, createStandardShadowSaveLocalId, createTournamentFromSetup, loadActiveTournament, loadShadowSaveMetadata, markActiveCloudTournamentAuthority, saveActiveTournament, saveActiveTournamentFromRemoteSync, type TournamentSetupFormat } from "../lib/tournament-setup";

const sixteenPlayerText = Array.from({ length: 16 }, (_, index) => `Spiller ${index + 1}`).join("\n");
const originalShadowSaveFlag = process.env.NEXT_PUBLIC_LEZGO_SUPABASE_SHADOW_SAVE;

describe("LiveScoringApp score sheet", () => {
  afterEach(() => {
    if (originalShadowSaveFlag === undefined) {
      delete process.env.NEXT_PUBLIC_LEZGO_SUPABASE_SHADOW_SAVE;
    } else {
      process.env.NEXT_PUBLIC_LEZGO_SUPABASE_SHADOW_SAVE = originalShadowSaveFlag;
    }
    vi.useRealTimers();
    vi.restoreAllMocks();
    cleanup();
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("opens new score fields empty and required", () => {
    saveActiveTournament(createMockLiveTournamentState());
    render(<LiveScoringApp />);

    fireEvent.click(screen.getAllByRole("button", { name: "Indtast score" })[0]);

    expect(screen.getByRole("textbox", { name: "Hold A scorepoint" })).toHaveValue("");
    expect(screen.getByRole("textbox", { name: "Hold B scorepoint" })).toHaveValue("");
    expect(screen.getByRole("textbox", { name: "Hold A scorepoint" })).toBeRequired();
    expect(screen.getByRole("textbox", { name: "Hold B scorepoint" })).toBeRequired();
  });

  it("shows standings heading, unified remote sharing and a bottom next button", async () => {
    saveActiveTournament(createMockLiveTournamentState());
    render(<LiveScoringApp />);

    expect(await screen.findByRole("heading", { name: "Stilling" })).toBeInTheDocument();
    expect(screen.getByLabelText("Sync status")).toHaveTextContent("Kun gemt lokalt");
    expect(screen.getByText("Del / vis på anden enhed")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "TV / Mirror" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Næste" })).toHaveLength(2);
  });

  it("uses a compact mobile header with combined round metrics and a protected more menu", async () => {
    const state = createStandardTournament("Mexicano");
    saveActiveTournament(state);
    render(<LiveScoringApp />);

    expect(await screen.findByText("Mexicano test")).toBeInTheDocument();

    const header = screen.getByTestId("live-compact-mobile-header");
    expect(header).toHaveClass("p-3", "sm:p-5");
    expect(within(header).getByText("16 spillere · 5 runder")).toBeInTheDocument();

    const summary = screen.getByTestId("live-mobile-round-summary");
    expect(summary).toHaveClass("grid-cols-3", "sm:contents");
    expect(within(summary).getByText("Runde")).toBeInTheDocument();
    expect(within(summary).getByText("Kampe")).toBeInTheDocument();
    expect(within(summary).getByText("Gemt")).toBeInTheDocument();
    expect(within(summary).getByText("1 / 5")).toBeInTheDocument();
    expect(within(summary).getByText("4")).toBeInTheDocument();
    expect(within(summary).getByText("0 / 4")).toBeInTheDocument();

    const roundCard = screen.getByTestId("live-round-navigation-card");
    expect(roundCard).toHaveClass("p-2.5", "sm:p-5");
    expect(within(roundCard).getByText("Alle kampe skal gemmes før næste runde.")).toBeInTheDocument();
    const roundActions = within(roundCard).getByTestId("live-round-navigation-actions");
    expect(roundActions).toHaveClass("grid-cols-2");
    const roundButtons = within(roundActions).getAllByRole("button");
    expect(roundButtons.map((button) => button.textContent)).toEqual(["Forrige", "Næste"]);
    expect(roundButtons[0]).toBeDisabled();

    const moreMenu = screen.getByTestId("live-mobile-more-menu");
    expect(moreMenu).toHaveClass("sm:hidden");
    expect(within(moreMenu).getByLabelText("Flere handlinger")).toBeInTheDocument();
    expect(within(moreMenu).getByRole("link", { name: "Afslut turnering" })).toHaveAttribute("href", "/finish");
  });

  it("keeps /live mobile compact while allowing a wider desktop shell", async () => {
    render(
      <AppShell title="Live turnering" subtitle="En skærm til runde, kampe, scoring og stilling." compactMobile>
        <p>Shell content</p>
      </AppShell>,
    );

    const shell = screen.getByRole("main");
    expect(shell).toHaveClass("max-w-4xl", "xl:max-w-6xl", "gap-3", "sm:gap-6");
  });

  it("uses a balanced desktop match and standings grid with natural player wrapping", async () => {
    saveActiveTournament(createStandardTournament("Mexicano"));
    render(<LiveScoringApp />);

    expect(await screen.findByText("Mexicano test")).toBeInTheDocument();
    expect(screen.getByTestId("live-desktop-content-grid")).toHaveClass("lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]");
    expect(screen.getByTestId("live-match-card-grid")).toHaveClass("xl:grid-cols-2");

    const playerLine = screen.getAllByTestId("live-court-left-player-1")[0];
    expect(playerLine).toHaveStyle({ overflowWrap: "break-word", wordBreak: "normal" });
    expect(playerLine).not.toHaveStyle({ overflowWrap: "anywhere" });
  });

  it("keeps synced sharing compact on mobile and exposes TV/access actions without the long UUID", async () => {
    const state = createStandardTournament("Mexicano");
    const localId = "step-24f-synced";
    saveShadowMetadata(localId, {
      kind: "standard",
      lastLocalSaveAt: "2026-08-13T12:00:00.000Z",
      lastShadowSaveVersion: "2026-08-13T12:00:00.000Z",
      lastSuccessfulShadowSaveAt: "2026-08-13T12:00:00.000Z",
      organizerToken: "STEP_24F_ORGANIZER_TOKEN",
      status: "synced",
      supabaseTournamentId: "00000000-0000-4000-8000-00000000024f",
    });

    render(<SyncStatusPanel kind="standard" localId={localId} state={state} />);

    const syncPanel = screen.getByTestId("live-sync-status-panel");
    expect(within(syncPanel).getByTestId("live-compact-sync-status")).toHaveTextContent("Synkroniseret");
    expect(within(syncPanel).getByRole("button", { name: "TV / Livescore" })).toBeInTheDocument();
    expect(within(syncPanel).getByRole("button", { name: "Scoreindtastning" })).toBeInTheDocument();
    expect(within(syncPanel).getByText("TV")).toHaveClass("sm:hidden");
    expect(within(syncPanel).getByText("Adgang")).toHaveClass("sm:hidden");
    expect(within(syncPanel).getByText(/Sidst synkroniseret/)).toHaveClass("hidden", "sm:block");
  });

  it("keeps sync errors visible in the compact mobile status", async () => {
    const state = createStandardTournament("Mexicano");
    const localId = "step-24f-sync-error";
    saveShadowMetadata(localId, {
      kind: "standard",
      lastError: "Supabase unavailable",
      lastLocalSaveAt: "2026-08-13T12:00:00.000Z",
      status: "error",
    });

    render(<SyncStatusPanel kind="standard" localId={localId} state={state} />);

    const syncPanel = screen.getByTestId("live-sync-status-panel");
    expect(within(syncPanel).getByText("Synkronisering fejlede")).toBeInTheDocument();
    expect(within(syncPanel).getByText("Synkronisering kunne ikke gennemføres. Dine lokale data er bevaret.")).not.toHaveClass("hidden");
    expect(within(syncPanel).queryByText(/Supabase unavailable/)).not.toBeInTheDocument();
    expect(within(syncPanel).getByRole("button", { name: "Prøv igen" })).toBeInTheDocument();
  });

  it("uses English compact labels when English is selected", async () => {
    window.localStorage.setItem("lezgo.tournamentSettings.v1", JSON.stringify({ language: "en" }));
    saveActiveTournament(createStandardTournament("Mexicano"));
    render(<LiveScoringApp />);

    expect(await screen.findByText("Mexicano test")).toBeInTheDocument();
    expect(await screen.findByLabelText("More actions")).toBeInTheDocument();
    expect(await screen.findByText("Saved")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Activate sharing" })).toBeInTheDocument();
    expect(screen.getByText("Share")).toHaveClass("sm:hidden");
  });

  it("uses the compact /live standings header without duplicate live score or sort label", async () => {
    const state = createTournamentFromSetup({
      name: "Live compact",
      format: "Americano",
      playerText: ["dfr", "sdfdsf", "ghil", "ghj", "dyx", "Aage My eng h", "Very Long Player Name", "Daniel"].join("\n"),
      femalePlayerText: "",
      malePlayerText: "",
      courts: 2,
      rounds: 2,
      scoringMode: "Fri scoring",
      firstRoundOrder: "manual",
      rankingMode: "partiPointsFirst",
    });
    const scoredState = saveMatchResult(state, {
      matchId: state.rounds[0].matches[0].id,
      teamAPoints: 100,
      teamBPoints: 98,
    });
    saveActiveTournament(scoredState);

    render(<LiveScoringApp />);

    expect(await screen.findByRole("heading", { name: "Live compact" })).toBeInTheDocument();
    const section = await screen.findByTestId("live-standings-section");
    expect(within(section).getByRole("heading", { name: "Stilling" })).toBeInTheDocument();
    expect(within(section).queryByRole("heading", { name: "Live score" })).not.toBeInTheDocument();
    expect(within(section).queryByText("Flest scorepoint")).not.toBeInTheDocument();
    expect(within(section).queryByText("Flest matchpoint")).not.toBeInTheDocument();

    const compactStandings = within(section).getByTestId("live-compact-standings");
    expect(compactStandings).toHaveAttribute("data-density", "compact-live");

    const playerHeader = within(compactStandings).getByTestId("live-standings-player-header");
    expect(playerHeader).toHaveStyle({ overflowWrap: "normal", wordBreak: "normal" });
    expect(playerHeader.parentElement?.className).toContain("minmax(7rem,1fr)");

    expect(compactStandings).toHaveTextContent("V");
    expect(compactStandings).toHaveTextContent("U");
    expect(compactStandings).toHaveTextContent("T");
    expect(compactStandings).toHaveTextContent("MP");
    expect(compactStandings).toHaveTextContent("Point");
    expect(compactStandings).toHaveTextContent("100");

    const rows = within(compactStandings).getAllByTestId("live-compact-standings-row");
    expect(rows.every((row) => row.getAttribute("data-column-layout") === "player-priority")).toBe(true);
    const playerNames = within(compactStandings).getAllByTestId("live-standings-player-name");
    expect(playerNames.map((name) => name.textContent)).toEqual(expect.arrayContaining(["dfr", "sdfdsf", "ghil", "ghj"]));
    playerNames.forEach((name) => {
      expect(name).toHaveStyle({ overflowWrap: "normal", wordBreak: "normal" });
    });
  });

  it("shows an existing score when a result is edited", async () => {
    const state = createMockLiveTournamentState();
    const matchId = state.rounds[0].matches[0].id;
    saveActiveTournament(saveMatchResult(state, { matchId, teamAPoints: 21, teamBPoints: 12 }));
    render(<LiveScoringApp />);

    fireEvent.click(await screen.findByRole("button", { name: "Rediger score" }));

    expect(screen.getByRole("textbox", { name: "Hold A scorepoint" })).toHaveValue("21");
    expect(screen.getByRole("textbox", { name: "Hold B scorepoint" })).toHaveValue("12");
  });

  it("pulls a newer remote score into the organizer live view without triggering a browser refresh", async () => {
    const localState = createTournamentFromSetup({
      name: "Organizer remote sync",
      format: "Mexicano",
      playerText: sixteenPlayerText,
      femalePlayerText: "",
      malePlayerText: "",
      courts: 4,
      rounds: 5,
      scoringMode: "Fast antal point",
      fixedScoreRule: "total",
      fixedScorePoints: 24,
      firstRoundOrder: "manual",
      rankingMode: "matchPointsFirst",
    });
    const remoteState = saveMatchResult(localState, {
      matchId: localState.rounds[0].matches[0].id,
      teamAPoints: 17,
      teamBPoints: 7,
    });
    const localId = createStandardShadowSaveLocalId(localState);
    saveActiveTournamentFromRemoteSync(localState);
    saveShadowMetadata(localId, {
      kind: "standard",
      lastLocalSaveAt: "2026-08-13T12:00:00.000Z",
      lastShadowSaveVersion: "2026-08-13T12:00:00.000Z",
      organizerToken: "STEP_24C_ORGANIZER_TOKEN",
      status: "synced",
      supabaseTournamentId: "00000000-0000-4000-8000-000000000240",
      matchScoreVersions: { [localState.rounds[0].matches[0].id]: 1 },
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      kind: "standard",
      state: remoteState,
      tournamentId: "00000000-0000-4000-8000-000000000240",
      updatedAt: "2026-08-13T12:00:05.000Z",
      matchScoreVersions: { [localState.rounds[0].matches[0].id]: 2 },
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<LiveScoringApp />);

    expect(await screen.findByText("Organizer remote sync")).toBeInTheDocument();
    expect(screen.queryByText("17 - 7")).not.toBeInTheDocument();

    await waitFor(() => expectLiveCourtScore("17", "7"), { timeout: 3500 });
    expect(screen.getByTestId("live-compact-standings")).toHaveTextContent("17");
    expect(fetchMock).toHaveBeenCalledWith("/api/account/tournaments/00000000-0000-4000-8000-000000000240", expect.objectContaining({
      cache: "no-store",
    }));
    expect(loadActiveTournament()?.results).toEqual([{ matchId: localState.rounds[0].matches[0].id, teamAPoints: 17, teamBPoints: 7 }]);
  }, 10000);

  it("saves an owned cloud match through the owner score API with the loaded score version", async () => {
    const localState = createMockLiveTournamentState();
    const matchId = localState.rounds[0].matches[1].id;
    const remoteState = saveMatchResult(localState, {
      matchId,
      teamAPoints: 14,
      teamBPoints: 9,
    });
    const localId = createStandardShadowSaveLocalId(localState);
    saveActiveTournamentFromRemoteSync(localState);
    saveShadowMetadata(localId, {
      kind: "standard",
      lastLocalSaveAt: "2026-08-19T12:00:00.000Z",
      lastShadowSaveVersion: "2026-08-19T12:00:00.000Z",
      status: "synced",
      supabaseTournamentId: "00000000-0000-4000-8000-000000000252",
      matchScoreVersions: { [matchId]: 3 },
    });
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = input.toString();

      if (url === "/api/account/tournaments/00000000-0000-4000-8000-000000000252/score") {
        return Promise.resolve(new Response(JSON.stringify({
          ok: true,
          kind: "standard",
          state: remoteState,
          tournamentId: "00000000-0000-4000-8000-000000000252",
          updatedAt: "2026-08-19T12:00:05.000Z",
          matchScoreVersions: { [matchId]: 4 },
        }), { status: 200 }));
      }

      return Promise.resolve(new Response(JSON.stringify({
        ok: true,
        kind: "standard",
        state: remoteState,
        tournamentId: "00000000-0000-4000-8000-000000000252",
        updatedAt: "2026-08-19T12:00:05.000Z",
        matchScoreVersions: { [matchId]: 4 },
      }), { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<LiveScoringApp />);

    expect(await screen.findByText("Mock Americano")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Indtast score" })[1]);
    fireEvent.change(screen.getByRole("textbox", { name: "Hold A scorepoint" }), { target: { value: "14" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Hold B scorepoint" }), { target: { value: "9" } });
    fireEvent.click(screen.getByRole("button", { name: "Gem" }));

    await waitFor(() => expectLiveCourtScore("14", "9", 1));
    expect(fetchMock).toHaveBeenCalledWith("/api/account/tournaments/00000000-0000-4000-8000-000000000252/score", expect.objectContaining({
      method: "POST",
      cache: "no-store",
    }));
    const scoreCall = (fetchMock.mock.calls as unknown as Array<[RequestInfo | URL, RequestInit?]>).find(
      (call) => call[0] === "/api/account/tournaments/00000000-0000-4000-8000-000000000252/score",
    );
    expect(JSON.parse(scoreCall?.[1]?.body as string)).toEqual({
      matchId,
      teamAPoints: 14,
      teamBPoints: 9,
      expectedScoreVersion: 3,
    });
    expect(fetchMock).not.toHaveBeenCalledWith("/api/supabase/shadow-save", expect.anything());
  }, 10000);

  it("opens a controller-transferred cloud tournament as read-only for the former creator", async () => {
    const localState = createMockLiveTournamentState();
    const localId = createStandardShadowSaveLocalId(localState);
    saveActiveTournamentFromRemoteSync(localState);
    markActiveCloudTournamentAuthority({
      source: "server",
      kind: "standard",
      localId,
      tournamentId: "00000000-0000-4000-8000-0000000008c8",
      canRead: true,
      canManage: false,
      createdByUserId: "00000000-0000-4000-8000-00000000aaa1",
      controllerUserId: "00000000-0000-4000-8000-00000000bbb2",
      ownerUserId: "00000000-0000-4000-8000-00000000aaa1",
    });
    saveShadowMetadata(localId, {
      canManage: true,
      kind: "standard",
      lastLocalSaveAt: "2026-08-20T12:00:00.000Z",
      lastShadowSaveVersion: "2026-08-20T12:00:00.000Z",
      status: "synced",
      supabaseTournamentId: "00000000-0000-4000-8000-0000000008c8",
      organizerToken: "STALE_CREATOR_ORGANIZER_TOKEN",
      matchScoreVersions: { [localState.rounds[0].matches[0].id]: 1 },
    });

    render(<LiveScoringApp />);

    await waitFor(() => expect(screen.getAllByText("Du har ikke længere styring af denne turnering.").length).toBeGreaterThan(0));
    expect(screen.getByText("Du kan stadig se turneringen, men du kan ikke længere ændre den.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Indtast score" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Aktivér deling" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Prøv igen" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Afslut turnering" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Næste" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Stilling" })).toBeInTheDocument();
    expect(screen.getAllByTestId("live-court-card")).toHaveLength(localState.rounds[0].matches.length);
  });

  it("moves a stale controller to read-only when the owner score API denies a write", async () => {
    const localState = createMockLiveTournamentState();
    const matchId = localState.rounds[0].matches[1].id;
    const localId = createStandardShadowSaveLocalId(localState);
    saveActiveTournamentFromRemoteSync(localState);
    markActiveCloudTournamentAuthority({
      source: "server",
      kind: "standard",
      localId,
      tournamentId: "00000000-0000-4000-8000-0000000009d9",
      canRead: true,
      canManage: true,
      createdByUserId: "00000000-0000-4000-8000-00000000aaa1",
      controllerUserId: "00000000-0000-4000-8000-00000000aaa1",
      ownerUserId: "00000000-0000-4000-8000-00000000aaa1",
    });
    saveShadowMetadata(localId, {
      canManage: true,
      kind: "standard",
      lastLocalSaveAt: "2026-08-23T12:00:00.000Z",
      lastShadowSaveVersion: "2026-08-23T12:00:00.000Z",
      status: "synced",
      supabaseTournamentId: "00000000-0000-4000-8000-0000000009d9",
      organizerToken: "STALE_CREATOR_ORGANIZER_TOKEN",
      matchScoreVersions: { [matchId]: 1 },
    });
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = input.toString();

      if (url === "/api/account/tournaments/00000000-0000-4000-8000-0000000009d9/score") {
        return Promise.resolve(new Response(JSON.stringify({
          ok: false,
          error: "Du har ikke længere styring af denne turnering.",
        }), { status: 403 }));
      }

      return Promise.resolve(new Response(JSON.stringify({ ok: false }), { status: 500 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<LiveScoringApp />);

    expect(await screen.findByText("Mock Americano")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Indtast score" })[1]);
    fireEvent.change(screen.getByRole("textbox", { name: "Hold A scorepoint" }), { target: { value: "14" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Hold B scorepoint" }), { target: { value: "9" } });
    fireEvent.click(screen.getByRole("button", { name: "Gem" }));

    await waitFor(() => expect(screen.getAllByText("Du har ikke længere styring af denne turnering.").length).toBeGreaterThan(0));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Indtast score" })).not.toBeInTheDocument());
    expect(loadShadowSaveMetadata(localId)).toMatchObject({
      canManage: false,
      supabaseTournamentId: "00000000-0000-4000-8000-0000000009d9",
    });
    expect(loadShadowSaveMetadata(localId)?.organizerToken).toBeUndefined();
    expect(JSON.parse(window.sessionStorage.getItem("lezgo.activeCloudTournamentAuthority.v1") ?? "{}")).toMatchObject({
      canManage: false,
      tournamentId: "00000000-0000-4000-8000-0000000009d9",
    });
  }, 10000);

  it("keeps a local tournament fully manageable without cloud authority", async () => {
    const localState = createMockLiveTournamentState();
    saveActiveTournament(localState);

    render(<LiveScoringApp />);

    expect(await screen.findByText("Mock Americano")).toBeInTheDocument();
    expect(screen.queryByTestId("controller-read-only-notice")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Indtast score" })).toHaveLength(localState.rounds[0].matches.length);
    expect(screen.getByRole("button", { name: "Aktivér deling" })).toBeInTheDocument();
  });

  it("starts organizer polling after sharing is activated on an already mounted local tournament", async () => {
    delete process.env.NEXT_PUBLIC_LEZGO_SUPABASE_SHADOW_SAVE;
    const localState = createTournamentFromSetup({
      name: "Mounted sharing sync",
      format: "Mexicano",
      playerText: sixteenPlayerText,
      femalePlayerText: "",
      malePlayerText: "",
      courts: 4,
      rounds: 5,
      scoringMode: "Fast antal point",
      fixedScoreRule: "total",
      fixedScorePoints: 24,
      firstRoundOrder: "manual",
      rankingMode: "matchPointsFirst",
    });
    const remoteState = saveMatchResult(localState, {
      matchId: localState.rounds[0].matches[0].id,
      teamAPoints: 19,
      teamBPoints: 5,
    });
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = input.toString();

      if (url === "/api/supabase/shadow-save") {
        return Promise.resolve(new Response(JSON.stringify({
          ok: true,
          saveMode: "insert",
          tournamentId: "00000000-0000-4000-8000-000000000242",
          organizerToken: "STEP_24C_ORGANIZER_TOKEN",
          updatedAt: "2026-08-13T12:00:00.000Z",
        }), { status: 200 }));
      }

      if (url === "/api/supabase/organizer-tournament/read") {
        return Promise.resolve(new Response(JSON.stringify({
          ok: true,
          kind: "standard",
          state: remoteState,
          tournamentId: "00000000-0000-4000-8000-000000000242",
          updatedAt: "2026-08-13T12:00:05.000Z",
        }), { status: 200 }));
      }

      return Promise.resolve(new Response(JSON.stringify({ ok: false, error: `Unexpected URL ${url}` }), { status: 500 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    saveActiveTournament(localState);
    render(<LiveScoringApp />);

    expect(await screen.findByText("Mounted sharing sync")).toBeInTheDocument();
    expect(screen.getByLabelText("Sync status")).toHaveTextContent("Kun gemt lokalt");

    process.env.NEXT_PUBLIC_LEZGO_SUPABASE_SHADOW_SAVE = "1";
    fireEvent.click(screen.getByRole("button", { name: "Aktivér deling" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Scoreindtastning" })).toBeInTheDocument());
    await waitFor(() => expectLiveCourtScore("19", "5"), { timeout: 3500 });

    expect(fetchMock).toHaveBeenCalledWith("/api/supabase/shadow-save", expect.objectContaining({
      method: "POST",
    }));
    expect(fetchMock).toHaveBeenCalledWith("/api/supabase/organizer-tournament/read", expect.objectContaining({
      cache: "no-store",
      method: "POST",
    }));
  }, 10000);

  it("pulls a newer remote score edit into the organizer live view", async () => {
    const baseState = createTournamentFromSetup({
      name: "Organizer remote edit sync",
      format: "Fast Makker Mexicano",
      playerText: sixteenPlayerText,
      femalePlayerText: "",
      malePlayerText: "",
      courts: 4,
      rounds: 5,
      scoringMode: "Fast antal point",
      fixedScoreRule: "total",
      fixedScorePoints: 24,
      firstRoundOrder: "manual",
      rankingMode: "matchPointsFirst",
    });
    const localState = saveMatchResult(baseState, {
      matchId: baseState.rounds[0].matches[0].id,
      teamAPoints: 17,
      teamBPoints: 7,
    });
    const remoteEditedState = saveMatchResult(baseState, {
      matchId: baseState.rounds[0].matches[0].id,
      teamAPoints: 15,
      teamBPoints: 9,
    });
    const localId = createStandardShadowSaveLocalId(localState);
    saveActiveTournamentFromRemoteSync(localState);
    saveShadowMetadata(localId, {
      kind: "standard",
      lastLocalSaveAt: "2026-08-13T12:00:00.000Z",
      lastShadowSaveVersion: "2026-08-13T12:00:00.000Z",
      organizerToken: "STEP_24C_ORGANIZER_TOKEN",
      status: "synced",
      supabaseTournamentId: "00000000-0000-4000-8000-000000000241",
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      kind: "standard",
      state: remoteEditedState,
      tournamentId: "00000000-0000-4000-8000-000000000241",
      updatedAt: "2026-08-13T12:00:06.000Z",
    }), { status: 200 })));

    render(<LiveScoringApp />);

    expect(await screen.findByText("Organizer remote edit sync")).toBeInTheDocument();
    expectLiveCourtScore("17", "7");

    await waitFor(() => expectLiveCourtScore("15", "9"), { timeout: 3500 });
    expect(screen.queryByText("17 - 7")).not.toBeInTheDocument();
  }, 10000);

  it("calculates the opponent score from one input for fixed total scoring", async () => {
    saveActiveTournament(createFixedPartnerAmericanoTotalScoreTournament());
    render(<LiveScoringApp />);

    fireEvent.click(await screen.findAllByRole("button", { name: "Indtast score" }).then((buttons) => buttons[0]));
    fireEvent.change(screen.getByRole("textbox", { name: "Hold A scorepoint" }), { target: { value: "18" } });

    expect(screen.getByLabelText("Hold B scorepoint")).toHaveTextContent("6");
    expect(screen.queryByRole("textbox", { name: "Hold B scorepoint" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Gem" }));

    await waitFor(() => expectLiveCourtScore("18", "6"));
  });

  it("calculates the opponent score for Mixed Americano fixed total scoring", async () => {
    saveActiveTournament(createMixedAmericanoTotalScoreTournament());
    render(<LiveScoringApp />);

    fireEvent.click(await screen.findAllByRole("button", { name: "Indtast score" }).then((buttons) => buttons[0]));
    fireEvent.change(screen.getByRole("textbox", { name: "Hold A scorepoint" }), { target: { value: "17" } });

    expect(screen.getByLabelText("Hold B scorepoint")).toHaveTextContent("7");
    fireEvent.click(screen.getByRole("button", { name: "Gem" }));

    await waitFor(() => expectLiveCourtScore("17", "7"));
  });

  it("shows validation instead of crashing for invalid fixed total scoring", async () => {
    saveActiveTournament(createFixedPartnerAmericanoTotalScoreTournament());
    render(<LiveScoringApp />);

    fireEvent.click(await screen.findAllByRole("button", { name: "Indtast score" }).then((buttons) => buttons[0]));
    fireEvent.change(screen.getByRole("textbox", { name: "Hold A scorepoint" }), { target: { value: "25" } });

    expect(screen.getByText("Scoren skal være mellem 0 og 24.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Gem" })).toBeDisabled();
  });

  it("shows target score validation instead of the runtime error page", async () => {
    saveActiveTournament(createFixedPartnerAmericanoTargetScoreTournament());
    render(<LiveScoringApp />);

    fireEvent.click(await screen.findAllByRole("button", { name: "Indtast score" }).then((buttons) => buttons[0]));
    fireEvent.change(screen.getByRole("textbox", { name: "Hold A scorepoint" }), { target: { value: "17" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Hold B scorepoint" }), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "Gem" }));

    expect(await screen.findByText((content) => content.includes("Ved Spil til 21"))).toBeInTheDocument();
    expect(screen.queryByText("17 - 4")).not.toBeInTheDocument();
  });

  it("opens the next Mexicano round from the live player standings", async () => {
    saveActiveTournament(createStandardTournament("Mexicano"));
    render(<LiveScoringApp />);

    expect(await screen.findByText("1 / 5")).toBeInTheDocument();
    scoreVisibleRound();
    fireEvent.click(screen.getAllByRole("button", { name: "Næste" })[0]);

    expect(screen.getByText("Næste runde åbnet.")).toBeInTheDocument();
    expect(screen.getByText("2 / 5")).toBeInTheDocument();
    expect(screen.getAllByText("Spiller 1").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Spiller 5").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Spiller 3").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Spiller 7").length).toBeGreaterThan(0);
    expect(screen.queryByText("Spiller 1 / Spiller 5")).not.toBeInTheDocument();
  });

  it("opens the next round from the bottom next button below live score", async () => {
    saveActiveTournament(createStandardTournament("Americano"));
    render(<LiveScoringApp />);

    expect(await screen.findByText("1 / 5")).toBeInTheDocument();
    scoreVisibleRound();
    const bottomNavigation = screen.getByTestId("live-bottom-round-navigation");
    expect(bottomNavigation).toHaveClass("grid-cols-2");
    const bottomButtons = within(bottomNavigation).getAllByRole("button");
    expect(bottomButtons.map((button) => button.textContent)).toEqual(["Forrige", "Næste"]);
    expect(bottomButtons[0]).toBeDisabled();
    fireEvent.click(within(bottomNavigation).getByRole("button", { name: "Næste" }));

    expect(screen.getByText("Næste runde åbnet.")).toBeInTheDocument();
    expect(screen.getByText("2 / 5")).toBeInTheDocument();
  });

  it("opens the previous round from the bottom standings navigation", async () => {
    saveActiveTournament(createStandardTournament("Americano"));
    render(<LiveScoringApp />);

    expect(await screen.findByText("1 / 5")).toBeInTheDocument();
    scoreVisibleRound();
    fireEvent.click(screen.getAllByRole("button", { name: "Næste" })[0]);

    expect(screen.getByText("2 / 5")).toBeInTheDocument();
    fireEvent.click(within(screen.getByTestId("live-bottom-round-navigation")).getByRole("button", { name: "Forrige" }));

    expect(screen.getByText("1 / 5")).toBeInTheDocument();
  });

  it("opens the next Fast Makker Mexicano round from the live pair standings", async () => {
    saveActiveTournament(createStandardTournament("Fast Makker Mexicano"));
    render(<LiveScoringApp />);

    expect(await screen.findByText("1 / 5")).toBeInTheDocument();
    scoreVisibleRound();
    fireEvent.click(screen.getAllByRole("button", { name: "Næste" })[0]);

    expect(screen.getByText("Næste runde åbnet.")).toBeInTheDocument();
    expect(screen.getByText("2 / 5")).toBeInTheDocument();
    expect(screen.getAllByText("Spiller 1 / Spiller 2").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Spiller 5 / Spiller 6").length).toBeGreaterThan(0);
  });

  it("locks ranking mode on live Fast Makker Mexicano tournaments", async () => {
    saveActiveTournament(createStandardTournament("Fast Makker Mexicano", { rankingMode: "partiPointsFirst" }));
    render(<LiveScoringApp />);

    expect(await screen.findByText("Fast Makker Mexicano test")).toBeInTheDocument();
    expect(screen.getAllByText((content) => content.includes("scorepoint")).length).toBeGreaterThan(0);
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("scores initial pool matches from a pool-play tournament", async () => {
    saveActiveTournament(createPoolTournament());
    render(<LiveScoringApp />);

    expect(await screen.findByRole("heading", { name: "Puljekampe" })).toBeInTheDocument();
    expect(screen.getByText("Puljespil · 4 deltagere · 2 puljer")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Indtast score" })[0]);
    fireEvent.change(screen.getByRole("textbox", { name: "Hold A scorepoint" }), { target: { value: "21" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Hold B scorepoint" }), { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: "Gem" }));

    expect(screen.getByText("Puljeresultat gemt.")).toBeInTheDocument();
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
    expect(screen.getByText("21 - 12")).toBeInTheDocument();
  });

  it("creates the cross-match stage after all initial pool matches are saved", async () => {
    saveActiveTournament(createCompletedInitialPoolTournament());
    render(<LiveScoringApp />);

    expect(await screen.findByText("2 / 2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Opret næste fase" }));

    expect(screen.getByText("Næste fase oprettet.")).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { name: "Krydskampe" }).length).toBeGreaterThan(0);
  });

  it("scores cross matches after the next phase is created", async () => {
    saveActiveTournament(createCompletedInitialPoolTournament());
    render(<LiveScoringApp />);

    expect(await screen.findByText("2 / 2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Opret næste fase" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Indtast score" })[0]);
    fireEvent.change(screen.getByRole("textbox", { name: "Hold A scorepoint" }), { target: { value: "21" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Hold B scorepoint" }), { target: { value: "18" } });
    fireEvent.click(screen.getByRole("button", { name: "Gem" }));

    expect(screen.getByText("Næste faseresultat gemt.")).toBeInTheDocument();
    expect(screen.getAllByText("1 / 2").length).toBeGreaterThan(0);
    expect(screen.getByText("21 - 18")).toBeInTheDocument();
  });

  it("creates and scores finals after completed cross matches", async () => {
    saveActiveTournament(createCompletedInitialPoolTournament());
    render(<LiveScoringApp />);

    expect(await screen.findByText("2 / 2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Opret næste fase" }));

    fireEvent.click(screen.getAllByRole("button", { name: "Indtast score" })[0]);
    fireEvent.change(screen.getByRole("textbox", { name: "Hold A scorepoint" }), { target: { value: "21" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Hold B scorepoint" }), { target: { value: "18" } });
    fireEvent.click(screen.getByRole("button", { name: "Gem" }));

    fireEvent.click(screen.getAllByRole("button", { name: "Indtast score" })[0]);
    fireEvent.change(screen.getByRole("textbox", { name: "Hold A scorepoint" }), { target: { value: "17" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Hold B scorepoint" }), { target: { value: "21" } });
    fireEvent.click(screen.getByRole("button", { name: "Gem" }));

    fireEvent.click(screen.getByRole("button", { name: "Opret finaler" }));

    expect(screen.getByText("Finaler oprettet.")).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { name: "Finaler" }).length).toBeGreaterThan(0);
    expect(screen.getByText("Finale")).toBeInTheDocument();
    expect(screen.getByText("Bronzekamp")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Indtast score" })[0]);
    fireEvent.change(screen.getByRole("textbox", { name: "Hold A scorepoint" }), { target: { value: "21" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Hold B scorepoint" }), { target: { value: "19" } });
    fireEvent.click(screen.getByRole("button", { name: "Gem" }));

    expect(screen.getByText("Finaleresultat gemt.")).toBeInTheDocument();
    expect(screen.getByText("21 - 19")).toBeInTheDocument();
  });

  it("stores match tiebreak winners for tied pool-play matches", async () => {
    saveActiveTournament(createCompletedInitialPoolTournament());
    render(<LiveScoringApp />);

    expect(await screen.findByText("2 / 2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Opret næste fase" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Indtast score" })[0]);
    fireEvent.change(screen.getByRole("textbox", { name: "Hold A scorepoint" }), { target: { value: "20" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Hold B scorepoint" }), { target: { value: "20" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Match tiebreak" }), { target: { value: "teamB" } });
    fireEvent.click(screen.getByRole("button", { name: "Gem" }));

    fireEvent.click(screen.getAllByRole("button", { name: "Indtast score" })[0]);
    fireEvent.change(screen.getByRole("textbox", { name: "Hold A scorepoint" }), { target: { value: "17" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Hold B scorepoint" }), { target: { value: "21" } });
    fireEvent.click(screen.getByRole("button", { name: "Gem" }));

    expect(screen.getByText("20 - 20 (MTB: hold B)")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Opret finaler" }));

    expect(screen.getByText("Finaler oprettet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Par D vs Par C -" })).toBeInTheDocument();
  });

  it("scores separate placement tiebreaks for individual Americano cross-play ties", async () => {
    saveActiveTournament(scoreIndividualCrossMatchAmericanoTournament());
    render(<LiveScoringApp />);

    expect(await screen.findByRole("heading", { name: "Tiebreak om placering" })).toBeInTheDocument();
    expect(screen.getByText("Tiebreak om 2. / 3. plads")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Indtast score" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Hold A scorepoint" }), { target: { value: "10" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Hold B scorepoint" }), { target: { value: "7" } });
    fireEvent.click(screen.getByRole("button", { name: "Gem" }));

    expect(screen.getByText("Tiebreak-resultat gemt.")).toBeInTheDocument();
    expect(screen.getByText("10 - 7")).toBeInTheDocument();
  });

  it("shows unmatched final player pool placement play in live scoring", async () => {
    saveActiveTournament(advanceLivePoolPlayState(createCompletedInitialOddPlayerPoolTournament()));
    render(<LiveScoringApp />);

    expect((await screen.findAllByText("Placeringsspil 2")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("0 / 6").length).toBeGreaterThan(0);
    expect(screen.getByText("Pulje 3 · placering 5-8")).toBeInTheDocument();
    expect(screen.getAllByText("Iben / Liam").length).toBeGreaterThan(0);
  });
});

function createStandardTournament(format: TournamentSetupFormat, overrides: Partial<Parameters<typeof createTournamentFromSetup>[0]> = {}) {
  return createTournamentFromSetup({
    name: `${format} test`,
    format,
    playerText: sixteenPlayerText,
    femalePlayerText: "",
    malePlayerText: "",
    courts: 4,
    rounds: 5,
    scoringMode: "Fri scoring",
    firstRoundOrder: "manual",
    rankingMode: "matchPointsFirst",
    ...overrides,
  });
}

function createFixedPartnerAmericanoTotalScoreTournament() {
  return createTournamentFromSetup({
    name: "Fast Makker Americano total",
    format: "Fast Makker Americano",
    playerText: sixteenPlayerText,
    femalePlayerText: "",
    malePlayerText: "",
    courts: 4,
    rounds: 8,
    scoringMode: "Fast antal point",
    fixedScoreRule: "total",
    fixedScorePoints: 24,
    firstRoundOrder: "manual",
    rankingMode: "matchPointsFirst",
  });
}

function createFixedPartnerAmericanoTargetScoreTournament() {
  return createTournamentFromSetup({
    name: "Fast Makker Americano target",
    format: "Fast Makker Americano",
    playerText: sixteenPlayerText,
    femalePlayerText: "",
    malePlayerText: "",
    courts: 4,
    rounds: 8,
    scoringMode: "Fast antal point",
    fixedScoreRule: "target",
    fixedScorePoints: 21,
    firstRoundOrder: "manual",
    rankingMode: "matchPointsFirst",
  });
}

function createMixedAmericanoTotalScoreTournament() {
  return createTournamentFromSetup({
    name: "Mixed Americano total",
    format: "Mixed Americano",
    playerText: "",
    femalePlayerText: Array.from({ length: 8 }, (_, index) => `Kvinde ${index + 1}`).join("\n"),
    malePlayerText: Array.from({ length: 8 }, (_, index) => `Mand ${index + 1}`).join("\n"),
    courts: 4,
    rounds: 8,
    scoringMode: "Fast antal point",
    fixedScoreRule: "total",
    fixedScorePoints: 24,
    firstRoundOrder: "manual",
    rankingMode: "matchPointsFirst",
  });
}

function scoreVisibleRound() {
  for (let matchIndex = 0; matchIndex < 4; matchIndex += 1) {
    fireEvent.click(screen.getAllByRole("button", { name: "Indtast score" })[0]);
    fireEvent.change(screen.getByRole("textbox", { name: "Hold A scorepoint" }), { target: { value: "21" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Hold B scorepoint" }), { target: { value: `${10 + matchIndex}` } });
    fireEvent.click(screen.getByRole("button", { name: "Gem" }));
  }
}

function expectLiveCourtScore(teamA: string, teamB: string, cardIndex = 0): HTMLElement {
  const card = screen.getAllByTestId("live-court-card")[cardIndex];
  const scoreRow = within(card).getByTestId("live-court-score-row");

  expect(scoreRow).toHaveAttribute("data-layout", "split-scoreboard-symmetric");
  expect(within(scoreRow).getByTestId("live-court-left-score")).toHaveTextContent(teamA);
  expect(within(scoreRow).getByTestId("live-court-score-separator")).toHaveTextContent("-");
  expect(within(scoreRow).getByTestId("live-court-right-score")).toHaveTextContent(teamB);

  return card;
}

function saveShadowMetadata(localId: string, metadata: Record<string, unknown>): void {
  const ids = Array.from(new Set([localId, localId.toLocaleLowerCase("da")]));
  window.localStorage.setItem("lezgo.shadowSaveMetadata.v1", JSON.stringify(Object.fromEntries(
    ids.map((id) => [id, {
      localId: id,
      ...metadata,
    }]),
  )));
}

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

function createCompletedInitialPlayerPoolTournament() {
  let state = createPoolTournamentFromSetup({
    name: "Individuel pulje",
    participantType: "player",
    participantText: ["Alpha", "Birk", "Clara", "David", "Echo", "Freja", "Greta", "Helge"].join("\n"),
    poolCount: 2,
    participantsPerPool: 4,
    advancementMode: "crossMatches",
    unmatchedResolution: "bye",
    scoringMode: "Fri scoring",
    rankingMode: "matchPointsFirst",
  });
  const poolPlay = state.poolPlay;

  if (!poolPlay) {
    throw new Error("Pool play state was not created.");
  }

  for (const pool of poolPlay.initialStage.pools) {
    for (const round of pool.americanoRounds) {
      for (const match of round.matches) {
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
              { matchId: match.id, teamAPoints: 10, teamBPoints: 10 },
            ],
          },
        };
      }
    }
  }

  return state;
}

function scoreIndividualCrossMatchAmericanoTournament() {
  let state = advanceLivePoolPlayState(createCompletedInitialPlayerPoolTournament());
  const matches = state.poolPlay?.crossMatchStage?.groups[0].americanoRounds.flatMap((round) => round.matches);

  if (!matches) {
    throw new Error("Cross-match Americano rounds were not created.");
  }

  [
    { teamAPoints: 20, teamBPoints: 20 },
    { teamAPoints: 20, teamBPoints: 10 },
    { teamAPoints: 20, teamBPoints: 10 },
  ].forEach((score, index) => {
    state = saveNextPoolPhaseResult(state, {
      matchId: matches[index].id,
      ...score,
    });
  });

  return state;
}

function createCompletedInitialOddPlayerPoolTournament() {
  let state = createPoolTournamentFromSetup({
    name: "Ulige individuel pulje",
    participantType: "player",
    participantText: ["Alpha", "Birk", "Clara", "David", "Echo", "Freja", "Greta", "Helge", "Iben", "Jens", "Karla", "Liam"].join("\n"),
    poolCount: 3,
    participantsPerPool: 4,
    advancementMode: "crossMatches",
    unmatchedResolution: "bye",
    scoringMode: "Fri scoring",
    rankingMode: "matchPointsFirst",
  });
  const poolPlay = state.poolPlay;

  if (!poolPlay) {
    throw new Error("Pool play state was not created.");
  }

  for (const pool of poolPlay.initialStage.pools) {
    for (const round of pool.americanoRounds) {
      for (const match of round.matches) {
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
              { matchId: match.id, teamAPoints: 10, teamBPoints: 10 },
            ],
          },
        };
      }
    }
  }

  return state;
}
