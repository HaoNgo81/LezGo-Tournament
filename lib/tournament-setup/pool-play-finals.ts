import type { PoolEncounter, PoolParticipant, PoolParticipantType } from "./pool-play";
import type { CrossMatchEncounter, CrossMatchGroup, CrossMatchStage } from "./pool-play-cross-matches";
import type { PoolMatchResult } from "./pool-play-standings";

export interface CrossMatchFinalEncounter extends PoolEncounter {
  placement: "final" | "bronze";
  sourceGroupId: string;
  sourceMatchIds: [string, string];
}

export interface CrossMatchFinalGroup {
  id: string;
  name: string;
  sourceGroupId: string;
  final: CrossMatchFinalEncounter;
  bronze: CrossMatchFinalEncounter;
}

export interface CrossMatchFinalStage {
  participantType: Exclude<PoolParticipantType, "player">;
  participants: PoolParticipant[];
  groups: CrossMatchFinalGroup[];
}

export function createCrossMatchFinalStage(
  crossStage: CrossMatchStage,
  crossResults: PoolMatchResult[],
): CrossMatchFinalStage {
  if (crossStage.participantType === "player") {
    throw new Error("Individuelle krydskampe afgøres af Americano-stillingen og opretter ikke finale- og bronzekamp.");
  }

  const resultByMatchId = new Map(crossResults.map((result) => [result.matchId, result]));
  const groups = crossStage.groups
    .filter((group) => group.scheduleType === "crossMatches")
    .map((group, index) => createFinalGroup(group, index + 1, resultByMatchId));

  return {
    participantType: crossStage.participantType,
    participants: crossStage.participants.map((participant) => ({ ...participant })),
    groups,
  };
}

function createFinalGroup(
  group: CrossMatchGroup,
  groupNumber: number,
  resultByMatchId: Map<string, PoolMatchResult>,
): CrossMatchFinalGroup {
  if (group.encounters.length !== 2) {
    throw new Error(`${group.name} skal have præcis 2 krydskampe for at oprette finale og bronzekamp.`);
  }

  const [firstSemiFinal, secondSemiFinal] = group.encounters;
  const firstOutcome = getMatchOutcome(firstSemiFinal, resultByMatchId);
  const secondOutcome = getMatchOutcome(secondSemiFinal, resultByMatchId);
  const sourceMatchIds: [string, string] = [firstSemiFinal.id, secondSemiFinal.id];
  const matchesPerTeam = firstSemiFinal.matchesPerTeam ?? secondSemiFinal.matchesPerTeam;

  return {
    id: `${group.id}-finals`,
    name: `Finalespil ${groupNumber}`,
    sourceGroupId: group.id,
    final: createFinalEncounter(group.id, "final", firstOutcome.winnerId, secondOutcome.winnerId, sourceMatchIds, matchesPerTeam),
    bronze: createFinalEncounter(group.id, "bronze", firstOutcome.loserId, secondOutcome.loserId, sourceMatchIds, matchesPerTeam),
  };
}

function getMatchOutcome(
  encounter: CrossMatchEncounter,
  resultByMatchId: Map<string, PoolMatchResult>,
): { winnerId: string; loserId: string } {
  const result = resultByMatchId.get(encounter.id);

  if (!result) {
    throw new Error(`Krydskampen mangler resultat: ${encounter.id}`);
  }

  if (result.teamAPoints === result.teamBPoints && !result.tieBreakWinner) {
    throw new Error(`Uafgjort i krydskamp kræver match tiebreak: ${encounter.id}`);
  }

  return isTeamAWinner(result)
    ? { winnerId: encounter.participantAId, loserId: encounter.participantBId }
    : { winnerId: encounter.participantBId, loserId: encounter.participantAId };
}

function isTeamAWinner(result: PoolMatchResult): boolean {
  if (result.teamAPoints === result.teamBPoints) {
    return result.tieBreakWinner === "teamA";
  }

  return result.teamAPoints > result.teamBPoints;
}

function createFinalEncounter(
  groupId: string,
  placement: "final" | "bronze",
  participantAId: string,
  participantBId: string,
  sourceMatchIds: [string, string],
  matchesPerTeam?: 2 | 3,
): CrossMatchFinalEncounter {
  return {
    id: `${groupId}-${placement}`,
    poolId: `${groupId}-finals`,
    participantAId,
    participantBId,
    placement,
    sourceGroupId: groupId,
    sourceMatchIds,
    ...(matchesPerTeam ? { matchesPerTeam } : {}),
  };
}
