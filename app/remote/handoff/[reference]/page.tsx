import { AppShell } from "@/components/layout/app-shell";
import { RemoteTournamentApp } from "@/components/tournament/remote-tournament-app";

export default async function RemoteHandoffPage({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;

  return (
    <AppShell title="openRemoteTournament" subtitle="openRemoteTournamentDescription">
      <RemoteTournamentApp initialHandoffReference={reference} />
    </AppShell>
  );
}
