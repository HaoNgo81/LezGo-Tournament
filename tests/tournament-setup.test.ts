import { describe, expect, it } from "vitest";
import { advanceTeamVsTeamFourTeamBracket, calculateTeamVsTeamPlacements, calculateTeamVsTeamStandings, createTeamVsTeamTournamentFromSetup, finishTeamVsTeamTournament, createTournamentFromSetup, parsePlayers, saveTeamVsTeamTieBreak } from "../lib/tournament-setup";
import type { TeamVsTeamRoundResult, TeamVsTeamTeam } from "../lib/team-vs-team";

const playerText = ["Anna", "Hassan", "Maja", "Noah", "Sofia", "Emil", "Clara", "Jonas"].join("\n");
const femalePlayerText = ["Anna", "Maja", "Sofia", "Clara"].join("\n");
const malePlayerText = ["Hassan", "Noah", "Emil", "Jonas"].join("\n");

const teamA = createTeam("a", "Hold A");
const teamB = createTeam("b", "Hold B");
const teamC = createTeam("c", "Hold C");
const teamD = createTeam("d", "Hold D");

describe("tournament setup", () => {
  it("parses one player per line", () => {
    expect(parsePlayers("Anna\nHassan\n\nMaja")).toEqual([
      { id: "p1", name: "Anna" },
      { id: "p2", name: "Hassan" },
      { id: "p3", name: "Maja" },
    ]);
  });

  it("creates a local Americano tournament state from setup input and stores scoring mode", () => {
    const tournament = createTournamentFromSetup({
      name: "Fredag Americano",
      format: "Americano",
      playerText,
      femalePlayerText: "",
      malePlayerText: "",
      courts: 2,
      rounds: 2,
      scoringMode: "Fri scoring",
      firstRoundOrder: "manual",
      rankingMode: "matchPointsFirst",
    });

    expect(tournament).toMatchObject({
      tournamentName: "Fredag Americano",
      format: "americano",
      status: "active",
      activeRoundNumber: 1,
      scoringMode: "Fri scoring",
      rankingMode: "matchPointsFirst",
    });
    expect(tournament.players).toHaveLength(8);
    expect(tournament.rounds).toHaveLength(2);
  });

  it("stores selected time limit for timed scoring", () => {
    const tournament = createTournamentFromSetup({
      name: "Tid Americano",
      format: "Americano",
      playerText,
      femalePlayerText: "",
      malePlayerText: "",
      courts: 2,
      rounds: 2,
      scoringMode: "Spil på tid",
      timeLimitMinutes: 12,
      firstRoundOrder: "manual",
      rankingMode: "matchPointsFirst",
    });

    expect(tournament).toMatchObject({ scoringMode: "Spil på tid", timeLimitMinutes: 12 });
  });

  it("creates Mixed Americano from separate women and men fields", () => {
    const tournament = createTournamentFromSetup({
      name: "Mixed fredag",
      format: "Mixed Americano",
      playerText: "",
      femalePlayerText,
      malePlayerText,
      courts: 2,
      rounds: 2,
      scoringMode: "Fri scoring",
      firstRoundOrder: "manual",
      rankingMode: "partiPointsFirst",
    });

    expect(tournament.format).toBe("mixed-americano");
    expect(tournament.players.filter((player) => player.gender === "female")).toHaveLength(4);
    expect(tournament.players.filter((player) => player.gender === "male")).toHaveLength(4);
    expect(tournament.rankingMode).toBe("partiPointsFirst");
  });

  it("creates Team vs. Team setup with free scoring", () => {
    const tournament = createTeamVsTeamTournamentFromSetup({
      name: "Klubkamp",
      date: "2026-08-05",
      startTime: "18:00",
      scoringMode: "Fri scoring",
      teamCount: 2,
      playersPerTeam: 4,
      matchFormat: "oneSet",
      teams: [teamA, teamB],
    });

    expect(tournament).toMatchObject({
      name: "Klubkamp",
      status: "setup",
      scoringMode: "Fri scoring",
      teamCount: 2,
      playersPerTeam: 4,
      matchFormat: "oneSet",
      maxRounds: 3,
    });
    expect(tournament.teams).toHaveLength(2);
    expect(tournament.activeMatchupId).toBe("holdkamp-1");
    expect(tournament.matchups[0]).toMatchObject({ id: "holdkamp-1", teamAId: "team-a", teamBId: "team-b", lineups: [], roundResults: [] });
  });

  it("creates Team vs. Team setup with 6 players and 2 rounds", () => {
    const tournament = createTeamVsTeamTournamentFromSetup({
      name: "Klubkamp 6",
      date: "2026-08-05",
      startTime: "18:00",
      scoringMode: "Fri scoring",
      teamCount: 2,
      playersPerTeam: 6,
      matchFormat: "bestOfThree",
      teams: [createTeam("a", "Hold A", 6), createTeam("b", "Hold B", 6)],
    });

    expect(tournament.playersPerTeam).toBe(6);
    expect(tournament.matchFormat).toBe("bestOfThree");
    expect(tournament.maxRounds).toBe(2);
  });

  it("creates four-team Team vs. Team setup with two semifinals", () => {
    const tournament = createTeamVsTeamTournamentFromSetup({
      name: "Klubfinaler",
      date: "2026-08-05",
      startTime: "18:00",
      scoringMode: "Fri scoring",
      teamCount: 4,
      playersPerTeam: 4,
      matchFormat: "oneSet",
      teams: [teamA, teamB, teamC, teamD],
    });

    expect(tournament.activeMatchupId).toBe("semifinale-1");
    expect(tournament.matchups).toMatchObject([
      { id: "semifinale-1", teamAId: "team-a", teamBId: "team-b" },
      { id: "semifinale-2", teamAId: "team-c", teamBId: "team-d" },
    ]);
  });

  it("advances four-team Team vs. Team semifinals to final and placement match", () => {
    const tournament = createTeamVsTeamTournamentFromSetup({
      name: "Klubfinaler",
      date: "2026-08-05",
      startTime: "18:00",
      scoringMode: "Fri scoring",
      teamCount: 4,
      playersPerTeam: 4,
      matchFormat: "oneSet",
      teams: [teamA, teamB, teamC, teamD],
    });
    const stateWithDecidedSemis = {
      ...tournament,
      matchups: tournament.matchups.map((match) => ({
        ...match,
        roundResults: createStraightTeamAWinResults(),
      })),
    };

    const advanced = advanceTeamVsTeamFourTeamBracket(stateWithDecidedSemis);

    expect(advanced.activeMatchupId).toBe("finale");
    expect(advanced.matchups).toHaveLength(4);
    expect(advanced.matchups.find((match) => match.id === "finale")).toMatchObject({ teamAId: "team-a", teamBId: "team-c" });
    expect(advanced.matchups.find((match) => match.id === "placeringskamp")).toMatchObject({ teamAId: "team-b", teamBId: "team-d" });
  });

  it("calculates final placements after final and placement match are decided", () => {
    const tournament = createTeamVsTeamTournamentFromSetup({
      name: "Klubfinaler",
      date: "2026-08-05",
      startTime: "18:00",
      scoringMode: "Fri scoring",
      teamCount: 4,
      playersPerTeam: 4,
      matchFormat: "oneSet",
      teams: [teamA, teamB, teamC, teamD],
    });
    const advanced = advanceTeamVsTeamFourTeamBracket({
      ...tournament,
      matchups: tournament.matchups.map((match) => ({ ...match, roundResults: createStraightTeamAWinResults() })),
    });
    const finished = {
      ...advanced,
      matchups: advanced.matchups.map((match) => {
        if (match.id === "finale") {
          return { ...match, roundResults: createStraightTeamBWinResults() };
        }

        if (match.id === "placeringskamp") {
          return { ...match, roundResults: createStraightTeamAWinResults() };
        }

        return match;
      }),
    };

    expect(calculateTeamVsTeamPlacements(finished)).toEqual([
      { rank: 1, teamId: "team-c" },
      { rank: 2, teamId: "team-a" },
      { rank: 3, teamId: "team-b" },
      { rank: 4, teamId: "team-d" },
    ]);
  });

  it("finishes Team vs. Team and keeps a complete team standing", () => {
    const tournament = createTeamVsTeamTournamentFromSetup({
      name: "Klubkamp",
      date: "2026-08-05",
      startTime: "18:00",
      scoringMode: "Fri scoring",
      teamCount: 2,
      playersPerTeam: 4,
      matchFormat: "oneSet",
      teams: [teamA, teamB],
    });
    const decidedTournament = {
      ...tournament,
      matchups: [{ ...tournament.matchups[0], roundResults: createStraightTeamAWinResults() }],
    };

    const finished = finishTeamVsTeamTournament(decidedTournament, "2026-08-05T18:30:00.000Z");
    const standings = calculateTeamVsTeamStandings(finished);

    expect(finished).toMatchObject({ status: "finished", finishedAt: "2026-08-05T18:30:00.000Z" });
    expect(standings).toEqual([
      { rank: 1, teamId: "team-a", teamName: "Hold A", played: 1, won: 1, lost: 0, matchWins: 6, matchLosses: 0 },
      { rank: 2, teamId: "team-b", teamName: "Hold B", played: 1, won: 0, lost: 1, matchWins: 0, matchLosses: 6 },
    ]);
  });
  it("saves Team vs. Team Match Tie-break on the active holdkamp", () => {
    const tournament = createTeamVsTeamTournamentFromSetup({
      name: "Klubkamp",
      date: "2026-08-05",
      startTime: "18:00",
      scoringMode: "Fri scoring",
      teamCount: 2,
      playersPerTeam: 4,
      matchFormat: "oneSet",
      teams: [teamA, teamB],
    });
    const match = tournament.matchups[0];
    const stateWithTiedMatch = {
      ...tournament,
      matchups: [
        {
          ...match,
          roundResults: [
            round(1, 6, 4, 3, 6),
            round(2, 7, 5, 4, 6),
            round(3, 7, 6, 2, 6),
          ],
        },
      ],
    };

    const updatedState = saveTeamVsTeamTieBreak(
      stateWithTiedMatch,
      { id: match.id, teamA, teamB },
      { teamAPlayerIds: ["a1", "a2"], teamBPlayerIds: ["b1", "b2"], result: { teamAPoints: 11, teamBPoints: 9 } },
    );

    expect(updatedState.matchups[0].tieBreak).toMatchObject({ result: { teamAPoints: 11, teamBPoints: 9 } });
  });

  it("rejects duplicate player names", () => {
    expect(() => parsePlayers("Anna\nanna")).toThrow("Spillernavn skal være unikt: anna");
  });

});

