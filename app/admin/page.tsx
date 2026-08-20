import { redirect } from "next/navigation";
import { AdminUserManagement } from "@/components/admin/admin-user-management";
import { AppShell } from "@/components/layout/app-shell";
import { listManagedAccountUsers } from "@/lib/admin/users";
import { assertFreshAdminAccountFromCookies } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  let admin;

  try {
    admin = await assertFreshAdminAccountFromCookies();
  } catch {
    redirect("/");
  }

  const users = await listManagedAccountUsers(admin);

  return (
    <AppShell title="Admin" subtitle="Beskyttet område for systemadministration." primaryAction={null}>
      <AdminUserManagement users={users} currentUserId={admin.userId} />
    </AppShell>
  );
}
