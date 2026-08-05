import { AppShell } from "@/components/layout/app-shell";
import { TemplatesApp } from "@/components/tournament/templates-app";

export default function TemplatesPage() {
  return (
    <AppShell title="Turneringsskabeloner" subtitle="Opret, rediger, slet og start fra skabelon." primaryAction={null}>
      <TemplatesApp />
    </AppShell>
  );
}
