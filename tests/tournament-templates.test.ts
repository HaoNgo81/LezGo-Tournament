import { beforeEach, describe, expect, it } from "vitest";
import {
  deleteTournamentTemplate,
  findTournamentTemplate,
  loadTournamentTemplates,
  saveTournamentTemplate,
} from "../lib/tournament-templates";

describe("tournament templates", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("loads default templates when none are saved", () => {
    const templates = loadTournamentTemplates();

    expect(templates).toHaveLength(2);
    expect(templates[0]).toMatchObject({ title: "8 spillere / 2 baner", format: "Americano" });
  });

  it("saves and finds a custom template", () => {
    const templates = saveTournamentTemplate(
      {
        title: "Fredag tid",
        format: "Mexicano",
        scoringMode: "Spil på tid",
        courts: 2,
        rounds: 4,
        firstRoundOrder: "manual",
        rankingMode: "partiPointsFirst",
        timeLimitMinutes: 12,
      },
      "fredag-tid",
    );

    expect(templates[0]).toMatchObject({ id: "fredag-tid", title: "Fredag tid", timeLimitMinutes: 12 });
    expect(findTournamentTemplate("fredag-tid")).toMatchObject({ format: "Mexicano", scoringMode: "Spil på tid" });
  });

  it("deletes a template", () => {
    saveTournamentTemplate(
      {
        title: "Slet mig",
        format: "Americano",
        scoringMode: "Fri scoring",
        courts: 2,
        rounds: 2,
        firstRoundOrder: "manual",
        rankingMode: "matchPointsFirst",
      },
      "slet-mig",
    );

    const templates = deleteTournamentTemplate("slet-mig");

    expect(templates.some((template) => template.id === "slet-mig")).toBe(false);
  });

  it("requires time limit for timed templates", () => {
    expect(() =>
      saveTournamentTemplate({
        title: "Mangler tid",
        format: "Mexicano",
        scoringMode: "Spil på tid",
        courts: 2,
        rounds: 2,
        firstRoundOrder: "manual",
        rankingMode: "matchPointsFirst",
      }),
    ).toThrow("Vælg spilletid for skabelonen.");
  });

  it("rejects pool-play templates because they need dedicated setup fields", () => {
    expect(() =>
      saveTournamentTemplate({
        title: "Pulje setup",
        format: "Puljespil" as never,
        scoringMode: "Fri scoring",
        courts: 2,
        rounds: 2,
        firstRoundOrder: "manual",
        rankingMode: "matchPointsFirst",
      }),
    ).toThrow("Puljespil og Team vs. Team kræver egne opsætningsfelter og kan ikke gemmes som standardskabelon.");
  });

  it("filters older unsupported pool-play templates from storage", () => {
    window.localStorage.setItem("lezgo.tournamentTemplates.v1", JSON.stringify([
      {
        id: "pool-template",
        title: "Gammel pulje",
        format: "Puljespil",
        scoringMode: "Fri scoring",
        courts: 2,
        rounds: 2,
        firstRoundOrder: "manual",
        rankingMode: "matchPointsFirst",
      },
      {
        id: "americano-template",
        title: "Americano",
        format: "Americano",
        scoringMode: "Fri scoring",
        courts: 2,
        rounds: 2,
        firstRoundOrder: "manual",
        rankingMode: "matchPointsFirst",
      },
    ]));

    expect(loadTournamentTemplates()).toEqual([
      expect.objectContaining({ id: "americano-template", format: "Americano" }),
    ]);
  });
});
