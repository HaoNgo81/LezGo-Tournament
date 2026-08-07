import { render, screen } from "@testing-library/react";
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
});
