import { AppShell } from "@/components/layout/app-shell";
import { TeamVsTeamApp } from "@/components/tournament/team-vs-team-app";

export default function TeamVsTeamPage() {
  return (
    <AppShell title="Team vs. Team" subtitle="Manuel opstilling, runderesultater, sætvalg og løbende holdstilling.">
      <TeamVsTeamApp />
    </AppShell>
  );
}
