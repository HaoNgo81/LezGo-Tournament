import { describe, expect, it } from "vitest";
import { createMockLiveTournamentState, getLiveMatches, saveMatchResult } from "../lib/live-scoring";
import { createReadOnlyTournamentView } from "../lib/read-only-views";

describe("read-only tournament views", () => {
  it("creates QR and TV data from the active tournament state", () => {
    const state = createMockLiveTournamentState();
    const [firstMatch] = getLiveMatches(state);
    const scoredState = saveMatchResult(state, { matchId: firstMatch.match.id, teamAPoints: 21, teamBPoints: 15 });
    const view = createReadOnlyTournamentView(scoredState);

    expect(view).toMatchObject({
      tournamentName: "Mock Americano",
      activeRoundNumber: 1,
      totalRounds: 2,
      courts: 2,
      players: 8,
    });
    expect(view.matches[0]).toMatchObject({ court: "Bane 1", score: "21 - 15", status: "Afsluttet" });
    expect(view.playerInfo[0]).toMatchObject({
      playerName: "Anna",
      rank: 1,
      court: "Bane 1",
      partnerName: "Hassan",
      opponents: "Maja / Noah",
    });
    expect(view.standings[0]).toMatchObject({ id: "p1", matchPoints: 3, pointsFor: 21 });
  });

  it("marks rounds as live, completed, or upcoming", () => {
    const state = createMockLiveTournamentState();
    const [firstMatch, secondMatch] = getLiveMatches(state);
    const firstSave = saveMatchResult(state, { matchId: firstMatch.match.id, teamAPoints: 21, teamBPoints: 15 });
    const completedRound = saveMatchResult(firstSave, { matchId: secondMatch.match.id, teamAPoints: 12, teamBPoints: 12 });
    const view = createReadOnlyTournamentView(completedRound);

    expect(view.rounds).toEqual([
      { roundNumber: 1, label: "afsluttet" },
      { roundNumber: 2, label: "kommende" },
    ]);
  });
});

