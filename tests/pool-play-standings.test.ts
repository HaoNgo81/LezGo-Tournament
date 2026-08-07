import { describe, expect, it } from "vitest";
import {
  calculateInitialPoolStandings,
  createInitialPoolStage,
  type InitialPoolStage,
  type PoolParticipant,
  type PoolPlayConfig,
} from "../lib/tournament-setup";

function createParticipants(count: number, prefix = "Deltager"): PoolParticipant[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `participant-${index + 1}`,
    name: `${prefix} ${index + 1}`,
  }));
}

function createStage(
  participantType: PoolPlayConfig["participantType"],
  poolCount: number,
  participantsPerPool: number,
): InitialPoolStage {
  return createInitialPoolStage(
    {
      participantType,
      poolCount,
      participantsPerPool,
      advancementMode: participantType === "player" && poolCount < 4 ? "crossMatches" : "placementPools",
      unmatchedResolution: "bye",
      ...(participantType === "team" ? { teamPlayersPerTeam: 6 as const } : {}),
    },
    createParticipants(poolCount * participantsPerPool),
  );
}

describe("pool-play standings", () => {
  it("returns one isolated standings table for each pair pool", () => {
    const stage = createStage("pair", 2, 2);
    const [poolOneMatch] = stage.pools[0].encounters;
    const [poolTwoMatch] = stage.pools[1].encounters;
    const tables = calculateInitialPoolStandings(stage, [
      { matchId: poolOneMatch.id, teamAPoints: 21, teamBPoints: 12 },
      { matchId: poolTwoMatch.id, teamAPoints: 8, teamBPoints: 8 },
    ]);

    expect(tables).toHaveLength(2);
    expect(tables[0]).toMatchObject({ poolId: "pool-1", poolName: "Pulje 1", participantType: "pair" });
    expect(tables[0].rows).toHaveLength(2);
    expect(tables[0].rows[0]).toMatchObject({ id: "participant-1", matchPoints: 3, pointsFor: 21, wins: 1 });
    expect(tables[0].rows.map((row) => row.id)).not.toContain("participant-3");
    expect(tables[1].rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "participant-3", matchPoints: 1, draws: 1 }),
      expect.objectContaining({ id: "participant-4", matchPoints: 1, draws: 1 }),
    ]));
  });

  it("ranks Americano players individually inside their own pool", () => {
    const stage = createStage("player", 2, 4);
    const firstMatch = stage.pools[0].americanoRounds[0].matches[0];
    const [table] = calculateInitialPoolStandings(stage, [
      { matchId: firstMatch.id, teamAPoints: 21, teamBPoints: 10 },
    ]);

    expect(table.participantType).toBe("player");
    expect(table.rows).toHaveLength(4);
    for (const winnerId of firstMatch.teamA.playerIds) {
      expect(table.rows.find((row) => row.id === winnerId)).toMatchObject({
        matchPoints: 3,
        pointsFor: 21,
        wins: 1,
      });
    }
  });

  it("includes Americano byes in each player's pool row", () => {
    const stage = createStage("player", 2, 5);
    const [table] = calculateInitialPoolStandings(stage, []);

    expect(table.rows.every((row) => row.pauseCount === 1)).toBe(true);
  });

  it("shows one standings row per team", () => {
    const stage = createStage("team", 1, 2);
    const [encounter] = stage.pools[0].encounters;
    const [table] = calculateInitialPoolStandings(stage, [
      { matchId: encounter.id, teamAPoints: 2, teamBPoints: 1 },
    ]);

    expect(table.participantType).toBe("team");
    expect(table.rows).toHaveLength(2);
    expect(table.rows[0]).toMatchObject({
      id: encounter.participantAId,
      name: "Deltager 1",
      matchPoints: 3,
      pointsFor: 2,
      wins: 1,
    });
  });

  it("uses the selected ranking mode independently in every pool", () => {
    const stage = createStage("pair", 1, 4);
    const firstMatch = findEncounter(stage, "participant-1", "participant-2");
    const secondMatch = findEncounter(stage, "participant-3", "participant-4");
    const results = [
      { matchId: firstMatch.id, teamAPoints: 8, teamBPoints: 7 },
      { matchId: secondMatch.id, teamAPoints: 30, teamBPoints: 31 },
    ];

    const [matchPointTable] = calculateInitialPoolStandings(stage, results, "matchPointsFirst");
    const [scorePointTable] = calculateInitialPoolStandings(stage, results, "partiPointsFirst");

    expect(rowIndex(matchPointTable, "participant-1")).toBeLessThan(rowIndex(matchPointTable, "participant-3"));
    expect(rowIndex(scorePointTable, "participant-3")).toBeLessThan(rowIndex(scorePointTable, "participant-1"));
  });

  it("rejects unknown, duplicate, non-integer, and negative results", () => {
    const stage = createStage("pair", 1, 2);
    const [encounter] = stage.pools[0].encounters;

    expect(() => calculateInitialPoolStandings(stage, [
      { matchId: "unknown", teamAPoints: 1, teamBPoints: 0 },
    ])).toThrow("Resultatet tilhører ikke puljespillet");
    expect(() => calculateInitialPoolStandings(stage, [
      { matchId: encounter.id, teamAPoints: 1, teamBPoints: 0 },
      { matchId: encounter.id, teamAPoints: 2, teamBPoints: 0 },
    ])).toThrow("mere end ét resultat");
    expect(() => calculateInitialPoolStandings(stage, [
      { matchId: encounter.id, teamAPoints: 1.5, teamBPoints: 0 },
    ])).toThrow("hele tal");
    expect(() => calculateInitialPoolStandings(stage, [
      { matchId: encounter.id, teamAPoints: -1, teamBPoints: 0 },
    ])).toThrow("må ikke være negative");
  });
});

function findEncounter(stage: InitialPoolStage, firstParticipantId: string, secondParticipantId: string) {
  const encounter = stage.pools[0].encounters.find((candidate) => (
    candidate.participantAId === firstParticipantId && candidate.participantBId === secondParticipantId
  ));

  if (!encounter) {
    throw new Error("Test encounter not found.");
  }

  return encounter;
}

function rowIndex(table: { rows: Array<{ id: string }> }, participantId: string): number {
  return table.rows.findIndex((row) => row.id === participantId);
}
