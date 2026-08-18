import { AppShell } from "@/components/layout/app-shell";
import { LiveScoringApp } from "@/components/tournament/live-scoring-app";

export default function LivePage() {
  return (
    <AppShell title="Live turnering" subtitle="En skærm til runde, kampe, scoring og stilling." compactMobile primaryAction={null}>
      <LiveScoringApp />
    </AppShell>
  );
}
