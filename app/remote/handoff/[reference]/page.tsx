import { AppShell } from "@/components/layout/app-shell";
import { DisabledFeaturePage } from "@/components/layout/disabled-feature-page";

export default async function RemoteHandoffPage({ params }: { params: Promise<{ reference: string }> }) {
  await params;

  return (
    <AppShell title="LEZGO PADEL" subtitle="Denne funktion er ikke længere tilgængelig.">
      <DisabledFeaturePage />
    </AppShell>
  );
}
