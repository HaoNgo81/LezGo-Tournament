import { describe, expect, it } from "vitest";
import {
  calculateTeamVsTeamMatchScore,
  createTeamVsTeamBracket,
  getTeamVsTeamPairConstitutions,
  validateTeamVsTeamLineup,
  validateTeamVsTeamTeams,
  type TeamVsTeamMatchup,
  type TeamVsTeamRoundLineup,
  type TeamVsTeamRoundResult,
  type TeamVsTeamTeam,
} from "../lib/team-vs-team";

function createTeam(idPrefix: string, name: string, count = 4): TeamVsTeamTeam {
  return {
    id: `team-${idPrefix}`,
    name,
    captainPlayerId: `${idPrefix}1`,
    players: Array.from({ length: count }, (_, index) => ({ id: `${idPrefix}${index + 1}`, name: `${name} spiller ${index + 1}` })),
  };
}

const teamA = createTeam("a", "Hold A");
const teamB = createTeam("b", "Hold B");
const teamC = createTeam("c", "Hold C");
const teamD = createTeam("d", "Hold D");

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
  it("requires either 2 or 4 teams with 4, 6, or 8 players and a captain", () => {
    expect(() => validateTeamVsTeamTeams([teamA, teamB], 4)).not.toThrow();
    expect(() => validateTeamVsTeamTeams([createTeam("a", "Hold A", 6), createTeam("b", "Hold B", 6)], 6)).not.toThrow();
    expect(() => validateTeamVsTeamTeams([createTeam("a", "Hold A", 8), createTeam("b", "Hold B", 8)], 8)).not.toThrow();
    expect(() => validateTeamVsTeamTeams([teamA, teamB, teamC, teamD], 4)).not.toThrow();
    expect(() => validateTeamVsTeamTeams([teamA, teamB, teamC], 4)).toThrow("Team vs. Team kræver enten 2 eller 4 hold.");
    expect(() => validateTeamVsTeamTeams([{ ...teamA, captainPlayerId: "missing" }, teamB], 4)).toThrow("holdkaptajn");
  });

  it("creates pair constitutions for 4, 6, and 8 player teams", () => {
    expect(getTeamVsTeamPairConstitutions(teamA)).toEqual([
      [["a1", "a2"], ["a3", "a4"]],
      [["a1", "a3"], ["a2", "a4"]],
      [["a1", "a4"], ["a2", "a3"]],
    ]);
    expect(getTeamVsTeamPairConstitutions(createTeam("a", "Hold A", 6))).toEqual([
      [["a1", "a2"], ["a3", "a4"]],
      [["a5", "a6"], ["a1", "a2"]],
    ]);
    expect(getTeamVsTeamPairConstitutions(createTeam("a", "Hold A", 8))).toEqual([
      [["a1", "a2"], ["a3", "a4"]],
      [["a5", "a6"], ["a7", "a8"]],
    ]);
  });

  it("validates manual lineups so each round uses four different players from each team", () => {
    expect(validateTeamVsTeamLineup(matchup, openingLineup)).toEqual([]);

    expect(() =>
      validateTeamVsTeamLineup(matchup, {
        roundNumber: 1,
        match1: { teamAPlayerIds: ["a1", "a2"], teamBPlayerIds: ["b1", "b2"] },
        match2: { teamAPlayerIds: ["a2", "a4"], teamBPlayerIds: ["b3", "b4"] },
      }),
    ).toThrow("4 forskellige spillere");
  });

  it("blocks repeated pair constitutions unless organiser overrides the warning", () => {
    const repeatedLineup: TeamVsTeamRoundLineup = { ...openingLineup, roundNumber: 2 };

    expect(() => validateTeamVsTeamLineup(matchup, repeatedLineup, [openingLineup])).toThrow("Makkerpar er allerede anvendt");
    expect(validateTeamVsTeamLineup(matchup, { ...repeatedLineup, overrideRepeatedPairs: true }, [openingLineup])).toContain("Makkerpar er allerede anvendt: a1+a2");
  });

  it("does not award automatic 6-0 wins to the team mate match", () => {
    const score = calculateTeamVsTeamMatchScore(matchup, [
      round(1, oneSet(6, 0), oneSet(3, 6)),
    ]);

    expect(score.roundScores[0].actualMatchWins).toEqual({ teamA: 1, teamB: 1 });
    expect(score.roundScores[0].awardedMatchWins).toEqual({ teamA: 1, teamB: 1 });
    expect(score.roundScores[0].ruleMessage).toBeUndefined();
  });

  it("supports best of 3 sets per match", () => {
    const score = calculateTeamVsTeamMatchScore(
      matchup,
      [round(1, bestOfThree([6, 4], [3, 6], [10, 8]), bestOfThree([6, 2], [6, 4]))],
      undefined,
      { matchFormat: "bestOfThree" },
    );

    expect(score.roundScores[0].actualMatchWins).toEqual({ teamA: 2, teamB: 0 });
  });

  it("requires Match Tie-break after a 3-3 result with 4 players and validates win by two", () => {
    const tiedRounds: TeamVsTeamRoundResult[] = [
      round(1, oneSet(6, 4), oneSet(3, 6)),
      round(2, oneSet(7, 5), oneSet(4, 6)),
      round(3, oneSet(7, 6), oneSet(2, 6)),
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

  it("requires Match Tie-break after a 2-2 result with 6 or 8 players", () => {
    const sixPlayerMatchup = { id: "m1", teamA: createTeam("a", "Hold A", 6), teamB: createTeam("b", "Hold B", 6) };
    const score = calculateTeamVsTeamMatchScore(
      sixPlayerMatchup,
      [round(1, oneSet(6, 4), oneSet(3, 6)), round(2, oneSet(6, 2), oneSet(4, 6))],
      undefined,
      { playersPerTeam: 6 },
    );

    expect(score).toMatchObject({ teamAWins: 2, teamBWins: 2, tieBreakRequired: true, winnerTeamId: undefined });
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

function oneSet(teamAPoints: number, teamBPoints: number) {
  return { sets: [{ teamAPoints, teamBPoints }] };
}

function bestOfThree(...sets: Array<[number, number]>) {
  return { sets: sets.map(([teamAPoints, teamBPoints]) => ({ teamAPoints, teamBPoints })) };
}

function round(roundNumber: 1 | 2 | 3, match1: ReturnType<typeof oneSet>, match2: ReturnType<typeof oneSet>): TeamVsTeamRoundResult {
  return { roundNumber, match1, match2 };
}