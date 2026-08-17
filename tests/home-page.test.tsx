import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import HomePage from "../app/page";
import { saveTournamentSettings } from "../lib/tournament-settings";

describe("HomePage i18n", () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    document.documentElement.lang = "da";
  });

  it("uses English system text when English is selected", async () => {
    saveTournamentSettings({
      language: "en",
      scoringMode: "Fast antal point",
      courts: 2,
      rounds: 2,
      rankingMode: "matchPointsFirst",
      timeLimitMinutes: 15,
      alarmSound: "standard",
    });

    render(<HomePage />);

    expect(await screen.findByRole("heading", { name: "LEZGO PADEL" })).toBeInTheDocument();
    expect(screen.getByText("Fast tournament management for phone and tablet.")).toBeInTheDocument();
    expect(screen.getByText("New tournament")).toBeInTheDocument();
    expect(screen.getByText("Choose format, settings and players.")).toBeInTheDocument();
    expect(screen.getByText("Tournament templates")).toBeInTheDocument();
    expect(screen.getByText("Create, edit, delete or start from a template.")).toBeInTheDocument();
    expect(screen.getByText("Tournaments")).toBeInTheDocument();
    expect(screen.getByText("Active, upcoming, completed and previous tournaments.")).toBeInTheDocument();
    expect(screen.getByText("Open tournament from another device")).toBeInTheDocument();
    expect(screen.getByText("Enter the tournament code and 4-digit access code for score entry.")).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(screen.getByText("Only the essential options.")).toBeInTheDocument();

    expect(screen.queryByText("Ny turnering")).not.toBeInTheDocument();
    expect(screen.queryByText("Turneringsskabeloner")).not.toBeInTheDocument();
    expect(screen.queryByText("Indstillinger")).not.toBeInTheDocument();
    expect(screen.queryByText("Hurtig turneringsstyring til telefon og tablet.")).not.toBeInTheDocument();
    expect(screen.queryByText("Vælg format, indstillinger og spillere.")).not.toBeInTheDocument();
  });
});
