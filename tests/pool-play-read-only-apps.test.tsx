import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { QrTournamentApp } from "../components/tournament/qr-tournament-app";
import { TvTournamentApp } from "../components/tournament/tv-tournament-app";
import { advanceLivePoolPlayState, saveNextPoolPhaseResult } from "../lib/live-scoring";
import { createPoolTournamentFromSetup, saveActiveTournament } from "../lib/tournament-setup";

describe("pool-play read-only apps", () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it("shows unmatched final player-pool Americano placement play in QR view", async () => {
    saveActiveTournament(scoreIndividualOddPoolCrossMatchTournament());

    render(<QrTournamentApp />);

    expect(await screen.findByRole("heading", { name: "Slutplaceringer" })).toBeInTheDocument();
    expect(screen.getAllByText("Placeringsspil 2").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Iben").length).toBeGreaterThan(0);
    expect(screen.getByText("5.")).toBeInTheDocument();
    expect(screen.getAllByText("Jens").length).toBeGreaterThan(0);
    expect(screen.getByText("8.")).toBeInTheDocument();
    expect(screen.getAllByText("30 - 0").length).toBeGreaterThan(0);
  });

  it("shows unmatched final player-pool Americano placement play in TV view", async () => {
    saveActiveTournament(scoreIndividualOddPoolCrossMatchTournament());

    render(<TvTournamentApp />);

    expect(await screen.findByRole("heading", { name: "Slutplaceringer" })).toBeInTheDocument();
    expect(screen.getAllByText("Placeringsspil 2").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Iben").length).toBeGreaterThan(0);
    expect(screen.getByText("5.")).toBeInTheDocument();
    expect(screen.getAllByText("Jens").length).toBeGreaterThan(0);
    expect(screen.getByText("8.")).toBeInTheDocument();
    expect(screen.getAllByText("10 - 15").length).toBeGreaterThan(0);
  });
});

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
