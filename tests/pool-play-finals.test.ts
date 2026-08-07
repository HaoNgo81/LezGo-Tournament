import { describe, expect, it } from "vitest";
import {
  createCrossMatchFinalStage,
  createCrossMatchStage,
  createInitialPoolStage,
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

describe("pool-play cross-match finals", () => {
  it("creates a final for semifinal winners and a bronze match for semifinal losers", () => {
    const crossStage = createPairCrossStage();
    const finalStage = createCrossMatchFinalStage(crossStage, [
      { matchId: "cross-group-1-match-1", teamAPoints: 21, teamBPoints: 12 },
      { matchId: "cross-group-1-match-2", teamAPoints: 15, teamBPoints: 21 },
    ]);

    expect(finalStage.groups).toEqual([
      expect.objectContaining({
        id: "cross-group-1-finals",
        name: "Finalespil 1",
        final: expect.objectContaining({
          id: "cross-group-1-final",
          placement: "final",
          participantAId: "participant-1",
          participantBId: "participant-3",
        }),
        bronze: expect.objectContaining({
          id: "cross-group-1-bronze",
          placement: "bronze",
          participantAId: "participant-4",
          participantBId: "participant-2",
        }),
      }),
    ]);
  });

  it("preserves team submatch count in final and bronze matches", () => {
    const stage = createStage({
      participantType: "team",
      poolCount: 2,
      participantsPerPool: 2,
      advancementMode: "crossMatches",
      unmatchedResolution: "bye",
      teamPlayersPerTeam: 6,
    });
    const crossStage = createCrossMatchStage(stage, createCompleteResults(stage), "bye");
    const finalStage = createCrossMatchFinalStage(crossStage, [
      { matchId: "cross-group-1-match-1", teamAPoints: 21, teamBPoints: 12 },
      { matchId: "cross-group-1-match-2", teamAPoints: 21, teamBPoints: 12 },
    ]);

    expect(finalStage.groups[0].final.matchesPerTeam).toBe(3);
    expect(finalStage.groups[0].bronze.matchesPerTeam).toBe(3);
  });

  it("requires every semifinal to have a non-drawn result", () => {
    const crossStage = createPairCrossStage();

    expect(() => createCrossMatchFinalStage(crossStage, [
      { matchId: "cross-group-1-match-1", teamAPoints: 21, teamBPoints: 12 },
    ])).toThrow("Krydskampen mangler resultat: cross-group-1-match-2");

    expect(() => createCrossMatchFinalStage(crossStage, [
      { matchId: "cross-group-1-match-1", teamAPoints: 21, teamBPoints: 21 },
      { matchId: "cross-group-1-match-2", teamAPoints: 21, teamBPoints: 12 },
    ])).toThrow("Uafgjort i krydskamp kræver match tiebreak: cross-group-1-match-1");
  });

  it("uses match tiebreak winners for drawn semifinals", () => {
    const finalStage = createCrossMatchFinalStage(createPairCrossStage(), [
      { matchId: "cross-group-1-match-1", teamAPoints: 20, teamBPoints: 20, tieBreakWinner: "teamB" },
      { matchId: "cross-group-1-match-2", teamAPoints: 21, teamBPoints: 12 },
    ]);

    expect(finalStage.groups[0].final).toMatchObject({
      participantAId: "participant-4",
      participantBId: "participant-2",
    });
    expect(finalStage.groups[0].bronze).toMatchObject({
      participantAId: "participant-1",
      participantBId: "participant-3",
    });
  });

  it("does not create final and bronze matches for individual Americano cross play", () => {
    const stage = createStage({
      participantType: "player",
      poolCount: 2,
      participantsPerPool: 4,
      advancementMode: "crossMatches",
      unmatchedResolution: "bye",
    });
    const crossStage = createCrossMatchStage(stage, createCompleteResults(stage), "bye");

    expect(() => createCrossMatchFinalStage(crossStage, [])).toThrow(
      "Individuelle krydskampe afgøres af Americano-stillingen og opretter ikke finale- og bronzekamp.",
    );
  });
});

function createPairCrossStage() {
  const stage = createStage({
    participantType: "pair",
    poolCount: 2,
    participantsPerPool: 2,
    advancementMode: "crossMatches",
    unmatchedResolution: "bye",
  });

  return createCrossMatchStage(stage, createCompleteResults(stage), "bye");
}
