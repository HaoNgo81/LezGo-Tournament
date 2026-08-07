import type { StandingsRankingMode, StandingRow } from "../tournament-engine";
import { calculateInitialPoolStandings, type PoolMatchResult } from "../tournament-setup/pool-play-standings";
import type { PoolParticipant, PoolUnmatchedResolution } from "../tournament-setup/pool-play";
import type { LivePoolPlayState } from "./pool-play-state";
import { createCrossMatchPlacementTiebreaks, type PoolPlayPlacementTiebreak } from "./pool-play-placement-tiebreaks";

export interface PoolPlaySummary {
  initialStandings: Array<{
    poolId: string;
    poolName: string;
    rows: StandingRow[];
  }>;
  nextPhaseMatches: PoolPlaySummaryMatch[];
  finalMatches: PoolPlaySummaryMatch[];
  placementTiebreakMatches: PoolPlaySummaryMatch[];
  finalPlacements: PoolPlaySummaryPlacement[];
  automaticAdvances: PoolPlaySummaryAutomaticAdvance[];
}

export interface PoolPlaySummaryMatch {
  id: string;
  groupId: string;
  groupName: string;
  label: string;
  teamAName: string;
  teamBName: string;
  result?: PoolMatchResult;
  matchesPerTeam?: 2 | 3;
}

export interface PoolPlaySummaryAutomaticAdvance {
  id: string;
  participantName: string;
  sourcePoolName: string;
  sourceRank: 1 | 2;
  resolution: PoolUnmatchedResolution;
}

export interface PoolPlaySummaryPlacement {
  rank: number;
  participantName: string;
  groupName: string;
}

export function createPoolPlaySummary(
  poolPlay: LivePoolPlayState,
  rankingMode: StandingsRankingMode,
): PoolPlaySummary {
  const initialStandings = calculateInitialPoolStandings(
    poolPlay.initialStage,
    poolPlay.initialResults,
    rankingMode,
  ).map((table) => ({
    poolId: table.poolId,
    poolName: table.poolName,
    rows: table.rows,
  }));

  return {
    initialStandings,
    nextPhaseMatches: getNextPhaseMatches(poolPlay),
    finalMatches: getFinalMatches(poolPlay),
    placementTiebreakMatches: getPlacementTiebreakMatches(poolPlay),
    finalPlacements: getFinalPlacements(poolPlay),
    automaticAdvances: getAutomaticAdvances(poolPlay),
  };
}

