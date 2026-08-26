import { randomInt } from "node:crypto";
import { AuthError, type AccountRole, type AuthenticatedAccount } from "@/lib/auth";
import {
  createSupabaseAdminAuthUser,
  isSupabaseAdminAuthUserDeactivated,
  isSupabaseAdminAuthUserVerified,
  readSupabaseAdminAuthUser,
  updateSupabaseAdminAuthUserBan,
  updateSupabaseAdminAuthUserCredentials,
  type SupabaseAdminAuthUser,
} from "@/lib/auth/auth-admin";
import { createInternalCredentialEmail, isInternalCredentialEmail, normalizeCredentialEmail, normalizeLoginCode, normalizeUsername, toPublicCredentialEmail, toSupabaseCredentialPassword } from "@/lib/auth/credentials";
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
  lastSignInAt?: string;
  adminNote?: string;
}

interface AdminProfileRow {
  user_id: string;
  display_name: string | null;
  role: AccountRole;
  username: string | null;
  username_normalized?: string | null;
  email: string | null;
  email_normalized?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

interface AdminUserServiceOptions {
  client?: SupabaseRestClient;
  readAuthUser?: (userId: string) => Promise<SupabaseAdminAuthUser | null>;
  updateAuthBan?: (userId: string, banDuration: string) => Promise<SupabaseAdminAuthUser>;
  updateAuthCredentials?: (userId: string, values: { email?: string; password?: string; user_metadata?: Record<string, unknown> }) => Promise<SupabaseAdminAuthUser>;
  createAuthUser?: (values: { email: string; password: string; email_confirm?: boolean; user_metadata?: Record<string, unknown> }) => Promise<SupabaseAdminAuthUser>;
  generateCode?: () => string;
}

interface AdminUserNoteRow {
  user_id: string;
  note: string | null;
  updated_at?: string | null;
  updated_by_user_id?: string | null;
}

const deactivateBanDuration = "876000h";
const reactivateBanDuration = "none";
const lastAdminMessage = "Der skal altid være mindst én administrator.";

export async function createManagedUsernameOnlyAccount(input: {
  actor: AuthenticatedAccount;
  username: string;
  code: string;
  displayName?: string;
  note?: string;
}, options: AdminUserServiceOptions = {}): Promise<ManagedAccountUser> {
  assertAdminActor(input.actor);
  const username = normalizeUsername(input.username);
  const code = normalizeLoginCode(input.code);
  const displayName = sanitizeDisplayName(input.displayName?.trim() ? input.displayName : username);
  const note = input.note === undefined ? "" : sanitizeAdminNote(input.note);
  const internalEmail = createInternalCredentialEmail(username);
  const client = options.client ?? createSupabaseRestClient();
  const createAuthUser = options.createAuthUser ?? createSupabaseAdminAuthUser;
  const readAuthUser = options.readAuthUser ?? readSupabaseAdminAuthUser;

  await assertUniqueProfileValue(client, "username_normalized", username, "", "Username is not available.");
  await assertUniqueProfileValue(client, "email_normalized", internalEmail, "", "Username is not available.");

  const authUser = await createAuthUser({
    email: internalEmail,
    password: toSupabaseCredentialPassword(internalEmail, code),
    email_confirm: true,
    user_metadata: {
      display_name: displayName,
      name: displayName,
      username,
      account_type: "username_only",
    },
  });

  await persistProfileForAdminCreatedUser(client, {
    user_id: authUser.id,
    display_name: displayName,
    role: "user",
    username,
    username_normalized: username,
    email: internalEmail,
    email_normalized: internalEmail,
  });

  if (note) {
    await client.insert<AdminUserNoteRow>("admin_user_notes", {
      user_id: authUser.id,
      note,
      updated_by_user_id: input.actor.userId,
    }, { onConflict: "user_id" });
  }

  return toManagedAccountUser(
    await readRequiredProfile(authUser.id, client),
    await readAuthUser(authUser.id) ?? authUser,
    note,
  );
}

export async function listManagedAccountUsers(actor: AuthenticatedAccount, options: AdminUserServiceOptions = {}): Promise<ManagedAccountUser[]> {
  assertAdminActor(actor);
  const client = options.client ?? createSupabaseRestClient();
  const readAuthUser = options.readAuthUser ?? readSupabaseAdminAuthUser;
  const profiles = await readAllProfiles(client);
  const notes = await readAdminNotes(client);

  const users = await Promise.all(profiles.map(async (profile) => toManagedAccountUser(profile, await readAuthUser(profile.user_id), notes.get(profile.user_id))));
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

  const notes = await readAdminNotes(client);
  return toManagedAccountUser(nextProfile, await readAuthUser(target.user_id), notes.get(target.user_id));
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
  const notes = await readAdminNotes(client);
  return toManagedAccountUser(target, authUser, notes.get(target.user_id));
}

export async function updateManagedAccountDetails(input: {
  actor: AuthenticatedAccount;
  targetUserId: string;
  displayName: string;
  username: string;
  email: string;
}, options: AdminUserServiceOptions = {}): Promise<ManagedAccountUser> {
  assertAdminActor(input.actor);
  assertUuid(input.targetUserId);

  const displayName = sanitizeDisplayName(input.displayName);
  const username = normalizeUsername(input.username);
  const client = options.client ?? createSupabaseRestClient();
  const updateAuthCredentials = options.updateAuthCredentials ?? updateSupabaseAdminAuthUserCredentials;
  const target = await readProfile(input.targetUserId, client);

  if (!target) {
    throw new AuthError("User was not found.", 404);
  }

  const email = input.email.trim()
    ? normalizeCredentialEmail(input.email)
    : isInternalCredentialEmail(target.email) ? target.email ?? "" : normalizeCredentialEmail(input.email);

  await assertUniqueProfileValue(client, "username_normalized", username, target.user_id, "Username is not available.");
  await assertUniqueProfileValue(client, "email_normalized", email, target.user_id, "Email is already used.");

  const authUser = await updateAuthCredentials(target.user_id, {
    email,
    user_metadata: {
      display_name: displayName,
      name: displayName,
      username,
    },
  });
  const [updated] = await client.update<AdminProfileRow>("profiles", `user_id=eq.${encodeURIComponent(target.user_id)}`, {
    display_name: displayName,
    username,
    username_normalized: username,
    email,
    email_normalized: email,
  });
  const notes = await readAdminNotes(client);

  return toManagedAccountUser(updated ?? { ...target, display_name: displayName, username, username_normalized: username, email, email_normalized: email }, authUser, notes.get(target.user_id));
}

export async function updateManagedAccountAdminNote(input: {
  actor: AuthenticatedAccount;
  targetUserId: string;
  note: string;
}, options: AdminUserServiceOptions = {}): Promise<ManagedAccountUser> {
  assertAdminActor(input.actor);
  assertUuid(input.targetUserId);

  const note = sanitizeAdminNote(input.note);
  const client = options.client ?? createSupabaseRestClient();
  const readAuthUser = options.readAuthUser ?? readSupabaseAdminAuthUser;
  const target = await readProfile(input.targetUserId, client);

  if (!target) {
    throw new AuthError("User was not found.", 404);
  }

  await client.insert<AdminUserNoteRow>("admin_user_notes", {
    user_id: target.user_id,
    note,
    updated_by_user_id: input.actor.userId,
  }, { onConflict: "user_id" });

  return toManagedAccountUser(target, await readAuthUser(target.user_id), note);
}

export async function resetManagedAccountLoginCode(input: {
  actor: AuthenticatedAccount;
  targetUserId: string;
  code?: string;
}, options: AdminUserServiceOptions = {}): Promise<{ user: ManagedAccountUser; generatedCode?: string }> {
  assertAdminActor(input.actor);
  assertUuid(input.targetUserId);

  const generatedCode = input.code ? undefined : (options.generateCode ?? generateLoginCode)();
  const code = normalizeLoginCode(input.code ?? generatedCode ?? "");
  const client = options.client ?? createSupabaseRestClient();
  const updateAuthCredentials = options.updateAuthCredentials ?? updateSupabaseAdminAuthUserCredentials;
  const target = await readProfile(input.targetUserId, client);

  if (!target) {
    throw new AuthError("User was not found.", 404);
  }

  const email = normalizeCredentialEmail(target.email ?? "");
  const authUser = await updateAuthCredentials(target.user_id, {
    password: toSupabaseCredentialPassword(email, code),
  });
  const notes = await readAdminNotes(client);

  return {
    user: toManagedAccountUser(target, authUser, notes.get(target.user_id)),
    generatedCode,
  };
}

function assertAdminActor(actor: AuthenticatedAccount): void {
  if (actor.role !== "admin") {
    throw new AuthError("Admin access was denied.", 403);
  }
}

async function readAllProfiles(client: SupabaseRestClient): Promise<AdminProfileRow[]> {
  return client.select<AdminProfileRow>(
    "profiles",
    "select=user_id,display_name,role,username,username_normalized,email,email_normalized,created_at,updated_at&order=display_name.asc",
  );
}

async function readProfile(userId: string, client: SupabaseRestClient): Promise<AdminProfileRow | null> {
  const [profile] = await client.select<AdminProfileRow>(
    "profiles",
    `user_id=eq.${encodeURIComponent(userId)}&select=user_id,display_name,role,username,username_normalized,email,email_normalized,created_at,updated_at&limit=1`,
  );
  return profile ?? null;
}

async function readAdminNotes(client: SupabaseRestClient): Promise<Map<string, string>> {
  const rows = await client.select<AdminUserNoteRow>("admin_user_notes", "select=user_id,note");
  return new Map(rows.map((row) => [row.user_id, row.note ?? ""]));
}

async function assertAnotherActiveAdminExists(
  targetUserId: string,
  client: SupabaseRestClient,
  readAuthUser: (userId: string) => Promise<SupabaseAdminAuthUser | null>,
): Promise<void> {
  const adminProfiles = await client.select<AdminProfileRow>(
    "profiles",
    "role=eq.admin&select=user_id,display_name,role,username,username_normalized,email,email_normalized,created_at,updated_at",
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

function toManagedAccountUser(profile: AdminProfileRow, authUser: SupabaseAdminAuthUser | null, adminNote = ""): ManagedAccountUser {
  const email = profile.email || authUser?.email || "";

  return {
    userId: profile.user_id,
    displayName: profile.display_name || profile.username || email.split("@")[0] || "Ukendt bruger",
    username: profile.username ?? undefined,
    email: toPublicCredentialEmail(email),
    role: profile.role,
    emailVerified: Boolean(authUser && isSupabaseAdminAuthUserVerified(authUser) && !isInternalCredentialEmail(email)),
    status: authUser && !isSupabaseAdminAuthUserDeactivated(authUser) ? "active" : "deactivated",
    createdAt: profile.created_at ?? parseAuthString(authUser?.created_at),
    updatedAt: profile.updated_at ?? undefined,
    lastSignInAt: parseAuthString(authUser?.last_sign_in_at),
    adminNote,
  };
}

async function persistProfileForAdminCreatedUser(client: SupabaseRestClient, profile: AdminProfileRow): Promise<void> {
  const existing = await readProfile(profile.user_id, client);

  if (existing) {
    await client.update<AdminProfileRow>("profiles", `user_id=eq.${encodeURIComponent(profile.user_id)}`, {
      display_name: profile.display_name,
      role: profile.role,
      username: profile.username,
      username_normalized: profile.username_normalized,
      email: profile.email,
      email_normalized: profile.email_normalized,
    });
    return;
  }

  await client.insert<AdminProfileRow>("profiles", {
    user_id: profile.user_id,
    display_name: profile.display_name,
    role: profile.role,
    username: profile.username,
    username_normalized: profile.username_normalized,
    email: profile.email,
    email_normalized: profile.email_normalized,
  });
}

async function readRequiredProfile(userId: string, client: SupabaseRestClient): Promise<AdminProfileRow> {
  const profile = await readProfile(userId, client);

  if (!profile) {
    throw new AuthError("User was not found.", 404);
  }

  return profile;
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

async function assertUniqueProfileValue(
  client: SupabaseRestClient,
  column: "username_normalized" | "email_normalized",
  value: string,
  targetUserId: string,
  message: string,
): Promise<void> {
  const [existing] = await client.select<Pick<AdminProfileRow, "user_id">>(
    "profiles",
    `${column}=eq.${encodeURIComponent(value)}&select=user_id&limit=1`,
  );

  if (existing && existing.user_id !== targetUserId) {
    throw new AuthError(message, 409);
  }
}

function sanitizeDisplayName(value: string): string {
  const displayName = value.trim().replace(/\s+/g, " ");

  if (displayName.length < 1 || displayName.length > 80) {
    throw new AuthError("Display name is invalid.", 400);
  }

  return displayName;
}

function sanitizeAdminNote(value: string): string {
  const note = value.trim();

  if (note.length > 1000) {
    throw new AuthError("Admin note is too long.", 400);
  }

  return note;
}

function parseAuthString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function generateLoginCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";

  for (let index = 0; index < 6; index += 1) {
    code += alphabet[randomInt(0, alphabet.length)];
  }

  return code;
}
