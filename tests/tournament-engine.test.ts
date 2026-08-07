import { describe, expect, it } from "vitest";
import {
  calculatePlayerStandings,
  calculateTeamStandings,
  createFixedPartnerTeams,
  createNextFixedMexicanoRoundFromTeamRanking,
  createNextMexicanoRoundFromPlayerRanking,
  createTournamentRounds,
  type MatchResult,
  type TournamentPlayer,
  type TournamentRound,
} from "../lib/tournament-engine";

const players: TournamentPlayer[] = [
  { id: "p1", name: "Anna" },
  { id: "p2", name: "Hassan" },
  { id: "p3", name: "Maja" },
  { id: "p4", name: "Noah" },
  { id: "p5", name: "Sofia" },
  { id: "p6", name: "Emil" },
  { id: "p7", name: "Clara" },
  { id: "p8", name: "Jonas" },
];

const tenPlayers: TournamentPlayer[] = [
  ...players,
  { id: "p9", name: "Liva" },
  { id: "p10", name: "Theo" },
];
const sixteenPlayers: TournamentPlayer[] = Array.from({ length: 16 }, (_, index) => ({
  id: `p${index + 1}`,
  name: `Spiller ${index + 1}`,
}));
const sixteenMixedPlayers: TournamentPlayer[] = [
  ...Array.from({ length: 8 }, (_, index) => ({
    id: `f${index + 1}`,
    name: `Kvinde ${index + 1}`,
    gender: "female" as const,
  })),
  ...Array.from({ length: 8 }, (_, index) => ({
    id: `m${index + 1}`,
    name: `Mand ${index + 1}`,
    gender: "male" as const,
  })),
];
const mixedPlayers: TournamentPlayer[] = [
  { id: "f1", name: "Anna", gender: "female" },
  { id: "f2", name: "Maja", gender: "female" },
  { id: "f3", name: "Sofia", gender: "female" },
  { id: "f4", name: "Clara", gender: "female" },
  { id: "m1", name: "Hassan", gender: "male" },
  { id: "m2", name: "Noah", gender: "male" },
  { id: "m3", name: "Emil", gender: "male" },
  { id: "m4", name: "Jonas", gender: "male" },
];

