import type { TournamentPlayer } from "./types";

export function assertPlayerCount(players: TournamentPlayer[]): void {
  if (players.length < 4) {
    throw new Error("Der skal vaere mindst 4 spillere for at oprette en turnering.");
  }
}

export function assertCourts(courts: number): void {
  if (!Number.isInteger(courts) || courts < 1) {
    throw new Error("Antal baner skal vaere mindst 1.");
  }
}

export function assertRounds(rounds: number): void {
  if (!Number.isInteger(rounds) || rounds < 1) {
    throw new Error("Antal runder skal vaere mindst 1.");
  }
}

export function assertUniquePlayerIds(players: TournamentPlayer[]): void {
  const ids = new Set<string>();

  for (const player of players) {
    if (ids.has(player.id)) {
      throw new Error(`Spiller-id skal vaere unikt: ${player.id}`);
    }

    ids.add(player.id);
  }
}

export function assertMixedPlayers(players: TournamentPlayer[]): void {
  const females = players.filter((player) => player.gender === "female").length;
  const males = players.filter((player) => player.gender === "male").length;

  if (females !== males) {
    throw new Error("Mixed Americano kraever samme antal kvinder og maend.");
  }

  if (players.some((player) => player.gender !== "female" && player.gender !== "male")) {
    throw new Error("Mixed Americano kraever koen paa alle spillere.");
  }
}
