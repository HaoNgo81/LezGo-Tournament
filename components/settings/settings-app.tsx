"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Section } from "@/components/ui/section";
import { normalizeLanguage, translate, type AppLanguage } from "@/lib/i18n/translations";
import { notifyPreferencesChanged } from "@/lib/preferences/client";
import { applyTheme, createDefaultTheme, getThemeForPreset, type AppTheme, type ThemePreset } from "@/lib/theme/theme";
import { alarmSoundOptions, createDefaultTournamentSettings, loadTournamentSettings, playTournamentAlarmSound, saveTournamentSettings, type AlarmSoundId, type TournamentSettings } from "@/lib/tournament-settings";
import type { StandingsRankingMode } from "@/lib/tournament-engine";
import type { ScoringMode } from "@/lib/tournament-setup";
import { useHasHydrated } from "@/hooks/use-has-hydrated";

const scoringOptions: Array<{ labelKey: "playToScorePoints" | "totalScorePoints" | "timeFreeScoring"; value: ScoringMode }> = [
  { labelKey: "playToScorePoints", value: "Fast antal point" },
  { labelKey: "totalScorePoints", value: "Fri scoring" },
  { labelKey: "timeFreeScoring", value: "Spil på tid" },
];

const rankingOptions: Array<{ labelKey: "mostMatchPoints" | "mostScorePoints"; value: StandingsRankingMode }> = [
  { labelKey: "mostMatchPoints", value: "matchPointsFirst" },
  { labelKey: "mostScorePoints", value: "partiPointsFirst" },
];

const themePresetOptions: Array<{ labelKey: "lezgo" | "darkGold" | "midnight" | "ocean" | "forest" | "light" | "hybridLezgo"; value: Exclude<ThemePreset, "custom"> }> = [
  { labelKey: "lezgo", value: "lezgo" },
  { labelKey: "darkGold", value: "darkGold" },
  { labelKey: "midnight", value: "midnight" },
  { labelKey: "ocean", value: "ocean" },
  { labelKey: "forest", value: "forest" },
  { labelKey: "light", value: "light" },
  { labelKey: "hybridLezgo", value: "hybridLezgo" },
];

