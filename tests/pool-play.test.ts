import { describe, expect, it } from "vitest";
import {
  createInitialPoolStage,
  createPoolAmericanoRounds,
  maxPoolCount,
  poolParticipantLimits,
  validatePoolPlayConfig,
  type PoolParticipant,
  type PoolPlayConfig,
} from "../lib/tournament-setup";

function createConfig(overrides: Partial<PoolPlayConfig> = {}): PoolPlayConfig {
  return {
    participantType: "player",
    poolCount: 2,
    participantsPerPool: 4,
    advancementMode: "crossMatches",
    unmatchedResolution: "bye",
    ...overrides,
  };
}

function createParticipants(count: number, prefix = "Deltager"): PoolParticipant[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `participant-${index + 1}`,
    name: `${prefix} ${index + 1}`,
  }));
}

describe("pool play configuration", () => {
  it("exposes the approved pool and participant limits", () => {
    expect(maxPoolCount).toBe(8);
    expect(poolParticipantLimits).toEqual({
      player: { minPerPool: 4, maxTotal: 32 },
      pair: { minPerPool: 2, maxTotal: 16 },
      team: { minPerPool: 2, maxTotal: 8 },
    });
  });

  it.each([
    ["player", 4, 8],
    ["pair", 3, 6],
    ["team", 2, 4],
  ] as const)("calculates the total number of %s participants", (participantType, participantsPerPool, expectedTotal) => {
    const config = validatePoolPlayConfig(createConfig({
      participantType,
      participantsPerPool,
      ...(participantType === "team" ? { teamPlayersPerTeam: 4 } : {}),
    }));

    expect(config.totalParticipants).toBe(expectedTotal);
  });

  it("accepts up to eight pools", () => {
    expect(validatePoolPlayConfig(createConfig({ poolCount: 8 })).poolCount).toBe(8);
  });

  it.each([
    ["player", 3, "Antal spillere skal være mindst 4 pr. pulje."],
    ["pair", 1, "Antal par skal være mindst 2 pr. pulje."],
    ["team", 1, "Antal hold skal være mindst 2 pr. pulje."],
  ] as const)("rejects too few %s participants per pool", (participantType, participantsPerPool, message) => {
    expect(() => validatePoolPlayConfig(createConfig({
      participantType,
      participantsPerPool,
      ...(participantType === "team" ? { teamPlayersPerTeam: 4 } : {}),
    }))).toThrow(message);
  });

  it.each([
    ["player", 5, 7, "Det samlede antal spillere må højst være 32."],
    ["pair", 6, 3, "Det samlede antal par må højst være 16."],
    ["team", 3, 3, "Det samlede antal hold må højst være 8."],
  ] as const)("rejects too many %s participants", (participantType, poolCount, participantsPerPool, message) => {
    expect(() => validatePoolPlayConfig(createConfig({
      participantType,
      poolCount,
      participantsPerPool,
      ...(participantType === "team" ? { teamPlayersPerTeam: 4 } : {}),
    }))).toThrow(message);
  });

  it("rejects more than eight pools", () => {
    expect(() => validatePoolPlayConfig(createConfig({ poolCount: 9 }))).toThrow("Antal puljer skal være mellem 1 og 8.");
  });

  it("requires at least two pools for cross matches", () => {
    expect(() => validatePoolPlayConfig(createConfig({ poolCount: 1, advancementMode: "crossMatches" }))).toThrow(
      "Krydskampe kræver mindst 2 puljer.",
    );
  });

  it("requires at least four initial pools for player placement pools", () => {
    expect(() => validatePoolPlayConfig(createConfig({
      poolCount: 3,
      advancementMode: "placementPools",
    }))).toThrow("Placeringspuljer for enkeltspillere kræver mindst 4 indledende puljer.");

    expect(validatePoolPlayConfig(createConfig({
      poolCount: 4,
      advancementMode: "placementPools",
    })).poolCount).toBe(4);
  });

  it.each([
    [4, 2],
    [6, 3],
  ] as const)("maps %i team players to %i matches", (teamPlayersPerTeam, matchesPerTeam) => {
    const config = validatePoolPlayConfig(createConfig({
      participantType: "team",
      participantsPerPool: 2,
      teamPlayersPerTeam,
    }));

    expect(config.matchesPerTeam).toBe(matchesPerTeam);
  });

  it("requires a supported team size", () => {
    expect(() => validatePoolPlayConfig(createConfig({
      participantType: "team",
      participantsPerPool: 2,
    }))).toThrow("Vælg 4 eller 6 spillere pr. hold.");
  });

  it.each(["bye", "walkover"] as const)("accepts %s for an unmatched pool", (unmatchedResolution) => {
    expect(validatePoolPlayConfig(createConfig({
      poolCount: 3,
      advancementMode: "crossMatches",
      unmatchedResolution,
    })).unmatchedResolution).toBe(unmatchedResolution);
  });
});

