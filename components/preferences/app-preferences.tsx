"use client";

import { useTournamentPreferences } from "@/lib/preferences/client";

export function AppPreferences() {
  useTournamentPreferences();
  return null;
}
