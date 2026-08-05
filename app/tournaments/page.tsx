import { AppShell } from "@/components/layout/app-shell";
import { TournamentListApp } from "@/components/tournament/tournament-list-app";
import { PrimaryButton } from "@/components/ui/primary-button";

export default function TournamentsPage() {
  return (
    <AppShell title="Turneringer" subtitle="Aktive og afsluttede turneringer gemmes lokalt." primaryAction={<PrimaryButton href="/new-tournament">Ny turnering</PrimaryButton>}>
      <TournamentListApp />
    </AppShell>
  );
}
