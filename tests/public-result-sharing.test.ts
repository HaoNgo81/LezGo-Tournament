import { describe, expect, it } from "vitest";
import { createPublicResultSnapshot, createResultUrl, generateResultId, normalizePublicResultUrl, validateResultId } from "../lib/results-sharing";
import { calculateLiveStandings, createMockLiveTournamentState, finishTournament, goToNextRound, saveMatchResult } from "../lib/live-scoring";

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
    expect("tournamentId" in snapshot).toBe(false);
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
    expect(snapshot.state).toMatchObject({
      status: "finished",
      tournamentName: finishedState.tournamentName,
      results: finishedState.results,
    });
  });

  it("stores completed round history needed for public read-only browsing", () => {
    const activeState = createMockLiveTournamentState();
    const firstRoundScored = activeState.rounds[0].matches.reduce((currentState, match, index) => saveMatchResult(currentState, {
      matchId: match.id,
      teamAPoints: index === 0 ? 21 : 17,
      teamBPoints: index === 0 ? 12 : 19,
    }), activeState);
    const secondRoundState = goToNextRound(firstRoundScored);
    const secondRoundScored = secondRoundState.rounds[1].matches.reduce((currentState, match, index) => saveMatchResult(currentState, {
      matchId: match.id,
      teamAPoints: index === 0 ? 17 : 20,
      teamBPoints: index === 0 ? 21 : 16,
    }), secondRoundState);
    const finishedState = finishTournament(secondRoundScored, "2026-08-29T12:00:00.000Z");

    const snapshot = createPublicResultSnapshot({
      resultId,
      tournamentId,
      state: finishedState,
    });

    expect(snapshot.state?.rounds).toHaveLength(2);
    expect(snapshot.state?.results.map((result) => result.matchId)).toEqual([
      ...activeState.rounds[0].matches.map((match) => match.id),
      ...secondRoundState.rounds[1].matches.map((match) => match.id),
    ]);
  });

  it("rejects draft tournaments and malformed result IDs", () => {
    expect(() => createPublicResultSnapshot({
      resultId,
      tournamentId,
      state: createMockLiveTournamentState(),
    })).toThrow("Only completed tournaments can be shared");

    expect(() => validateResultId("bad-token")).toThrow("Result ID is invalid.");
  });

  it("generates non-sequential public result IDs with at least 80 bits of entropy", () => {
    const ids = Array.from({ length: 64 }, () => generateResultId());

    expect(ids.every((id) => /^[A-HJ-NP-Z2-9]{16}$/.test(id))).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain(tournamentId.replace(/-/g, "").slice(0, 16).toUpperCase());
  });

  it("creates a stable public result URL without secret tokens", () => {
    const url = createResultUrl("https://lezgotournament.vercel.app", resultId);

    expect(url).toBe(`https://lezgotournament.vercel.app/result/${resultId}`);
    expect(url).not.toMatch(/token|secret|password|pin|share/i);
  });

  it("normalizes stale custom-domain result URLs to the current working production origin while preserving the result ID", () => {
    const url = normalizePublicResultUrl(`https://app.lezgopadel.dk/result/${resultId}`, resultId);

    expect(url).toBe(`https://lezgotournament.vercel.app/result/${resultId}`);
    expect(url).not.toContain("app.lezgopadel.dk");
    expect(url).not.toContain("lez-go-tournament.vercel.app");
    expect(url).not.toMatch(/token|secret|password|pin|share/i);
  });

  it("uses the browser origin for QR/copy/share URLs when it is available", () => {
    const url = normalizePublicResultUrl(`https://app.lezgopadel.dk/result/${resultId}`, resultId, "https://lezgotournament.vercel.app");

    expect(url).toBe(`https://lezgotournament.vercel.app/result/${resultId}`);
  });

  it("does not use the old hyphenated production origin for new QR/copy/share URLs", () => {
    const url = normalizePublicResultUrl(`https://lez-go-tournament.vercel.app/result/${resultId}`, resultId, "https://lez-go-tournament.vercel.app");

    expect(url).toBe(`https://lezgotournament.vercel.app/result/${resultId}`);
    expect(url).not.toContain("lez-go-tournament.vercel.app");
  });
});