function getNextPhaseMatches(poolPlay: LivePoolPlayState): PoolPlaySummaryMatch[] {
  const resultByMatchId = new Map((poolPlay.nextStageResults ?? []).map((result) => [result.matchId, result]));

  if (poolPlay.phase === "placementPools" && poolPlay.placementStage) {
    const participantById = new Map(poolPlay.placementStage.participants.map((participant) => [participant.id, participant]));

    return poolPlay.placementStage.pools.flatMap((pool) => (
      pool.scheduleType === "americanoRotation"
        ? pool.americanoRounds.flatMap((round) => round.matches.map((match) => ({
            id: match.id,
            groupId: pool.id,
            groupName: pool.name,
            label: `Runde ${round.roundNumber}, bane ${match.courtNumber}`,
            teamAName: formatPoolTeam(match.teamA.playerIds, participantById),
            teamBName: formatPoolTeam(match.teamB.playerIds, participantById),
            ...(resultByMatchId.has(match.id) ? { result: resultByMatchId.get(match.id) } : {}),
          })))
        : pool.encounters.map((encounter, index) => ({
            id: encounter.id,
            groupId: pool.id,
            groupName: pool.name,
            label: `Kamp ${index + 1}`,
            teamAName: getPoolParticipantName(participantById, encounter.participantAId),
            teamBName: getPoolParticipantName(participantById, encounter.participantBId),
            ...(encounter.matchesPerTeam ? { matchesPerTeam: encounter.matchesPerTeam } : {}),
            ...(resultByMatchId.has(encounter.id) ? { result: resultByMatchId.get(encounter.id) } : {}),
          }))
    ));
  }

  if ((poolPlay.phase === "crossMatches" || poolPlay.phase === "finals") && poolPlay.crossMatchStage) {
    const participantById = new Map(poolPlay.crossMatchStage.participants.map((participant) => [participant.id, participant]));

    const pairedMatches = poolPlay.crossMatchStage.groups.flatMap((group) => (
      group.scheduleType === "americanoRotation"
        ? group.americanoRounds.flatMap((round) => round.matches.map((match) => ({
            id: match.id,
            groupId: group.id,
            groupName: group.name,
            label: `Runde ${round.roundNumber}, bane ${match.courtNumber}`,
            teamAName: formatPoolTeam(match.teamA.playerIds, participantById),
            teamBName: formatPoolTeam(match.teamB.playerIds, participantById),
            ...(resultByMatchId.has(match.id) ? { result: resultByMatchId.get(match.id) } : {}),
          })))
        : group.encounters.map((encounter, index) => ({
            id: encounter.id,
            groupId: group.id,
            groupName: group.name,
            label: `Kamp ${index + 1}`,
            teamAName: getPoolParticipantName(participantById, encounter.participantAId),
            teamBName: getPoolParticipantName(participantById, encounter.participantBId),
            ...(encounter.matchesPerTeam ? { matchesPerTeam: encounter.matchesPerTeam } : {}),
            ...(resultByMatchId.has(encounter.id) ? { result: resultByMatchId.get(encounter.id) } : {}),
          }))
    ));

    const unmatchedMatches = (poolPlay.crossMatchStage.unmatchedPlacementGroups ?? []).flatMap((group) => (
      group.americanoRounds.flatMap((round) => round.matches.map((match) => ({
        id: match.id,
        groupId: group.id,
        groupName: group.name,
        label: `Runde ${round.roundNumber}, bane ${match.courtNumber}`,
        teamAName: formatPoolTeam(match.teamA.playerIds, participantById),
        teamBName: formatPoolTeam(match.teamB.playerIds, participantById),
        ...(resultByMatchId.has(match.id) ? { result: resultByMatchId.get(match.id) } : {}),
      })))
    ));

    return [...pairedMatches, ...unmatchedMatches];
  }

  return [];
}

function getFinalMatches(poolPlay: LivePoolPlayState): PoolPlaySummaryMatch[] {
  if (poolPlay.phase !== "finals" || !poolPlay.crossMatchFinalStage) {
    return [];
  }

  const participantById = new Map(poolPlay.crossMatchFinalStage.participants.map((participant) => [participant.id, participant]));
  const resultByMatchId = new Map((poolPlay.finalResults ?? []).map((result) => [result.matchId, result]));

  return poolPlay.crossMatchFinalStage.groups.flatMap((group) => (
    [group.final, group.bronze].map((encounter) => ({
      id: encounter.id,
      groupId: group.id,
      groupName: group.name,
      label: encounter.placement === "final" ? "Finale" : "Bronzekamp",
      teamAName: getPoolParticipantName(participantById, encounter.participantAId),
      teamBName: getPoolParticipantName(participantById, encounter.participantBId),
      ...(encounter.matchesPerTeam ? { matchesPerTeam: encounter.matchesPerTeam } : {}),
      ...(resultByMatchId.has(encounter.id) ? { result: resultByMatchId.get(encounter.id) } : {}),
    }))
  ));
}

