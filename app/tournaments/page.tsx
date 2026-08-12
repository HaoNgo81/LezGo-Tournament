"use client";

import { AppShell } from "@/components/layout/app-shell";
import { TournamentListApp } from "@/components/tournament/tournament-list-app";
import { PrimaryButton } from "@/components/ui/primary-button";
import { useAppTranslation } from "@/lib/preferences/client";

export default function TournamentsPage() {
  const { t } = useAppTranslation();

  return (
    <AppShell title="Turneringer" subtitle="Aktive og afsluttede turneringer gemmes lokalt." primaryAction={<PrimaryButton href="/new-tournament">{t("newTournamentTitle")}</PrimaryButton>}>
      <TournamentListApp />
    </AppShell>
  );
}
