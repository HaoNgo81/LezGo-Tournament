import {
  createTournamentRounds,
  createFixedPartnerTeams,
  getAmericanoCycleLength,
  getFixedPartnerAmericanoCycleLength,
  getMixedAmericanoCycleLength,
  type Gender,
  type StandingsRankingMode,
  type TournamentFormat,
  type TournamentPlayer,
} from "../tournament-engine";
import type { LiveTournamentState } from "../live-scoring";
import type { LivePoolPlayState } from "../live-scoring/pool-play-state";
import { createInitialPoolStage, type PoolParticipantType, type PoolPlayConfig, type PoolTeamPlayers } from "./pool-play";
import { validateScoringSettings, type FixedScoreRule, type ScoringMode } from "./scoring";

export type TournamentSetupFormat =
  | "Americano"
  | "Mexicano"
  | "Mixed Americano"
  | "Fast Makker Americano"
  | "Fast Makker Mexicano"
  | "Puljespil"
  | "Team vs. Team";

export interface TournamentSetupInput {
  name: string;
  format: TournamentSetupFormat;
  playerText: string;
  femalePlayerText: string;
  malePlayerText: string;
  courts: number;
  rounds: number;
  scoringMode: ScoringMode;
  fixedScoreRule?: FixedScoreRule;
  fixedScorePoints?: number;
  timeLimitMinutes?: number;
  firstRoundOrder: "manual" | "random";
  rankingMode: StandingsRankingMode;
}

export interface PoolTournamentSetupInput {
  name: string;
  participantType: PoolParticipantType;
  participantText: string;
  poolCount: number;
  participantsPerPool: number;
  advancementMode: PoolPlayConfig["advancementMode"];
  unmatchedResolution: PoolPlayConfig["unmatchedResolution"];
  scoringMode: ScoringMode;
  fixedScoreRule?: FixedScoreRule;
  fixedScorePoints?: number;
  timeLimitMinutes?: number;
  rankingMode: StandingsRankingMode;
  teamPlayersPerTeam?: PoolTeamPlayers;
}

export function createTournamentFromSetup(input: TournamentSetupInput): LiveTournamentState {
  const tournamentName = input.name.trim();

  if (!tournamentName) {
    throw new Error("Turneringen skal have et navn.");
  }

  const format = mapSetupFormat(input.format);
  const players = input.format === "Mixed Americano" ? parseMixedPlayers(input.femalePlayerText, input.malePlayerText) : parsePlayers(input.playerText);
  const isFixedPartner = input.format === "Fast Makker Americano" || input.format === "Fast Makker Mexicano";
  const isAutomaticCycle = input.format === "Americano" || input.format === "Fast Makker Americano" || input.format === "Mixed Americano";
  const isOpenEndedMexicano = input.format === "Mexicano";
  const isOpenEndedFixedPartnerMexicano = input.format === "Fast Makker Mexicano";

  if (isFixedPartner) {
    if (players.length % 2 !== 0) {
      throw new Error("Fast Makker kræver et lige antal spillere, så alle kan indgå i et par.");
    }

    const pairCount = players.length / 2;

    if (isOpenEndedFixedPartnerMexicano && pairCount !== input.courts * 2) {
      throw new Error("Fast Makker Mexicano kræver præcis 2 par pr. bane.");
    }

    const maxCourts = Math.floor(pairCount / 2);
    if (input.courts > maxCourts) {
      throw new Error(`${pairCount} par kan højst fylde ${maxCourts} ${maxCourts === 1 ? "bane" : "baner"}.`);
    }
  }

  if (isOpenEndedMexicano && players.length !== input.courts * 4) {
    throw new Error("Mexicano kræver præcis 4 spillere pr. bane.");
  }

  if (input.scoringMode === "Spil på tid" && (!input.timeLimitMinutes || input.timeLimitMinutes < 1)) {
    throw new Error("Vælg spilletid for Spil på tid.");
  }
  validateScoringSettings(input.scoringMode, input);

  const configuredRounds = input.format === "Americano"
    ? getAmericanoCycleLength(players, input.courts)
    : input.format === "Fast Makker Americano"
      ? getFixedPartnerAmericanoCycleLength(createFixedPartnerTeams(players), input.courts)
      : input.format === "Mixed Americano" ? getMixedAmericanoCycleLength(players, input.courts) : input.format === "Mexicano" || input.format === "Fast Makker Mexicano" ? 1 : input.rounds;
  const rounds = createTournamentRounds({
    format,
    players,
    rounds: configuredRounds,
    courts: input.courts,
    firstRoundOrder: input.firstRoundOrder,
  });

  return {
    tournamentName,
    format,
    status: "active",
    players,
    rounds,
    configuredRounds: isAutomaticCycle || isOpenEndedMexicano || isOpenEndedFixedPartnerMexicano ? undefined : input.rounds,
    automaticCycle: isAutomaticCycle ? { type: "automatic-cycle", cycleLength: configuredRounds } : undefined,
    courtCount: input.courts,
    activeRoundNumber: 1,
    results: [],
    startedMatchIds: [],
    scoringMode: input.scoringMode,
    fixedScoreRule: input.scoringMode === "Fast antal point" ? input.fixedScoreRule : undefined,
    fixedScorePoints: input.scoringMode === "Fast antal point" ? input.fixedScorePoints : undefined,
    timeLimitMinutes: input.scoringMode === "Spil på tid" ? input.timeLimitMinutes : undefined,
    rankingMode: input.rankingMode,
  };
}

