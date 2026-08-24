import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminDashboard } from "../components/admin/admin-dashboard";
import type { ManagedAccountUser } from "../lib/admin/users";

describe("STEP 25Y-B-FIX2 admin tournament tab removal", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("opens admin on user management without exposing tournament management", () => {
    render(<AdminDashboard users={users} currentUserId={adminUserId} />);

    expect(screen.getByText("Brugere")).toBeInTheDocument();
    expect(screen.getByTestId("admin-user-management")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Turneringer" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("admin-tournament-management")).not.toBeInTheDocument();
    expect(screen.queryByText("TURNERINGSSTYRING")).not.toBeInTheDocument();
  });

  it("keeps user administration visible and usable from the admin overview", () => {
    render(<AdminDashboard users={users} currentUserId={adminUserId} />);

    expect(screen.getAllByTestId("admin-user-row")).toHaveLength(2);
    expect(screen.getByText("Admin One")).toBeInTheDocument();
    expect(screen.getByText("@admin")).toBeInTheDocument();
    expect(screen.getByText("admin@example.com")).toBeInTheDocument();
    expect(screen.getByText("User One")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Administrer" })).toHaveLength(2);
  });
});

const adminUserId = "00000000-0000-4000-8000-00000000ad01";

const users: ManagedAccountUser[] = [
  {
    userId: adminUserId,
    displayName: "Admin One",
    username: "admin",
    email: "admin@example.com",
    role: "admin",
    emailVerified: true,
    status: "active",
    createdAt: "2026-08-20T10:00:00.000Z",
    lastSignInAt: "2026-08-21T10:00:00.000Z",
    adminNote: "",
  },
  {
    userId: "00000000-0000-4000-8000-00000000ad02",
    displayName: "User One",
    username: "user",
    email: "user@example.com",
    role: "user",
    emailVerified: true,
    status: "active",
    createdAt: "2026-08-20T10:00:00.000Z",
    adminNote: "",
  },
];
