"use client";

import { AppShell } from "@/components/layout/app-shell";
import { AccountAccess } from "@/components/auth/account-access";
import { TournamentSetupForm } from "@/components/tournament/tournament-setup-form";

export default function NewTournamentPage() {
  return (
    <AppShell title="Ny turnering" subtitle="Opret en turnering med format, spillere, baner, runder og stillingssortering." headerAction={<AccountAccess />}>
      <TournamentSetupForm />
    </AppShell>
  );
}
