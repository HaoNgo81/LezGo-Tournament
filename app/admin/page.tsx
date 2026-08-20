import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { assertAdminAccount, readAuthAccessCookie } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  let admin;

  try {
    admin = await assertAdminAccount(await readAuthAccessCookie());
  } catch {
    redirect("/");
  }

  return (
    <AppShell title="Admin" subtitle="Beskyttet område for systemadministration." primaryAction={null}>
      <section className="app-card grid gap-3 p-4 sm:p-5">
        <div>
          <p className="text-sm font-black uppercase tracking-wide text-[var(--primary-strong)]">ADMIN</p>
          <h2 className="mt-1 text-2xl font-black">Server-beskyttet adminadgang</h2>
          <p className="mt-2 font-bold text-[var(--muted)]">Logget ind som {admin.displayName}.</p>
        </div>
        <dl className="grid gap-2 text-sm font-bold sm:grid-cols-2">
          <div className="rounded-md border border-[var(--line)] bg-white/70 p-3">
            <dt className="text-[var(--muted)]">E-mail</dt>
            <dd className="break-words">{admin.email}</dd>
          </div>
          <div className="rounded-md border border-[var(--line)] bg-white/70 p-3">
            <dt className="text-[var(--muted)]">Rolle</dt>
            <dd>{admin.role}</dd>
          </div>
        </dl>
      </section>
    </AppShell>
  );
}
