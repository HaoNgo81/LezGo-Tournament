import { describe, expect, it } from "vitest";
import { createTournamentFromSetup } from "../lib/tournament-setup";
import { currentTournamentFormats } from "./helpers/current-product-regression";

const eightPlayers = [
  "Alba",
  "Bo",
  "Clara",
  "David",
  "Emma",
  "Finn",
  "Greta",
  "Hans",
].join("\n");

const fourFemalePlayers = ["Alba", "Clara", "Emma", "Greta"].join("\n");
const fourMalePlayers = ["Bo", "David", "Finn", "Hans"].join("\n");

describe("STEP 25Y-E consolidated current product regression contract", () => {
  it("keeps the current product scope to the five approved standard formats", () => {
    expect(currentTournamentFormats).toEqual([
      "Americano",
      "Fast Makker Americano",
      "Mixed Americano",
      "Mexicano",
      "Fast Makker Mexicano",
    ]);
  });

  it.each(currentTournamentFormats)("creates an active %s tournament through the approved setup path", (format) => {
    const tournament = createTournamentFromSetup({
      name: `${format} regression`,
      format,
      playerText: format === "Mixed Americano" ? "" : eightPlayers,
      femalePlayerText: format === "Mixed Americano" ? fourFemalePlayers : "",
      malePlayerText: format === "Mixed Americano" ? fourMalePlayers : "",
      courts: 2,
      rounds: 2,
      scoringMode: "Fri scoring",
      firstRoundOrder: "manual",
      rankingMode: "matchPointsFirst",
    });

    expect(tournament.status).toBe("active");
    expect(tournament.tournamentName).toBe(`${format} regression`);
    expect(tournament.rounds.length).toBeGreaterThan(0);
    if (format === "Americano") {
      expect(tournament.configuredRounds).toBeUndefined();
      expect(tournament.automaticCycle).toEqual({ type: "automatic-cycle", cycleLength: 7 });
    } else {
      expect(tournament.configuredRounds).toBe(2);
    }
  });
});
