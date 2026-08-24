import { AppShell } from "@/components/layout/app-shell";
import { DisabledFeaturePage } from "@/components/layout/disabled-feature-page";

export default function QrPage() {
  return (
    <AppShell title="LEZGO PADEL" subtitle="Denne funktion er ikke længere tilgængelig." primaryAction={null}>
      <DisabledFeaturePage />
    </AppShell>
  );
}
