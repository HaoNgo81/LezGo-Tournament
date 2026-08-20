// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ManagedAccountUser } from "../lib/admin/users";

const authMocks = vi.hoisted(() => ({
  assertFreshAdminAccountFromCookies: vi.fn(),
}));

const adminUserMocks = vi.hoisted(() => ({
  listManagedAccountUsers: vi.fn(),
}));

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/auth")>();
  return {
    ...actual,
    assertFreshAdminAccountFromCookies: authMocks.assertFreshAdminAccountFromCookies,
  };
});

vi.mock("@/lib/admin/users", () => ({
  listManagedAccountUsers: adminUserMocks.listManagedAccountUsers,
}));

describe("STEP 25I-C1-C7 admin user API boundary", () => {
  beforeEach(() => {
    authMocks.assertFreshAdminAccountFromCookies.mockReset();
    adminUserMocks.listManagedAccountUsers.mockReset();
  });

  it("allows admins to list safe users", async () => {
    const { GET } = await import("../app/api/admin/users/route");
    const admin = createAccount("admin");
    authMocks.assertFreshAdminAccountFromCookies.mockResolvedValue(admin);
    adminUserMocks.listManagedAccountUsers.mockResolvedValue([managedUser]);

    const response = await GET();
    const body = await response.json() as { ok: boolean; users: ManagedAccountUser[] };

    expect(response.status).toBe(200);
    expect(body.users).toEqual([managedUser]);
    expect(JSON.stringify(body)).not.toMatch(/code|hash|password|token|service/i);
    expect(adminUserMocks.listManagedAccountUsers).toHaveBeenCalledWith(admin);
  });

  it("blocks normal users, anonymous users and unverified users from the list endpoint", async () => {
    const { AuthError } = await import("../lib/auth");
    const { GET } = await import("../app/api/admin/users/route");

    for (const error of [
      new AuthError("Admin access was denied.", 403),
      new AuthError("Authentication was denied.", 401),
      new AuthError("Email is not verified.", 403),
    ]) {
      authMocks.assertFreshAdminAccountFromCookies.mockRejectedValueOnce(error);

      const response = await GET();

      expect(response.status).toBe(error.status);
      expect(adminUserMocks.listManagedAccountUsers).not.toHaveBeenCalled();
    }
  });
});

function createAccount(role: "admin" | "user") {
  return {
    userId: "00000000-0000-4000-8000-00000000ad01",
    email: `${role}@example.com`,
    displayName: `${role} account`,
    username: role,
    role,
  };
}

const managedUser: ManagedAccountUser = {
  userId: "00000000-0000-4000-8000-00000000ad01",
  email: "admin@example.com",
  displayName: "Admin One",
  username: "admin",
  role: "admin",
  emailVerified: true,
  status: "active",
};
