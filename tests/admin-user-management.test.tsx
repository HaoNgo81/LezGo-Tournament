import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminUserManagement } from "../components/admin/admin-user-management";
import type { ManagedAccountUser } from "../lib/admin/users";

describe("STEP 25I-C1-C7 admin user management UI", () => {
  beforeEach(() => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders safe user fields without credential material", () => {
    render(<AdminUserManagement users={users} currentUserId={users[0].userId} />);

    expect(screen.getByText("Brugerstyring")).toBeInTheDocument();
    expect(screen.getAllByText("Admin One").length).toBeGreaterThan(0);
    expect(screen.getAllByText("@admin_one").length).toBeGreaterThan(0);
    expect(screen.getAllByText("admin@example.com").length).toBeGreaterThan(0);
    expect(screen.getByText("Koder og hashes vises aldrig.")).toBeInTheDocument();
    expect(screen.queryByText(/password|token|service-role|6-tegns kode/i)).not.toBeInTheDocument();
  });

  it("filters users by search and status without horizontal-only table dependency", () => {
    render(<AdminUserManagement users={users} currentUserId={users[0].userId} />);

    fireEvent.change(screen.getByLabelText("Søg"), { target: { value: "user" } });
    expect(screen.getAllByTestId("admin-user-row")).toHaveLength(1);
    expect(screen.getAllByText("User One").length).toBeGreaterThan(0);

    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "deactivated" } });
    expect(screen.getByText("Viser 0 af 3 brugere")).toBeInTheDocument();
  });

  it("calls trusted admin endpoints for role and status changes", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const user = url.includes("/role")
        ? { ...users[2], role: "admin" }
        : { ...users[2], status: "deactivated" };

      return new Response(JSON.stringify({ ok: true, user }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<AdminUserManagement users={users} currentUserId={users[0].userId} />);

    const row = screen.getAllByTestId("admin-user-row").find((candidate) => within(candidate).queryByText("User One"));
    expect(row).toBeTruthy();

    fireEvent.click(within(row as HTMLElement).getByRole("button", { name: "Gør ADMIN" }));
    await screen.findByText("Brugeren er nu ADMIN.");

    fireEvent.click(within(row as HTMLElement).getByRole("button", { name: "Deaktivér bruger" }));
    await screen.findByText("Brugeren er deaktiveret.");

    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining(`/api/admin/users/${users[2].userId}/role`), expect.objectContaining({
      method: "POST",
    }));
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining(`/api/admin/users/${users[2].userId}/status`), expect.objectContaining({
      method: "POST",
    }));
  });
});

const users: ManagedAccountUser[] = [
  {
    userId: "00000000-0000-4000-8000-00000000a001",
    displayName: "Admin One",
    username: "admin_one",
    email: "admin@example.com",
    role: "admin",
    emailVerified: true,
    status: "active",
  },
  {
    userId: "00000000-0000-4000-8000-00000000a002",
    displayName: "Admin Two",
    username: "admin_two",
    email: "admin2@example.com",
    role: "admin",
    emailVerified: true,
    status: "active",
  },
  {
    userId: "00000000-0000-4000-8000-00000000b001",
    displayName: "User One",
    username: "user_one",
    email: "user@example.com",
    role: "user",
    emailVerified: false,
    status: "active",
  },
];
