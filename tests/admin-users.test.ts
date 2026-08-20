// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  listManagedAccountUsers,
  updateManagedAccountRole,
  updateManagedAccountStatus,
} from "../lib/admin/users";
import { readAccountFromAccessToken, type AccountRole, type AuthenticatedAccount } from "../lib/auth";
import type { SupabaseAdminAuthUser } from "../lib/auth/auth-admin";
import type { SupabaseRestClient } from "../lib/supabase/rest-client";

describe("STEP 25I-C1-C7 admin user management service", () => {
  const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalServerSupabaseUrl = process.env.SUPABASE_URL;
  const originalAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const originalServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

  afterEach(() => {
    vi.restoreAllMocks();
    restoreEnv("NEXT_PUBLIC_SUPABASE_URL", originalSupabaseUrl);
    restoreEnv("SUPABASE_URL", originalServerSupabaseUrl);
    restoreEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", originalAnonKey);
    restoreEnv("SUPABASE_SERVICE_ROLE_KEY", originalServiceRole);
  });

  it("lists safe admin user fields with verification and account status", async () => {
    const store = createAdminUserStore();
    const users = await listManagedAccountUsers(createActor("admin"), store.options());

    expect(users).toHaveLength(3);
    expect(users[0]).toMatchObject({
      displayName: "Admin One",
      username: "admin_one",
      email: "admin@example.com",
      role: "admin",
      emailVerified: true,
      status: "active",
    });
    expect(JSON.stringify(users)).not.toMatch(/code|hash|password|token|service/i);
  });

  it("blocks non-admin actors from reading the list", async () => {
    await expect(listManagedAccountUsers(createActor("user"), createAdminUserStore().options())).rejects.toMatchObject({
      status: 403,
    });
  });

  it("allows trusted admin role changes while preserving last active admin protection", async () => {
    const store = createAdminUserStore();

    const promoted = await updateManagedAccountRole({
      actor: createActor("admin"),
      targetUserId: userId,
      role: "admin",
    }, store.options());

    expect(promoted.role).toBe("admin");
    expect(store.profile(userId)?.role).toBe("admin");

    const demoted = await updateManagedAccountRole({
      actor: createActor("admin"),
      targetUserId: secondAdminId,
      role: "user",
    }, store.options());

    expect(demoted.role).toBe("user");
    expect(store.profile(secondAdminId)?.role).toBe("user");
  });

  it("blocks demoting or deactivating the final active admin", async () => {
    const store = createAdminUserStore({
      profiles: [adminProfile(), userProfile()],
      authUsers: [authUser(adminId), authUser(userId)],
    });

    await expect(updateManagedAccountRole({
      actor: createActor("admin"),
      targetUserId: adminId,
      role: "user",
    }, store.options())).rejects.toMatchObject({
      status: 409,
      message: "Der skal altid være mindst én administrator.",
    });

    await expect(updateManagedAccountStatus({
      actor: createActor("admin"),
      targetUserId: adminId,
      status: "deactivated",
    }, store.options())).rejects.toMatchObject({
      status: 409,
      message: "Der skal altid være mindst én administrator.",
    });
  });

  it("deactivates and reactivates users through Supabase Auth ban state without deleting profiles", async () => {
    const store = createAdminUserStore();

    const deactivated = await updateManagedAccountStatus({
      actor: createActor("admin"),
      targetUserId: userId,
      status: "deactivated",
    }, store.options());

    expect(deactivated.status).toBe("deactivated");
    expect(store.profile(userId)).toBeTruthy();
    expect(store.banDurations).toContainEqual({ userId, banDuration: "876000h" });

    const reactivated = await updateManagedAccountStatus({
      actor: createActor("admin"),
      targetUserId: userId,
      status: "active",
    }, store.options());

    expect(reactivated.status).toBe("active");
    expect(store.banDurations).toContainEqual({ userId, banDuration: "none" });
  });

  it("rejects existing sessions for deactivated users at the trusted auth boundary", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://auth.example.supabase.co";
    process.env.SUPABASE_URL = "https://auth.example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);

      if (url.endsWith("/auth/v1/user")) {
        return new Response(JSON.stringify({
          id: userId,
          email: "user@example.com",
          email_confirmed_at: "2026-08-20T10:00:00.000Z",
          confirmed_at: "2026-08-20T10:00:00.000Z",
        }), { status: 200 });
      }

      if (url.endsWith(`/auth/v1/admin/users/${userId}`)) {
        return new Response(JSON.stringify({
          id: userId,
          email: "user@example.com",
          banned_until: "2126-08-20T10:00:00.000Z",
          email_confirmed_at: "2026-08-20T10:00:00.000Z",
          confirmed_at: "2026-08-20T10:00:00.000Z",
        }), { status: 200 });
      }

      throw new Error(`Unexpected fetch ${url}`);
    });

    await expect(readAccountFromAccessToken("access-token", createReadOnlyProfileClient("user"))).rejects.toMatchObject({
      status: 403,
      message: "Account is deactivated.",
    });
  });
});

