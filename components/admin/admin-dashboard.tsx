import { AdminUserManagement } from "./admin-user-management";
import type { ManagedAccountUser } from "@/lib/admin/users";

interface AdminDashboardProps {
  users: ManagedAccountUser[];
  currentUserId: string;
}

export function AdminDashboard({ users, currentUserId }: AdminDashboardProps) {
  return (
    <div className="grid gap-4">
      <nav className="flex flex-wrap gap-2 rounded-md border border-[var(--line)] bg-[var(--surface)] p-2 shadow-lg" aria-label="Admin navigation">
        <span className="min-h-11 rounded-md border border-[var(--primary)] bg-[var(--primary)] px-4 py-2 text-sm font-black text-black">
          Brugere
        </span>
      </nav>
      <AdminUserManagement users={users} currentUserId={currentUserId} />
    </div>
  );
}
