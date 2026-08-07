export type PoolParticipantType = "player" | "pair" | "team";
export type PoolAdvancementMode = "placementPools" | "crossMatches";
export type PoolUnmatchedResolution = "bye" | "walkover";
export type PoolTeamPlayers = 4 | 6;

export interface PoolParticipantLimit {
  minPerPool: number;
  maxTotal: number;
}

export interface PoolPlayConfig {
  participantType: PoolParticipantType;
  poolCount: number;
  participantsPerPool: number;
  advancementMode: PoolAdvancementMode;
  unmatchedResolution: PoolUnmatchedResolution;
  teamPlayersPerTeam?: PoolTeamPlayers;
}

export interface ValidatedPoolPlayConfig extends PoolPlayConfig {
  totalParticipants: number;
  matchesPerTeam?: 2 | 3;
}

export interface PoolParticipant {
  id: string;
  name: string;
}

export interface PoolEncounter {
  id: string;
  poolId: string;
  participantAId: string;
  participantBId: string;
  matchesPerTeam?: 2 | 3;
}

export interface InitialPool {
  id: string;
  name: string;
  participantIds: string[];
  scheduleType: "americanoRotation" | "roundRobin";
  encounters: PoolEncounter[];
  americanoRounds: PoolAmericanoRound[];
}

export interface InitialPoolStage {
  participantType: PoolParticipantType;
  participants: PoolParticipant[];
  pools: InitialPool[];
}

export const maxPoolCount = 8;

export const poolParticipantLimits: Record<PoolParticipantType, PoolParticipantLimit> = {
  player: { minPerPool: 4, maxTotal: 32 },
  pair: { minPerPool: 2, maxTotal: 16 },
  team: { minPerPool: 2, maxTotal: 8 },
};

export function validatePoolPlayConfig(config: PoolPlayConfig): ValidatedPoolPlayConfig {
  assertWholeNumber(config.poolCount, "Antal puljer");
  assertWholeNumber(config.participantsPerPool, participantCountLabel(config.participantType));

  if (config.poolCount < 1 || config.poolCount > maxPoolCount) {
    throw new Error(`Antal puljer skal være mellem 1 og ${maxPoolCount}.`);
  }

  if (config.advancementMode === "crossMatches" && config.poolCount < 2) {
    throw new Error("Krydskampe kræver mindst 2 puljer.");
  }

  if (config.participantType === "player" && config.advancementMode === "placementPools" && config.poolCount < 4) {
    throw new Error("Placeringspuljer for enkeltspillere kræver mindst 4 indledende puljer.");
  }

  const limits = poolParticipantLimits[config.participantType];

  if (config.participantsPerPool < limits.minPerPool) {
    throw new Error(`${participantCountLabel(config.participantType)} skal være mindst ${limits.minPerPool} pr. pulje.`);
  }

  const totalParticipants = config.poolCount * config.participantsPerPool;

  if (totalParticipants > limits.maxTotal) {
    throw new Error(`${participantTotalLabel(config.participantType)} må højst være ${limits.maxTotal}.`);
  }

  if (config.participantType !== "team") {
    return { ...config, totalParticipants };
  }

  if (config.teamPlayersPerTeam !== 4 && config.teamPlayersPerTeam !== 6) {
    throw new Error("Vælg 4 eller 6 spillere pr. hold.");
  }

  return {
    ...config,
    totalParticipants,
    matchesPerTeam: config.teamPlayersPerTeam === 4 ? 2 : 3,
  };
}

export function createInitialPoolStage(config: PoolPlayConfig, participants: PoolParticipant[]): InitialPoolStage {
  const validatedConfig = validatePoolPlayConfig(config);

  if (participants.length !== validatedConfig.totalParticipants) {
    throw new Error(`Der skal være præcis ${validatedConfig.totalParticipants} deltagere.`);
  }

  assertUniqueParticipants(participants);

  const pools = Array.from({ length: validatedConfig.poolCount }, (_, poolIndex) => {
    const id = `pool-${poolIndex + 1}`;
    const firstParticipantIndex = poolIndex * validatedConfig.participantsPerPool;
    const poolParticipants = participants.slice(
      firstParticipantIndex,
      firstParticipantIndex + validatedConfig.participantsPerPool,
    );
    const scheduleType = validatedConfig.participantType === "player" ? "americanoRotation" : "roundRobin";

    return {
      id,
      name: `Pulje ${poolIndex + 1}`,
      participantIds: poolParticipants.map((participant) => participant.id),
      scheduleType,
      encounters: scheduleType === "roundRobin"
        ? createRoundRobinEncounters(id, poolParticipants, validatedConfig.matchesPerTeam)
        : [],
      americanoRounds: scheduleType === "americanoRotation"
        ? createPoolAmericanoRounds(id, poolParticipants.map((participant) => participant.id))
        : [],
    } satisfies InitialPool;
  });

  return {
    participantType: validatedConfig.participantType,
    participants: participants.map((participant) => ({ ...participant })),
    pools,
  };
}

export function createRoundRobinEncounters(
  poolId: string,
  participants: PoolParticipant[],
  matchesPerTeam?: 2 | 3,
): PoolEncounter[] {
  const encounters: PoolEncounter[] = [];

  for (let firstIndex = 0; firstIndex < participants.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < participants.length; secondIndex += 1) {
      encounters.push({
        id: `${poolId}-match-${encounters.length + 1}`,
        poolId,
        participantAId: participants[firstIndex].id,
        participantBId: participants[secondIndex].id,
        ...(matchesPerTeam ? { matchesPerTeam } : {}),
      });
    }
  }

  return encounters;
}

function assertUniqueParticipants(participants: PoolParticipant[]): void {
  const ids = new Set<string>();
  const names = new Set<string>();

  for (const participant of participants) {
    const id = participant.id.trim();
    const name = participant.name.trim();

    if (!id || !name) {
      throw new Error("Alle deltagere skal have id og navn.");
    }

    if (ids.has(id)) {
      throw new Error(`Deltager-id skal være unikt: ${id}`);
    }

    const normalizedName = name.toLocaleLowerCase("da");

    if (names.has(normalizedName)) {
      throw new Error(`Deltagernavn skal være unikt: ${name}`);
    }

    ids.add(id);
    names.add(normalizedName);
  }
}

function assertWholeNumber(value: number, label: string): void {
  if (!Number.isInteger(value)) {
    throw new Error(`${label} skal være et helt tal.`);
  }
}

function participantCountLabel(participantType: PoolParticipantType): string {
  switch (participantType) {
    case "player":
      return "Antal spillere";
    case "pair":
      return "Antal par";
    case "team":
      return "Antal hold";
  }
}

function participantTotalLabel(participantType: PoolParticipantType): string {
  switch (participantType) {
    case "player":
      return "Det samlede antal spillere";
    case "pair":
      return "Det samlede antal par";
    case "team":
      return "Det samlede antal hold";
  }
}
import { createPoolAmericanoRounds, type PoolAmericanoRound } from "./pool-play-americano";
