import type { StandingsRankingMode } from "../tournament-engine";
import type {
  InitialPoolStage,
  PoolEncounter,
  PoolParticipant,
  PoolParticipantType,
  PoolUnmatchedResolution,
} from "./pool-play";
import { createPoolAmericanoRounds, type PoolAmericanoRound } from "./pool-play-americano";
import { calculateInitialPoolStandings, type PoolMatchResult } from "./pool-play-standings";

export type CrossMatchSourceRank = 1 | 2;

export interface CrossMatchQualifier {
  participantId: string;
  sourcePoolId: string;
  sourcePoolName: string;
  sourceRank: CrossMatchSourceRank;
}

export interface CrossMatchEncounter extends PoolEncounter {
  sourcePoolAId: string;
  sourcePoolBId: string;
  sourceRankA: CrossMatchSourceRank;
  sourceRankB: CrossMatchSourceRank;
}

export interface CrossMatchGroup {
  id: string;
  name: string;
  sourcePoolIds: [string, string];
  qualifiers: CrossMatchQualifier[];
  scheduleType: "americanoRotation" | "crossMatches";
  encounters: CrossMatchEncounter[];
  americanoRounds: PoolAmericanoRound[];
}

export interface CrossMatchUnmatchedPlacementParticipant {
  participantId: string;
  sourcePoolId: string;
  sourcePoolName: string;
  sourceRank: number;
}

export interface CrossMatchUnmatchedPlacementGroup {
  id: string;
  name: string;
  sourcePoolId: string;
  sourcePoolName: string;
  finalPlacementFrom: number;
  finalPlacementTo: number;
  participants: CrossMatchUnmatchedPlacementParticipant[];
  americanoRounds: PoolAmericanoRound[];
}

export interface CrossMatchAutomaticAdvance extends CrossMatchQualifier {
  id: string;
  resolution: PoolUnmatchedResolution;
  advancesAutomatically: true;
}

export interface CrossMatchStage {
  participantType: PoolParticipantType;
  participants: PoolParticipant[];
  groups: CrossMatchGroup[];
  unmatchedPlacementGroups: CrossMatchUnmatchedPlacementGroup[];
  automaticAdvances: CrossMatchAutomaticAdvance[];
}

export function createCrossMatchStage(
  initialStage: InitialPoolStage,
  initialResults: PoolMatchResult[],
  unmatchedResolution: PoolUnmatchedResolution,
  rankingMode: StandingsRankingMode = "matchPointsFirst",
): CrossMatchStage {
  if (initialStage.pools.length < 2) {
    throw new Error("Krydskampe kræver mindst 2 indledende puljer.");
  }

  if (unmatchedResolution !== "bye" && unmatchedResolution !== "walkover") {
    throw new Error("Vælg oversidning eller walkover for en pulje uden modstander.");
  }

  const standings = calculateInitialPoolStandings(initialStage, initialResults, rankingMode);
  assertInitialStageComplete(initialStage, initialResults);
  assertTopTwoAvailable(standings);

  const matchesPerTeam = getMatchesPerTeam(initialStage);
  const groups: CrossMatchGroup[] = [];

  for (let poolIndex = 0; poolIndex + 1 < standings.length; poolIndex += 2) {
    const firstPool = standings[poolIndex];
    const secondPool = standings[poolIndex + 1];
    const id = `cross-group-${groups.length + 1}`;
    const qualifiers = [
      createQualifier(firstPool.poolId, firstPool.poolName, firstPool.rows[0].id, 1),
      createQualifier(firstPool.poolId, firstPool.poolName, firstPool.rows[1].id, 2),
      createQualifier(secondPool.poolId, secondPool.poolName, secondPool.rows[0].id, 1),
      createQualifier(secondPool.poolId, secondPool.poolName, secondPool.rows[1].id, 2),
    ];
    const scheduleType = initialStage.participantType === "player" ? "americanoRotation" : "crossMatches";

    groups.push({
      id,
      name: `Krydsspil ${groups.length + 1}`,
      sourcePoolIds: [firstPool.poolId, secondPool.poolId],
      qualifiers,
      scheduleType,
      encounters: scheduleType === "crossMatches"
        ? [
            createEncounter(id, 1, qualifiers[0], qualifiers[3], matchesPerTeam),
            createEncounter(id, 2, qualifiers[1], qualifiers[2], matchesPerTeam),
          ]
        : [],
      americanoRounds: scheduleType === "americanoRotation"
        ? createPoolAmericanoRounds(id, qualifiers.map((qualifier) => qualifier.participantId))
        : [],
    });
  }

  const unmatchedPool = standings.length % 2 === 1 ? standings.at(-1) : undefined;
  const unmatchedPlacementGroups = unmatchedPool && initialStage.participantType === "player"
    ? [createUnmatchedPlacementGroup(unmatchedPool, groups.length)]
    : [];
  const automaticAdvances = unmatchedPool && initialStage.participantType !== "player"
    ? ([1, 2] as const).map((sourceRank) => ({
        id: `${unmatchedPool.poolId}-rank-${sourceRank}-${unmatchedResolution}`,
        ...createQualifier(
          unmatchedPool.poolId,
          unmatchedPool.poolName,
          unmatchedPool.rows[sourceRank - 1].id,
          sourceRank,
        ),
        resolution: unmatchedResolution,
        advancesAutomatically: true as const,
      }))
    : [];

  return {
    participantType: initialStage.participantType,
    participants: initialStage.participants.map((participant) => ({ ...participant })),
    groups,
    unmatchedPlacementGroups,
    automaticAdvances,
  };
}

