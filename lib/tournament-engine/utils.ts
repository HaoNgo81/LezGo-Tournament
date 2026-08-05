export function seededShuffle<T>(items: T[], seed = 1): T[] {
  const shuffled = [...items];
  let state = seed || 1;

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    state = (state * 1664525 + 1013904223) % 4294967296;
    const swapIndex = state % (index + 1);
    const current = shuffled[index];
    shuffled[index] = shuffled[swapIndex];
    shuffled[swapIndex] = current;
  }

  return shuffled;
}

export function canonicalPairKey(playerIds: readonly string[]): string {
  return [...playerIds].sort().join("+");
}

export function canonicalMatchupKey(teamAIds: readonly string[], teamBIds: readonly string[]): string {
  return [canonicalPairKey(teamAIds), canonicalPairKey(teamBIds)].sort().join(" vs ");
}