describe("initial pool stage", () => {
  it("distributes participants into pools in the provided order", () => {
    const stage = createInitialPoolStage(createConfig(), createParticipants(8));

    expect(stage.pools.map((pool) => pool.participantIds)).toEqual([
      ["participant-1", "participant-2", "participant-3", "participant-4"],
      ["participant-5", "participant-6", "participant-7", "participant-8"],
    ]);
  });

  it("marks player pools for Americano rotation", () => {
    const stage = createInitialPoolStage(createConfig(), createParticipants(8, "Spiller"));

    expect(stage.pools.every((pool) => pool.scheduleType === "americanoRotation")).toBe(true);
    expect(stage.pools.every((pool) => pool.encounters.length === 0)).toBe(true);
    expect(stage.pools.every((pool) => pool.americanoRounds.length === 3)).toBe(true);
  });

  it("creates every unique pair encounter once", () => {
    const stage = createInitialPoolStage(createConfig({
      participantType: "pair",
      poolCount: 1,
      participantsPerPool: 5,
      advancementMode: "placementPools",
    }), createParticipants(5, "Par"));

    expect(stage.pools[0].scheduleType).toBe("roundRobin");
    expect(stage.pools[0].encounters).toHaveLength(10);
    expect(new Set(stage.pools[0].encounters.map((encounter) => (
      [encounter.participantAId, encounter.participantBId].sort().join(":")
    ))).size).toBe(10);
  });

  it.each([
    [4, 2],
    [6, 3],
  ] as const)("creates team encounters with %i players and %i matches", (teamPlayersPerTeam, matchesPerTeam) => {
    const stage = createInitialPoolStage(createConfig({
      participantType: "team",
      poolCount: 1,
      participantsPerPool: 4,
      teamPlayersPerTeam,
      advancementMode: "placementPools",
    }), createParticipants(4, "Hold"));

    expect(stage.pools[0].encounters).toHaveLength(6);
    expect(stage.pools[0].encounters.every((encounter) => encounter.matchesPerTeam === matchesPerTeam)).toBe(true);
  });

  it("requires the exact configured participant count", () => {
    expect(() => createInitialPoolStage(createConfig(), createParticipants(7))).toThrow(
      "Der skal være præcis 8 deltagere.",
    );
  });

  it("rejects duplicate participant ids", () => {
    const participants = createParticipants(8);
    participants[7] = { ...participants[7], id: participants[0].id };

    expect(() => createInitialPoolStage(createConfig(), participants)).toThrow(
      "Deltager-id skal være unikt: participant-1",
    );
  });

  it("rejects duplicate participant names", () => {
    const participants = createParticipants(8);
    participants[7] = { ...participants[7], name: "deltager 1" };

    expect(() => createInitialPoolStage(createConfig(), participants)).toThrow(
      "Deltagernavn skal være unikt: deltager 1",
    );
  });
});

describe("pool Americano rotation", () => {
  it.each([
    [4, 3, 0],
    [5, 5, 1],
    [6, 6, 2],
    [7, 7, 3],
    [8, 7, 0],
  ] as const)("balances %i players across %i rounds", (playerCount, roundCount, byesPerRound) => {
    const playerIds = createParticipants(playerCount, "Spiller").map((participant) => participant.id);
    const rounds = createPoolAmericanoRounds("pool-1", playerIds);

    expect(rounds).toHaveLength(roundCount);
    expect(rounds.every((round) => round.byeParticipantIds.length === byesPerRound)).toBe(true);

    for (const round of rounds) {
      const playingIds = round.matches.flatMap((match) => [
        ...match.teamA.playerIds,
        ...match.teamB.playerIds,
      ]);

      expect(new Set([...playingIds, ...round.byeParticipantIds])).toEqual(new Set(playerIds));
      expect(new Set(playingIds).size).toBe(playingIds.length);
    }

    const byeCounts = playerIds.map((playerId) => (
      rounds.filter((round) => round.byeParticipantIds.includes(playerId)).length
    ));
    expect(Math.max(...byeCounts) - Math.min(...byeCounts)).toBeLessThanOrEqual(1);
  });

  it.each(Array.from({ length: 29 }, (_, index) => index + 4))(
    "avoids repeated partners for %i players",
    (playerCount) => {
    const rounds = createPoolAmericanoRounds(
      "pool-1",
      createParticipants(playerCount, "Spiller").map((participant) => participant.id),
    );
    const partnerKeys = rounds.flatMap((round) => round.matches.flatMap((match) => (
      [match.teamA, match.teamB].map((team) => [...team.playerIds].sort().join(":"))
    )));

    expect(new Set(partnerKeys).size).toBe(partnerKeys.length);
    },
  );

  it("creates a complete unique-partner rotation for 32 players", () => {
    const rounds = createPoolAmericanoRounds(
      "pool-1",
      createParticipants(32, "Spiller").map((participant) => participant.id),
    );
    const partnerKeys = rounds.flatMap((round) => round.matches.flatMap((match) => (
      [match.teamA, match.teamB].map((team) => [...team.playerIds].sort().join(":"))
    )));

    expect(rounds).toHaveLength(31);
    expect(rounds.every((round) => round.matches.length === 8)).toBe(true);
    expect(new Set(partnerKeys).size).toBe(496);
  });
});
