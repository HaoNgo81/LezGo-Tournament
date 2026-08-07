import type { StandingsRankingMode } from "../tournament-engine";
import {
  createCrossMatchStage,
  createCrossMatchFinalStage,
  createPlacementPoolStage,
  type CrossMatchFinalStage,
  type CrossMatchStage,
  type InitialPoolStage,
  type PlacementPoolStage,
  type PoolAdvancementMode,
  type PoolMatchResult,
  type PoolUnmatchedResolution,
} from "../tournament-setup";
import type { LiveTournamentState } from "./live-state";
import { createCrossMatchPlacementTiebreaks } from "./pool-play-placement-tiebreaks";

export type LivePoolPlayPhase = "initial" | "placementPools" | "crossMatches" | "finals";

export interface LivePoolPlayState {
  phase: LivePoolPlayPhase;
  advancementMode: PoolAdvancementMode;
  unmatchedResolution: PoolUnmatchedResolution;
  initialStage: InitialPoolStage;
  initialResults: PoolMatchResult[];
  nextStageResults: PoolMatchResult[];
  finalResults: PoolMatchResult[];
  placementTiebreakResults: PoolMatchResult[];
  placementStage?: PlacementPoolStage;
  crossMatchStage?: CrossMatchStage;
  crossMatchFinalStage?: CrossMatchFinalStage;
}

export interface InitialPoolProgress {
  completedMatches: number;
  totalMatches: number;
  isComplete: boolean;
}

export function createLivePoolPlayState(
  initialStage: InitialPoolStage,
  advancementMode: PoolAdvancementMode,
  unmatchedResolution: PoolUnmatchedResolution,
  initialResults: PoolMatchResult[] = [],
): LivePoolPlayState {
  return {
    phase: "initial",
    advancementMode,
    unmatchedResolution,
    initialStage,
    initialResults: [...initialResults],
    nextStageResults: [],
    finalResults: [],
    placementTiebreakResults: [],
  };
}

export function attachLivePoolPlayState(
  state: LiveTournamentState,
  poolPlay: LivePoolPlayState,
): LiveTournamentState {
  return {
    ...state,
    poolPlay,
  };
}

export function saveInitialPoolResult(
  state: LiveTournamentState,
  result: PoolMatchResult,
): LiveTournamentState {
  assertPoolPlayAvailable(state);
  assertInitialPoolMatchExists(state.poolPlay.initialStage, result.matchId);
  assertValidPoolResult(result);

  const initialResults = state.poolPlay.initialResults.filter((savedResult) => savedResult.matchId !== result.matchId);

  return {
    ...state,
    poolPlay: {
      ...state.poolPlay,
      phase: "initial",
      initialResults: [...initialResults, result],
      nextStageResults: [],
      finalResults: [],
      placementTiebreakResults: [],
      placementStage: undefined,
      crossMatchStage: undefined,
      crossMatchFinalStage: undefined,
    },
  };
}

export function saveNextPoolPhaseResult(
  state: LiveTournamentState,
  result: PoolMatchResult,
): LiveTournamentState {
  assertPoolPlayAvailable(state);
  assertNextPoolPhaseMatchExists(state.poolPlay, result.matchId);
  assertValidPoolResult(result);

  const nextStageResults = (state.poolPlay.nextStageResults ?? []).filter((savedResult) => savedResult.matchId !== result.matchId);

  return {
    ...state,
    poolPlay: {
      ...state.poolPlay,
      nextStageResults: [...nextStageResults, result],
      finalResults: [],
      placementTiebreakResults: [],
      crossMatchFinalStage: undefined,
    },
  };
}

export function savePoolPlacementTiebreakResult(
  state: LiveTournamentState,
  result: PoolMatchResult,
): LiveTournamentState {
  assertPoolPlayAvailable(state);
  assertPoolPlacementTiebreakMatchExists(state.poolPlay, result.matchId);
  assertValidPoolResult(result);

  const placementTiebreakResults = (state.poolPlay.placementTiebreakResults ?? []).filter((savedResult) => savedResult.matchId !== result.matchId);

  return {
    ...state,
    poolPlay: {
      ...state.poolPlay,
      placementTiebreakResults: [...placementTiebreakResults, result],
    },
  };
}

