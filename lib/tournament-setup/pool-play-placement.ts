import type { StandingsRankingMode } from "../tournament-engine";
import {
  createRoundRobinEncounters,
  type InitialPool,
  type InitialPoolStage,
  type PoolParticipant,
} from "./pool-play";
import { createPoolAmericanoRounds } from "./pool-play-americano";
import { calculateInitialPoolStandings, type PoolMatchResult } from "./pool-play-standings";

export interface PlacementPool extends InitialPool {
  sourceRank: number;
  finalPlacementFrom: number;
  finalPlacementTo: number;
}

export interface PlacementPoolStage extends Omit<InitialPoolStage, "pools"> {
  pools: PlacementPool[];
}

export function createPlacementPoolStage(
  initialStage: InitialPoolStage,
  initialResults: PoolMatchResult[],
  rankingMode: StandingsRankingMode = "matchPointsFirst",
): PlacementPoolStage {
  if (initialStage.participantType === "player" && initialStage.pools.length < 4) {
    throw new Error("Placeringspuljer for enkeltspillere kræver mindst 4 indledende puljer.");
  }

  const standings = calculateInitialPoolStandings(initialStage, initialResults, rankingMode);
  assertInitialStageComplete(initialStage, initialResults);

  if (standings.length === 0) {
    return { ...initialStage, participants: [], pools: [] };
  }

  const participantById = new Map(initialStage.participants.map((participant) => [participant.id, participant]));
  const participantsPerInitialPool = standings[0].rows.length;
  const sourcePoolCount = standings.length;
  const matchesPerTeam = getMatchesPerTeam(initialStage);

  if (standings.some((table) => table.rows.length !== participantsPerInitialPool)) {
    throw new Error("Alle indledende puljer skal have samme antal deltagere.");
  }

  const pools = Array.from({ length: participantsPerInitialPool }, (_, placementIndex) => {
    const sourceRank = placementIndex + 1;
    const id = `placement-pool-${sourceRank}`;
    const participantIds = standings.map((table) => table.rows[placementIndex].id);
    const participants = participantIds.map((participantId) => getParticipant(participantById, participantId));
    const scheduleType = initialStage.participantType === "player" ? "americanoRotation" : "roundRobin";

    return {
      id,
      name: `Placeringspulje ${sourceRank}`,
      sourceRank,
      finalPlacementFrom: placementIndex * sourcePoolCount + 1,
      finalPlacementTo: (placementIndex + 1) * sourcePoolCount,
      participantIds,
      scheduleType,
      encounters: scheduleType === "roundRobin"
        ? createRoundRobinEncounters(id, participants, matchesPerTeam)
        : [],
      americanoRounds: scheduleType === "americanoRotation"
        ? createPoolAmericanoRounds(id, participantIds)
        : [],
    } satisfies PlacementPool;
  });

  return {
    participantType: initialStage.participantType,
    participants: initialStage.participants.map((participant) => ({ ...participant })),
    pools,
  };
}

function assertInitialStageComplete(stage: InitialPoolStage, results: PoolMatchResult[]): void {
  const resultMatchIds = new Set(results.map((result) => result.matchId));
  const missingMatch = getStageMatchIds(stage).find((matchId) => !resultMatchIds.has(matchId));

  if (missingMatch) {
    throw new Error("Alle kampe i de indledende puljer skal være registreret før placeringspuljerne oprettes.");
  }
}

function getStageMatchIds(stage: InitialPoolStage): string[] {
  return stage.pools.flatMap((pool) => (
    pool.scheduleType === "americanoRotation"
      ? pool.americanoRounds.flatMap((round) => round.matches.map((match) => match.id))
      : pool.encounters.map((encounter) => encounter.id)
  ));
}

function getMatchesPerTeam(stage: InitialPoolStage): 2 | 3 | undefined {
  if (stage.participantType !== "team") {
    return undefined;
  }

  return stage.pools.flatMap((pool) => pool.encounters)[0]?.matchesPerTeam;
}

function getParticipant(participants: Map<string, PoolParticipant>, participantId: string): PoolParticipant {
  const participant = participants.get(participantId);

  if (!participant) {
    throw new Error(`Stillingen henviser til en ukendt deltager: ${participantId}`);
  }

  return participant;
}