function createUnmatchedPlacementGroup(
  unmatchedPool: { poolId: string; poolName: string; rows: Array<{ id: string }> },
  pairedGroupCount: number,
): CrossMatchUnmatchedPlacementGroup {
  const id = `unmatched-placement-${pairedGroupCount + 1}`;
  const finalPlacementFrom = pairedGroupCount * 4 + 1;
  const participantIds = unmatchedPool.rows.map((row) => row.id);

  return {
    id,
    name: `Placeringsspil ${pairedGroupCount + 1}`,
    sourcePoolId: unmatchedPool.poolId,
    sourcePoolName: unmatchedPool.poolName,
    finalPlacementFrom,
    finalPlacementTo: finalPlacementFrom + participantIds.length - 1,
    participants: unmatchedPool.rows.map((row, rowIndex) => ({
      participantId: row.id,
      sourcePoolId: unmatchedPool.poolId,
      sourcePoolName: unmatchedPool.poolName,
      sourceRank: rowIndex + 1,
    })),
    americanoRounds: createPoolAmericanoRounds(id, participantIds),
  };
}

function createQualifier(
  sourcePoolId: string,
  sourcePoolName: string,
  participantId: string,
  sourceRank: CrossMatchSourceRank,
): CrossMatchQualifier {
  return { participantId, sourcePoolId, sourcePoolName, sourceRank };
}

function createEncounter(
  groupId: string,
  matchNumber: number,
  firstQualifier: CrossMatchQualifier,
  secondQualifier: CrossMatchQualifier,
  matchesPerTeam?: 2 | 3,
): CrossMatchEncounter {
  return {
    id: `${groupId}-match-${matchNumber}`,
    poolId: groupId,
    participantAId: firstQualifier.participantId,
    participantBId: secondQualifier.participantId,
    sourcePoolAId: firstQualifier.sourcePoolId,
    sourcePoolBId: secondQualifier.sourcePoolId,
    sourceRankA: firstQualifier.sourceRank,
    sourceRankB: secondQualifier.sourceRank,
    ...(matchesPerTeam ? { matchesPerTeam } : {}),
  };
}

function assertTopTwoAvailable(
  standings: Array<{ poolName: string; rows: Array<{ id: string }> }>,
): void {
  const incompletePool = standings.find((table) => table.rows.length < 2);

  if (incompletePool) {
    throw new Error(`${incompletePool.poolName} skal have mindst 2 deltagere for at oprette krydskampe.`);
  }
}

function assertInitialStageComplete(stage: InitialPoolStage, results: PoolMatchResult[]): void {
  const resultMatchIds = new Set(results.map((result) => result.matchId));
  const missingMatch = getStageMatchIds(stage).find((matchId) => !resultMatchIds.has(matchId));

  if (missingMatch) {
    throw new Error("Alle kampe i de indledende puljer skal være registreret før krydskampene oprettes.");
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