export function advanceLivePoolPlayToFinals(
  state: LiveTournamentState,
): LiveTournamentState {
  assertPoolPlayAvailable(state);

  if (state.poolPlay.phase !== "crossMatches" || !state.poolPlay.crossMatchStage) {
    throw new Error("Finale og bronzekamp kan kun oprettes efter krydskampe.");
  }

  return {
    ...state,
    poolPlay: {
      ...state.poolPlay,
      phase: "finals",
      crossMatchFinalStage: createCrossMatchFinalStage(
        state.poolPlay.crossMatchStage,
        state.poolPlay.nextStageResults,
      ),
      finalResults: [],
    },
  };
}

export function savePoolFinalResult(
  state: LiveTournamentState,
  result: PoolMatchResult,
): LiveTournamentState {
  assertPoolPlayAvailable(state);
  assertPoolFinalMatchExists(state.poolPlay, result.matchId);
  assertValidPoolResult(result);

  const finalResults = (state.poolPlay.finalResults ?? []).filter((savedResult) => savedResult.matchId !== result.matchId);

  return {
    ...state,
    poolPlay: {
      ...state.poolPlay,
      finalResults: [...finalResults, result],
    },
  };
}

export function advanceLivePoolPlayState(
  state: LiveTournamentState,
  rankingMode: StandingsRankingMode = state.rankingMode,
): LiveTournamentState {
  assertPoolPlayAvailable(state);

  if (state.poolPlay.advancementMode === "placementPools") {
    return {
      ...state,
      poolPlay: {
        ...state.poolPlay,
        phase: "placementPools",
        placementStage: createPlacementPoolStage(
          state.poolPlay.initialStage,
          state.poolPlay.initialResults,
          rankingMode,
        ),
        crossMatchStage: undefined,
        crossMatchFinalStage: undefined,
        nextStageResults: [],
        finalResults: [],
        placementTiebreakResults: [],
      },
    };
  }

  return {
    ...state,
    poolPlay: {
      ...state.poolPlay,
      phase: "crossMatches",
      placementStage: undefined,
      crossMatchStage: createCrossMatchStage(
        state.poolPlay.initialStage,
        state.poolPlay.initialResults,
        state.poolPlay.unmatchedResolution,
        rankingMode,
      ),
      nextStageResults: [],
      finalResults: [],
      placementTiebreakResults: [],
      crossMatchFinalStage: undefined,
    },
  };
}

export function getInitialPoolProgress(poolPlay: LivePoolPlayState): InitialPoolProgress {
  const matchIds = getInitialStageMatchIds(poolPlay.initialStage);
  const completedMatchIds = new Set(poolPlay.initialResults.map((result) => result.matchId));
  const completedMatches = matchIds.filter((matchId) => completedMatchIds.has(matchId)).length;

  return {
    completedMatches,
    totalMatches: matchIds.length,
    isComplete: completedMatches === matchIds.length,
  };
}

export function getNextPoolPhaseProgress(poolPlay: LivePoolPlayState): InitialPoolProgress | null {
  const matchIds = getNextStageMatchIds(poolPlay);

  if (matchIds.length === 0) {
    return null;
  }

  const completedMatchIds = new Set((poolPlay.nextStageResults ?? []).map((result) => result.matchId));
  const completedMatches = matchIds.filter((matchId) => completedMatchIds.has(matchId)).length;

  return {
    completedMatches,
    totalMatches: matchIds.length,
    isComplete: completedMatches === matchIds.length,
  };
}

export function getPoolFinalProgress(poolPlay: LivePoolPlayState): InitialPoolProgress | null {
  const matchIds = getFinalStageMatchIds(poolPlay);

  if (matchIds.length === 0) {
    return null;
  }

  const completedMatchIds = new Set((poolPlay.finalResults ?? []).map((result) => result.matchId));
  const completedMatches = matchIds.filter((matchId) => completedMatchIds.has(matchId)).length;

  return {
    completedMatches,
    totalMatches: matchIds.length,
    isComplete: completedMatches === matchIds.length,
  };
}

