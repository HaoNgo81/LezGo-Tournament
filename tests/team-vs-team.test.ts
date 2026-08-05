import { describe, expect, it } from "vitest";
import {
  calculateTeamVsTeamMatchScore,
  createTeamVsTeamBracket,
  getTeamVsTeamPairConstitutions,
  validateTeamVsTeamLineup,
  validateTeamVsTeamTeams,
  type TeamVsTeamMatchup,
  type TeamVsTeamRoundLineup,
  type TeamVsTeamTeam,
} from "../lib/team-vs-team";

const teamA: TeamVsTeamTeam = {
  id: "team-a",
  name: "Hold A",
  captainPlayerId: "a1",
  players: [
    { id: "a1", name: "Anna" },
    { id: "a2", name: "Hassan" },
    { id: "a3", name: "Maja" },
    { id: "a4", name: "Noah" },
  ],
};

const teamB: TeamVsTeamTeam = {
  id: "team-b",
  name: "Hold B",
  captainPlayerId: "b1",
  players: [
    { id: "b1", name: "Sofia" },
    { id: "b2", name: "Emil" },
    { id: "b3", name: "Clara" },
    { id: "b4", name: "Jonas" },
  ],
};

const teamC: TeamVsTeamTeam = {
  id: "team-c",
  name: "Hold C",
  captainPlayerId: "c1",
  players: [
    { id: "c1", name: "Freja" },
    { id: "c2", name: "Malik" },
    { id: "c3", name: "Ida" },
    { id: "c4", name: "Oscar" },
  ],
};

const teamD: TeamVsTeamTeam = {
  id: "team-d",
  name: "Hold D",
  captainPlayerId: "d1",
  players: [
    { id: "d1", name: "Liva" },
    { id: "d2", name: "Yusuf" },
    { id: "d3", name: "Nora" },
    { id: "d4", name: "Theo" },
  ],
};

const matchup: TeamVsTeamMatchup = {
  id: "m1",
  teamA,
  teamB,
};

const openingLineup: TeamVsTeamRoundLineup = {
  roundNumber: 1,
  match1: { teamAPlayerIds: ["a1", "a2"], teamBPlayerIds: ["b1", "b2"] },
  match2: { teamAPlayerIds: ["a3", "a4"], teamBPlayerIds: ["b3", "b4"] },
};

