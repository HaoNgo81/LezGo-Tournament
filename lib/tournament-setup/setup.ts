import {
  createTournamentRounds,
  type Gender,
  type StandingsRankingMode,
  type TournamentFormat,
  type TournamentPlayer,
} from "../tournament-engine";
import type { LiveTournamentState } from "../live-scoring";
import type { ScoringMode } from "./team-vs-team-setup";

export type TournamentSetupFormat =
  | "Americano"
  | "Mexicano"
  | "Mixed Americano"
  | "Fast Makker Americano"
  | "Fast Makker Mexicano"
  | "Team vs. Team"
  | "Club vs Club";

export interface TournamentSetupInput {
  name: string;
  format: TournamentSetupFormat;
  playerText: string;
  femalePlayerText: string;
  malePlayerText: string;
  courts: number;
  rounds: number;
  scoringMode: ScoringMode;
  timeLimitMinutes?: number;
  firstRoundOrder: "manual" | "random";
  rankingMode: StandingsRankingMode;
}

export function createTournamentFromSetup(input: TournamentSetupInput): LiveTournamentState {
  const tournamentName = input.name.trim();

  if (!tournamentName) {
    throw new Error("Turneringen skal have et navn.");
  }

  const format = mapSetupFormat(input.format);
  const players = input.format === "Mixed Americano" ? parseMixedPlayers(input.femalePlayerText, input.malePlayerText) : parsePlayers(input.playerText);
  if (input.scoringMode === "Spil på tid" && (!input.timeLimitMinutes || input.timeLimitMinutes < 1)) {
    throw new Error("Vælg spilletid for Spil på tid.");
  }

  const rounds = createTournamentRounds({
    format,
    players,
    rounds: input.rounds,
    courts: input.courts,
    firstRoundOrder: input.firstRoundOrder,
  });

  return {
    tournamentName,
    format,
    status: "active",
    players,
    rounds,
    activeRoundNumber: 1,
    results: [],
    startedMatchIds: [],
    scoringMode: input.scoringMode,
    timeLimitMinutes: input.scoringMode === "Spil på tid" ? input.timeLimitMinutes : undefined,
    rankingMode: input.rankingMode,
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
    case "Team vs. Team":
      throw new Error("Team vs. Team oprettes via holdformularen.");
    case "Club vs Club":
      throw new Error("Club vs Club er ikke implementeret endnu.");
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



