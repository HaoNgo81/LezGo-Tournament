import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PublicResultPage } from "../components/tournament/public-result-page";
import { calculateLiveStandings, finishTournament, goToNextRound, saveMatchResult, type LiveTournamentState } from "../lib/live-scoring";
import { createPublicResultSnapshot } from "../lib/results-sharing";
import { createTournamentFromSetup } from "../lib/tournament-setup";

describe("STEP 29A public completed tournament result page", () => {
  afterEach(() => {
    cleanup();
  });

  it("loads a shared completed tournament without login and reuses read-only standings plus round history", () => {
    const finishedState = createFinishedHistoryTournament();
    const snapshot = createPublicResultSnapshot({
      resultId: "ABCDEFGHJKLM2345",
      tournamentId: "00000000-0000-4000-8000-000000000291",
      state: finishedState,
      createdAt: "2026-08-29T10:00:00.000Z",
      updatedAt: "2026-08-29T10:00:00.000Z",
    });

    render(<PublicResultPage snapshot={snapshot} />);

    expect(screen.getByRole("heading", { name: "Delt finale" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Slutstilling" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Kampresultater" })).toBeInTheDocument();
    expect(screen.queryByText(/Kun visning|Skrivebeskyttet|Read only|View only/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Runde 1" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Runde 2" })).toHaveAttribute("aria-pressed", "false");

    const expectedStandings = calculateLiveStandings(finishedState);
    expect(screen.getAllByText(expectedStandings[0].name).length).toBeGreaterThan(0);
    const firstRoundCard = screen.getAllByTestId("finished-history-match-card")[0];
    expect(within(firstRoundCard).getByTestId("finished-history-court-left-score")).toHaveTextContent("21");
    expect(within(firstRoundCard).getByTestId("finished-history-court-right-score")).toHaveTextContent("15");

    fireEvent.click(screen.getByRole("button", { name: "Runde 2" }));

    expect(screen.getByRole("button", { name: "Runde 2" })).toHaveAttribute("aria-pressed", "true");
    const secondRoundCard = screen.getAllByTestId("finished-history-match-card")[0];
    expect(within(secondRoundCard).getByTestId("finished-history-court-left-score")).toHaveTextContent("18");
    expect(within(secondRoundCard).getByTestId("finished-history-court-right-score")).toHaveTextContent("21");
    expect(screen.queryByRole("link", { name: "Rediger score" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Afslut turnering" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Indtast score" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Slå deling fra" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Mine turneringer" })).not.toBeInTheDocument();
  });
});

function createFinishedHistoryTournament(): LiveTournamentState {
  const initialState = createTournamentFromSetup({
    name: "Delt finale",
    format: "Americano",
    playerText: ["Alle 1", "Alle 2", "Alle 3", "Alle 4", "Alle 5", "Alle 6", "Alle 7", "Alle 8"].join("\n"),
    femalePlayerText: "",
    malePlayerText: "",
    courts: 2,
    rounds: 2,
    scoringMode: "Fri scoring",
    firstRoundOrder: "manual",
    rankingMode: "matchPointsFirst",
  });
  const firstRoundScored = initialState.rounds[0].matches.reduce((currentState, match, index) => saveMatchResult(currentState, {
    matchId: match.id,
    teamAPoints: index === 0 ? 21 : 17,
    teamBPoints: index === 0 ? 15 : 19,
  }), initialState);
  const secondRoundState = goToNextRound(firstRoundScored);
  const secondRoundScored = secondRoundState.rounds[1].matches.reduce((currentState, match, index) => saveMatchResult(currentState, {
    matchId: match.id,
    teamAPoints: index === 0 ? 18 : 20,
    teamBPoints: index === 0 ? 21 : 16,
  }), secondRoundState);

  return finishTournament(secondRoundScored, "2026-08-29T10:00:00.000Z");
}
