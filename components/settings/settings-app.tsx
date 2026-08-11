"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Section } from "@/components/ui/section";
import { scoringModes } from "@/lib/mock/tournament-data";
import { createDefaultTournamentSettings, loadTournamentSettings, saveTournamentSettings, type TournamentSettings } from "@/lib/tournament-settings";
import type { StandingsRankingMode } from "@/lib/tournament-engine";
import type { ScoringMode } from "@/lib/tournament-setup";
import { useHasHydrated } from "@/hooks/use-has-hydrated";

const rankingOptions: Array<{ label: string; value: StandingsRankingMode }> = [
  { label: "Flest matchpoint", value: "matchPointsFirst" },
  { label: "Flest scorepoint", value: "partiPointsFirst" },
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

  if (!hasHydrated) {
    return <p className="app-card p-4 font-bold text-[var(--muted)]">Indlæser indstillinger...</p>;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      const savedSettings = saveTournamentSettings(settings);
      setSettings(savedSettings);
      setMessage("Indstillinger gemt.");
    } catch (caughtError) {
      setMessage(caughtError instanceof Error ? caughtError.message : "Indstillinger kunne ikke gemmes.");
    }
  }

  return (
    <form className="grid gap-5" onSubmit={handleSubmit}>
      <Section title="Standarder for nye turneringer">
        <div className="app-card grid gap-3 p-4 sm:p-5">
          <label className="grid gap-2 text-lg font-bold">
            Scoring
            <select className="field-control" value={settings.scoringMode} onChange={(event) => setSettings({ ...settings, scoringMode: event.target.value as ScoringMode })}>
              {scoringModes.map((mode) => <option key={mode}>{mode}</option>)}
            </select>
          </label>
          <label className="grid gap-2 text-lg font-bold">
            Stilling sorteres efter
            <select className="field-control" value={settings.rankingMode} onChange={(event) => setSettings({ ...settings, rankingMode: event.target.value as StandingsRankingMode })}>
              {rankingOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <div className="action-grid">
            <label className="grid gap-2 text-lg font-bold">
              Baner
              <input className="field-control" min="1" type="number" value={settings.courts} onChange={(event) => setSettings({ ...settings, courts: Number(event.target.value) })} />
            </label>
            <label className="grid gap-2 text-lg font-bold">
              Runder
              <input className="field-control" min="1" type="number" value={settings.rounds} onChange={(event) => setSettings({ ...settings, rounds: Number(event.target.value) })} />
            </label>
            <label className="grid gap-2 text-lg font-bold">
              Spilletid (minutter)
              <input className="field-control" min="1" type="number" value={settings.timeLimitMinutes} onChange={(event) => setSettings({ ...settings, timeLimitMinutes: Number(event.target.value) })} />
            </label>
          </div>
        </div>
      </Section>

      {message ? <p className="rounded-md bg-green-50 p-3 font-bold text-[var(--primary-strong)]">{message}</p> : null}

      <button className="btn-primary min-h-14 text-lg" type="submit">
        Gem indstillinger
      </button>
    </form>
  );
}