function createTeam(idPrefix: string, name: string, count = 4): TeamVsTeamTeam {
  return {
    id: `team-${idPrefix}`,
    name,
    captainPlayerId: `${idPrefix}1`,
    players: Array.from({ length: count }, (_, index) => ({ id: `${idPrefix}${index + 1}`, name: `${name} spiller ${index + 1}` })),
  };
}

function round(roundNumber: 1 | 2 | 3, match1TeamAPoints: number, match1TeamBPoints: number, match2TeamAPoints: number, match2TeamBPoints: number): TeamVsTeamRoundResult {
  return {
    roundNumber,
    match1: { sets: [{ teamAPoints: match1TeamAPoints, teamBPoints: match1TeamBPoints }] },
    match2: { sets: [{ teamAPoints: match2TeamAPoints, teamBPoints: match2TeamBPoints }] },
  };
}

function createStraightTeamAWinResults(): TeamVsTeamRoundResult[] {
  return [
    round(1, 6, 4, 6, 3),
    round(2, 6, 2, 6, 1),
    round(3, 6, 5, 6, 4),
  ];
}

function createStraightTeamBWinResults(): TeamVsTeamRoundResult[] {
  return [
    round(1, 4, 6, 3, 6),
    round(2, 2, 6, 1, 6),
    round(3, 5, 6, 4, 6),
  ];
}
