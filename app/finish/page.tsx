import { AppShell } from "@/components/layout/app-shell";
import { FinishTournamentApp } from "@/components/tournament/finish-tournament-app";

export default function FinishTournamentPage() {
  return (
    <AppShell title="Afslut turnering" subtitle="Afslut når som helst og se slutstilling for alle deltagere.">
      <FinishTournamentApp />
    </AppShell>
  );
}
