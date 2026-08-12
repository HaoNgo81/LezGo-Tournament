"use client";

import { useEffect, useState } from "react";
import { normalizeLanguage, translate, type AppLanguage, type TranslationKey } from "@/lib/i18n/translations";
import { applyTheme } from "@/lib/theme/theme";
import { createDefaultTournamentSettings, loadTournamentSettings, type TournamentSettings } from "@/lib/tournament-settings";

const preferencesChangedEvent = "lezgo:preferences-changed";

export function notifyPreferencesChanged(): void {
  window.dispatchEvent(new Event(preferencesChangedEvent));
}

export function useTournamentPreferences(): TournamentSettings {
  const [settings, setSettings] = useState<TournamentSettings>(() => createDefaultTournamentSettings());

  useEffect(() => {
    function syncSettings() {
      const nextSettings = loadTournamentSettings();
      setSettings(nextSettings);
      applyTheme(nextSettings.theme);
      document.documentElement.lang = nextSettings.language;
    }

    syncSettings();
    window.addEventListener(preferencesChangedEvent, syncSettings);
    window.addEventListener("storage", syncSettings);

    return () => {
      window.removeEventListener(preferencesChangedEvent, syncSettings);
      window.removeEventListener("storage", syncSettings);
    };
  }, []);

  return settings;
}

export function useAppTranslation(): { language: AppLanguage; t: (key: TranslationKey) => string } {
  const settings = useTournamentPreferences();
  const language = normalizeLanguage(settings.language);

  return {
    language,
    t: (key) => translate(language, key),
  };
}
