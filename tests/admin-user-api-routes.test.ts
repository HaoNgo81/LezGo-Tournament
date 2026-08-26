// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ManagedAccountUser } from "../lib/admin/users";

const authMocks = vi.hoisted(() => ({
  assertFreshAdminAccountFromCookies: vi.fn(),
}));

const adminUserMocks = vi.hoisted(() => ({
  createManagedUsernameOnlyAccount: vi.fn(),
  listManagedAccountUsers: vi.fn(),
  updateManagedAccountDetails: vi.fn(),
  updateManagedAccountAdminNote: vi.fn(),
  resetManagedAccountLoginCode: vi.fn(),
}));

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/auth")>();
  return {
    ...actual,
    assertFreshAdminAccountFromCookies: authMocks.assertFreshAdminAccountFromCookies,
  };
});

vi.mock("@/lib/admin/users", () => ({
  createManagedUsernameOnlyAccount: adminUserMocks.createManagedUsernameOnlyAccount,
  listManagedAccountUsers: adminUserMocks.listManagedAccountUsers,
  updateManagedAccountDetails: adminUserMocks.updateManagedAccountDetails,
  updateManagedAccountAdminNote: adminUserMocks.updateManagedAccountAdminNote,
  resetManagedAccountLoginCode: adminUserMocks.resetManagedAccountLoginCode,
}));

describe("STEP 25I-C1-C7 admin user API boundary", () => {
  beforeEach(() => {
    authMocks.assertFreshAdminAccountFromCookies.mockReset();
    adminUserMocks.createManagedUsernameOnlyAccount.mockReset();
    adminUserMocks.listManagedAccountUsers.mockReset();
    adminUserMocks.updateManagedAccountDetails.mockReset();
    adminUserMocks.updateManagedAccountAdminNote.mockReset();
    adminUserMocks.resetManagedAccountLoginCode.mockReset();
  });

  it("routes ADMIN username-only user creation through a trusted service", async () => {
    const { POST } = await import("../app/api/admin/users/route");
    const admin = createAccount("admin");
    const createdUser = {
      ...managedUser,
      userId: "00000000-0000-4000-8000-00000000b002",
      displayName: "Player One",
      username: "player_one",
      email: "",
      role: "user" as const,
      emailVerified: false,
    };
    authMocks.assertFreshAdminAccountFromCookies.mockResolvedValue(admin);
    adminUserMocks.createManagedUsernameOnlyAccount.mockResolvedValue(createdUser);

    const response = await POST(jsonRequest({
      username: "Player_One",
      code: "A1B2C3",
      displayName: "Player One",
      note: "Created at desk.",
    }));
    const body = await response.json() as { ok: boolean; user: ManagedAccountUser };

    expect(response.status).toBe(200);
    expect(body.user).toEqual(createdUser);
    expect(JSON.stringify(body)).not.toMatch(/A1B2C3|password|hash|token|service|users\.lezgotournament\.internal/i);
    expect(adminUserMocks.createManagedUsernameOnlyAccount).toHaveBeenCalledWith({
      actor: admin,
      username: "Player_One",
      code: "A1B2C3",
      displayName: "Player One",
      note: "Created at desk.",
    });
  });

  it("rejects direct username-only user creation for non-admin callers", async () => {
    const { AuthError } = await import("../lib/auth");
    const { POST } = await import("../app/api/admin/users/route");
    authMocks.assertFreshAdminAccountFromCookies.mockRejectedValue(new AuthError("Admin access was denied.", 403));

    const response = await POST(jsonRequest({ username: "player_one", code: "A1B2C3" }));
    const body = await response.json() as { error: string };

    expect(response.status).toBe(403);
    expect(body.error).toBe("Admin access was denied.");
    expect(adminUserMocks.createManagedUsernameOnlyAccount).not.toHaveBeenCalled();
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

  it("routes admin detail, note and reset-code changes through trusted services", async () => {
    const admin = createAccount("admin");
    authMocks.assertFreshAdminAccountFromCookies.mockResolvedValue(admin);
    adminUserMocks.updateManagedAccountDetails.mockResolvedValue({ ...managedUser, displayName: "Updated User" });
    adminUserMocks.updateManagedAccountAdminNote.mockResolvedValue({ ...managedUser, adminNote: "Internal note" });
    adminUserMocks.resetManagedAccountLoginCode.mockResolvedValue({ user: managedUser, generatedCode: "Q2W3E4" });

    const detailsRoute = await import("../app/api/admin/users/[userId]/details/route");
    const noteRoute = await import("../app/api/admin/users/[userId]/note/route");
    const resetCodeRoute = await import("../app/api/admin/users/[userId]/reset-code/route");
    const context = { params: Promise.resolve({ userId: managedUser.userId }) };

    const detailsResponse = await detailsRoute.POST(jsonRequest({ displayName: "Updated User", username: "updated_user", email: "updated@example.com" }), context);
    const noteResponse = await noteRoute.POST(jsonRequest({ note: "Internal note" }), context);
    const resetResponse = await resetCodeRoute.POST(jsonRequest({ mode: "generate" }), context);
    const resetBody = await resetResponse.json() as { generatedCode?: string };

    expect(detailsResponse.status).toBe(200);
    expect(noteResponse.status).toBe(200);
    expect(resetResponse.status).toBe(200);
    expect(resetBody.generatedCode).toBe("Q2W3E4");
    expect(JSON.stringify(resetBody)).not.toMatch(/password|hash|token|service/i);
    expect(adminUserMocks.updateManagedAccountDetails).toHaveBeenCalledWith(expect.objectContaining({
      actor: admin,
      targetUserId: managedUser.userId,
      email: "updated@example.com",
    }));
    expect(adminUserMocks.updateManagedAccountAdminNote).toHaveBeenCalledWith(expect.objectContaining({
      actor: admin,
      note: "Internal note",
    }));
    expect(adminUserMocks.resetManagedAccountLoginCode).toHaveBeenCalledWith(expect.objectContaining({
      actor: admin,
      targetUserId: managedUser.userId,
    }));
  });

  it("does not call admin mutation services when auth is denied", async () => {
    const { AuthError } = await import("../lib/auth");
    const { POST } = await import("../app/api/admin/users/[userId]/reset-code/route");
    authMocks.assertFreshAdminAccountFromCookies.mockRejectedValue(new AuthError("Admin access was denied.", 403));

    const response = await POST(jsonRequest({ code: "A1B2C3" }), { params: Promise.resolve({ userId: managedUser.userId }) });

    expect(response.status).toBe(403);
    expect(adminUserMocks.resetManagedAccountLoginCode).not.toHaveBeenCalled();
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

function jsonRequest(body: unknown): Request {
  return new Request("https://lezgotournament.vercel.app/api/admin/users/test", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}
