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
    expect(screen.getByText("Eksisterende koder, hashes og tokens vises aldrig.")).toBeInTheDocument();
    expect(screen.queryByText(/password|service-role/i)).not.toBeInTheDocument();
  });

  it("filters users by search and status without horizontal-only table dependency", () => {
    render(<AdminUserManagement users={users} currentUserId={users[0].userId} />);

    fireEvent.change(screen.getByLabelText("Søg"), { target: { value: "user" } });
    expect(screen.getAllByTestId("admin-user-row")).toHaveLength(1);
    expect(screen.getAllByText("User One").length).toBeGreaterThan(0);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "deactivated" } });
    expect(screen.getByText("Viser 0 af 3 brugere")).toBeInTheDocument();
  });

  it("uses one row action and keeps role/status changes inside the management dialog", async () => {
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
    expect(within(row as HTMLElement).getByRole("button", { name: "Administrer" })).toBeInTheDocument();
    expect(within(row as HTMLElement).queryByRole("button", { name: "Gør ADMIN" })).not.toBeInTheDocument();
    expect(within(row as HTMLElement).queryByRole("button", { name: "Deaktivér bruger" })).not.toBeInTheDocument();

    fireEvent.click(within(row as HTMLElement).getByRole("button", { name: "Administrer" }));
    const detail = screen.getByTestId("admin-user-detail");

    fireEvent.click(within(detail).getByRole("button", { name: "Gør ADMIN" }));
    await screen.findByText("Brugeren er nu ADMIN.");

    fireEvent.click(within(detail).getByRole("button", { name: "Deaktivér bruger" }));
    await screen.findByText("Brugeren er deaktiveret.");

    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining(`/api/admin/users/${users[2].userId}/role`), expect.objectContaining({
      method: "POST",
    }));
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining(`/api/admin/users/${users[2].userId}/status`), expect.objectContaining({
      method: "POST",
    }));
  });

  it("opens a user detail panel for safe edits, notes and code reset", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;

      if (url.includes("/details")) {
        return new Response(JSON.stringify({
          ok: true,
          user: {
            ...users[2],
            displayName: body.displayName,
            username: body.username,
            email: body.email,
          },
        }), { status: 200 });
      }

      if (url.includes("/note")) {
        return new Response(JSON.stringify({
          ok: true,
          user: {
            ...users[2],
            adminNote: body.note,
          },
        }), { status: 200 });
      }

      return new Response(JSON.stringify({
        ok: true,
        user: users[2],
        generatedCode: "Q2W3E4",
      }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<AdminUserManagement users={users} currentUserId={users[0].userId} />);

    const row = screen.getAllByTestId("admin-user-row").find((candidate) => within(candidate).queryByText("User One"));
    expect(row).toBeTruthy();
    fireEvent.click(within(row as HTMLElement).getByRole("button", { name: "Administrer" }));

    const detail = screen.getByTestId("admin-user-detail");
    fireEvent.change(within(detail).getByLabelText("Navn"), { target: { value: "Updated User" } });
    fireEvent.change(within(detail).getByLabelText("Brugernavn"), { target: { value: "updated_user" } });
    fireEvent.change(within(detail).getByLabelText("E-mail"), { target: { value: "updated@example.com" } });
    fireEvent.click(within(detail).getByRole("button", { name: "Gem oplysninger" }));
    await screen.findByText("Brugeroplysninger er gemt.");

    fireEvent.change(within(detail).getByLabelText("Intern admin-note"), { target: { value: "Internal only" } });
    fireEvent.click(within(detail).getByRole("button", { name: "Gem note" }));
    await screen.findByText("Intern note er gemt.");

    fireEvent.click(within(detail).getByRole("button", { name: "Generér kode" }));
    await screen.findByText(/Genereret kode/);

    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining(`/api/admin/users/${users[2].userId}/details`), expect.objectContaining({ method: "POST" }));
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining(`/api/admin/users/${users[2].userId}/note`), expect.objectContaining({ method: "POST" }));
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining(`/api/admin/users/${users[2].userId}/reset-code`), expect.objectContaining({ method: "POST" }));
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
    createdAt: "2026-08-20T10:00:00.000Z",
    lastSignInAt: "2026-08-21T10:00:00.000Z",
    adminNote: "",
  },
  {
    userId: "00000000-0000-4000-8000-00000000a002",
    displayName: "Admin Two",
    username: "admin_two",
    email: "admin2@example.com",
    role: "admin",
    emailVerified: true,
    status: "active",
    createdAt: "2026-08-20T10:00:00.000Z",
    lastSignInAt: "2026-08-21T10:00:00.000Z",
    adminNote: "Founder",
  },
  {
    userId: "00000000-0000-4000-8000-00000000b001",
    displayName: "User One",
    username: "user_one",
    email: "user@example.com",
    role: "user",
    emailVerified: false,
    status: "active",
    createdAt: "2026-08-20T10:00:00.000Z",
    lastSignInAt: "2026-08-21T10:00:00.000Z",
    adminNote: "",
  },
];
