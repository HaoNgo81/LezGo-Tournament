import { AppShell } from "@/components/layout/app-shell";
import { RemoteTournamentApp } from "@/components/tournament/remote-tournament-app";

export default function RemotePage() {
  return (
    <AppShell title="openRemoteTournament" subtitle="openRemoteTournamentDescription">
      <RemoteTournamentApp />
    </AppShell>
  );
}
