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
      alarmSound: "bell",
      language: "en",
      theme: {
        preset: "custom",
        primary: "#111111",
        secondary: "#eeeeee",
        background: "#222222",
        surface: "#333333",
        foreground: "#ffffff",
        accent: "#d6a447",
      },
    });

    expect(settings).toMatchObject({ scoringMode: "Spil på tid", courts: 3, rounds: 5, rankingMode: "partiPointsFirst", timeLimitMinutes: 12, language: "en" });
    expect(loadTournamentSettings()).toEqual(settings);
  });

  it("normalizes missing and invalid alarm sound settings", () => {
    window.localStorage.setItem("lezgo.tournamentSettings.v1", JSON.stringify({
      scoringMode: "Fri scoring",
      courts: 2,
      rounds: 2,
      rankingMode: "matchPointsFirst",
      timeLimitMinutes: 15,
      alarmSound: "missing",
    }));

    expect(loadTournamentSettings()).toMatchObject({ alarmSound: "standard" });
  });

  it("normalizes missing language and theme settings", () => {
    window.localStorage.setItem("lezgo.tournamentSettings.v1", JSON.stringify({
      scoringMode: "Fri scoring",
      courts: 2,
      rounds: 2,
      rankingMode: "matchPointsFirst",
      timeLimitMinutes: 15,
      alarmSound: "standard",
    }));

    expect(loadTournamentSettings()).toMatchObject({
      language: "da",
      theme: expect.objectContaining({ preset: "hybridLezgo", primary: "#d7a91e" }),
    });
  });

  it("preserves a valid saved non-default theme preference", () => {
    window.localStorage.setItem("lezgo.tournamentSettings.v1", JSON.stringify({
      scoringMode: "Fri scoring",
      courts: 2,
      rounds: 2,
      rankingMode: "matchPointsFirst",
      timeLimitMinutes: 15,
      alarmSound: "standard",
      language: "da",
      theme: {
        preset: "light",
        primary: "#0f7d43",
        secondary: "#eef4f0",
        background: "#fbfdfb",
        surface: "#ffffff",
        foreground: "#102017",
        accent: "#d6a447",
      },
    }));

    expect(loadTournamentSettings().theme).toMatchObject({ preset: "light", primary: "#0f7d43" });
  });

  it("falls back to Hybrid LEZGO for invalid stored theme presets", () => {
    window.localStorage.setItem("lezgo.tournamentSettings.v1", JSON.stringify({
      scoringMode: "Fri scoring",
      courts: 2,
      rounds: 2,
      rankingMode: "matchPointsFirst",
      timeLimitMinutes: 15,
      alarmSound: "standard",
      language: "da",
      theme: {
        preset: "removedTheme",
        primary: "#000000",
      },
    }));

    expect(loadTournamentSettings().theme).toMatchObject({ preset: "hybridLezgo", primary: "#d7a91e" });
  });

  it("rejects invalid numeric settings", () => {
    expect(() =>
      saveTournamentSettings({
        scoringMode: "Fri scoring",
        courts: 0,
        rounds: 2,
        rankingMode: "matchPointsFirst",
      timeLimitMinutes: 15,
      alarmSound: "standard",
      }),
    ).toThrow("Standardindstillinger skal have mindst 1 bane.");
  });
});
