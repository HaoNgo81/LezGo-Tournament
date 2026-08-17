import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MatchCards } from "../components/tournament/match-cards";

describe("MatchCards", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows match participants in the unified court card structure", () => {
    render(
      <MatchCards
        matches={[
          {
            id: "match-1",
            court: "Bane 1",
            teamA: "Par 1",
            teamB: "Par 2",
            score: "-",
            status: "Klar",
          },
        ]}
      />,
    );

    const card = screen.getByTestId("match-court-card");
    expect(card).toHaveAttribute("data-card-structure", "unified-court-card");
    expect(within(card).getByTestId("match-court-left-player-1")).toHaveTextContent("Par 1");
    expect(within(card).getByTestId("match-court-vs")).toHaveTextContent("VS");
    expect(within(card).getByTestId("match-court-right-player-1")).toHaveTextContent("Par 2");
    expect(within(card).getByTestId("match-court-unsaved-status")).toHaveTextContent("Ikke gemt");
    expect(screen.queryByText("mod")).not.toBeInTheDocument();
  });
});
