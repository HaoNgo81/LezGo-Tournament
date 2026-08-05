import { AppShell } from "@/components/layout/app-shell";
import { LargeAction } from "@/components/ui/large-action";

export default function HomePage() {
  return (
    <AppShell title="LEZGO PADEL" subtitle="Hurtig turneringsstyring til telefon og tablet." backHref="">
      <nav className="grid gap-4">
        <LargeAction href="/new-tournament" title="Ny turnering" description="Vælg format, indstillinger og spillere." icon="+" />
        <LargeAction href="/templates" title="Turneringsskabeloner" description="Opret, rediger, slet eller start fra skabelon." icon="=" />
        <LargeAction href="/tournaments" title="Turneringer" description="Aktive, kommende, afsluttede og tidligere." icon=">" />
        <LargeAction href="/settings" title="Indstillinger" description="Kun de nødvendige valg." icon="*" />
      </nav>
    </AppShell>
  );
}