describe("tournament engine", () => {
  it.each([
    ["americano", sixteenPlayers],
    ["mixed-americano", sixteenMixedPlayers],
    ["fixed-partner-americano", sixteenPlayers],
  ] as const)("fills 4 courts for every generated %s round with 16 players", (format, formatPlayers) => {
    const rounds = createTournamentRounds({ format, players: formatPlayers, rounds: 5, courts: 4, firstRoundOrder: "manual" });

    expect(rounds).toHaveLength(5);
    expect(rounds.every((round) => round.matches.length === 4)).toBe(true);
    expect(rounds.every((round) => (round.byePlayerIds ?? []).length === 0)).toBe(true);
  });

  it.each([
    "mexicano",
    "fixed-partner-mexicano",
  ] as const)("fills 4 courts for the first ranked %s round with 16 players", (format) => {
    const rounds = createTournamentRounds({ format, players: sixteenPlayers, rounds: 5, courts: 4, firstRoundOrder: "manual" });

    expect(rounds).toHaveLength(1);
    expect(rounds[0].matches).toHaveLength(4);
    expect(rounds[0].byePlayerIds ?? []).toHaveLength(0);
  });

  it("creates manual Americano opening round as 1+2 vs 3+4", () => {
    const [round] = createTournamentRounds({ format: "americano", players, rounds: 1, courts: 2, firstRoundOrder: "manual" });

    expect(round.matches[0].teamA.playerIds).toEqual(["p1", "p2"]);
    expect(round.matches[0].teamB.playerIds).toEqual(["p3", "p4"]);
    expect(round.matches[1].teamA.playerIds).toEqual(["p5", "p6"]);
    expect(round.matches[1].teamB.playerIds).toEqual(["p7", "p8"]);
  });

  it("creates Mexicano rounds from ranking as 1+3 vs 2+4", () => {
    const round = createNextMexicanoRoundFromPlayerRanking(players, 2);

    expect(round.matches[0].roundNumber).toBe(2);
    expect(round.matches[0].teamA.playerIds).toEqual(["p1", "p3"]);
    expect(round.matches[0].teamB.playerIds).toEqual(["p2", "p4"]);
    expect(round.matches[1].teamA.playerIds).toEqual(["p5", "p7"]);
    expect(round.matches[1].teamB.playerIds).toEqual(["p6", "p8"]);
  });

  it("creates 4-court Mexicano rounds as 1+3 vs 2+4, 5+7 vs 6+8, and so on", () => {
    const round = createNextMexicanoRoundFromPlayerRanking(sixteenPlayers, 2, 4);

    for (let courtIndex = 0; courtIndex < 4; courtIndex += 1) {
      const baseRank = courtIndex * 4;

      expect(round.matches[courtIndex]).toMatchObject({
        courtNumber: courtIndex + 1,
        teamA: {
          playerIds: [sixteenPlayers[baseRank].id, sixteenPlayers[baseRank + 2].id],
        },
        teamB: {
          playerIds: [sixteenPlayers[baseRank + 1].id, sixteenPlayers[baseRank + 3].id],
        },
      });
    }
  });

  it("creates Fast Makker Mexicano rounds as rank 1 vs 2, 3 vs 4, and so on", () => {
    const teamsByRanking = createFixedPartnerTeams(players);
    const round = createNextFixedMexicanoRoundFromTeamRanking(teamsByRanking, 2, 2);

    expect(round.matches[0]).toMatchObject({
      courtNumber: 1,
      teamA: teamsByRanking[0],
      teamB: teamsByRanking[1],
    });
    expect(round.matches[1]).toMatchObject({
      courtNumber: 2,
      teamA: teamsByRanking[2],
      teamB: teamsByRanking[3],
    });
  });

  it("keeps fixed partners through all fixed partner Americano rounds", () => {
    const rounds = createTournamentRounds({ format: "fixed-partner-americano", players, rounds: 3, courts: 2 });
    const expectedTeamIds = createFixedPartnerTeams(players).map((team) => team.id).sort();

    for (const round of rounds) {
      const teamIds = round.matches.flatMap((match) => [match.teamA.id, match.teamB.id]).sort();
      expect(teamIds).toEqual(expectedTeamIds);
    }
  });

  it("uses supplied pair names in fixed-team standings", () => {
    const teams = createFixedPartnerTeams(players);
    const standings = calculateTeamStandings(
      teams.map((team) => ({
        team,
        name: team.playerIds.map((playerId) => players.find((player) => player.id === playerId)?.name).join(" / "),
      })),
      [],
      [],
    );

    expect(standings.find((row) => row.id === teams[0].id)?.name).toBe("Anna / Hassan");
    expect(standings).toHaveLength(4);
  });

  it("creates Mixed Americano teams with one woman and one man", () => {
    const rounds = createTournamentRounds({ format: "mixed-americano", players: mixedPlayers, rounds: 2, courts: 2 });
    const playerById = new Map(mixedPlayers.map((player) => [player.id, player]));

    for (const round of rounds) {
      for (const match of round.matches) {
        for (const team of [match.teamA, match.teamB]) {
          const genders = team.playerIds.map((playerId) => playerById.get(playerId)?.gender).sort();
          expect(genders).toEqual(["female", "male"]);
        }
      }
    }
  });

  it("uses head-to-head only after equal match points and won parti points", () => {
    const teams = createFixedPartnerTeams(players);
    const rounds: TournamentRound[] = [
      {
        roundNumber: 1,
        matches: [
          { id: "m1", roundNumber: 1, courtNumber: 1, teamA: teams[2], teamB: teams[1] },
          { id: "m2", roundNumber: 1, courtNumber: 2, teamA: teams[1], teamB: teams[0] },
        ],
      },
      {
        roundNumber: 2,
        matches: [
          { id: "m3", roundNumber: 2, courtNumber: 1, teamA: teams[2], teamB: teams[0] },
          { id: "m4", roundNumber: 2, courtNumber: 2, teamA: teams[2], teamB: teams[3] },
          { id: "m5", roundNumber: 2, courtNumber: 3, teamA: teams[1], teamB: teams[3] },
        ],
      },
    ];
    const results: MatchResult[] = [
      { matchId: "m1", teamAPoints: 10, teamBPoints: 8 },
      { matchId: "m2", teamAPoints: 10, teamBPoints: 4 },
      { matchId: "m3", teamAPoints: 4, teamBPoints: 10 },
      { matchId: "m4", teamAPoints: 10, teamBPoints: 10 },
      { matchId: "m5", teamAPoints: 6, teamBPoints: 6 },
    ];

    const standings = calculateTeamStandings(teams, rounds, results);

    expect(standings[0]).toMatchObject({ id: teams[2].id, matchPoints: 4, pointsFor: 24 });
    expect(standings[1]).toMatchObject({ id: teams[1].id, matchPoints: 4, pointsFor: 24 });
    expect(standings[0].headToHeadMatchPoints).toBe(3);
    expect(standings[1].headToHeadMatchPoints).toBe(0);
  });

  it("ranks tied teams by won parti points before head-to-head", () => {
    const teams = createFixedPartnerTeams(players);
    const rounds: TournamentRound[] = [
      {
        roundNumber: 1,
        matches: [
          { id: "m1", roundNumber: 1, courtNumber: 1, teamA: teams[0], teamB: teams[1] },
          { id: "m2", roundNumber: 1, courtNumber: 2, teamA: teams[0], teamB: teams[2] },
          { id: "m3", roundNumber: 1, courtNumber: 3, teamA: teams[1], teamB: teams[2] },
        ],
      },
    ];
    const results: MatchResult[] = [
      { matchId: "m1", teamAPoints: 20, teamBPoints: 21 },
      { matchId: "m2", teamAPoints: 21, teamBPoints: 1 },
      { matchId: "m3", teamAPoints: 1, teamBPoints: 21 },
    ];

    const standings = calculateTeamStandings(teams.slice(0, 3), rounds, results);

    expect(standings[0]).toMatchObject({ id: teams[0].id, matchPoints: 3, pointsFor: 41 });
    expect(standings.find((row) => row.id === teams[1].id)).toMatchObject({ matchPoints: 3, pointsFor: 22, headToHeadMatchPoints: 3 });
  });

  it("lets the organiser rank by either match points or won parti points", () => {
    const teams = createFixedPartnerTeams(players);
    const rounds: TournamentRound[] = [
      {
        roundNumber: 1,
        matches: [
          { id: "m1", roundNumber: 1, courtNumber: 1, teamA: teams[0], teamB: teams[1] },
          { id: "m2", roundNumber: 1, courtNumber: 2, teamA: teams[2], teamB: teams[3] },
        ],
      },
    ];
    const results: MatchResult[] = [
      { matchId: "m1", teamAPoints: 8, teamBPoints: 7 },
      { matchId: "m2", teamAPoints: 30, teamBPoints: 31 },
    ];

    const matchPointStandings = calculateTeamStandings(teams, rounds, results, "matchPointsFirst");
    const partiPointStandings = calculateTeamStandings(teams, rounds, results, "partiPointsFirst");

    expect(matchPointStandings.findIndex((row) => row.id === teams[0].id)).toBeLessThan(matchPointStandings.findIndex((row) => row.id === teams[2].id));
    expect(partiPointStandings.findIndex((row) => row.id === teams[2].id)).toBeLessThan(partiPointStandings.findIndex((row) => row.id === teams[0].id));
  });

  it("rejects fixed partner tournaments with an uneven player count", () => {
    expect(() => createTournamentRounds({ format: "fixed-partner-americano", players: tenPlayers.slice(0, 9), rounds: 1, courts: 2 })).toThrow("Fast Makker kraever et lige antal spillere.");
  });
  it("creates fair pauses when there are more players than active court slots", () => {
    const rounds = createTournamentRounds({ format: "americano", players: tenPlayers, rounds: 3, courts: 2, firstRoundOrder: "manual" });

    expect(rounds).toHaveLength(3);
    expect(rounds[0].matches).toHaveLength(2);
    expect(rounds[0].byePlayerIds).toHaveLength(2);
    expect(rounds[1].byePlayerIds).toHaveLength(2);
    expect(rounds[0].byePlayerIds?.filter((playerId) => rounds[1].byePlayerIds?.includes(playerId))).toHaveLength(0);
  });

  it("adds pause counts to standings", () => {
    const rounds = createTournamentRounds({ format: "americano", players: tenPlayers, rounds: 1, courts: 2, firstRoundOrder: "manual" });
    const pausedPlayerId = rounds[0].byePlayerIds?.[0];

    const standings = calculatePlayerStandings(tenPlayers, rounds, []);

    expect(pausedPlayerId).toBeDefined();
    expect(standings.find((row) => row.id === pausedPlayerId)).toMatchObject({ pauseCount: 1 });
    expect(standings.find((row) => row.id === "p1")).toMatchObject({ pauseCount: 0 });
  });
});


