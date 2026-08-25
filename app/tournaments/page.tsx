"use client";

import { useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { AccountAccess } from "@/components/auth/account-access";
import type { Account } from "@/components/auth/account-panel";
import { TournamentListApp } from "@/components/tournament/tournament-list-app";
import { PrimaryButton } from "@/components/ui/primary-button";
import { useAppTranslation } from "@/lib/preferences/client";

export default function TournamentsPage() {
  const { t } = useAppTranslation();
  const [accountRevision, setAccountRevision] = useState(0);
  const [account, setAccount] = useState<Account | null | undefined>(undefined);
  const handleAccountChange = (nextAccount: Account | null) => {
    setAccount(nextAccount);
    setAccountRevision((revision) => revision + 1);
  };

  return (
    <AppShell title="Turneringer" subtitle="Aktive og afsluttede turneringer gemmes lokalt." headerAction={<AccountAccess onAccountChange={handleAccountChange} />} primaryAction={<PrimaryButton href="/new-tournament">{t("newTournamentTitle")}</PrimaryButton>}>
      <TournamentListApp account={account} accountRevision={accountRevision} />
    </AppShell>
  );
}