describe("Team vs. Team rules", () => {
  it("requires either 2 or 4 teams with exactly 4 players and a captain", () => {
    expect(() => validateTeamVsTeamTeams([teamA, teamB])).not.toThrow();
    expect(() => validateTeamVsTeamTeams([teamA, teamB, teamC, teamD])).not.toThrow();
    expect(() => validateTeamVsTeamTeams([teamA, teamB, teamC])).toThrow("Team vs. Team kræver enten 2 eller 4 hold.");
    expect(() => validateTeamVsTeamTeams([{ ...teamA, captainPlayerId: "missing" }, teamB])).toThrow("holdkaptajn");
  });

  it("creates the three allowed internal pair constitutions for each team", () => {
    expect(getTeamVsTeamPairConstitutions(teamA)).toEqual([
      [["a1", "a2"], ["a3", "a4"]],
      [["a1", "a3"], ["a2", "a4"]],
      [["a1", "a4"], ["a2", "a3"]],
    ]);
  });

  it("validates manual lineups so every team player is used exactly once", () => {
    expect(validateTeamVsTeamLineup(matchup, openingLineup)).toEqual([]);

    expect(() =>
      validateTeamVsTeamLineup(matchup, {
        roundNumber: 1,
        match1: { teamAPlayerIds: ["a1", "a2"], teamBPlayerIds: ["b1", "b2"] },
        match2: { teamAPlayerIds: ["a2", "a4"], teamBPlayerIds: ["b3", "b4"] },
      }),
    ).toThrow("alle 4 spillere skal anvendes præcis én gang");
  });

  it("blocks repeated pair constitutions unless organiser overrides the warning", () => {
    const repeatedLineup: TeamVsTeamRoundLineup = { ...openingLineup, roundNumber: 2 };

    expect(() => validateTeamVsTeamLineup(matchup, repeatedLineup, [openingLineup])).toThrow("Makkerpar er allerede anvendt");
    expect(validateTeamVsTeamLineup(matchup, { ...repeatedLineup, overrideRepeatedPairs: true }, [openingLineup])).toContain("Makkerpar er allerede anvendt: a1+a2");
  });

  it("applies the 6-0 rule when only one team wins 6-0 in a round", () => {
    const score = calculateTeamVsTeamMatchScore(matchup, [
      { roundNumber: 1, match1: { teamAPoints: 6, teamBPoints: 0 }, match2: { teamAPoints: 3, teamBPoints: 6 } },
    ]);

    expect(score.roundScores[0].actualMatchWins).toEqual({ teamA: 1, teamB: 1 });
    expect(score.roundScores[0].awardedMatchWins).toEqual({ teamA: 2, teamB: 0 });
    expect(score.roundScores[0].ruleMessage).toContain("6-0-reglen er aktiveret");
  });

  it("cancels the 6-0 penalty when both teams win 6-0 in the same round", () => {
    const score = calculateTeamVsTeamMatchScore(matchup, [
      { roundNumber: 1, match1: { teamAPoints: 6, teamBPoints: 0 }, match2: { teamAPoints: 0, teamBPoints: 6 } },
    ]);

    expect(score.roundScores[0].actualMatchWins).toEqual({ teamA: 1, teamB: 1 });
    expect(score.roundScores[0].awardedMatchWins).toEqual({ teamA: 1, teamB: 1 });
    expect(score.roundScores[0].ruleMessage).toContain("Straffen ophæves");
  });

  it("requires Match Tie-break only after three rounds end 3-3 and validates win by two", () => {
    const tiedRounds = [
      { roundNumber: 1 as const, match1: { teamAPoints: 6, teamBPoints: 4 }, match2: { teamAPoints: 3, teamBPoints: 6 } },
      { roundNumber: 2 as const, match1: { teamAPoints: 7, teamBPoints: 5 }, match2: { teamAPoints: 4, teamBPoints: 6 } },
      { roundNumber: 3 as const, match1: { teamAPoints: 7, teamBPoints: 6 }, match2: { teamAPoints: 2, teamBPoints: 6 } },
    ];

    const score = calculateTeamVsTeamMatchScore(matchup, tiedRounds);

    expect(score).toMatchObject({ teamAWins: 3, teamBWins: 3, tieBreakRequired: true, winnerTeamId: undefined });
    expect(() =>
      calculateTeamVsTeamMatchScore(matchup, tiedRounds, {
        teamAPlayerIds: ["a1", "a2"],
        teamBPlayerIds: ["b1", "b2"],
        result: { teamAPoints: 10, teamBPoints: 9 },
      }),
    ).toThrow("vindes med mindst 2 point");

    expect(
      calculateTeamVsTeamMatchScore(matchup, tiedRounds, {
        teamAPlayerIds: ["a1", "a2"],
        teamBPlayerIds: ["b1", "b2"],
        result: { teamAPoints: 11, teamBPoints: 9 },
      }).winnerTeamId,
    ).toBe("team-a");
  });

  it("creates first and second hold rounds for four teams", () => {
    const bracket = createTeamVsTeamBracket([teamA, teamB, teamC, teamD]);

    expect(bracket.firstRound).toEqual([
      { id: "semifinale-1", label: "Holdrunde 1", teamAId: "team-a", teamBId: "team-b" },
      { id: "semifinale-2", label: "Holdrunde 1", teamAId: "team-c", teamBId: "team-d" },
    ]);
    expect(bracket.secondRound).toEqual([
      { id: "finale", label: "Finale", teamAId: "vinder-semifinale-1", teamBId: "vinder-semifinale-2" },
      { id: "placeringskamp", label: "Placeringskamp", teamAId: "taber-semifinale-1", teamBId: "taber-semifinale-2" },
    ]);
  });
});
