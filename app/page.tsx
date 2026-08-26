"use client";

import { useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { AccountAccess } from "@/components/auth/account-access";
import { RecoveryHashRouter } from "@/components/auth/recovery-hash-router";
import type { Account } from "@/components/auth/account-panel";
import { LargeAction } from "@/components/ui/large-action";
import { useAppTranslation } from "@/lib/preferences/client";

export default function HomePage() {
  const { t } = useAppTranslation();
  const [account, setAccount] = useState<Account | null>(null);
  const isAdmin = account?.role === "admin";

  return (
    <AppShell title={t("appBrand")} subtitle={t("appSubtitle")} backHref="" headerAction={<AccountAccess onAccountChange={setAccount} />}>
      <RecoveryHashRouter />
      <nav className="grid gap-4 sm:grid-cols-2">
        <LargeAction href="/new-tournament" title={t("newTournamentTitle")} description={t("homeNewTournamentDescription")} icon="+" />
        <LargeAction href="/tournaments" title={t("tournaments")} description={t("homeTournamentsDescription")} icon=">" />
        {isAdmin ? <LargeAction href="/settings" title={t("settings")} description={t("homeSettingsDescription")} icon="*" /> : null}
      </nav>
    </AppShell>
  );
}
