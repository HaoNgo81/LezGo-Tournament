import { describe, expect, it } from "vitest";
import { mockMatches, scoringModes, standings, tournamentTypes } from "../lib/mock/tournament-data";

describe("mock tournament baseline", () => {
  it("contains all required tournament types", () => {
    expect(tournamentTypes).toEqual([
      "Americano",
      "Mexicano",
      "Mixed Americano",
      "Fast Makker Americano",
      "Fast Makker Mexicano",
      "Puljespil",
      "Team vs. Team",
    ]);
  });

  it("contains all required scoring modes", () => {
    expect(scoringModes).toEqual(["Fri scoring", "Fast antal point", "Spil på tid"]);
  });

  it("keeps live mock data aligned with available courts and standings", () => {
    expect(mockMatches).toHaveLength(3);
    expect(standings[0]).toMatchObject({ rank: 1, name: "Anna" });
  });
});
