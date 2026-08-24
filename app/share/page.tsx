import { AppShell } from "@/components/layout/app-shell";
import { DisabledFeaturePage } from "@/components/layout/disabled-feature-page";

export default function SharePage() {
  return (
    <AppShell title="LEZGO PADEL" subtitle="Denne funktion er ikke længere tilgængelig.">
      <DisabledFeaturePage />
    </AppShell>
  );
}