function getFinalPlacements(poolPlay: LivePoolPlayState): PoolPlaySummaryPlacement[] {
  if (poolPlay.phase === "placementPools" && poolPlay.placementStage) {
    return getPlacementPoolPlacements(poolPlay);
  }

  if (poolPlay.phase === "crossMatches" && poolPlay.crossMatchStage?.participantType === "player") {
    return getCrossMatchAmericanoPlacements(poolPlay);
  }

  if (poolPlay.phase !== "finals" || !poolPlay.crossMatchFinalStage) {
    return [];
  }

  const participantById = new Map(poolPlay.crossMatchFinalStage.participants.map((participant) => [participant.id, participant]));
  const resultByMatchId = new Map((poolPlay.finalResults ?? []).map((result) => [result.matchId, result]));
  const placements: PoolPlaySummaryPlacement[] = [];

  poolPlay.crossMatchFinalStage.groups.forEach((group, groupIndex) => {
    const finalResult = resultByMatchId.get(group.final.id);
    const bronzeResult = resultByMatchId.get(group.bronze.id);

    if (!finalResult || !bronzeResult || isUnresolvedDraw(finalResult) || isUnresolvedDraw(bronzeResult)) {
      return;
    }

    const baseRank = groupIndex * 4;
    placements.push(
      {
        rank: baseRank + 1,
        participantName: getPoolParticipantName(participantById, getWinnerId(group.final.participantAId, group.final.participantBId, finalResult)),
        groupName: group.name,
      },
      {
        rank: baseRank + 2,
        participantName: getPoolParticipantName(participantById, getLoserId(group.final.participantAId, group.final.participantBId, finalResult)),
        groupName: group.name,
      },
      {
        rank: baseRank + 3,
        participantName: getPoolParticipantName(participantById, getWinnerId(group.bronze.participantAId, group.bronze.participantBId, bronzeResult)),
        groupName: group.name,
      },
      {
        rank: baseRank + 4,
        participantName: getPoolParticipantName(participantById, getLoserId(group.bronze.participantAId, group.bronze.participantBId, bronzeResult)),
        groupName: group.name,
      },
    );
  });

  return placements;
}

function getPlacementTiebreakMatches(poolPlay: LivePoolPlayState): PoolPlaySummaryMatch[] {
  if (poolPlay.phase !== "crossMatches" || !poolPlay.crossMatchStage) {
    return [];
  }

  return createCrossMatchPlacementTiebreaks(
    poolPlay.crossMatchStage,
    poolPlay.nextStageResults,
    poolPlay.placementTiebreakResults,
  ).map((match) => ({
    id: match.id,
    groupId: match.groupId,
    groupName: match.groupName,
    label: `Tiebreak om ${match.rankFrom}. / ${match.rankTo}. plads`,
    teamAName: match.participantAName,
    teamBName: match.participantBName,
    ...(match.result ? { result: match.result } : {}),
  }));
}

function getCrossMatchAmericanoPlacements(poolPlay: LivePoolPlayState): PoolPlaySummaryPlacement[] {
  if (!poolPlay.crossMatchStage || poolPlay.crossMatchStage.participantType !== "player") {
    return [];
  }

  const participantById = new Map(poolPlay.crossMatchStage.participants.map((participant) => [participant.id, participant]));
  const tiebreaks = createCrossMatchPlacementTiebreaks(
    poolPlay.crossMatchStage,
    poolPlay.nextStageResults,
    poolPlay.placementTiebreakResults,
  );

  const pairedPlacements = poolPlay.crossMatchStage.groups.flatMap((group, groupIndex) => {
    if (group.scheduleType !== "americanoRotation") {
      return [];
    }

    return getAmericanoPlacementRows({
      id: group.id,
      name: group.name,
      participantIds: group.qualifiers.map((qualifier) => qualifier.participantId),
      baseRank: groupIndex * group.qualifiers.length,
      americanoRounds: group.americanoRounds,
    }, poolPlay, participantById, tiebreaks);
  });

  const unmatchedPlacements = (poolPlay.crossMatchStage.unmatchedPlacementGroups ?? []).flatMap((group) => (
    getAmericanoPlacementRows({
      id: group.id,
      name: group.name,
      participantIds: group.participants.map((participant) => participant.participantId),
      baseRank: group.finalPlacementFrom - 1,
      americanoRounds: group.americanoRounds,
    }, poolPlay, participantById, tiebreaks)
  ));

  return [...pairedPlacements, ...unmatchedPlacements];
}

