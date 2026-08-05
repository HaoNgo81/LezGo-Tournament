import { describe, expect, it } from "vitest";
import { createMockLiveTournamentState, getLiveMatches, saveMatchResult } from "../lib/live-scoring";
import { createReadOnlyTournamentView, createTeamVsTeamReadOnlyView } from "../lib/read-only-views";
import { createTeamVsTeamTournamentFromSetup } from "../lib/tournament-setup";
import type { TeamVsTeamRoundLineup, TeamVsTeamRoundResult, TeamVsTeamTeam } from "../lib/team-vs-team";

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


  it("creates Team vs. Team QR and TV data from the active holdkamp", () => {
    const tournament = createTeamVsTeamTournamentFromSetup({
      name: "Klubkamp",
      date: "2026-08-05",
      startTime: "18:00",
      scoringMode: "Fri scoring",
      teamCount: 2,
      playersPerTeam: 4,
      matchFormat: "oneSet",
      teams: [createTeam("a", "Hold A"), createTeam("b", "Hold B")],
    });
    const stateWithLineup = {
      ...tournament,
      status: "active" as const,
      matchups: [
        {
          ...tournament.matchups[0],
          lineups: [lineup(1)],
          roundResults: [round(1, 6, 4, 3, 6)],
        },
      ],
    };

    const view = createTeamVsTeamReadOnlyView(stateWithLineup);

    expect(view).toMatchObject({
      tournamentName: "Klubkamp",
      activeMatchLabel: "Holdkamp",
      activeRoundNumber: 2,
      totalRounds: 3,
      teamsCount: 2,
      playersPerTeam: 4,
      matchFormat: "1 sæt",
    });
    expect(view.teams[0]).toMatchObject({ teamName: "Hold A", captainName: "Hold A spiller 1" });
    expect(view.matches).toEqual([]);
    expect(view.standings[0]).toMatchObject({ teamName: "Hold A", matchWins: 1, matchLosses: 1 });
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
function createTeam(idPrefix: string, name: string): TeamVsTeamTeam {
  return {
    id: `team-${idPrefix}`,
    name,
    captainPlayerId: `${idPrefix}1`,
    players: Array.from({ length: 4 }, (_, index) => ({ id: `${idPrefix}${index + 1}`, name: `${name} spiller ${index + 1}` })),
  };
}

function lineup(roundNumber: 1 | 2 | 3): TeamVsTeamRoundLineup {
  return {
    roundNumber,
    match1: { teamAPlayerIds: ["a1", "a2"], teamBPlayerIds: ["b1", "b2"] },
    match2: { teamAPlayerIds: ["a3", "a4"], teamBPlayerIds: ["b3", "b4"] },
  };
}

function round(roundNumber: 1 | 2 | 3, match1TeamAPoints: number, match1TeamBPoints: number, match2TeamAPoints: number, match2TeamBPoints: number): TeamVsTeamRoundResult {
  return {
    roundNumber,
    match1: { sets: [{ teamAPoints: match1TeamAPoints, teamBPoints: match1TeamBPoints }] },
    match2: { sets: [{ teamAPoints: match2TeamAPoints, teamBPoints: match2TeamBPoints }] },
  };
}
