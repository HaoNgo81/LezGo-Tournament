"use client";

import { useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { AccountAccess } from "@/components/auth/account-access";
import { TournamentListApp } from "@/components/tournament/tournament-list-app";
import { PrimaryButton } from "@/components/ui/primary-button";
import { useAppTranslation } from "@/lib/preferences/client";

export default function TournamentsPage() {
  const { t } = useAppTranslation();
  const [accountRevision, setAccountRevision] = useState(0);

  return (
    <AppShell title="Turneringer" subtitle="Aktive og afsluttede turneringer gemmes lokalt." headerAction={<AccountAccess onAccountChange={() => setAccountRevision((revision) => revision + 1)} />} primaryAction={<PrimaryButton href="/new-tournament">{t("newTournamentTitle")}</PrimaryButton>}>
      <TournamentListApp accountRevision={accountRevision} />
    </AppShell>
  );
}