function assertPoolPlayAvailable(state: LiveTournamentState): asserts state is LiveTournamentState & {
  poolPlay: LivePoolPlayState;
} {
  if (!state.poolPlay) {
    throw new Error("Turneringen har ikke puljespil tilknyttet.");
  }
}

function assertInitialPoolMatchExists(initialStage: InitialPoolStage, matchId: string): void {
  if (!getInitialStageMatchIds(initialStage).includes(matchId)) {
    throw new Error(`Puljekamp findes ikke: ${matchId}`);
  }
}

function assertNextPoolPhaseMatchExists(poolPlay: LivePoolPlayState, matchId: string): void {
  if (!getNextStageMatchIds(poolPlay).includes(matchId)) {
    throw new Error(`Næste fase-kamp findes ikke: ${matchId}`);
  }
}

function assertPoolFinalMatchExists(poolPlay: LivePoolPlayState, matchId: string): void {
  if (!getFinalStageMatchIds(poolPlay).includes(matchId)) {
    throw new Error(`Finalekamp findes ikke: ${matchId}`);
  }
}

function assertPoolPlacementTiebreakMatchExists(poolPlay: LivePoolPlayState, matchId: string): void {
  if (!getPlacementTiebreakMatchIds(poolPlay).includes(matchId)) {
    throw new Error(`Tiebreak-kamp findes ikke: ${matchId}`);
  }
}

function assertValidPoolResult(result: PoolMatchResult): void {
  if (!Number.isInteger(result.teamAPoints) || !Number.isInteger(result.teamBPoints)) {
    throw new Error("Puljeresultat skal være hele tal.");
  }

  if (result.teamAPoints < 0 || result.teamBPoints < 0) {
    throw new Error("Puljeresultat må ikke være negativt.");
  }

  if (result.tieBreakWinner && result.teamAPoints !== result.teamBPoints) {
    throw new Error("Match tiebreak kan kun gemmes ved uafgjorte scorepoint.");
  }
}

function getInitialStageMatchIds(stage: InitialPoolStage): string[] {
  return stage.pools.flatMap((pool) => (
    pool.scheduleType === "americanoRotation"
      ? pool.americanoRounds.flatMap((round) => round.matches.map((match) => match.id))
      : pool.encounters.map((encounter) => encounter.id)
  ));
}

function getNextStageMatchIds(poolPlay: LivePoolPlayState): string[] {
  if (poolPlay.phase === "placementPools" && poolPlay.placementStage) {
    return getInitialStageMatchIds(poolPlay.placementStage);
  }

  if (poolPlay.phase === "crossMatches" && poolPlay.crossMatchStage) {
    const pairedGroupMatchIds = poolPlay.crossMatchStage.groups.flatMap((group) => (
      group.scheduleType === "americanoRotation"
        ? group.americanoRounds.flatMap((round) => round.matches.map((match) => match.id))
        : group.encounters.map((encounter) => encounter.id)
    ));
    const unmatchedGroupMatchIds = (poolPlay.crossMatchStage.unmatchedPlacementGroups ?? []).flatMap((group) => (
      group.americanoRounds.flatMap((round) => round.matches.map((match) => match.id))
    ));

    return [...pairedGroupMatchIds, ...unmatchedGroupMatchIds];
  }

  return [];
}

function getFinalStageMatchIds(poolPlay: LivePoolPlayState): string[] {
  if (poolPlay.phase !== "finals" || !poolPlay.crossMatchFinalStage) {
    return [];
  }

  return poolPlay.crossMatchFinalStage.groups.flatMap((group) => [group.final.id, group.bronze.id]);
}

function getPlacementTiebreakMatchIds(poolPlay: LivePoolPlayState): string[] {
  if (poolPlay.phase !== "crossMatches" || !poolPlay.crossMatchStage) {
    return [];
  }

  return createCrossMatchPlacementTiebreaks(
    poolPlay.crossMatchStage,
    poolPlay.nextStageResults,
    poolPlay.placementTiebreakResults,
  ).map((match) => match.id);
}