function getAmericanoPlacementRows(
  group: {
    id: string;
    name: string;
    participantIds: string[];
    baseRank: number;
    americanoRounds: NonNullable<LivePoolPlayState["crossMatchStage"]>["groups"][number]["americanoRounds"];
  },
  poolPlay: LivePoolPlayState,
  participantById: Map<string, PoolParticipant>,
  tiebreaks: PoolPlayPlacementTiebreak[],
): PoolPlaySummaryPlacement[] {
  const matchIds = group.americanoRounds.flatMap((round) => round.matches.map((match) => match.id));
  const groupResults = poolPlay.nextStageResults.filter((result) => matchIds.includes(result.matchId));

  if (matchIds.length === 0 || groupResults.length !== matchIds.length) {
    return [];
  }

  const [table] = calculateInitialPoolStandings({
    participantType: "player",
    participants: poolPlay.crossMatchStage?.participants ?? [],
    pools: [{
      id: group.id,
      name: group.name,
      participantIds: group.participantIds,
      scheduleType: "americanoRotation",
      encounters: [],
      americanoRounds: group.americanoRounds,
    }],
  }, groupResults, "partiPointsFirst");
  const orderedRows = orderCrossMatchAmericanoRows(table.rows, tiebreaks.filter((match) => match.groupId === group.id));

  if (!orderedRows) {
    return [];
  }

  return orderedRows.map((row, index) => ({
    rank: group.baseRank + index + 1,
    participantName: getPoolParticipantName(participantById, row.id),
    groupName: group.name,
  }));
}

function orderCrossMatchAmericanoRows(
  rows: StandingRow[],
  tiebreaks: PoolPlayPlacementTiebreak[],
): StandingRow[] | null {
  const sortedRows = [...rows].sort((left, right) => right.pointsFor - left.pointsFor || left.name.localeCompare(right.name, "da"));
  const resolvedRows: StandingRow[] = [];

  for (const pointTotal of [...new Set(sortedRows.map((row) => row.pointsFor))].sort((left, right) => right - left)) {
    const tiedRows = sortedRows.filter((row) => row.pointsFor === pointTotal);

    if (tiedRows.length === 1) {
      resolvedRows.push(tiedRows[0]);
      continue;
    }

    if (tiedRows.length !== 2) {
      return null;
    }

    const [left, right] = tiedRows;
    const tiebreak = tiebreaks.find((candidate) => (
      [candidate.participantAId, candidate.participantBId].includes(left.id)
      && [candidate.participantAId, candidate.participantBId].includes(right.id)
    ));

    if (!tiebreak?.result || isUnresolvedDraw(tiebreak.result)) {
      return null;
    }

    const winnerId = getWinnerId(tiebreak.participantAId, tiebreak.participantBId, tiebreak.result);
    resolvedRows.push(
      left.id === winnerId ? left : right,
      left.id === winnerId ? right : left,
    );
  }

  return resolvedRows;
}

function getPlacementPoolPlacements(poolPlay: LivePoolPlayState): PoolPlaySummaryPlacement[] {
  if (!poolPlay.placementStage) {
    return [];
  }

  const completedMatchIds = new Set((poolPlay.nextStageResults ?? []).map((result) => result.matchId));
  const completePools = poolPlay.placementStage.pools.filter((pool) => (
    getPoolMatchIds(pool).every((matchId) => completedMatchIds.has(matchId))
  ));
  const completePoolMatchIds = new Set(completePools.flatMap(getPoolMatchIds));
  const completePoolResults = poolPlay.nextStageResults.filter((result) => completePoolMatchIds.has(result.matchId));
  const standings = calculateInitialPoolStandings(
    { ...poolPlay.placementStage, pools: completePools },
    completePoolResults,
    "partiPointsFirst",
  );

  return standings.flatMap((table) => {
    const pool = completePools.find((candidate) => candidate.id === table.poolId);

    if (!pool) {
      return [];
    }

    const orderedRows = orderPlacementPoolRows(table.rows, pool, completePoolResults);

    if (!orderedRows) {
      return [];
    }

    return orderedRows
      .map((row, index) => ({
        rank: pool.finalPlacementFrom + index,
        participantName: row.name,
        groupName: pool.name,
      }));
  });
}

