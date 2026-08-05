import { AppShell } from "@/components/layout/app-shell";
import { ShareTournamentApp } from "@/components/tournament/share-tournament-app";

export default function SharePage() {
  return (
    <AppShell title="Del turnering" subtitle="Vis QR-kode, kopier link eller åbn TV-visning.">
      <ShareTournamentApp />
    </AppShell>
  );
}
