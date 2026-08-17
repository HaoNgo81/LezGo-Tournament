"use client";

import { useEffect, useState } from "react";
import { SyncStatusPanel } from "@/components/tournament/sync-status-panel";
import type { LiveTournamentState } from "@/lib/live-scoring";
import { useAppTranslation } from "@/lib/preferences/client";
import { createStandardShadowSaveLocalId, createTeamVsTeamShadowSaveLocalId, loadActiveTeamVsTeamTournament, loadActiveTournament, type TeamVsTeamTournamentState } from "@/lib/tournament-setup";
import { useHasHydrated } from "@/hooks/use-has-hydrated";

export function ShareTournamentApp() {
  const { t } = useAppTranslation();
  const hasHydrated = useHasHydrated();
  const [standardState, setStandardState] = useState<LiveTournamentState | null>(null);
  const [teamState, setTeamState] = useState<TeamVsTeamTournamentState | null>(null);

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }

    const loadTimer = window.setTimeout(() => {
      setTeamState(loadActiveTeamVsTeamTournament());
      setStandardState(loadActiveTournament());
    }, 0);

    return () => window.clearTimeout(loadTimer);
  }, [hasHydrated]);

  if (!hasHydrated) {
    return <div className="app-card p-4 font-bold text-[var(--muted)]">{t("loadingShare")}</div>;
  }

  if (teamState) {
    return (
      <div className="grid gap-4">
        <section className="app-card grid gap-2 p-4 sm:p-5">
          <p className="text-sm font-bold uppercase text-[var(--primary-strong)]">{t("remoteUnifiedShareTitle")}</p>
          <h2 className="text-2xl font-black">{teamState.name}</h2>
          <p className="font-bold text-[var(--muted)]">{t("remoteShareUnifiedHelp")}</p>
        </section>
        <SyncStatusPanel kind="team-vs-team" localId={createTeamVsTeamShadowSaveLocalId(teamState)} state={teamState} />
      </div>
    );
  }

  if (standardState) {
    return (
      <div className="grid gap-4">
        <section className="app-card grid gap-2 p-4 sm:p-5">
          <p className="text-sm font-bold uppercase text-[var(--primary-strong)]">{t("remoteUnifiedShareTitle")}</p>
          <h2 className="text-2xl font-black">{standardState.tournamentName}</h2>
          <p className="font-bold text-[var(--muted)]">{t("remoteShareUnifiedHelp")}</p>
        </section>
        <SyncStatusPanel kind="standard" localId={createStandardShadowSaveLocalId(standardState)} state={standardState} />
      </div>
    );
  }

  return <div className="app-card p-4 font-bold text-[var(--muted)]">{t("noActiveTournaments")}</div>;
}
