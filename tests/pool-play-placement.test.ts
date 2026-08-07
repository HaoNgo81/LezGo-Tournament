import { describe, expect, it } from "vitest";
import {
  createInitialPoolStage,
  createPlacementPoolStage,
  type InitialPoolStage,
  type PoolMatchResult,
  type PoolParticipant,
  type PoolPlayConfig,
} from "../lib/tournament-setup";

function createParticipants(count: number): PoolParticipant[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `participant-${index + 1}`,
    name: `Deltager ${index + 1}`,
  }));
}

function createStage(config: PoolPlayConfig): InitialPoolStage {
  return createInitialPoolStage(config, createParticipants(config.poolCount * config.participantsPerPool));
}

function createCompleteResults(stage: InitialPoolStage): PoolMatchResult[] {
  return stage.pools.flatMap((pool) => (
    pool.scheduleType === "americanoRotation"
      ? pool.americanoRounds.flatMap((round) => round.matches.map((match) => ({
          matchId: match.id,
          teamAPoints: 21,
          teamBPoints: 10,
        })))
      : pool.encounters.map((encounter) => ({
          matchId: encounter.id,
          teamAPoints: 21,
          teamBPoints: 10,
        }))
  ));
}

describe("placement pools", () => {
  it("groups the same pair rank from every initial pool", () => {
    const stage = createStage({
      participantType: "pair",
      poolCount: 2,
      participantsPerPool: 3,
      advancementMode: "placementPools",
      unmatchedResolution: "bye",
    });
    const placementStage = createPlacementPoolStage(stage, createCompleteResults(stage));

    expect(placementStage.pools).toHaveLength(3);
    expect(placementStage.pools[0]).toMatchObject({
      id: "placement-pool-1",
      name: "Placeringspulje 1",
      sourceRank: 1,
      finalPlacementFrom: 1,
      finalPlacementTo: 2,
      participantIds: ["participant-1", "participant-4"],
      scheduleType: "roundRobin",
    });
    expect(placementStage.pools[1]).toMatchObject({
      sourceRank: 2,
      finalPlacementFrom: 3,
      finalPlacementTo: 4,
      participantIds: ["participant-2", "participant-5"],
    });
    expect(placementStage.pools[2]).toMatchObject({
      sourceRank: 3,
      finalPlacementFrom: 5,
      finalPlacementTo: 6,
      participantIds: ["participant-3", "participant-6"],
    });
    expect(placementStage.pools.every((pool) => pool.encounters.length === 1)).toBe(true);
  });

  it("creates Americano placement pools from at least four player pools", () => {
    const stage = createStage({
      participantType: "player",
      poolCount: 4,
      participantsPerPool: 4,
      advancementMode: "placementPools",
      unmatchedResolution: "bye",
    });
    const placementStage = createPlacementPoolStage(stage, createCompleteResults(stage));
    const sourcePoolByParticipantId = new Map(stage.pools.flatMap((pool) => (
      pool.participantIds.map((participantId) => [participantId, pool.id] as const)
    )));

    expect(placementStage.pools).toHaveLength(4);
    for (const pool of placementStage.pools) {
      expect(pool.scheduleType).toBe("americanoRotation");
      expect(pool.participantIds).toHaveLength(4);
      expect(new Set(pool.participantIds.map((participantId) => sourcePoolByParticipantId.get(participantId))).size).toBe(4);
      expect(pool.americanoRounds).toHaveLength(3);
      expect(pool.encounters).toHaveLength(0);
    }
  });

  it("preserves the approved number of matches in team placement encounters", () => {
    const stage = createStage({
      participantType: "team",
      poolCount: 2,
      participantsPerPool: 2,
      advancementMode: "placementPools",
      unmatchedResolution: "bye",
      teamPlayersPerTeam: 6,
    });
    const placementStage = createPlacementPoolStage(stage, createCompleteResults(stage));

    expect(placementStage.pools).toHaveLength(2);
    expect(placementStage.pools.every((pool) => (
      pool.encounters.length === 1 && pool.encounters[0].matchesPerTeam === 3
    ))).toBe(true);
  });

  it("requires every initial pool match to be registered", () => {
    const stage = createStage({
      participantType: "pair",
      poolCount: 2,
      participantsPerPool: 2,
      advancementMode: "placementPools",
      unmatchedResolution: "bye",
    });
    const incompleteResults = createCompleteResults(stage).slice(0, -1);

    expect(() => createPlacementPoolStage(stage, incompleteResults)).toThrow(
      "Alle kampe i de indledende puljer skal være registreret",
    );
  });

  it("defensively rejects player placement pools with fewer than four source pools", () => {
    const stage = createInitialPoolStage({
      participantType: "player",
      poolCount: 2,
      participantsPerPool: 4,
      advancementMode: "crossMatches",
      unmatchedResolution: "bye",
    }, createParticipants(8));

    expect(() => createPlacementPoolStage(stage, createCompleteResults(stage))).toThrow(
      "Placeringspuljer for enkeltspillere kræver mindst 4 indledende puljer.",
    );
  });
});
