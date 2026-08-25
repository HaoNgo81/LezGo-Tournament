import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TournamentListApp } from "../components/tournament/tournament-list-app";
import { advanceLivePoolPlayState, finishTournament, saveNextPoolPhaseResult } from "../lib/live-scoring";
import { createPoolTournamentFromSetup, createStandardShadowSaveLocalId, createTournamentFromSetup, loadActiveTournament, markCloudTournamentRestored, saveActiveTournament, saveCompletedTournament, type CompletedTournament } from "../lib/tournament-setup";

const sixteenPlayerText = Array.from({ length: 16 }, (_, index) => `Spiller ${index + 1}`).join("\n");
const routerPush = vi.fn();
let accountTournamentRows: AccountTournamentRow[] = [];

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush }),
}));

describe("TournamentListApp pool play", () => {
  beforeEach(() => {
    routerPush.mockReset();
    accountTournamentRows = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();

      if (url === "/api/auth/me") {
        return Response.json({
          ok: true,
          account: {
            userId: "00000000-0000-4000-8000-0000000000a1",
            email: "owner@example.com",
            displayName: "Owner",
            role: "user",
          },
        });
      }

      if (url === "/api/account/tournaments") {
        return Response.json({ ok: true, tournaments: accountTournamentRows });
      }

      return Response.json({ ok: false }, { status: 404 });
    }));
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("shows precise pool-play summaries for active and completed tournaments", async () => {
    const activeTournament = createPoolTournament("Aktiv pulje");
    const completedTournament = finishTournament(createPoolTournament("Afsluttet pulje"), "2026-08-04T18:00:00.000Z");

    saveActiveTournament(activeTournament);
    markOwnedStandardTournament(activeTournament, "00000000-0000-4000-8000-000000000101", "active");
    const completed = saveCompletedTournament(completedTournament);
    markOwnedCompletedTournament(completed, "00000000-0000-4000-8000-000000000102");
    render(<TournamentListApp />);

    expect(await screen.findByText("Aktiv pulje")).toBeInTheDocument();
    expect(screen.getByText("Puljespil · 4 par · 2 puljer · Krydskampe · Fri scoring")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Åbn live" })).toHaveAttribute("href", "/live");
    expect(screen.getByText(/Afsluttet · Puljespil · 4 par · 2 puljer/)).toBeInTheDocument();
  });
  it("shows final placements for completed pool-play tournaments", async () => {
    const completed = saveCompletedTournament(finishTournament(scoreIndividualOddPoolCrossMatchTournament(), "2026-08-04T18:00:00.000Z"));
    markOwnedCompletedTournament(completed, "00000000-0000-4000-8000-000000000103");

    render(<TournamentListApp />);

    expect(await screen.findByRole("heading", { name: "Slutplaceringer" })).toBeInTheDocument();
    expect(screen.getByText("1. Alpha")).toBeInTheDocument();
    expect(screen.getByText("5. Iben")).toBeInTheDocument();
    expect(screen.getAllByText("Placeringsspil 2").length).toBeGreaterThan(0);
  });

  it("shows completed standard five-round tournaments in history", async () => {
    const completed = saveCompletedTournament(finishTournament(createStandardTournament(), "2026-08-04T18:00:00.000Z"));
    markOwnedCompletedTournament(completed, "00000000-0000-4000-8000-000000000104");

    render(<TournamentListApp />);

    expect(await screen.findByText("Fast Makker Mexicano 16/4")).toBeInTheDocument();
    expect(screen.getByText(/Afsluttet .* 16 spillere/)).toBeInTheDocument();
  });

  it("opens a completed tournament from Se slutstilling as the selected read-only result state", async () => {
    const completedTournament = saveCompletedTournament(finishTournament(createStandardTournament("Se slutstilling test"), "2026-08-04T18:00:00.000Z"));
    markOwnedCompletedTournament(completedTournament, "00000000-0000-4000-8000-000000000105");

    render(<TournamentListApp />);

    const card = (await screen.findByText("Se slutstilling test")).closest("article");

    if (!card) {
      throw new Error("Missing completed tournament card.");
    }

    const finalLink = within(card).getByRole("link", { name: "Se slutstilling" });
    expect(finalLink).toHaveAttribute("href", "/finish");

    finalLink.click();

    expect(loadActiveTournament()).toMatchObject({
      status: "finished",
      finishedAt: completedTournament.finishedAt,
      tournamentName: "Se slutstilling test",
    });
  });

  it("classifies a finished tournament only under completed even when a stale active copy exists", async () => {
    const tournament = createStandardTournament("FIX 6");
    saveActiveTournament(tournament);
    const completed = saveCompletedTournament(finishTournament(tournament, "2026-08-24T12:00:00.000Z"));
    markOwnedCompletedTournament(completed, "00000000-0000-4000-8000-000000000106");

    render(<TournamentListApp />);

    await screen.findByRole("heading", { name: "Aktive" });
    const activeSection = getSectionByHeading("Aktive");
    const completedSection = getSectionByHeading("Afsluttet");

    expect(await within(completedSection).findByText("FIX 6")).toBeInTheDocument();
    expect(within(activeSection).queryByText("FIX 6")).not.toBeInTheDocument();
  });

  it("blocks stale active-list snapshots from duplicating completed tournaments after refresh", async () => {
    const tournament = createStandardTournament("Stale finished list copy");
    const staleActiveCopy = { ...tournament, status: "active" as const };
    const completed = saveCompletedTournament(finishTournament(tournament, "2026-08-24T12:10:00.000Z"));
    markOwnedCompletedTournament(completed, "00000000-0000-4000-8000-000000000107");
    window.localStorage.setItem("lezgo.activeTournaments.v1", JSON.stringify([staleActiveCopy]));

    render(<TournamentListApp />);

    await screen.findByRole("heading", { name: "Aktive" });
    const activeSection = getSectionByHeading("Aktive");
    const completedSection = getSectionByHeading("Afsluttet");

    expect(await within(completedSection).findByText("Stale finished list copy")).toBeInTheDocument();
    expect(within(activeSection).queryByText("Stale finished list copy")).not.toBeInTheDocument();
  });

  it("shows up to five active standard tournaments and opens the selected one", async () => {
    Array.from({ length: 5 }, (_, index) => createTournamentFromSetup({
      name: `Aktiv ${index + 1}`,
      format: "Americano",
      playerText: sixteenPlayerText,
      femalePlayerText: "",
      malePlayerText: "",
      courts: 4,
      rounds: 5,
      scoringMode: "Fri scoring",
      firstRoundOrder: "manual",
      rankingMode: "matchPointsFirst",
    })).forEach((tournament, index) => {
      saveActiveTournament(tournament);
      markOwnedStandardTournament(tournament, `00000000-0000-4000-8000-${(200 + index).toString().padStart(12, "0")}`, "active");
    });

    render(<TournamentListApp />);

    expect(await screen.findByText("Aktiv 5")).toBeInTheDocument();
    expect(screen.getByText("Aktiv 1")).toBeInTheDocument();

    screen.getAllByRole("link", { name: "Åbn live" }).at(-1)?.click();

    expect(loadActiveTournament()?.tournamentName).toBe("Aktiv 1");
  });

  it("hides all stale local tournaments while anonymous", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (input.toString() === "/api/auth/me") {
        return Response.json({ ok: false }, { status: 401 });
      }

      return Response.json({ ok: false }, { status: 401 });
    }));
    saveActiveTournament(createStandardTournament("User A private active"));
    saveCompletedTournament(finishTournament(createStandardTournament("User A private finished"), "2026-08-24T12:00:00.000Z"));

    render(<TournamentListApp />);

    expect(await screen.findByText("Log ind for at se dine turneringer.")).toBeInTheDocument();
    expect(screen.queryByText("User A private active")).not.toBeInTheDocument();
    expect(screen.queryByText("User A private finished")).not.toBeInTheDocument();
  });

  it("hides stale local tournaments that are not in the authenticated user's owned cloud list", async () => {
    const ownTournament = createStandardTournament("User A visible");
    const otherTournament = createStandardTournament("User B hidden");
    saveActiveTournament(ownTournament);
    markOwnedStandardTournament(ownTournament, "00000000-0000-4000-8000-000000000301", "active");
    saveActiveTournament(otherTournament);
    markCloudTournamentRestored({
      localId: createStandardShadowSaveLocalId(otherTournament),
      kind: "standard",
      tournamentId: "00000000-0000-4000-8000-000000000302",
    });

    render(<TournamentListApp />);

    expect(await screen.findByText("User A visible")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("User B hidden")).not.toBeInTheDocument());
  });

  it("shows the tournament list shell immediately while the owned cloud list is loading", async () => {
    const ownTournament = createStandardTournament("Fast local own tournament");
    saveActiveTournament(ownTournament);
    markOwnedStandardTournament(ownTournament, "00000000-0000-4000-8000-000000000401", "active");
    let resolveTournamentList: (response: Response) => void = () => undefined;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();

      if (url === "/api/auth/me") {
        throw new Error("/tournaments should not wait for /api/auth/me before loading owned tournaments.");
      }

      if (url === "/api/account/tournaments") {
        return await new Promise<Response>((resolve) => {
          resolveTournamentList = resolve;
        });
      }

      return Response.json({ ok: false }, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<TournamentListApp />);

    const activeSection = await screen.findByRole("heading", { name: "Aktive" });
    expect(activeSection).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Afsluttet" })).toBeInTheDocument();
    expect(screen.getAllByText("Indlæser turneringer...")).toHaveLength(2);
    expect(screen.queryByText("Fast local own tournament")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/account/tournaments", { cache: "no-store" });

    resolveTournamentList(Response.json({ ok: true, tournaments: accountTournamentRows }));

    expect(await screen.findByText("Fast local own tournament")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

interface AccountTournamentRow {
  id: string;
  name: string;
  format: string;
  status: "setup" | "active" | "finished";
  updatedAt: string;
  canManage: boolean;
  managementState: "controller" | "readOnly" | "completed";
}

function markOwnedStandardTournament(tournament: ReturnType<typeof createStandardTournament> | ReturnType<typeof createPoolTournament>, tournamentId: string, status: "active" | "finished") {
  const localId = createStandardShadowSaveLocalId(tournament);
  markCloudTournamentRestored({
    localId,
    kind: "standard",
    tournamentId,
  });
  accountTournamentRows.push({
    id: tournamentId,
    name: tournament.tournamentName,
    format: tournament.format,
    status,
    updatedAt: "2026-08-24T12:00:00.000Z",
    canManage: true,
    managementState: status === "finished" ? "completed" : "controller",
  });
}

function markOwnedCompletedTournament(completedTournament: CompletedTournament, tournamentId: string) {
  markOwnedStandardTournament(completedTournament.state, tournamentId, "finished");
}

function createPoolTournament(name: string) {
  return createPoolTournamentFromSetup({
    name,
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

function getSectionByHeading(name: string): HTMLElement {
  const heading = screen.getByRole("heading", { name });
  const section = heading.closest("section");

  if (!section) {
    throw new Error(`Missing section for ${name}`);
  }

  return section;
}

function createStandardTournament(name = "Fast Makker Mexicano 16/4") {
  return createTournamentFromSetup({
    name,
    format: "Fast Makker Mexicano",
    playerText: sixteenPlayerText,
    femalePlayerText: "",
    malePlayerText: "",
    courts: 4,
    rounds: 5,
    scoringMode: "Fri scoring",
    firstRoundOrder: "manual",
    rankingMode: "matchPointsFirst",
  });
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
              { matchId: match.id, teamAPoints: 10, teamBPoints: 8 },
            ],
          },
        };
      }
    }
  }

  return state;
}

function scoreIndividualOddPoolCrossMatchTournament() {
  let state = advanceLivePoolPlayState(createCompletedInitialOddPlayerPoolTournament());
  const matches = [
    ...(state.poolPlay?.crossMatchStage?.groups[0].americanoRounds.flatMap((round) => round.matches) ?? []),
    ...(state.poolPlay?.crossMatchStage?.unmatchedPlacementGroups[0].americanoRounds.flatMap((round) => round.matches) ?? []),
  ];

  if (matches.length !== 6) {
    throw new Error("Expected paired and unmatched Americano matches.");
  }

  [
    { teamAPoints: 30, teamBPoints: 0 },
    { teamAPoints: 20, teamBPoints: 5 },
    { teamAPoints: 10, teamBPoints: 15 },
    { teamAPoints: 30, teamBPoints: 0 },
    { teamAPoints: 20, teamBPoints: 5 },
    { teamAPoints: 10, teamBPoints: 15 },
  ].forEach((score, index) => {
    state = saveNextPoolPhaseResult(state, {
      matchId: matches[index].id,
      ...score,
    });
  });

  return state;
}
