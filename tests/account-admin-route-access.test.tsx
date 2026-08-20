import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminPage from "../app/admin/page";
import SettingsPage from "../app/settings/page";

const authMocks = vi.hoisted(() => ({
  assertAdminAccount: vi.fn(),
  readAuthAccessCookie: vi.fn(),
}));

const navigationMocks = vi.hoisted(() => ({
  redirect: vi.fn((path: string): never => {
    throw new Error(`redirect:${path}`);
  }),
}));

const adminUserMocks = vi.hoisted(() => ({
  listManagedAccountUsers: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  assertAdminAccount: authMocks.assertAdminAccount,
  readAuthAccessCookie: authMocks.readAuthAccessCookie,
}));

vi.mock("next/navigation", () => ({
  redirect: navigationMocks.redirect,
}));

vi.mock("@/lib/admin/users", () => ({
  listManagedAccountUsers: adminUserMocks.listManagedAccountUsers,
}));

describe("STEP 25I-C1-C6 admin route access", () => {
  beforeEach(() => {
    authMocks.assertAdminAccount.mockReset();
    authMocks.readAuthAccessCookie.mockReset();
    adminUserMocks.listManagedAccountUsers.mockReset();
    navigationMocks.redirect.mockClear();
  });

  it("allows admin accounts to open /settings", async () => {
    authMocks.readAuthAccessCookie.mockResolvedValue("access-token");
    authMocks.assertAdminAccount.mockResolvedValue(createAccount("admin"));

    await expect(SettingsPage()).resolves.toBeTruthy();

    expect(authMocks.assertAdminAccount).toHaveBeenCalledWith("access-token");
    expect(navigationMocks.redirect).not.toHaveBeenCalled();
  });

  it("blocks normal users from /settings", async () => {
    authMocks.readAuthAccessCookie.mockResolvedValue("access-token");
    authMocks.assertAdminAccount.mockRejectedValue(new Error("Admin access was denied."));

    await expect(SettingsPage()).rejects.toThrow("redirect:/");

    expect(authMocks.assertAdminAccount).toHaveBeenCalledWith("access-token");
    expect(navigationMocks.redirect).toHaveBeenCalledWith("/");
  });

  it("blocks anonymous visitors from /settings", async () => {
    authMocks.readAuthAccessCookie.mockResolvedValue(undefined);
    authMocks.assertAdminAccount.mockRejectedValue(new Error("Authentication was denied."));

    await expect(SettingsPage()).rejects.toThrow("redirect:/");

    expect(authMocks.assertAdminAccount).toHaveBeenCalledWith(undefined);
    expect(navigationMocks.redirect).toHaveBeenCalledWith("/");
  });

  it("allows admin accounts to open /admin", async () => {
    authMocks.readAuthAccessCookie.mockResolvedValue("access-token");
    authMocks.assertAdminAccount.mockResolvedValue(createAccount("admin"));
    adminUserMocks.listManagedAccountUsers.mockResolvedValue([]);

    await expect(AdminPage()).resolves.toBeTruthy();

    expect(authMocks.assertAdminAccount).toHaveBeenCalledWith("access-token");
    expect(adminUserMocks.listManagedAccountUsers).toHaveBeenCalledWith(createAccount("admin"));
    expect(navigationMocks.redirect).not.toHaveBeenCalled();
  });

  it("blocks normal users from /admin", async () => {
    authMocks.readAuthAccessCookie.mockResolvedValue("access-token");
    authMocks.assertAdminAccount.mockRejectedValue(new Error("Admin access was denied."));

    await expect(AdminPage()).rejects.toThrow("redirect:/");

    expect(authMocks.assertAdminAccount).toHaveBeenCalledWith("access-token");
    expect(navigationMocks.redirect).toHaveBeenCalledWith("/");
  });

  it("blocks anonymous visitors from /admin", async () => {
    authMocks.readAuthAccessCookie.mockResolvedValue(undefined);
    authMocks.assertAdminAccount.mockRejectedValue(new Error("Authentication was denied."));

    await expect(AdminPage()).rejects.toThrow("redirect:/");

    expect(authMocks.assertAdminAccount).toHaveBeenCalledWith(undefined);
    expect(navigationMocks.redirect).toHaveBeenCalledWith("/");
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
