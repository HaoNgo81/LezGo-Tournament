"use client";

import { useState } from "react";
import { AdminUserManagement } from "./admin-user-management";
import { AdminTournamentManagement } from "./admin-tournament-management";
import type { ManagedAccountUser } from "@/lib/admin/users";
import type { ManagedTournament } from "@/lib/admin/tournaments";

interface AdminDashboardProps {
  users: ManagedAccountUser[];
  tournaments: ManagedTournament[];
  currentUserId: string;
}

type AdminTab = "users" | "tournaments";

export function AdminDashboard({ users, tournaments, currentUserId }: AdminDashboardProps) {
  const [activeTab, setActiveTab] = useState<AdminTab>("users");

  return (
    <div className="grid gap-4">
      <nav className="flex flex-wrap gap-2 rounded-md border border-[var(--line)] bg-[var(--surface)] p-2 shadow-lg" aria-label="Admin navigation">
        <TabButton active={activeTab === "users"} onClick={() => setActiveTab("users")}>Brugere</TabButton>
        <TabButton active={activeTab === "tournaments"} onClick={() => setActiveTab("tournaments")}>Turneringer</TabButton>
      </nav>
      {activeTab === "users" ? (
        <AdminUserManagement users={users} currentUserId={currentUserId} />
      ) : (
        <AdminTournamentManagement tournaments={tournaments} currentUserId={currentUserId} />
      )}
    </div>
  );
}

function TabButton({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      className={`min-h-11 rounded-md border px-4 py-2 text-sm font-black ${active ? "border-[var(--primary)] bg-[var(--primary)] text-black" : "border-[var(--line)] bg-white/70 text-[var(--foreground)]"}`}
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  );
}
