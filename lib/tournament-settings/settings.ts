import type { StandingsRankingMode } from "../tournament-engine";
import { normalizeLanguage, type AppLanguage } from "../i18n/translations";
import { createDefaultTheme, normalizeTheme, type AppTheme } from "../theme/theme";
import type { ScoringMode } from "../tournament-setup";
import { normalizeAlarmSoundId, type AlarmSoundId } from "./alarm-sounds";

const settingsStorageKey = "lezgo.tournamentSettings.v1";

export interface TournamentSettings {
  scoringMode: ScoringMode;
  courts: number;
  rounds: number;
  rankingMode: StandingsRankingMode;
  timeLimitMinutes: number;
  alarmSound: AlarmSoundId;
  language: AppLanguage;
  theme: AppTheme;
}

export function createDefaultTournamentSettings(): TournamentSettings {
  return {
    scoringMode: "Fri scoring",
    courts: 2,
    rounds: 2,
    rankingMode: "matchPointsFirst",
    timeLimitMinutes: 15,
    alarmSound: "standard",
    language: "da",
    theme: createDefaultTheme(),
  };
}

export function loadTournamentSettings(): TournamentSettings {
  if (typeof window === "undefined") {
    return createDefaultTournamentSettings();
  }

  const savedSettings = window.localStorage.getItem(settingsStorageKey);

  if (!savedSettings) {
    const defaults = createDefaultTournamentSettings();
    saveTournamentSettings(defaults);
    return defaults;
  }

  try {
    return normalizeTournamentSettings(JSON.parse(savedSettings) as Partial<TournamentSettings>);
  } catch {
    window.localStorage.removeItem(settingsStorageKey);
    return createDefaultTournamentSettings();
  }
}

export function saveTournamentSettings(input: Partial<TournamentSettings>): TournamentSettings {
  const settings = normalizeTournamentSettings(input);

  if (typeof window !== "undefined") {
    window.localStorage.setItem(settingsStorageKey, JSON.stringify(settings));
  }

  return settings;
}

function normalizeTournamentSettings(input: Partial<TournamentSettings>): TournamentSettings {
  const defaults = createDefaultTournamentSettings();
  const settings = {
    scoringMode: input.scoringMode ?? defaults.scoringMode,
    courts: input.courts ?? defaults.courts,
    rounds: input.rounds ?? defaults.rounds,
    rankingMode: input.rankingMode ?? defaults.rankingMode,
    timeLimitMinutes: input.timeLimitMinutes ?? defaults.timeLimitMinutes,
    alarmSound: normalizeAlarmSoundId(input.alarmSound),
    language: normalizeLanguage(input.language),
    theme: normalizeTheme(input.theme),
  };

  if (!Number.isInteger(settings.courts) || settings.courts < 1) {
    throw new Error("Standardindstillinger skal have mindst 1 bane.");
  }

  if (!Number.isInteger(settings.rounds) || settings.rounds < 1) {
    throw new Error("Standardindstillinger skal have mindst 1 runde.");
  }

  if (!Number.isInteger(settings.timeLimitMinutes) || settings.timeLimitMinutes < 1) {
    throw new Error("Standardindstillinger skal have mindst 1 minut spilletid.");
  }

  return settings;
}
