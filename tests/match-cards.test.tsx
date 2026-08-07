import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MatchCards } from "../components/tournament/match-cards";

describe("MatchCards", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows match participants side by side", () => {
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

    expect(screen.getByText((_content, element) => element?.textContent === "Par 1 vs Par 2")).toBeInTheDocument();
    expect(screen.queryByText("mod")).not.toBeInTheDocument();
  });
});