export function SettingsApp() {
  const hasHydrated = useHasHydrated();
  const [settings, setSettings] = useState<TournamentSettings>(() => createDefaultTournamentSettings());
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!hasHydrated) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setSettings(loadTournamentSettings());
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [hasHydrated]);

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }

    applyTheme(settings.theme);
    document.documentElement.lang = settings.language;
  }, [hasHydrated, settings.language, settings.theme]);

  if (!hasHydrated) {
    return <p className="app-card p-4 font-bold text-[var(--muted)]">{translate("da", "loadingSettings")}</p>;
  }

  const language = normalizeLanguage(settings.language);
  const t = (key: Parameters<typeof translate>[1]) => translate(language, key);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      const savedSettings = saveTournamentSettings(settings);
      setSettings(savedSettings);
      notifyPreferencesChanged();
      setMessage(t("settingsSaved"));
    } catch (caughtError) {
      setMessage(caughtError instanceof Error ? caughtError.message : `${t("settings")} kunne ikke gemmes.`);
    }
  }

  async function handlePreviewAlarm() {
    const didPlay = await playTournamentAlarmSound(settings.alarmSound);
    setMessage(didPlay ? `${t("alarmSound")} afspillet.` : `Browseren kunne ikke afspille ${t("alarmSound").toLowerCase()}.`);
  }

  function updateTheme(nextTheme: AppTheme) {
    setSettings({ ...settings, theme: nextTheme });
  }

  function handleThemePresetChange(preset: ThemePreset) {
    updateTheme(preset === "custom" ? { ...settings.theme, preset } : getThemeForPreset(preset));
  }

  function updateThemeColor(key: keyof Omit<AppTheme, "preset">, value: string) {
    updateTheme({ ...settings.theme, preset: "custom", [key]: value });
  }

  function resetTheme() {
    updateTheme(createDefaultTheme());
  }

  return (
    <form className="grid gap-5" onSubmit={handleSubmit}>
      <Section title={t("standardsForNewTournaments")}>
        <div className="app-card grid gap-3 p-4 sm:p-5">
          <label className="grid gap-2 text-lg font-bold">
            {t("scoring")}
            <select className="field-control" value={settings.scoringMode} onChange={(event) => setSettings({ ...settings, scoringMode: event.target.value as ScoringMode })}>
              {scoringOptions.map((option) => <option key={option.value} value={option.value}>{t(option.labelKey)}</option>)}
            </select>
          </label>
          <label className="grid gap-2 text-lg font-bold">
            {t("rankingSort")}
            <select className="field-control" value={settings.rankingMode} onChange={(event) => setSettings({ ...settings, rankingMode: event.target.value as StandingsRankingMode })}>
              {rankingOptions.map((option) => <option key={option.value} value={option.value}>{t(option.labelKey)}</option>)}
            </select>
          </label>
          <div className="action-grid">
            <label className="grid gap-2 text-lg font-bold">
              {t("courts")}
              <input className="field-control" min="1" type="number" value={settings.courts} onChange={(event) => setSettings({ ...settings, courts: Number(event.target.value) })} />
            </label>
            <label className="grid gap-2 text-lg font-bold">
              {t("rounds")}
              <input className="field-control" min="1" type="number" value={settings.rounds} onChange={(event) => setSettings({ ...settings, rounds: Number(event.target.value) })} />
            </label>
            <label className="grid gap-2 text-lg font-bold">
              {t("timeLimitMinutes")}
              <input className="field-control" min="1" type="number" value={settings.timeLimitMinutes} onChange={(event) => setSettings({ ...settings, timeLimitMinutes: Number(event.target.value) })} />
            </label>
          </div>
        </div>
      </Section>

      <Section title={t("language")}>
        <div className="app-card grid gap-3 p-4 sm:p-5">
          <label className="grid gap-2 text-lg font-bold">
            {t("language")}
            <select className="field-control" value={settings.language} onChange={(event) => setSettings({ ...settings, language: event.target.value as AppLanguage })}>
              <option value="da">Dansk</option>
              <option value="en">English</option>
            </select>
          </label>
        </div>
      </Section>

      <Section title={t("theme")}>
        <div className="app-card grid gap-4 p-4 sm:p-5">
          <label className="grid gap-2 text-lg font-bold">
            {t("themePreset")}
            <select className="field-control" value={settings.theme.preset} onChange={(event) => handleThemePresetChange(event.target.value as ThemePreset)}>
              {themePresetOptions.map((option) => <option key={option.value} value={option.value}>{t(option.labelKey)}</option>)}
              <option value="custom">{t("themeCustom")}</option>
            </select>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <ThemeColorField label={t("primaryButtonColor")} value={settings.theme.primary} onChange={(value) => updateThemeColor("primary", value)} />
            <ThemeColorField label={t("secondaryButtonColor")} value={settings.theme.secondary} onChange={(value) => updateThemeColor("secondary", value)} />
            <ThemeColorField label={t("background")} value={settings.theme.background} onChange={(value) => updateThemeColor("background", value)} />
            <ThemeColorField label={t("cardBackground")} value={settings.theme.surface} onChange={(value) => updateThemeColor("surface", value)} />
            <ThemeColorField label={t("foreground")} value={settings.theme.foreground} onChange={(value) => updateThemeColor("foreground", value)} />
            <ThemeColorField label={t("themeAccent")} value={settings.theme.accent} onChange={(value) => updateThemeColor("accent", value)} />
          </div>
          <button className="btn-secondary min-h-12" type="button" onClick={resetTheme}>
            {t("resetTheme")}
          </button>
        </div>
      </Section>

      <Section title={t("alarmSound")}>
        <div className="app-card grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-end sm:p-5">
          <label className="grid gap-2 text-lg font-bold">
            {t("alarmSound")}
            <select className="field-control" value={settings.alarmSound} onChange={(event) => setSettings({ ...settings, alarmSound: event.target.value as AlarmSoundId })}>
              {alarmSoundOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
          </label>
          <button className="btn-secondary min-h-14" type="button" onClick={handlePreviewAlarm}>
            {t("testSound")}
          </button>
        </div>
      </Section>

      {message ? <p className="rounded-md bg-green-50 p-3 font-bold text-[var(--primary-strong)]">{message}</p> : null}

      <button className="btn-primary min-h-14 text-lg" type="submit">
        {t("saveSettings")}
      </button>
    </form>
  );
}

function ThemeColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-2 text-lg font-bold">
      {label}
      <span className="grid grid-cols-[4rem_1fr] gap-2">
        <input className="field-control h-14 p-1" type="color" value={value} onChange={(event) => onChange(event.target.value)} aria-label={label} />
        <input className="field-control font-mono" value={value} onChange={(event) => onChange(event.target.value)} aria-label={`${label} hex`} />
      </span>
    </label>
  );
}
