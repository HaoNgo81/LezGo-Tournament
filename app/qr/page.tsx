import { AppShell } from "@/components/layout/app-shell";
import { QrTournamentApp } from "@/components/tournament/qr-tournament-app";

export default function QrPage() {
  return (
    <AppShell title="QR visning" subtitle="Read-only visning til spillere." primaryAction={null}>
      <QrTournamentApp />
    </AppShell>
  );
}