const adminId = "00000000-0000-4000-8000-00000000a001";
const secondAdminId = "00000000-0000-4000-8000-00000000a002";
const userId = "00000000-0000-4000-8000-00000000b001";

interface TestProfile {
  user_id: string;
  display_name: string | null;
  role: AccountRole;
  username: string | null;
  email: string | null;
  created_at: string;
  updated_at: string;
}

function createActor(role: AccountRole): AuthenticatedAccount {
  return {
    userId: role === "admin" ? adminId : userId,
    email: `${role}@example.com`,
    displayName: `${role} account`,
    username: role,
    role,
  };
}

function createAdminUserStore(input: { profiles?: TestProfile[]; authUsers?: SupabaseAdminAuthUser[] } = {}) {
  const profiles = new Map((input.profiles ?? [adminProfile(), secondAdminProfile(), userProfile()]).map((profile) => [profile.user_id, { ...profile }]));
  const authUsers = new Map((input.authUsers ?? [authUser(adminId), authUser(secondAdminId), authUser(userId)]).map((user) => [user.id, { ...user }]));
  const banDurations: { userId: string; banDuration: string }[] = [];
  const client: SupabaseRestClient = {
    async rpc<T>(): Promise<T> {
      throw new Error("rpc is not used.");
    },
    async select<T>(table: string, query: string): Promise<T[]> {
      if (table !== "profiles") {
        return [];
      }

      if (query.includes("user_id=eq.")) {
        const selectedUserId = decodeURIComponent(query.match(/user_id=eq\.([^&]+)/)?.[1] ?? "");
        const profile = profiles.get(selectedUserId);
        return profile ? [profile] as T[] : [];
      }

      const rows = Array.from(profiles.values());
      return (query.includes("role=eq.admin") ? rows.filter((profile) => profile.role === "admin") : rows) as T[];
    },
    async insert<T>(): Promise<T[]> {
      throw new Error("insert is not used.");
    },
    async update<T>(table: string, query: string, values: Record<string, unknown>): Promise<T[]> {
      if (table !== "profiles") {
        return [];
      }

      const selectedUserId = decodeURIComponent(query.match(/user_id=eq\.([^&]+)/)?.[1] ?? "");
      const profile = profiles.get(selectedUserId);

      if (!profile) {
        return [];
      }

      const updated = { ...profile, ...values } as TestProfile;
      profiles.set(selectedUserId, updated);
      return [updated] as T[];
    },
    async delete(): Promise<void> {
      throw new Error("delete is not used.");
    },
  };

  return {
    banDurations,
    profile: (id: string) => profiles.get(id),
    options: () => ({
      client,
      readAuthUser: async (id: string) => authUsers.get(id) ?? null,
      updateAuthBan: async (id: string, banDuration: string) => {
        banDurations.push({ userId: id, banDuration });
        const current = authUsers.get(id) ?? authUser(id);
        const updated = {
          ...current,
          banned_until: banDuration === "none" ? null : "2126-08-20T10:00:00.000Z",
        };
        authUsers.set(id, updated);
        return updated;
      },
    }),
  };
}

function adminProfile(): TestProfile {
  return {
    user_id: adminId,
    display_name: "Admin One",
    role: "admin",
    username: "admin_one",
    email: "admin@example.com",
    created_at: "2026-08-20T10:00:00.000Z",
    updated_at: "2026-08-20T10:00:00.000Z",
  };
}

function secondAdminProfile(): TestProfile {
  return {
    user_id: secondAdminId,
    display_name: "Admin Two",
    role: "admin",
    username: "admin_two",
    email: "admin2@example.com",
    created_at: "2026-08-20T10:00:00.000Z",
    updated_at: "2026-08-20T10:00:00.000Z",
  };
}

function userProfile(): TestProfile {
  return {
    user_id: userId,
    display_name: "User One",
    role: "user",
    username: "user_one",
    email: "user@example.com",
    created_at: "2026-08-20T10:00:00.000Z",
    updated_at: "2026-08-20T10:00:00.000Z",
  };
}

function authUser(id: string): SupabaseAdminAuthUser {
  const profile = id === adminId ? adminProfile() : id === secondAdminId ? secondAdminProfile() : userProfile();
  return {
    id,
    email: profile.email ?? "",
    email_confirmed_at: "2026-08-20T10:00:00.000Z",
    confirmed_at: "2026-08-20T10:00:00.000Z",
  };
}

function createReadOnlyProfileClient(role: AccountRole): SupabaseRestClient {
  return {
    async rpc<T>(): Promise<T> {
      throw new Error("rpc is not used.");
    },
    async select<T>(table: string): Promise<T[]> {
      if (table !== "profiles") {
        return [];
      }

      return [{
        user_id: userId,
        display_name: "User One",
        username: "user_one",
        email: "user@example.com",
        role,
      }] as T[];
    },
    async insert<T>(): Promise<T[]> {
      throw new Error("insert is not used.");
    },
    async update<T>(): Promise<T[]> {
      throw new Error("update is not used.");
    },
    async delete(): Promise<void> {
      throw new Error("delete is not used.");
    },
  };
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
