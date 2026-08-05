import { describe, expect, it } from "vitest";
import { advanceTeamVsTeamFourTeamBracket, calculateTeamVsTeamPlacements, createTeamVsTeamTournamentFromSetup, createTournamentFromSetup, parsePlayers, saveTeamVsTeamTieBreak } from "../lib/tournament-setup";
import type { TeamVsTeamTeam } from "../lib/team-vs-team";

const playerText = ["Anna", "Hassan", "Maja", "Noah", "Sofia", "Emil", "Clara", "Jonas"].join("\n");
const femalePlayerText = ["Anna", "Maja", "Sofia", "Clara"].join("\n");
const malePlayerText = ["Hassan", "Noah", "Emil", "Jonas"].join("\n");

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
      teams: [teamA, teamB],
    });

    expect(tournament).toMatchObject({
      name: "Klubkamp",
      status: "setup",
      scoringMode: "Fri scoring",
      teamCount: 2,
    });
    expect(tournament.teams).toHaveLength(2);
    expect(tournament.activeMatchupId).toBe("holdkamp-1");
    expect(tournament.matchups[0]).toMatchObject({ id: "holdkamp-1", teamAId: "team-a", teamBId: "team-b", lineups: [], roundResults: [] });
  });

  it("creates four-team Team vs. Team setup with two semifinals", () => {
    const tournament = createTeamVsTeamTournamentFromSetup({
      name: "Klubfinaler",
      date: "2026-08-05",
      startTime: "18:00",
      scoringMode: "Fri scoring",
      teamCount: 4,
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
  it("saves Team vs. Team Match Tie-break on the active holdkamp", () => {
    const tournament = createTeamVsTeamTournamentFromSetup({
      name: "Klubkamp",
      date: "2026-08-05",
      startTime: "18:00",
      scoringMode: "Fri scoring",
      teamCount: 2,
      teams: [teamA, teamB],
    });
    const match = tournament.matchups[0];
    const stateWithTiedMatch = {
      ...tournament,
      matchups: [
        {
          ...match,
          roundResults: [
            { roundNumber: 1 as const, match1: { teamAPoints: 6, teamBPoints: 4 }, match2: { teamAPoints: 3, teamBPoints: 6 } },
            { roundNumber: 2 as const, match1: { teamAPoints: 7, teamBPoints: 5 }, match2: { teamAPoints: 4, teamBPoints: 6 } },
            { roundNumber: 3 as const, match1: { teamAPoints: 7, teamBPoints: 6 }, match2: { teamAPoints: 2, teamBPoints: 6 } },
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

  it("rejects Club vs Club until it is specified", () => {
    expect(() =>
      createTournamentFromSetup({
        name: "Klubkamp",
        format: "Club vs Club",
        playerText,
        femalePlayerText: "",
        malePlayerText: "",
        courts: 2,
        rounds: 2,
        scoringMode: "Fri scoring",
        firstRoundOrder: "manual",
        rankingMode: "matchPointsFirst",
      }),
    ).toThrow("Club vs Club er ikke implementeret endnu.");
  });
});

function createStraightTeamAWinResults() {
  return [
    { roundNumber: 1 as const, match1: { teamAPoints: 6, teamBPoints: 4 }, match2: { teamAPoints: 6, teamBPoints: 3 } },
    { roundNumber: 2 as const, match1: { teamAPoints: 6, teamBPoints: 2 }, match2: { teamAPoints: 6, teamBPoints: 1 } },
    { roundNumber: 3 as const, match1: { teamAPoints: 6, teamBPoints: 5 }, match2: { teamAPoints: 6, teamBPoints: 4 } },
  ];
}

function createStraightTeamBWinResults() {
  return [
    { roundNumber: 1 as const, match1: { teamAPoints: 4, teamBPoints: 6 }, match2: { teamAPoints: 3, teamBPoints: 6 } },
    { roundNumber: 2 as const, match1: { teamAPoints: 2, teamBPoints: 6 }, match2: { teamAPoints: 1, teamBPoints: 6 } },
    { roundNumber: 3 as const, match1: { teamAPoints: 5, teamBPoints: 6 }, match2: { teamAPoints: 4, teamBPoints: 6 } },
  ];
}