export function createPoolTournamentFromSetup(input: PoolTournamentSetupInput): LiveTournamentState {
  const tournamentName = input.name.trim();

  if (!tournamentName) {
    throw new Error("Turneringen skal have et navn.");
  }

  if (input.scoringMode === "Spil på tid" && (!input.timeLimitMinutes || input.timeLimitMinutes < 1)) {
    throw new Error("Vælg spilletid for Spil på tid.");
  }
  validateScoringSettings(input.scoringMode, input);

  const config: PoolPlayConfig = {
    participantType: input.participantType,
    poolCount: input.poolCount,
    participantsPerPool: input.participantsPerPool,
    advancementMode: input.advancementMode,
    unmatchedResolution: input.unmatchedResolution,
    ...(input.participantType === "team" ? { teamPlayersPerTeam: input.teamPlayersPerTeam } : {}),
  };
  const participants = parsePlayers(input.participantText);
  const initialStage = createInitialPoolStage(config, participants);
  const poolPlay: LivePoolPlayState = {
    phase: "initial",
    advancementMode: input.advancementMode,
    unmatchedResolution: input.unmatchedResolution,
    initialStage,
    initialResults: [],
    nextStageResults: [],
    finalResults: [],
    placementTiebreakResults: [],
  };

  return {
    tournamentName,
    format: "pool-play",
    status: "active",
    players: participants,
    rounds: [],
    activeRoundNumber: 1,
    results: [],
    startedMatchIds: [],
    scoringMode: input.scoringMode,
    fixedScoreRule: input.scoringMode === "Fast antal point" ? input.fixedScoreRule : undefined,
    fixedScorePoints: input.scoringMode === "Fast antal point" ? input.fixedScorePoints : undefined,
    timeLimitMinutes: input.scoringMode === "Spil på tid" ? input.timeLimitMinutes : undefined,
    rankingMode: input.rankingMode,
    poolPlay,
  };
}

export function parsePlayers(text: string, gender?: Gender): TournamentPlayer[] {
  const names = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (names.length === 0) {
    throw new Error("Tilføj mindst 4 spillere.");
  }

  assertUniqueNames(names);

  return names.map((name, index) => ({
    id: `p${index + 1}`,
    name,
    ...(gender ? { gender } : {}),
  }));
}

function parseMixedPlayers(femaleText: string, maleText: string): TournamentPlayer[] {
  const females = parsePlayers(femaleText, "female").map((player, index) => ({ ...player, id: `f${index + 1}` }));
  const males = parsePlayers(maleText, "male").map((player, index) => ({ ...player, id: `m${index + 1}` }));

  assertUniqueNames([...females, ...males].map((player) => player.name));

  return [...females, ...males];
}

function mapSetupFormat(format: TournamentSetupFormat): TournamentFormat {
  switch (format) {
    case "Americano":
      return "americano";
    case "Mexicano":
      return "mexicano";
    case "Mixed Americano":
      return "mixed-americano";
    case "Fast Makker Americano":
      return "fixed-partner-americano";
    case "Fast Makker Mexicano":
      return "fixed-partner-mexicano";
    case "Puljespil":
      throw new Error("Puljespil oprettes via puljeformularen.");
    case "Team vs. Team":
      throw new Error("Team vs. Team oprettes via holdformularen.");
    default:
      return assertNever(format);
  }
}

function assertUniqueNames(names: string[]): void {
  const seen = new Set<string>();

  for (const name of names) {
    const normalizedName = name.toLocaleLowerCase("da");

    if (seen.has(normalizedName)) {
      throw new Error(`Spillernavn skal være unikt: ${name}`);
    }

    seen.add(normalizedName);
  }
}

function assertNever(value: never): never {
  throw new Error(`Ukendt turneringsform: ${value}`);
}



