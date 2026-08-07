import { calculateInitialPoolStandings, type PoolMatchResult } from "../tournament-setup";
import type { CrossMatchStage, InitialPoolStage, PoolAmericanoRound, PoolParticipant } from "../tournament-setup";

export interface PoolPlayPlacementTiebreak {
  id: string;
  groupId: string;
  groupName: string;
  rankFrom: number;
  rankTo: number;
  participantAId: string;
  participantBId: string;
  participantAName: string;
  participantBName: string;
  result?: PoolMatchResult;
}

export function createCrossMatchPlacementTiebreaks(
  crossMatchStage: CrossMatchStage,
  nextStageResults: PoolMatchResult[],
  placementTiebreakResults: PoolMatchResult[] = [],
): PoolPlayPlacementTiebreak[] {
  if (crossMatchStage.participantType !== "player") {
    return [];
  }

  const participantById = new Map(crossMatchStage.participants.map((participant) => [participant.id, participant]));
  const resultByMatchId = new Map(placementTiebreakResults.map((result) => [result.matchId, result]));

  return crossMatchStage.groups.flatMap((group, groupIndex) => {
    if (group.scheduleType !== "americanoRotation") {
      return [];
    }

    return createAmericanoPlacementTiebreaks(
      {
        id: group.id,
        name: group.name,
        participantIds: group.qualifiers.map((qualifier) => qualifier.participantId),
        americanoRounds: group.americanoRounds,
        baseRank: groupIndex * group.qualifiers.length,
      },
      crossMatchStage.participants,
      participantById,
      nextStageResults,
      resultByMatchId,
    );
  }).concat((crossMatchStage.unmatchedPlacementGroups ?? []).flatMap((group) => (
    createAmericanoPlacementTiebreaks(
      {
        id: group.id,
        name: group.name,
        participantIds: group.participants.map((participant) => participant.participantId),
        americanoRounds: group.americanoRounds,
        baseRank: group.finalPlacementFrom - 1,
      },
      crossMatchStage.participants,
      participantById,
      nextStageResults,
      resultByMatchId,
    )
  )));
}

function createAmericanoPlacementTiebreaks(
  group: {
    id: string;
    name: string;
    participantIds: string[];
    americanoRounds: PoolAmericanoRound[];
    baseRank: number;
  },
  participants: PoolParticipant[],
  participantById: Map<string, PoolParticipant>,
  nextStageResults: PoolMatchResult[],
  resultByMatchId: Map<string, PoolMatchResult>,
): PoolPlayPlacementTiebreak[] {
  const stage: InitialPoolStage = {
    participantType: "player",
    participants,
    pools: [{
      id: group.id,
      name: group.name,
      participantIds: group.participantIds,
      scheduleType: "americanoRotation",
      encounters: [],
      americanoRounds: group.americanoRounds,
    }],
  };
  const completedMatchIds = new Set(group.americanoRounds.flatMap((round) => round.matches.map((match) => match.id)));

  if (!group.americanoRounds.length || ![...completedMatchIds].every((matchId) => nextStageResults.some((result) => result.matchId === matchId))) {
    return [];
  }

  const [table] = calculateInitialPoolStandings(
    stage,
    nextStageResults.filter((result) => completedMatchIds.has(result.matchId)),
    "partiPointsFirst",
  );
  const rows = [...table.rows].sort((left, right) => right.pointsFor - left.pointsFor || left.name.localeCompare(right.name, "da"));
  const tiebreaks: PoolPlayPlacementTiebreak[] = [];

  for (let index = 0; index < rows.length - 1; index += 1) {
    const left = rows[index];
    const right = rows[index + 1];

    if (left.pointsFor !== right.pointsFor) {
      continue;
    }

    const id = `${group.id}-placement-tiebreak-${group.baseRank + index + 1}-${group.baseRank + index + 2}`;
    tiebreaks.push({
      id,
      groupId: group.id,
      groupName: group.name,
      rankFrom: group.baseRank + index + 1,
      rankTo: group.baseRank + index + 2,
      participantAId: left.id,
      participantBId: right.id,
      participantAName: getParticipantName(participantById, left.id),
      participantBName: getParticipantName(participantById, right.id),
      ...(resultByMatchId.has(id) ? { result: resultByMatchId.get(id) } : {}),
    });
  }

  return tiebreaks;
}

function getParticipantName(participants: Map<string, PoolParticipant>, participantId: string): string {
  return participants.get(participantId)?.name ?? participantId;
}
