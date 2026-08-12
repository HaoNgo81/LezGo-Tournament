export type ScoringMode = "Fri scoring" | "Fast antal point" | "Spil på tid";

export type FixedScoreRule = "target" | "total";

export interface FixedScoreSettings {
  fixedScoreRule?: FixedScoreRule;
  fixedScorePoints?: number;
}

export interface FixedTotalScore {
  teamAPoints: number;
  teamBPoints: number;
}

export function calculateFixedTotalScore(fixedScoreTotal: number, enteredScore: number): FixedTotalScore {
  if (!Number.isInteger(fixedScoreTotal) || fixedScoreTotal < 1) {
    throw new Error("Vælg et fast samlet antal scorepoint på mindst 1.");
  }

  if (!Number.isInteger(enteredScore)) {
    throw new Error("Score skal være et helt tal.");
  }

  if (enteredScore < 0 || enteredScore > fixedScoreTotal) {
    throw new Error(`Scoren skal være mellem 0 og ${fixedScoreTotal}.`);
  }

  return {
    teamAPoints: enteredScore,
    teamBPoints: fixedScoreTotal - enteredScore,
  };
}

export function validateScoringSettings(scoringMode: ScoringMode, settings: FixedScoreSettings): void {
  if (scoringMode !== "Fast antal point") {
    return;
  }

  if (settings.fixedScoreRule !== "target" && settings.fixedScoreRule !== "total") {
    throw new Error("Vælg om der spilles til et antal scorepoint eller med et samlet antal scorepoint.");
  }

  if (!Number.isInteger(settings.fixedScorePoints) || (settings.fixedScorePoints ?? 0) < 1) {
    throw new Error("Vælg et fast antal scorepoint på mindst 1.");
  }
}

export function validateScoreForScoringMode(
  scoringMode: ScoringMode,
  teamAPoints: number,
  teamBPoints: number,
  settings: FixedScoreSettings,
): void {
  if (scoringMode !== "Fast antal point") {
    return;
  }

  validateScoringSettings(scoringMode, settings);
  const fixedScorePoints = settings.fixedScorePoints as number;

  if (settings.fixedScoreRule === "target" && Math.max(teamAPoints, teamBPoints) !== fixedScorePoints) {
    throw new Error(`Ved Spil til ${fixedScorePoints} skal én score være præcis ${fixedScorePoints}.`);
  }

  if (settings.fixedScoreRule === "total" && teamAPoints + teamBPoints !== fixedScorePoints) {
    throw new Error(`De to scorer skal tilsammen være ${fixedScorePoints}.`);
  }
}
