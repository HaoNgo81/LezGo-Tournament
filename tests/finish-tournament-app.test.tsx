import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FinishTournamentApp } from "../components/tournament/finish-tournament-app";
import { advanceLivePoolPlayState, saveNextPoolPhaseResult } from "../lib/live-scoring";
import { createPoolTournamentFromSetup, saveActiveTournament } from "../lib/tournament-setup";

describe("FinishTournamentApp pool play", () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
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
