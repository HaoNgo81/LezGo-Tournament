import { AppShell } from "@/components/layout/app-shell";
import { ClientHydrationProbe } from "@/components/tournament/client-hydration-probe";
import { TournamentSetupForm } from "@/components/tournament/tournament-setup-form";

type NewTournamentPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function NewTournamentPage({ searchParams }: NewTournamentPageProps) {
  const resolvedSearchParams = await searchParams;
  const deviceDebugValue = resolvedSearchParams?.deviceDebug;
  const initialDeviceDebugEnabled = Array.isArray(deviceDebugValue) ? deviceDebugValue.includes("1") : deviceDebugValue === "1";

  return (
    <AppShell title="Ny turnering" subtitle="Opret en turnering med format, spillere, baner, runder og stillingssortering.">
      <ClientHydrationProbe />
      <TournamentSetupForm initialDeviceDebugEnabled={initialDeviceDebugEnabled} />
    </AppShell>
  );
}
