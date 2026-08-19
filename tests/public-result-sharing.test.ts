import { describe, expect, it } from "vitest";
import { createPublicResultSnapshot, createResultUrl, validateResultId } from "../lib/results-sharing";
import { calculateLiveStandings, createMockLiveTournamentState, finishTournament, saveMatchResult } from "../lib/live-scoring";

const tournamentId = "00000000-0000-4000-8000-000000000251";
const resultId = "ABCDEFGHJKLM2345";

describe("STEP 25G public result snapshots", () => {
  it("creates a public result snapshot from existing completed tournament standings", () => {
    const activeState = createMockLiveTournamentState();
    const scoredState = saveMatchResult(activeState, {
      matchId: activeState.rounds[0].matches[0].id,
      teamAPoints: 21,
      teamBPoints: 12,
    });
    const finishedState = finishTournament(scoredState, "2026-08-19T18:30:00.000Z");
    const expectedStandings = calculateLiveStandings(finishedState);

    const snapshot = createPublicResultSnapshot({
      resultId,
      tournamentId,
      state: finishedState,
      createdAt: "2026-08-19T18:31:00.000Z",
      updatedAt: "2026-08-19T18:31:00.000Z",
    });

    expect(snapshot.resultId).toBe(resultId);
    expect(snapshot.tournamentName).toBe(finishedState.tournamentName);
    expect(snapshot.formatLabel).toBe("Americano");
    expect(snapshot.completedAt).toBe("2026-08-19T18:30:00.000Z");
    expect(snapshot.rows.map((row) => ({
      rank: row.rank,
      name: row.name,
      matchPoints: row.matchPoints,
      scorePoints: row.scorePoints,
      wins: row.wins,
      draws: row.draws,
      losses: row.losses,
    }))).toEqual(expectedStandings.map((row) => ({
      rank: row.rank,
      name: row.name,
      matchPoints: row.matchPoints,
      scorePoints: row.pointsFor,
      wins: row.wins,
      draws: row.draws,
      losses: row.losses,
    })));
  });

  it("rejects draft tournaments and malformed result IDs", () => {
    expect(() => createPublicResultSnapshot({
      resultId,
      tournamentId,
      state: createMockLiveTournamentState(),
    })).toThrow("Only completed tournaments can be shared");

    expect(() => validateResultId("bad-token")).toThrow("Result ID is invalid.");
  });

  it("creates a stable public result URL without secret tokens", () => {
    const url = createResultUrl("https://lez-go-tournament.vercel.app", resultId);

    expect(url).toBe(`https://lez-go-tournament.vercel.app/result/${resultId}`);
    expect(url).not.toMatch(/token|secret|password|pin|share/i);
  });
});
