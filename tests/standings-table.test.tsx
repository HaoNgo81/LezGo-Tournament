import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StandingsTable } from "../components/tournament/standings-table";

describe("StandingsTable", () => {
  it("shows only the requested live standings columns", () => {
    render(
      <StandingsTable
        standings={[
          {
            id: "p1",
            name: "Anna",
            rank: 1,
            matchPoints: 3,
            pointsFor: 21,
            pointsAgainst: 12,
            pointDifference: 9,
            pauseCount: 0,
            wins: 1,
            draws: 0,
            losses: 0,
            headToHeadMatchPoints: 0,
            headToHeadPointDifference: 0,
          },
        ]}
      />,
    );

    expect(screen.getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
      "Placering",
      "Navn",
      "Matchpoint",
      "Scorepoint",
      "Sejre",
      "Uafgjort",
      "Tab",
    ]);
    expect(screen.queryByRole("columnheader", { name: "Tabte" })).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Difference" })).not.toBeInTheDocument();
  });

  it("renders the compact live standings with player-priority columns", () => {
    render(
      <StandingsTable
        variant="compactLive"
        standings={[
          {
            id: "p1",
            name: "dfr",
            rank: 1,
            matchPoints: 3,
            pointsFor: 100,
            pointsAgainst: 98,
            pointDifference: 2,
            pauseCount: 0,
            wins: 1,
            draws: 0,
            losses: 0,
            headToHeadMatchPoints: 0,
            headToHeadPointDifference: 0,
          },
          {
            id: "p2",
            name: "Aage My eng h",
            rank: 2,
            matchPoints: 0,
            pointsFor: 98,
            pointsAgainst: 100,
            pointDifference: -2,
            pauseCount: 0,
            wins: 0,
            draws: 0,
            losses: 1,
            headToHeadMatchPoints: 0,
            headToHeadPointDifference: 0,
          },
        ]}
      />,
    );

    const standings = screen.getByTestId("live-compact-standings");
    expect(standings).toHaveAttribute("data-density", "compact-live");
    expect(standings).not.toHaveClass("table-scroll");
    expect(within(standings).queryByRole("columnheader")).not.toBeInTheDocument();

    const header = screen.getByTestId("live-standings-player-header");
    expect(header).toHaveTextContent("Spiller");
    expect(header).toHaveStyle({ overflowWrap: "normal", wordBreak: "normal" });
    expect(header.parentElement?.className).toContain("minmax(7rem,1fr)");

    expect(screen.getByText("V")).toBeInTheDocument();
    expect(screen.getByText("U")).toBeInTheDocument();
    expect(screen.getByText("T")).toBeInTheDocument();
    expect(screen.getByText("MP")).toBeInTheDocument();
    expect(screen.getByText("Point")).toBeInTheDocument();

    const rows = screen.getAllByTestId("live-compact-standings-row");
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.getAttribute("data-column-layout") === "player-priority")).toBe(true);
    expect(screen.getByLabelText("1 dfr V 1 U 0 T 0 MP 3 Point 100")).toBeInTheDocument();

    const playerNames = screen.getAllByTestId("live-standings-player-name");
    expect(playerNames.map((name) => name.textContent)).toEqual(["dfr", "Aage My eng h"]);
    playerNames.forEach((name) => {
      expect(name).toHaveStyle({ overflowWrap: "normal", wordBreak: "normal" });
    });
  });
});