function orderPlacementPoolRows(
  rows: StandingRow[],
  pool: NonNullable<LivePoolPlayState["placementStage"]>["pools"][number],
  results: PoolMatchResult[],
): StandingRow[] | null {
  const sortedRows = [...rows].sort((left, right) => right.pointsFor - left.pointsFor);
  const tiedPointTotals = new Set<number>();
  const seenPointTotals = new Set<number>();

  for (const row of sortedRows) {
    if (seenPointTotals.has(row.pointsFor)) {
      tiedPointTotals.add(row.pointsFor);
    }

    seenPointTotals.add(row.pointsFor);
  }

  if (tiedPointTotals.size === 0) {
    return sortedRows;
  }

  const resultByMatchId = new Map(results.map((result) => [result.matchId, result]));
  const resolvedRows: StandingRow[] = [];

  for (const pointTotal of [...new Set(sortedRows.map((row) => row.pointsFor))].sort((left, right) => right - left)) {
    const tiedRows = sortedRows.filter((row) => row.pointsFor === pointTotal);

    if (tiedRows.length === 1) {
      resolvedRows.push(tiedRows[0]);
      continue;
    }

    if (tiedRows.length !== 2) {
      return null;
    }

    const [left, right] = tiedRows;
    const encounter = pool.encounters.find((candidate) => (
      [candidate.participantAId, candidate.participantBId].includes(left.id)
      && [candidate.participantAId, candidate.participantBId].includes(right.id)
    ));
    const result = encounter ? resultByMatchId.get(encounter.id) : undefined;

    if (!encounter || !result || !result.tieBreakWinner) {
      return null;
    }

    const winnerId = result.tieBreakWinner === "teamA" ? encounter.participantAId : encounter.participantBId;
    resolvedRows.push(
      left.id === winnerId ? left : right,
      left.id === winnerId ? right : left,
    );
  }

  return resolvedRows;
}

function getPoolMatchIds(pool: LivePoolPlayState["initialStage"]["pools"][number]): string[] {
  return pool.scheduleType === "americanoRotation"
    ? pool.americanoRounds.flatMap((round) => round.matches.map((match) => match.id))
    : pool.encounters.map((encounter) => encounter.id);
}

function getWinnerId(participantAId: string, participantBId: string, result: PoolMatchResult): string {
  if (result.teamAPoints === result.teamBPoints) {
    return result.tieBreakWinner === "teamA" ? participantAId : participantBId;
  }

  return result.teamAPoints > result.teamBPoints ? participantAId : participantBId;
}

function getLoserId(participantAId: string, participantBId: string, result: PoolMatchResult): string {
  if (result.teamAPoints === result.teamBPoints) {
    return result.tieBreakWinner === "teamA" ? participantBId : participantAId;
  }

  return result.teamAPoints > result.teamBPoints ? participantBId : participantAId;
}

function isUnresolvedDraw(result: PoolMatchResult): boolean {
  return result.teamAPoints === result.teamBPoints && !result.tieBreakWinner;
}

function getAutomaticAdvances(poolPlay: LivePoolPlayState): PoolPlaySummaryAutomaticAdvance[] {
  if ((poolPlay.phase !== "crossMatches" && poolPlay.phase !== "finals") || !poolPlay.crossMatchStage) {
    return [];
  }

  const participantById = new Map(poolPlay.crossMatchStage.participants.map((participant) => [participant.id, participant]));

  return poolPlay.crossMatchStage.automaticAdvances.map((advance) => ({
    id: advance.id,
    participantName: getPoolParticipantName(participantById, advance.participantId),
    sourcePoolName: advance.sourcePoolName,
    sourceRank: advance.sourceRank,
    resolution: advance.resolution,
  }));
}

function formatPoolTeam(participantIds: readonly string[], participants: Map<string, PoolParticipant>): string {
  return participantIds.map((participantId) => getPoolParticipantName(participants, participantId)).join(" / ");
}

function getPoolParticipantName(participants: Map<string, PoolParticipant>, participantId: string): string {
  return participants.get(participantId)?.name ?? participantId;
}
