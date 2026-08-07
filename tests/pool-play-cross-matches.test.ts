import { describe, expect, it } from "vitest";
import {
  createCrossMatchStage,
  createInitialPoolStage,
  type InitialPoolStage,
  type PoolMatchResult,
  type PoolParticipant,
  type PoolPlayConfig,
  type PoolUnmatchedResolution,
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

describe("pool-play cross matches", () => {
  it("pairs first place with the neighboring pool's second place and vice versa", () => {
    const stage = createStage({
      participantType: "pair",
      poolCount: 2,
      participantsPerPool: 3,
      advancementMode: "crossMatches",
      unmatchedResolution: "bye",
    });
    const crossStage = createCrossMatchStage(stage, createCompleteResults(stage), "bye");

    expect(crossStage.groups).toHaveLength(1);
    expect(crossStage.groups[0]).toMatchObject({
      id: "cross-group-1",
      sourcePoolIds: ["pool-1", "pool-2"],
      scheduleType: "crossMatches",
    });
    expect(crossStage.groups[0].encounters).toEqual([
      expect.objectContaining({
        participantAId: "participant-1",
        participantBId: "participant-5",
        sourcePoolAId: "pool-1",
        sourcePoolBId: "pool-2",
        sourceRankA: 1,
        sourceRankB: 2,
      }),
      expect.objectContaining({
        participantAId: "participant-2",
        participantBId: "participant-4",
        sourceRankA: 2,
        sourceRankB: 1,
      }),
    ]);
    expect(crossStage.automaticAdvances).toHaveLength(0);
    expect(crossStage.groups[0].qualifiers).toEqual([
      expect.objectContaining({ participantId: "participant-1", sourcePoolName: "Pulje 1", sourceRank: 1 }),
      expect.objectContaining({ participantId: "participant-2", sourcePoolName: "Pulje 1", sourceRank: 2 }),
      expect.objectContaining({ participantId: "participant-4", sourcePoolName: "Pulje 2", sourceRank: 1 }),
      expect.objectContaining({ participantId: "participant-5", sourcePoolName: "Pulje 2", sourceRank: 2 }),
    ]);
  });

  it("creates an Americano rotation for the four qualifying individual players", () => {
    const stage = createStage({
      participantType: "player",
      poolCount: 2,
      participantsPerPool: 4,
      advancementMode: "crossMatches",
      unmatchedResolution: "bye",
    });
    const crossStage = createCrossMatchStage(stage, createCompleteResults(stage), "bye");
    const [group] = crossStage.groups;
    const partnerKeys = group.americanoRounds.flatMap((round) => (
      round.matches.flatMap((match) => [match.teamA, match.teamB])
    )).map((team) => [...team.playerIds].sort().join(":"));

    expect(group.scheduleType).toBe("americanoRotation");
    expect(group.qualifiers).toHaveLength(4);
    expect(group.encounters).toHaveLength(0);
    expect(group.americanoRounds).toHaveLength(3);
    expect(new Set(partnerKeys)).toHaveLength(6);
  });

  it("preserves three team submatches for teams with six players", () => {
    const stage = createStage({
      participantType: "team",
      poolCount: 2,
      participantsPerPool: 2,
      advancementMode: "crossMatches",
      unmatchedResolution: "bye",
      teamPlayersPerTeam: 6,
    });
    const crossStage = createCrossMatchStage(stage, createCompleteResults(stage), "bye");

    expect(crossStage.groups[0].encounters).toHaveLength(2);
    expect(crossStage.groups[0].encounters.every((encounter) => encounter.matchesPerTeam === 3)).toBe(true);
  });

  it.each(["bye", "walkover"] as const)(
    "automatically advances both qualifiers from an unmatched pool by %s",
    (resolution: PoolUnmatchedResolution) => {
      const stage = createStage({
        participantType: "pair",
        poolCount: 3,
        participantsPerPool: 2,
        advancementMode: "crossMatches",
        unmatchedResolution: resolution,
      });
      const crossStage = createCrossMatchStage(stage, createCompleteResults(stage), resolution);

      expect(crossStage.groups).toHaveLength(1);
      expect(crossStage.automaticAdvances).toEqual([
        expect.objectContaining({
          participantId: "participant-5",
          sourcePoolId: "pool-3",
          sourcePoolName: "Pulje 3",
          sourceRank: 1,
          resolution,
          advancesAutomatically: true,
        }),
        expect.objectContaining({
          participantId: "participant-6",
          sourcePoolId: "pool-3",
          sourcePoolName: "Pulje 3",
          sourceRank: 2,
          resolution,
          advancesAutomatically: true,
        }),
      ]);
    },
  );

  it("creates an Americano placement group for an unmatched final player pool", () => {
    const stage = createStage({
      participantType: "player",
      poolCount: 3,
      participantsPerPool: 4,
      advancementMode: "crossMatches",
      unmatchedResolution: "bye",
    });
    const crossStage = createCrossMatchStage(stage, createCompleteResults(stage), "bye");

    expect(crossStage.groups).toHaveLength(1);
    expect(crossStage.automaticAdvances).toEqual([]);
    expect(crossStage.unmatchedPlacementGroups).toEqual([
      expect.objectContaining({
        id: "unmatched-placement-2",
        name: "Placeringsspil 2",
        sourcePoolId: "pool-3",
        sourcePoolName: "Pulje 3",
        finalPlacementFrom: 5,
        finalPlacementTo: 8,
      }),
    ]);
    expect(crossStage.unmatchedPlacementGroups[0].participants).toHaveLength(4);
    expect(crossStage.unmatchedPlacementGroups[0].americanoRounds).toHaveLength(3);
  });

  it("requires every initial pool match to be registered", () => {
    const stage = createStage({
      participantType: "pair",
      poolCount: 2,
      participantsPerPool: 2,
      advancementMode: "crossMatches",
      unmatchedResolution: "bye",
    });
    const incompleteResults = createCompleteResults(stage).slice(0, -1);

    expect(() => createCrossMatchStage(stage, incompleteResults, "bye")).toThrow(
      "Alle kampe i de indledende puljer skal være registreret",
    );
  });

  it("defensively rejects fewer than two source pools", () => {
    const stage = createStage({
      participantType: "pair",
      poolCount: 1,
      participantsPerPool: 2,
      advancementMode: "placementPools",
      unmatchedResolution: "bye",
    });

    expect(() => createCrossMatchStage(stage, createCompleteResults(stage), "bye")).toThrow(
      "Krydskampe kræver mindst 2 indledende puljer.",
    );
  });
});
