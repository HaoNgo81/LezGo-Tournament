import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";

export function LegacyDisabledFeatureRoute() {
  return (
    <AppShell title="LEZGO PADEL" subtitle="Denne funktion er ikke længere tilgængelig." primaryAction={null}>
      <DisabledFeaturePage />
    </AppShell>
  );
}

export function DisabledFeaturePage() {
  return (
    <section className="app-card mx-auto grid w-full max-w-2xl gap-4 p-5 text-center sm:p-8" data-testid="disabled-feature-page">
      <div>
        <p className="text-sm font-bold uppercase text-[var(--primary-strong)]">LEZGO PADEL</p>
        <h2 className="mt-1 text-2xl font-black">Denne funktion er ikke længere tilgængelig.</h2>
        <p className="mt-2 font-bold text-[var(--muted)]">
          Brug din konto til at oprette, åbne og styre turneringer direkte på denne enhed.
        </p>
      </div>
      <div className="mx-auto grid w-full max-w-md gap-2 sm:grid-cols-2">
        <Link className="btn-primary" href="/new-tournament">Ny turnering</Link>
        <Link className="btn-secondary" href="/tournaments">Turneringer</Link>
      </div>
    </section>
  );
}
