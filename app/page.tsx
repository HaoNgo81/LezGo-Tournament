"use client";

import { AppShell } from "@/components/layout/app-shell";
import { LargeAction } from "@/components/ui/large-action";
import { useAppTranslation } from "@/lib/preferences/client";

export default function HomePage() {
  const { t } = useAppTranslation();

  return (
    <AppShell title={t("appBrand")} subtitle={t("appSubtitle")} backHref="">
      <nav className="grid gap-4">
        <LargeAction href="/new-tournament" title={t("newTournamentTitle")} description={t("homeNewTournamentDescription")} icon="+" />
        <LargeAction href="/templates" title={t("homeTemplatesTitle")} description={t("homeTemplatesDescription")} icon="=" />
        <LargeAction href="/tournaments" title={t("tournaments")} description={t("homeTournamentsDescription")} icon=">" />
        <LargeAction href="/remote" title={t("openRemoteTournament")} description={t("openRemoteTournamentDescription")} icon="#" />
        <LargeAction href="/settings" title={t("settings")} description={t("homeSettingsDescription")} icon="*" />
      </nav>
    </AppShell>
  );
}
