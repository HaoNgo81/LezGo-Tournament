// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createManagedUsernameOnlyAccount,
  listManagedAccountUsers,
  resetManagedAccountLoginCode,
  updateManagedAccountAdminNote,
  updateManagedAccountDetails,
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
  const originalCredentialSecret = process.env.LEZGO_ACCOUNT_CREDENTIAL_SECRET;

  afterEach(() => {
    vi.restoreAllMocks();
    restoreEnv("NEXT_PUBLIC_SUPABASE_URL", originalSupabaseUrl);
    restoreEnv("SUPABASE_URL", originalServerSupabaseUrl);
    restoreEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", originalAnonKey);
    restoreEnv("SUPABASE_SERVICE_ROLE_KEY", originalServiceRole);
    restoreEnv("LEZGO_ACCOUNT_CREDENTIAL_SECRET", originalCredentialSecret);
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

  it("allows ADMIN to create a username-only USER without returning credential material", async () => {
    const store = createAdminUserStore();
    process.env.LEZGO_ACCOUNT_CREDENTIAL_SECRET = "test-credential-secret";

    const created = await createManagedUsernameOnlyAccount({
      actor: createActor("admin"),
      username: "Player_One",
      code: "A1B2C3",
      displayName: "Player One",
      note: "Desk signup",
    }, store.options());

    expect(created).toMatchObject({
      displayName: "Player One",
      username: "player_one",
      email: "",
      role: "user",
      emailVerified: false,
      status: "active",
      adminNote: "Desk signup",
    });
    expect(store.profile(created.userId)).toMatchObject({
      username_normalized: "player_one",
      email: "player_one@users.lezgotournament.internal",
      role: "user",
    });
    expect(store.createdAuthUsers).toHaveLength(1);
    expect(store.createdAuthUsers[0]).toMatchObject({
      email: "player_one@users.lezgotournament.internal",
      email_confirm: true,
      user_metadata: expect.objectContaining({
        username: "player_one",
        account_type: "username_only",
      }),
    });
    expect(store.createdAuthUsers[0].password).toMatch(/^LezGo1!/);
    expect(JSON.stringify(created)).not.toMatch(/A1B2C3|password|hash|token|service|users\.lezgotournament\.internal/i);
  });

  it("rejects non-admin, duplicate username and invalid code for username-only creation", async () => {
    const store = createAdminUserStore();

    await expect(createManagedUsernameOnlyAccount({
      actor: createActor("user"),
      username: "fresh_user",
      code: "A1B2C3",
    }, store.options())).rejects.toMatchObject({ status: 403 });

    await expect(createManagedUsernameOnlyAccount({
      actor: createActor("admin"),
      username: "USER_ONE",
      code: "A1B2C3",
    }, store.options())).rejects.toMatchObject({
      status: 409,
      message: "Username is not available.",
    });

    await expect(createManagedUsernameOnlyAccount({
      actor: createActor("admin"),
      username: "fresh_user",
      code: "",
    }, store.options())).rejects.toMatchObject({ status: 400 });
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

  it("allows admins to update safe user details while enforcing unique username and email", async () => {
    const store = createAdminUserStore();

    const updated = await updateManagedAccountDetails({
      actor: createActor("admin"),
      targetUserId: userId,
      displayName: "Updated User",
      username: "updated_user",
      email: "updated@example.com",
    }, store.options());

    expect(updated).toMatchObject({
      displayName: "Updated User",
      username: "updated_user",
      email: "updated@example.com",
    });
    expect(store.profile(userId)).toMatchObject({
      display_name: "Updated User",
      username_normalized: "updated_user",
      email_normalized: "updated@example.com",
    });
    expect(store.credentialUpdates).toContainEqual({
      userId,
      values: expect.objectContaining({
        email: "updated@example.com",
      }),
    });

    await expect(updateManagedAccountDetails({
      actor: createActor("admin"),
      targetUserId: userId,
      displayName: "Updated User",
      username: "admin_one",
      email: "updated@example.com",
    }, store.options())).rejects.toMatchObject({
      status: 409,
    });
  });

  it("stores internal notes outside profile fields and blocks normal users", async () => {
    const store = createAdminUserStore();

    const updated = await updateManagedAccountAdminNote({
      actor: createActor("admin"),
      targetUserId: userId,
      note: "Support call completed.",
    }, store.options());

    expect(updated.adminNote).toBe("Support call completed.");
    expect(store.note(userId)).toBe("Support call completed.");
    expect(store.profile(userId)).not.toHaveProperty("admin_note");

    await expect(updateManagedAccountAdminNote({
      actor: createActor("user"),
      targetUserId: userId,
      note: "Not allowed.",
    }, store.options())).rejects.toMatchObject({
      status: 403,
    });
  });

  it("resets a user's 6-character code without returning existing credentials", async () => {
    const store = createAdminUserStore();
    process.env.LEZGO_ACCOUNT_CREDENTIAL_SECRET = "test-credential-secret";

    const manual = await resetManagedAccountLoginCode({
      actor: createActor("admin"),
      targetUserId: userId,
      code: "A1B2C3",
    }, store.options());

    expect(manual.generatedCode).toBeUndefined();
    expect(store.credentialUpdates.at(-1)).toMatchObject({
      userId,
      values: {
        password: expect.stringMatching(/^LezGo1!/),
      },
    });
    expect(JSON.stringify(manual)).not.toMatch(/hash|password|token|service/i);

    const generated = await resetManagedAccountLoginCode({
      actor: createActor("admin"),
      targetUserId: userId,
    }, store.options());

    expect(generated.generatedCode).toBe("Q2W3E4");
    expect(JSON.stringify(generated.user)).not.toMatch(/Q2W3E4|hash|password|token|service/i);
  });

  it("resets username-only account codes using the internal auth identity without exposing it", async () => {
    const store = createAdminUserStore({
      profiles: [adminProfile(), secondAdminProfile(), usernameOnlyProfile()],
      authUsers: [authUser(adminId), authUser(secondAdminId), usernameOnlyAuthUser()],
    });
    process.env.LEZGO_ACCOUNT_CREDENTIAL_SECRET = "test-credential-secret";

    const result = await resetManagedAccountLoginCode({
      actor: createActor("admin"),
      targetUserId: usernameOnlyUserId,
      code: "N3W456",
    }, store.options());

    expect(result.user).toMatchObject({
      username: "desk_user",
      email: "",
      role: "user",
    });
    expect(store.credentialUpdates.at(-1)).toMatchObject({
      userId: usernameOnlyUserId,
      values: {
        password: expect.stringMatching(/^LezGo1!/),
      },
    });
    expect(JSON.stringify(result)).not.toMatch(/N3W456|users\.lezgotournament\.internal|password|hash|token|service/i);
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
const usernameOnlyUserId = "00000000-0000-4000-8000-00000000b002";

interface TestProfile {
  user_id: string;
  display_name: string | null;
  role: AccountRole;
  username: string | null;
  username_normalized?: string | null;
  email: string | null;
  email_normalized?: string | null;
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
  const notes = new Map<string, string>();
  const banDurations: { userId: string; banDuration: string }[] = [];
  const credentialUpdates: { userId: string; values: { email?: string; password?: string; user_metadata?: Record<string, unknown> } }[] = [];
  const createdAuthUsers: Array<{ email: string; password: string; email_confirm?: boolean; user_metadata?: Record<string, unknown> }> = [];
  const client: SupabaseRestClient = {
    async rpc<T>(): Promise<T> {
      throw new Error("rpc is not used.");
    },
    async select<T>(table: string, query: string): Promise<T[]> {
      if (table === "admin_user_notes") {
        return Array.from(notes.entries()).map(([noteUserId, note]) => ({ user_id: noteUserId, note })) as T[];
      }

      if (table !== "profiles") {
        return [];
      }

      if (query.includes("username_normalized=eq.")) {
        const username = decodeURIComponent(query.match(/username_normalized=eq\.([^&]+)/)?.[1] ?? "");
        return Array.from(profiles.values()).filter((profile) => profile.username_normalized === username || profile.username === username) as T[];
      }

      if (query.includes("email_normalized=eq.")) {
        const email = decodeURIComponent(query.match(/email_normalized=eq\.([^&]+)/)?.[1] ?? "");
        return Array.from(profiles.values()).filter((profile) => profile.email_normalized === email || profile.email === email) as T[];
      }

      if (query.includes("user_id=eq.")) {
        const selectedUserId = decodeURIComponent(query.match(/user_id=eq\.([^&]+)/)?.[1] ?? "");
        const profile = profiles.get(selectedUserId);
        return profile ? [profile] as T[] : [];
      }

      const rows = Array.from(profiles.values());
      return (query.includes("role=eq.admin") ? rows.filter((profile) => profile.role === "admin") : rows) as T[];
    },
    async insert<T>(table: string, rows: Record<string, unknown> | Record<string, unknown>[]): Promise<T[]> {
      const row = Array.isArray(rows) ? rows[0] : rows;

      if (table === "profiles") {
        const profile = {
          user_id: String(row.user_id),
          display_name: String(row.display_name ?? ""),
          role: String(row.role ?? "user") as AccountRole,
          username: typeof row.username === "string" ? row.username : null,
          username_normalized: typeof row.username_normalized === "string" ? row.username_normalized : null,
          email: typeof row.email === "string" ? row.email : null,
          email_normalized: typeof row.email_normalized === "string" ? row.email_normalized : null,
          created_at: "2026-08-20T10:00:00.000Z",
          updated_at: "2026-08-20T10:00:00.000Z",
        };
        profiles.set(profile.user_id, profile);
        return [profile] as T[];
      }

      if (table !== "admin_user_notes") {
        throw new Error("insert is not used.");
      }

      notes.set(String(row.user_id), String(row.note ?? ""));
      return [{ user_id: String(row.user_id), note: String(row.note ?? "") }] as T[];
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
    credentialUpdates,
    createdAuthUsers,
    profile: (id: string) => profiles.get(id),
    note: (id: string) => notes.get(id),
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
      updateAuthCredentials: async (id: string, values: { email?: string; password?: string; user_metadata?: Record<string, unknown> }) => {
        credentialUpdates.push({ userId: id, values });
        const current = authUsers.get(id) ?? authUser(id);
        const updated = {
          ...current,
          email: values.email ?? current.email,
          user_metadata: values.user_metadata ?? current.user_metadata,
        };
        authUsers.set(id, updated);
        return updated;
      },
      createAuthUser: async (values: { email: string; password: string; email_confirm?: boolean; user_metadata?: Record<string, unknown> }) => {
        createdAuthUsers.push(values);
        const id = usernameOnlyUserId;
        const created = {
          id,
          email: values.email,
          created_at: "2026-08-20T10:00:00.000Z",
          email_confirmed_at: values.email_confirm ? "2026-08-20T10:00:00.000Z" : null,
          confirmed_at: values.email_confirm ? "2026-08-20T10:00:00.000Z" : null,
          user_metadata: values.user_metadata,
        };
        authUsers.set(id, created);
        return created;
      },
      generateCode: () => "Q2W3E4",
    }),
  };
}

function usernameOnlyProfile(): TestProfile {
  return {
    user_id: usernameOnlyUserId,
    display_name: "Desk User",
    role: "user",
    username: "desk_user",
    username_normalized: "desk_user",
    email: "desk_user@users.lezgotournament.internal",
    email_normalized: "desk_user@users.lezgotournament.internal",
    created_at: "2026-08-20T10:00:00.000Z",
    updated_at: "2026-08-20T10:00:00.000Z",
  };
}

function usernameOnlyAuthUser(): SupabaseAdminAuthUser {
  return {
    id: usernameOnlyUserId,
    email: "desk_user@users.lezgotournament.internal",
    email_confirmed_at: "2026-08-20T10:00:00.000Z",
    confirmed_at: "2026-08-20T10:00:00.000Z",
  };
}

function adminProfile(): TestProfile {
  return {
    user_id: adminId,
    display_name: "Admin One",
    role: "admin",
    username: "admin_one",
    username_normalized: "admin_one",
    email: "admin@example.com",
    email_normalized: "admin@example.com",
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
    username_normalized: "admin_two",
    email: "admin2@example.com",
    email_normalized: "admin2@example.com",
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
    username_normalized: "user_one",
    email: "user@example.com",
    email_normalized: "user@example.com",
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
