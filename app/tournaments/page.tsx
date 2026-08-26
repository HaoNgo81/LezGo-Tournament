"use client";

import { useCallback, useState } from "react";
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
  const handleAccountChange = useCallback((nextAccount: Account | null) => {
    setAccount((currentAccount) => {
      if (isSameAccount(currentAccount, nextAccount)) {
        return currentAccount;
      }

      setAccountRevision((revision) => revision + 1);
      return nextAccount;
    });
  }, []);

  return (
    <AppShell title="Turneringer" subtitle="Aktive og afsluttede turneringer gemmes lokalt." headerAction={<AccountAccess onAccountChange={handleAccountChange} />} primaryAction={<PrimaryButton href="/new-tournament">{t("newTournamentTitle")}</PrimaryButton>}>
      <TournamentListApp account={account} accountRevision={accountRevision} />
    </AppShell>
  );
}

function isSameAccount(left: Account | null | undefined, right: Account | null): boolean {
  if (!left || !right) {
    return left === right;
  }

  return left.userId === right.userId
    && left.email === right.email
    && left.displayName === right.displayName
    && left.username === right.username
    && left.role === right.role;
}
