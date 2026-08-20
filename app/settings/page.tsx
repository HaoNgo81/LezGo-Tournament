import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { SettingsApp } from "@/components/settings/settings-app";
import { assertAdminAccount, readAuthAccessCookie } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  try {
    await assertAdminAccount(await readAuthAccessCookie());
  } catch {
    redirect("/");
  }

  return (
    <AppShell title="Indstillinger" subtitle="Standarder, der bruges automatisk ved nye turneringer." primaryAction={null}>
      <SettingsApp />
    </AppShell>
  );
}
