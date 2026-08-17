import { AppShell } from "@/components/layout/app-shell";
import { ShareTournamentApp } from "@/components/tournament/share-tournament-app";

export default function SharePage() {
  return (
    <AppShell title="Del / vis på anden enhed" subtitle="Opret scoreindtastning eller TV/livescore fra samme sikre flow.">
      <ShareTournamentApp />
    </AppShell>
  );
}
