import { AppShell } from "@/components/layout/app-shell";
import { SettingsApp } from "@/components/settings/settings-app";

export default function SettingsPage() {
  return (
    <AppShell title="Indstillinger" subtitle="Standarder, der bruges automatisk ved nye turneringer." primaryAction={null}>
      <SettingsApp />
    </AppShell>
  );
}