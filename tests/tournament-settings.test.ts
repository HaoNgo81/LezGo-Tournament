import { beforeEach, describe, expect, it } from "vitest";
import { createDefaultTournamentSettings, loadTournamentSettings, saveTournamentSettings } from "../lib/tournament-settings";

describe("tournament settings", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("loads default settings when none are saved", () => {
    expect(loadTournamentSettings()).toEqual(createDefaultTournamentSettings());
  });

  it("saves settings for new tournaments", () => {
    const settings = saveTournamentSettings({
      scoringMode: "Spil på tid",
      courts: 3,
      rounds: 5,
      rankingMode: "partiPointsFirst",
      timeLimitMinutes: 12,
    });

    expect(settings).toMatchObject({ scoringMode: "Spil på tid", courts: 3, rounds: 5, rankingMode: "partiPointsFirst", timeLimitMinutes: 12 });
    expect(loadTournamentSettings()).toEqual(settings);
  });

  it("rejects invalid numeric settings", () => {
    expect(() =>
      saveTournamentSettings({
        scoringMode: "Fri scoring",
        courts: 0,
        rounds: 2,
        rankingMode: "matchPointsFirst",
        timeLimitMinutes: 15,
      }),
    ).toThrow("Standardindstillinger skal have mindst 1 bane.");
  });
});