import { AuthError, type AccountRole, type AuthenticatedAccount } from "@/lib/auth";
import {
  isSupabaseAdminAuthUserDeactivated,
  isSupabaseAdminAuthUserVerified,
  readSupabaseAdminAuthUser,
  updateSupabaseAdminAuthUserBan,
  type SupabaseAdminAuthUser,
} from "@/lib/auth/auth-admin";
import { createSupabaseRestClient, type SupabaseRestClient } from "@/lib/supabase/rest-client";

export type ManagedAccountStatus = "active" | "deactivated";

export interface ManagedAccountUser {
  userId: string;
  displayName: string;
  username?: string;
  email: string;
  role: AccountRole;
  emailVerified: boolean;
  status: ManagedAccountStatus;
  createdAt?: string;
  updatedAt?: string;
}

interface AdminProfileRow {
  user_id: string;
  display_name: string | null;
  role: AccountRole;
  username: string | null;
  email: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

interface AdminUserServiceOptions {
  client?: SupabaseRestClient;
  readAuthUser?: (userId: string) => Promise<SupabaseAdminAuthUser | null>;
  updateAuthBan?: (userId: string, banDuration: string) => Promise<SupabaseAdminAuthUser>;
}

const deactivateBanDuration = "876000h";
const reactivateBanDuration = "none";
const lastAdminMessage = "Der skal altid være mindst én administrator.";

export async function listManagedAccountUsers(actor: AuthenticatedAccount, options: AdminUserServiceOptions = {}): Promise<ManagedAccountUser[]> {
  assertAdminActor(actor);
  const client = options.client ?? createSupabaseRestClient();
  const readAuthUser = options.readAuthUser ?? readSupabaseAdminAuthUser;
  const profiles = await readAllProfiles(client);

  const users = await Promise.all(profiles.map(async (profile) => toManagedAccountUser(profile, await readAuthUser(profile.user_id))));
  return users.sort(compareManagedUsers);
}

export async function updateManagedAccountRole(input: {
  actor: AuthenticatedAccount;
  targetUserId: string;
  role: AccountRole;
}, options: AdminUserServiceOptions = {}): Promise<ManagedAccountUser> {
  assertAdminActor(input.actor);
  assertUuid(input.targetUserId);
  assertRole(input.role);

  const client = options.client ?? createSupabaseRestClient();
  const readAuthUser = options.readAuthUser ?? readSupabaseAdminAuthUser;
  const target = await readProfile(input.targetUserId, client);

  if (!target) {
    throw new AuthError("User was not found.", 404);
  }

  if (target.role === "admin" && input.role === "user") {
    await assertAnotherActiveAdminExists(target.user_id, client, readAuthUser);
  }

  const [updated] = await client.update<AdminProfileRow>("profiles", `user_id=eq.${encodeURIComponent(target.user_id)}`, {
    role: input.role,
  });
  const nextProfile = updated ?? { ...target, role: input.role };

  return toManagedAccountUser(nextProfile, await readAuthUser(target.user_id));
}

export async function updateManagedAccountStatus(input: {
  actor: AuthenticatedAccount;
  targetUserId: string;
  status: ManagedAccountStatus;
}, options: AdminUserServiceOptions = {}): Promise<ManagedAccountUser> {
  assertAdminActor(input.actor);
  assertUuid(input.targetUserId);
  assertStatus(input.status);

  const client = options.client ?? createSupabaseRestClient();
  const readAuthUser = options.readAuthUser ?? readSupabaseAdminAuthUser;
  const updateAuthBan = options.updateAuthBan ?? updateSupabaseAdminAuthUserBan;
  const target = await readProfile(input.targetUserId, client);

  if (!target) {
    throw new AuthError("User was not found.", 404);
  }

  if (input.status === "deactivated" && target.role === "admin") {
    await assertAnotherActiveAdminExists(target.user_id, client, readAuthUser);
  }

  const authUser = await updateAuthBan(target.user_id, input.status === "deactivated" ? deactivateBanDuration : reactivateBanDuration);
  return toManagedAccountUser(target, authUser);
}

function assertAdminActor(actor: AuthenticatedAccount): void {
  if (actor.role !== "admin") {
    throw new AuthError("Admin access was denied.", 403);
  }
}

async function readAllProfiles(client: SupabaseRestClient): Promise<AdminProfileRow[]> {
  return client.select<AdminProfileRow>(
    "profiles",
    "select=user_id,display_name,role,username,email,created_at,updated_at&order=display_name.asc",
  );
}

async function readProfile(userId: string, client: SupabaseRestClient): Promise<AdminProfileRow | null> {
  const [profile] = await client.select<AdminProfileRow>(
    "profiles",
    `user_id=eq.${encodeURIComponent(userId)}&select=user_id,display_name,role,username,email,created_at,updated_at&limit=1`,
  );
  return profile ?? null;
}

async function assertAnotherActiveAdminExists(
  targetUserId: string,
  client: SupabaseRestClient,
  readAuthUser: (userId: string) => Promise<SupabaseAdminAuthUser | null>,
): Promise<void> {
  const adminProfiles = await client.select<AdminProfileRow>(
    "profiles",
    "role=eq.admin&select=user_id,display_name,role,username,email,created_at,updated_at",
  );

  for (const profile of adminProfiles) {
    if (profile.user_id === targetUserId) {
      continue;
    }

    const authUser = await readAuthUser(profile.user_id);

    if (authUser && !isSupabaseAdminAuthUserDeactivated(authUser)) {
      return;
    }
  }

  throw new AuthError(lastAdminMessage, 409);
}

function toManagedAccountUser(profile: AdminProfileRow, authUser: SupabaseAdminAuthUser | null): ManagedAccountUser {
  const email = profile.email || authUser?.email || "";

  return {
    userId: profile.user_id,
    displayName: profile.display_name || profile.username || email.split("@")[0] || "Ukendt bruger",
    username: profile.username ?? undefined,
    email,
    role: profile.role,
    emailVerified: Boolean(authUser && isSupabaseAdminAuthUserVerified(authUser)),
    status: authUser && !isSupabaseAdminAuthUserDeactivated(authUser) ? "active" : "deactivated",
    createdAt: profile.created_at ?? undefined,
    updatedAt: profile.updated_at ?? undefined,
  };
}

function compareManagedUsers(a: ManagedAccountUser, b: ManagedAccountUser): number {
  if (a.role !== b.role) {
    return a.role === "admin" ? -1 : 1;
  }

  if (a.status !== b.status) {
    return a.status === "active" ? -1 : 1;
  }

  return a.displayName.localeCompare(b.displayName, "da");
}

function assertUuid(value: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new AuthError("User id is invalid.", 400);
  }
}

function assertRole(value: string): asserts value is AccountRole {
  if (value !== "admin" && value !== "user") {
    throw new AuthError("Role is invalid.", 400);
  }
}

function assertStatus(value: string): asserts value is ManagedAccountStatus {
  if (value !== "active" && value !== "deactivated") {
    throw new AuthError("Account status is invalid.", 400);
  }
}
