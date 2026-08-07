import { describe, expect, it } from "vitest";
import {
  advanceLivePoolPlayState,
  advanceLivePoolPlayToFinals,
  attachLivePoolPlayState,
  createLivePoolPlayState,
  createMockLiveTournamentState,
  getInitialPoolProgress,
  getNextPoolPhaseProgress,
  getPoolFinalProgress,
  saveInitialPoolResult,
  saveNextPoolPhaseResult,
  savePoolFinalResult,
  savePoolPlacementTiebreakResult,
} from "../lib/live-scoring";
import {
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

describe("pool-play live state", () => {
  it("stores initial pool progress on a live tournament state", () => {
    const initialStage = createStage({
      participantType: "pair",
      poolCount: 2,
      participantsPerPool: 2,
      advancementMode: "placementPools",
      unmatchedResolution: "bye",
    });
    const poolPlay = createLivePoolPlayState(initialStage, "placementPools", "bye");
    const state = attachLivePoolPlayState(createMockLiveTournamentState(), poolPlay);
    const updatedState = saveInitialPoolResult(state, {
      matchId: initialStage.pools[0].encounters[0].id,
      teamAPoints: 21,
      teamBPoints: 12,
    });

    expect(updatedState.poolPlay?.phase).toBe("initial");
    expect(updatedState.poolPlay?.initialResults).toEqual([
      expect.objectContaining({ matchId: initialStage.pools[0].encounters[0].id }),
    ]);
    expect(getInitialPoolProgress(updatedState.poolPlay as NonNullable<typeof updatedState.poolPlay>)).toEqual({
      completedMatches: 1,
      totalMatches: 2,
      isComplete: false,
    });
  });

  it("advances complete initial pools to placement pools", () => {
    const initialStage = createStage({
      participantType: "pair",
      poolCount: 2,
      participantsPerPool: 2,
      advancementMode: "placementPools",
      unmatchedResolution: "bye",
    });
    const state = attachLivePoolPlayState(
      createMockLiveTournamentState(),
      createLivePoolPlayState(initialStage, "placementPools", "bye", createCompleteResults(initialStage)),
    );
    const advancedState = advanceLivePoolPlayState(state);

    expect(advancedState.poolPlay?.phase).toBe("placementPools");
    expect(advancedState.poolPlay?.placementStage?.pools).toHaveLength(2);
    expect(advancedState.poolPlay?.crossMatchStage).toBeUndefined();
  });

  it("advances complete initial pools to cross matches", () => {
    const initialStage = createStage({
      participantType: "pair",
      poolCount: 2,
      participantsPerPool: 2,
      advancementMode: "crossMatches",
      unmatchedResolution: "bye",
    });
    const state = attachLivePoolPlayState(
      createMockLiveTournamentState(),
      createLivePoolPlayState(initialStage, "crossMatches", "bye", createCompleteResults(initialStage)),
    );
    const advancedState = advanceLivePoolPlayState(state);

    expect(advancedState.poolPlay?.phase).toBe("crossMatches");
    expect(advancedState.poolPlay?.crossMatchStage?.groups).toHaveLength(1);
    expect(advancedState.poolPlay?.placementStage).toBeUndefined();
    expect(advancedState.poolPlay?.nextStageResults).toEqual([]);
    expect(getNextPoolPhaseProgress(advancedState.poolPlay as NonNullable<typeof advancedState.poolPlay>)).toEqual({
      completedMatches: 0,
      totalMatches: 2,
      isComplete: false,
    });
  });

  it("stores next phase results without changing initial pool results", () => {
    const initialStage = createStage({
      participantType: "pair",
      poolCount: 2,
      participantsPerPool: 2,
      advancementMode: "crossMatches",
      unmatchedResolution: "bye",
    });
    const advancedState = advanceLivePoolPlayState(attachLivePoolPlayState(
      createMockLiveTournamentState(),
      createLivePoolPlayState(initialStage, "crossMatches", "bye", createCompleteResults(initialStage)),
    ));
    const matchId = advancedState.poolPlay?.crossMatchStage?.groups[0].encounters[0].id;

    if (!matchId) {
      throw new Error("Cross-match was not created.");
    }

    const updatedState = saveNextPoolPhaseResult(advancedState, {
      matchId,
      teamAPoints: 21,
      teamBPoints: 18,
    });

    expect(updatedState.poolPlay?.initialResults).toHaveLength(2);
    expect(updatedState.poolPlay?.nextStageResults).toEqual([{ matchId, teamAPoints: 21, teamBPoints: 18 }]);
    expect(getNextPoolPhaseProgress(updatedState.poolPlay as NonNullable<typeof updatedState.poolPlay>)).toEqual({
      completedMatches: 1,
      totalMatches: 2,
      isComplete: false,
    });
  });

  it("advances completed pair cross matches to final and bronze matches", () => {
    const completedCrossState = saveNextPoolPhaseResult(
      saveNextPoolPhaseResult(createAdvancedCrossMatchState(), {
        matchId: "cross-group-1-match-1",
        teamAPoints: 21,
        teamBPoints: 18,
      }),
      {
        matchId: "cross-group-1-match-2",
        teamAPoints: 14,
        teamBPoints: 21,
      },
    );
    const finalState = advanceLivePoolPlayToFinals(completedCrossState);

    expect(finalState.poolPlay?.phase).toBe("finals");
    expect(finalState.poolPlay?.crossMatchFinalStage?.groups[0].final).toMatchObject({
      id: "cross-group-1-final",
      participantAId: "participant-1",
      participantBId: "participant-3",
    });
    expect(getPoolFinalProgress(finalState.poolPlay as NonNullable<typeof finalState.poolPlay>)).toEqual({
      completedMatches: 0,
      totalMatches: 2,
      isComplete: false,
    });
  });

  it("stores final and bronze results", () => {
    const finalState = advanceLivePoolPlayToFinals(saveNextPoolPhaseResult(
      saveNextPoolPhaseResult(createAdvancedCrossMatchState(), {
        matchId: "cross-group-1-match-1",
        teamAPoints: 21,
        teamBPoints: 18,
      }),
      {
        matchId: "cross-group-1-match-2",
        teamAPoints: 14,
        teamBPoints: 21,
      },
    ));
    const scoredState = savePoolFinalResult(finalState, {
      matchId: "cross-group-1-final",
      teamAPoints: 21,
      teamBPoints: 19,
    });

    expect(scoredState.poolPlay?.finalResults).toEqual([
      { matchId: "cross-group-1-final", teamAPoints: 21, teamBPoints: 19 },
    ]);
    expect(getPoolFinalProgress(scoredState.poolPlay as NonNullable<typeof scoredState.poolPlay>)).toEqual({
      completedMatches: 1,
      totalMatches: 2,
      isComplete: false,
    });
  });

  it("stores separate placement tiebreak results for individual cross-match Americano", () => {
    const scoredState = createScoredIndividualCrossMatchState();
    const updatedState = savePoolPlacementTiebreakResult(scoredState, {
      matchId: "cross-group-1-placement-tiebreak-2-3",
      teamAPoints: 10,
      teamBPoints: 7,
    });

    expect(updatedState.poolPlay?.placementTiebreakResults).toEqual([
      { matchId: "cross-group-1-placement-tiebreak-2-3", teamAPoints: 10, teamBPoints: 7 },
    ]);

    const editedState = saveNextPoolPhaseResult(updatedState, {
      matchId: "cross-group-1-round-1-court-1",
      teamAPoints: 18,
      teamBPoints: 12,
    });

    expect(editedState.poolPlay?.placementTiebreakResults).toEqual([]);
  });

  it("tracks unmatched final player pool Americano placement matches as next phase matches", () => {
    const initialStage = createStage({
      participantType: "player",
      poolCount: 3,
      participantsPerPool: 4,
      advancementMode: "crossMatches",
      unmatchedResolution: "bye",
    });
    const advancedState = advanceLivePoolPlayState(attachLivePoolPlayState(
      createMockLiveTournamentState(),
      createLivePoolPlayState(initialStage, "crossMatches", "bye", createCompleteResults(initialStage)),
    ));
    const unmatchedMatchId = advancedState.poolPlay?.crossMatchStage?.unmatchedPlacementGroups[0].americanoRounds[0].matches[0].id;

    if (!unmatchedMatchId) {
      throw new Error("Unmatched placement match was not created.");
    }

    expect(advancedState.poolPlay?.crossMatchStage?.automaticAdvances).toEqual([]);
    expect(getNextPoolPhaseProgress(advancedState.poolPlay as NonNullable<typeof advancedState.poolPlay>)).toEqual({
      completedMatches: 0,
      totalMatches: 6,
      isComplete: false,
    });

    const scoredState = saveNextPoolPhaseResult(advancedState, {
      matchId: unmatchedMatchId,
      teamAPoints: 21,
      teamBPoints: 12,
    });

    expect(scoredState.poolPlay?.nextStageResults).toEqual([
      { matchId: unmatchedMatchId, teamAPoints: 21, teamBPoints: 12 },
    ]);
  });

  it("rejects unknown placement tiebreak results", () => {
    const scoredState = createScoredIndividualCrossMatchState();

    expect(() => savePoolPlacementTiebreakResult(scoredState, {
      matchId: "unknown-tiebreak",
      teamAPoints: 10,
      teamBPoints: 7,
    })).toThrow("Tiebreak-kamp findes ikke: unknown-tiebreak");
  });

  it("requires non-drawn cross matches before finals can be created", () => {
    const drawState = saveNextPoolPhaseResult(
      saveNextPoolPhaseResult(createAdvancedCrossMatchState(), {
        matchId: "cross-group-1-match-1",
        teamAPoints: 21,
        teamBPoints: 21,
      }),
      {
        matchId: "cross-group-1-match-2",
        teamAPoints: 14,
        teamBPoints: 21,
      },
    );

    expect(() => advanceLivePoolPlayToFinals(drawState)).toThrow(
      "Uafgjort i krydskamp kræver match tiebreak: cross-group-1-match-1",
    );
  });

  it("clears generated next phases when an initial pool result is edited", () => {
    const initialStage = createStage({
      participantType: "pair",
      poolCount: 2,
      participantsPerPool: 2,
      advancementMode: "crossMatches",
      unmatchedResolution: "bye",
    });
    const advancedState = advanceLivePoolPlayState(attachLivePoolPlayState(
      createMockLiveTournamentState(),
      createLivePoolPlayState(initialStage, "crossMatches", "bye", createCompleteResults(initialStage)),
    ));
    const editedState = saveInitialPoolResult(advancedState, {
      matchId: initialStage.pools[0].encounters[0].id,
      teamAPoints: 10,
      teamBPoints: 21,
    });

    expect(editedState.poolPlay?.phase).toBe("initial");
    expect(editedState.poolPlay?.crossMatchStage).toBeUndefined();
    expect(editedState.poolPlay?.nextStageResults).toEqual([]);
    expect(editedState.poolPlay?.finalResults).toEqual([]);
    expect(editedState.poolPlay?.crossMatchFinalStage).toBeUndefined();
    expect(editedState.poolPlay?.initialResults).toHaveLength(2);
  });

  it("rejects unknown and invalid initial pool results", () => {
    const initialStage = createStage({
      participantType: "pair",
      poolCount: 2,
      participantsPerPool: 2,
      advancementMode: "crossMatches",
      unmatchedResolution: "bye",
    });
    const state = attachLivePoolPlayState(
      createMockLiveTournamentState(),
      createLivePoolPlayState(initialStage, "crossMatches", "bye"),
    );

    expect(() => saveInitialPoolResult(state, {
      matchId: "unknown-match",
      teamAPoints: 21,
      teamBPoints: 12,
    })).toThrow("Puljekamp findes ikke: unknown-match");
    expect(() => saveInitialPoolResult(state, {
      matchId: initialStage.pools[0].encounters[0].id,
      teamAPoints: -1,
      teamBPoints: 12,
    })).toThrow("Puljeresultat må ikke være negativt.");
    expect(() => saveInitialPoolResult(state, {
      matchId: initialStage.pools[0].encounters[0].id,
      teamAPoints: 21,
      teamBPoints: 12,
      tieBreakWinner: "teamA",
    })).toThrow("Match tiebreak kan kun gemmes ved uafgjorte scorepoint.");
    expect(() => saveNextPoolPhaseResult(state, {
      matchId: initialStage.pools[0].encounters[0].id,
      teamAPoints: 21,
      teamBPoints: 12,
    })).toThrow(`Næste fase-kamp findes ikke: ${initialStage.pools[0].encounters[0].id}`);
    expect(() => savePoolFinalResult(state, {
      matchId: initialStage.pools[0].encounters[0].id,
      teamAPoints: 21,
      teamBPoints: 12,
    })).toThrow(`Finalekamp findes ikke: ${initialStage.pools[0].encounters[0].id}`);
  });
});

function createAdvancedCrossMatchState() {
  const initialStage = createStage({
    participantType: "pair",
    poolCount: 2,
    participantsPerPool: 2,
    advancementMode: "crossMatches",
    unmatchedResolution: "bye",
  });

  return advanceLivePoolPlayState(attachLivePoolPlayState(
    createMockLiveTournamentState(),
    createLivePoolPlayState(initialStage, "crossMatches", "bye", createCompleteResults(initialStage)),
  ));
}

function createScoredIndividualCrossMatchState() {
  const initialStage = createStage({
    participantType: "player",
    poolCount: 2,
    participantsPerPool: 4,
    advancementMode: "crossMatches",
    unmatchedResolution: "bye",
  });
  let state = advanceLivePoolPlayState(attachLivePoolPlayState(
    createMockLiveTournamentState(),
    createLivePoolPlayState(initialStage, "crossMatches", "bye", createCompleteResults(initialStage)),
  ));
  const matches = state.poolPlay?.crossMatchStage?.groups[0].americanoRounds.flatMap((round) => round.matches);

  if (!matches) {
    throw new Error("Cross-match Americano rounds were not created.");
  }

  [
    { teamAPoints: 20, teamBPoints: 20 },
    { teamAPoints: 20, teamBPoints: 10 },
    { teamAPoints: 20, teamBPoints: 10 },
  ].forEach((score, index) => {
    state = saveNextPoolPhaseResult(state, {
      matchId: matches[index].id,
      ...score,
    });
  });

  return state;
}
