import { describe, expect, it } from "vitest";
import { createMockLiveTournamentState, finishTournament, getLiveMatches, saveMatchResult } from "../lib/live-scoring";
import { createTournamentResultFileName, createTournamentResultLines, createTournamentResultPdf } from "../lib/results-export";

describe("result export", () => {
  it("creates result lines with tournament metadata, standings and match results", () => {
    const state = createMockLiveTournamentState();
    const firstMatch = getLiveMatches(state)[0].match;
    const scoredState = saveMatchResult(state, { matchId: firstMatch.id, teamAPoints: 21, teamBPoints: 12 });
    const finishedState = finishTournament(scoredState, "2026-08-04T18:00:00.000Z");

    const lines = createTournamentResultLines(finishedState);

    expect(lines).toContain("LEZGO Padel - Mock Americano");
    expect(lines).toContain("Status: Afsluttet");
    expect(lines).toContain("Format: Americano");
    expect(lines).toContain("Ranking: Flest matchpoint");
    expect(lines).toContain("SLUTSTILLING");
    expect(lines).toContain("KAMPRESULTATER");
    expect(lines).toContain("Bane 1: Anna / Hassan vs Maja / Noah - 21-12");
  });

  it("creates a downloadable pdf byte stream", () => {
    const state = finishTournament(createMockLiveTournamentState(), "2026-08-04T18:00:00.000Z");
    const pdf = createTournamentResultPdf(state);
    const header = new TextDecoder().decode(pdf.slice(0, 8));

    expect(header).toBe("%PDF-1.4");
    expect(pdf.length).toBeGreaterThan(1000);
  });

  it("creates a safe pdf file name", () => {
    const state = { ...createMockLiveTournamentState(), tournamentName: "Fredag Padel #1" };

    expect(createTournamentResultFileName(state)).toBe("fredag-padel-1-resultater.pdf");
  });
});
