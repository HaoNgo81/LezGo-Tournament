export type RandomSource = () => number;

export function shuffleItems<T>(items: T[], random: RandomSource = Math.random): T[] {
  const shuffled = [...items];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomValue = random();
    const safeRandomValue = Number.isFinite(randomValue) ? Math.min(Math.max(randomValue, 0), 0.9999999999999999) : 0;
    const swapIndex = Math.floor(safeRandomValue * (index + 1));
    const current = shuffled[index];
    shuffled[index] = shuffled[swapIndex];
    shuffled[swapIndex] = current;
  }

  return shuffled;
}

export function seededShuffle<T>(items: T[], seed = 1): T[] {
  return shuffleItems(items, createSeededRandomSource(seed));
}

export function createSeededRandomSource(seed = 1): RandomSource {
  let state = seed || 1;

  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

export function canonicalPairKey(playerIds: readonly string[]): string {
  return [...playerIds].sort().join("+");
}

export function canonicalMatchupKey(teamAIds: readonly string[], teamBIds: readonly string[]): string {
  return [canonicalPairKey(teamAIds), canonicalPairKey(teamBIds)].sort().join(" vs ");
}
