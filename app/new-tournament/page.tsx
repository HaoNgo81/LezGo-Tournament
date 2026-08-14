import { AppShell } from "@/components/layout/app-shell";
import { TournamentSetupForm } from "@/components/tournament/tournament-setup-form";

export default function NewTournamentPage() {
  return (
    <AppShell title="Ny turnering" subtitle="Opret en turnering med format, spillere, baner, runder og stillingssortering.">
      <TournamentSetupForm />
    </AppShell>
  );
}
