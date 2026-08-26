import { createHash } from "node:crypto";
import { createSupabaseRestClient, SupabaseRestClientError, type SupabaseRestClient } from "@/lib/supabase/rest-client";
import { isSupabaseAdminAuthUserDeactivated, readSupabaseAdminAuthUser, SupabaseAuthAdminError } from "./auth-admin";

export type AccountRole = "admin" | "user";

export interface AuthenticatedAccount {
  userId: string;
  email: string;
  displayName: string;
  username?: string;
  role: AccountRole;
}

export interface SupabaseAuthSession {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
}

export class AuthError extends Error {
  readonly status: number;

  constructor(message = "Authentication was denied.", status = 401) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

interface SupabaseAuthUserResponse {
  id?: string;
  email?: string;
  confirmed_at?: unknown;
  email_confirmed_at?: unknown;
  user_metadata?: {
    display_name?: unknown;
    name?: unknown;
  };
}

interface ProfileRow {
  user_id: string;
  display_name: string | null;
  username?: string | null;
  email?: string | null;
  role: AccountRole;
}

export const authAccessCookieName = "lezgo_auth_access";
export const authRefreshCookieName = "lezgo_auth_refresh";
const internalCredentialEmailDomain = "users.lezgotournament.internal";

export function getSupabaseAuthConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new AuthError("Supabase Auth is not configured.", 503);
  }

  return {
    url: url.replace(/\/$/, ""),
    anonKey,
  };
}

export async function requestEmailOtp(input: { email: string; displayName: string; redirectTo?: string }): Promise<void> {
  const email = normalizeEmail(input.email);
  const displayName = sanitizeDisplayName(input.displayName);
  const config = getSupabaseAuthConfig();
  const response = await fetch(`${config.url}/auth/v1/otp`, {
    method: "POST",
    headers: getAuthHeaders(config.anonKey),
    body: JSON.stringify({
      email,
      data: {
        display_name: displayName,
      },
      options: {
        should_create_user: true,
        email_redirect_to: input.redirectTo,
      },
    }),
  });

  if (!response.ok) {
    throw new AuthError("Could not send login email.", response.status);
  }
}

export async function verifyEmailOtp(input: { email: string; token: string; displayName?: string }): Promise<{ session: SupabaseAuthSession; account: AuthenticatedAccount }> {
  const email = normalizeEmail(input.email);
  const token = input.token.trim();

  if (!/^\d{6}$/.test(token)) {
    throw new AuthError("Verification code is invalid.", 400);
  }

  const config = getSupabaseAuthConfig();
  const response = await fetch(`${config.url}/auth/v1/verify`, {
    method: "POST",
    headers: getAuthHeaders(config.anonKey),
    body: JSON.stringify({
      type: "email",
      email,
      token,
    }),
  });
  const body = await parseJson(response);

  if (!response.ok || !isVerifyResponse(body)) {
    throw new AuthError("Email verification failed.", response.status || 401);
  }

  const user = body.user;
  const metadataName = getMetadataName(user);
  const displayName = sanitizeDisplayName(input.displayName ?? metadataName ?? email.split("@")[0]);
  const account = await upsertAndReadProfile({
    userId: user.id,
    email: user.email,
    displayName,
    updateExistingDisplayName: Boolean(input.displayName),
  });

  return {
    session: {
      accessToken: body.access_token,
      refreshToken: body.refresh_token,
      expiresIn: body.expires_in,
    },
    account,
  };
}

export async function refreshAuthenticatedSession(refreshToken: string | undefined, client?: SupabaseRestClient): Promise<{ session: SupabaseAuthSession; account: AuthenticatedAccount }> {
  if (!refreshToken) {
    throw new AuthError();
  }

  const config = getSupabaseAuthConfig();
  const response = await fetch(`${config.url}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: getAuthHeaders(config.anonKey),
    body: JSON.stringify({
      refresh_token: refreshToken,
    }),
  });
  const body = await parseJson(response);

  if (!response.ok || !isVerifyResponse(body)) {
    throw new AuthError("Authentication was denied.", response.status || 401);
  }

  if (!isAuthUserEmailVerified(body.user)) {
    throw new AuthError("Email is not verified.", 403);
  }

  await assertAuthUserIsActive(body.user.id);
  const account = await readProfileForAuthUser(body.user, client ?? createSupabaseRestClient());

  return {
    session: {
      accessToken: body.access_token,
      refreshToken: body.refresh_token,
      expiresIn: body.expires_in,
    },
    account,
  };
}

export async function readAccountFromAccessToken(accessToken: string | undefined, client?: SupabaseRestClient): Promise<AuthenticatedAccount> {
  if (!accessToken) {
    throw new AuthError();
  }

  const authUser = await readSupabaseAuthUser(accessToken);
  await assertAuthUserIsActive(authUser.id);
  return readProfileForAuthUser(authUser, client ?? createSupabaseRestClient());
}

export async function readVerifiedAuthUserIdFromAccessToken(accessToken: string | undefined): Promise<string> {
  if (!accessToken) {
    throw new AuthError();
  }

  return (await readSupabaseAuthUser(accessToken)).id;
}

export async function assertAuthUserIdIsActive(userId: string): Promise<void> {
  await assertAuthUserIsActive(userId);
}

export async function readOptionalAccountFromAccessToken(accessToken: string | undefined, client?: SupabaseRestClient): Promise<AuthenticatedAccount | null> {
  try {
    return await readAccountFromAccessToken(accessToken, client);
  } catch {
    return null;
  }
}

export async function logoutOtherSupabaseSessions(accessToken: string | undefined): Promise<void> {
  if (!accessToken) {
    throw new AuthError();
  }

  const config = getSupabaseAuthConfig();
  const response = await fetch(`${config.url}/auth/v1/logout?scope=others`, {
    method: "POST",
    headers: {
      apikey: config.anonKey,
      authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new AuthError("Other sessions could not be logged out.", response.status || 401);
  }
}

export async function logoutCurrentSupabaseSession(input: { accessToken?: string; refreshToken?: string }): Promise<void> {
  const accessToken = input.accessToken ?? await refreshAccessTokenForLogout(input.refreshToken);

  if (!accessToken) {
    return;
  }

  await logoutSupabaseSessionWithAccessToken(accessToken, "local");
}

async function refreshAccessTokenForLogout(refreshToken: string | undefined): Promise<string | undefined> {
  if (!refreshToken) {
    return undefined;
  }

  const config = getSupabaseAuthConfig();
  const response = await fetch(`${config.url}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: getAuthHeaders(config.anonKey),
    body: JSON.stringify({
      refresh_token: refreshToken,
    }),
  });
  const body = await parseJson(response);

  if (!response.ok || !isVerifyResponse(body)) {
    return undefined;
  }

  return body.access_token;
}

async function logoutSupabaseSessionWithAccessToken(accessToken: string, scope: "local" | "others"): Promise<void> {
  const config = getSupabaseAuthConfig();
  const response = await fetch(`${config.url}/auth/v1/logout?scope=${scope}`, {
    method: "POST",
    headers: {
      apikey: config.anonKey,
      authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new AuthError("Session could not be logged out.", response.status || 401);
  }
}

export async function assertAdminAccount(accessToken: string | undefined, client?: SupabaseRestClient): Promise<AuthenticatedAccount> {
  const account = await readAccountFromAccessToken(accessToken, client);

  if (account.role !== "admin") {
    throw new AuthError("Admin access was denied.", 403);
  }

  return account;
}

export async function upsertAndReadProfile(input: { userId: string; email: string; displayName: string; username?: string; updateExistingDisplayName?: boolean }, client: SupabaseRestClient = createSupabaseRestClient()): Promise<AuthenticatedAccount> {
  validateUuid(input.userId, "userId");
  const displayName = sanitizeDisplayName(input.displayName);
  const email = normalizeEmail(input.email);
  const username = input.username ? normalizeOptionalUsername(input.username) : undefined;
  const query = `user_id=eq.${encodeURIComponent(input.userId)}&select=user_id,display_name,role,username,email`;
  const [existingProfile] = await client.select<ProfileRow>("profiles", query);

  if (existingProfile) {
    const patch: Record<string, unknown> = {};

    if ((!existingProfile.display_name || input.updateExistingDisplayName) && existingProfile.display_name !== displayName && displayName) {
      patch.display_name = displayName;
    }

    if (username && existingProfile.username !== username) {
      patch.username = username;
      patch.username_normalized = username;
    }

    if (existingProfile.email !== email) {
      patch.email = email;
      patch.email_normalized = email;
    }

    if (Object.keys(patch).length > 0) {
      const [updated] = await client.update<ProfileRow>("profiles", `user_id=eq.${encodeURIComponent(input.userId)}`, {
        ...patch,
      });

      return {
        userId: input.userId,
        email: toPublicCredentialEmail(email),
        displayName: updated?.display_name ?? displayName,
        username: updated?.username ?? username ?? existingProfile.username ?? undefined,
        role: updated?.role ?? existingProfile.role,
      };
    }

    return {
      userId: input.userId,
      email: toPublicCredentialEmail(email),
      displayName: existingProfile.display_name || displayName,
      username: existingProfile.username ?? undefined,
      role: existingProfile.role,
    };
  }

  try {
    await client.insert<ProfileRow>("profiles", {
      user_id: input.userId,
      display_name: displayName,
      username,
      username_normalized: username,
      email,
      email_normalized: email,
      role: "user",
    });
  } catch (error) {
    if (!(error instanceof SupabaseRestClientError) || error.status !== 409) {
      throw error;
    }
  }

  const [profile] = await client.select<ProfileRow>("profiles", query);

  if (!profile) {
    throw new AuthError("Account profile was not found.", 500);
  }

  return {
    userId: input.userId,
    email: toPublicCredentialEmail(email),
    displayName: profile.display_name || displayName,
    username: profile.username ?? undefined,
    role: profile.role,
  };
}

export function hashUserIdForLog(userId: string): string {
  return createHash("sha256").update(userId, "utf8").digest("hex").slice(0, 12);
}

function getAuthHeaders(anonKey: string): HeadersInit {
  return {
    apikey: anonKey,
    authorization: `Bearer ${anonKey}`,
    "content-type": "application/json",
  };
}

async function readSupabaseAuthUser(accessToken: string): Promise<{ id: string; email: string; displayName?: string }> {
  const config = getSupabaseAuthConfig();
  const response = await fetch(`${config.url}/auth/v1/user`, {
    method: "GET",
    headers: {
      apikey: config.anonKey,
      authorization: `Bearer ${accessToken}`,
    },
  });
  const body = await parseJson(response);

  if (!response.ok || !isAuthUser(body)) {
    throw new AuthError("Authentication was denied.", response.status || 401);
  }

  if (!isAuthUserEmailVerified(body)) {
    throw new AuthError("Email is not verified.", 403);
  }

  return {
    id: body.id,
    email: body.email,
    displayName: getMetadataName(body),
  };
}

async function assertAuthUserIsActive(userId: string): Promise<void> {
  try {
    const authUser = await readSupabaseAdminAuthUser(userId);

    if (!authUser) {
      throw new AuthError("Authentication was denied.", 401);
    }

    if (isSupabaseAdminAuthUserDeactivated(authUser)) {
      throw new AuthError("Account is deactivated.", 403);
    }
  } catch (error) {
    if (error instanceof AuthError) {
      throw error;
    }

    if (error instanceof SupabaseAuthAdminError) {
      throw new AuthError("Authentication was denied.", error.status >= 500 ? 503 : 401);
    }

    throw error;
  }
}

async function readProfileForAuthUser(authUser: { id: string; email: string; displayName?: string }, client: SupabaseRestClient): Promise<AuthenticatedAccount> {
  const [profile] = await client.select<ProfileRow>("profiles", `user_id=eq.${encodeURIComponent(authUser.id)}&select=user_id,display_name,role,username,email`);

  if (!profile) {
    return upsertAndReadProfile({
      userId: authUser.id,
      email: authUser.email,
      displayName: authUser.displayName ?? authUser.email.split("@")[0],
    }, client);
  }

  return {
    userId: authUser.id,
    email: toPublicCredentialEmail(profile.email ?? authUser.email),
    displayName: profile.display_name || authUser.displayName || authUser.email.split("@")[0],
    username: profile.username ?? undefined,
    role: profile.role,
  };
}

function normalizeEmail(value: string): string {
  const email = value.trim().toLocaleLowerCase("en");

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AuthError("Email is invalid.", 400);
  }

  return email;
}

function toPublicCredentialEmail(value: string | null | undefined): string {
  const email = value ?? "";
  return email.toLocaleLowerCase("en").endsWith(`@${internalCredentialEmailDomain}`) ? "" : email;
}

function sanitizeDisplayName(value: string): string {
  const displayName = value.trim().replace(/\s+/g, " ").slice(0, 80);

  if (!displayName) {
    throw new AuthError("Name is required.", 400);
  }

  return displayName;
}

function normalizeOptionalUsername(value: string): string {
  const username = value.trim().toLocaleLowerCase("en");

  if (!/^[a-z0-9_]{3,30}$/.test(username)) {
    throw new AuthError("Username is invalid.", 400);
  }

  return username;
}

async function parseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function isVerifyResponse(value: unknown): value is { access_token: string; refresh_token?: string; expires_in?: number; user: { id: string; email: string; user_metadata?: SupabaseAuthUserResponse["user_metadata"] } } {
  return Boolean(
    value &&
    typeof value === "object" &&
    typeof (value as { access_token?: unknown }).access_token === "string" &&
    (value as { user?: unknown }).user &&
    isAuthUser((value as { user: unknown }).user),
  );
}

function isAuthUser(value: unknown): value is { id: string; email: string; user_metadata?: SupabaseAuthUserResponse["user_metadata"] } {
  return Boolean(
    value &&
    typeof value === "object" &&
    typeof (value as SupabaseAuthUserResponse).id === "string" &&
    typeof (value as SupabaseAuthUserResponse).email === "string",
  );
}

function isAuthUserEmailVerified(user: SupabaseAuthUserResponse): boolean {
  return Boolean(parseAuthDate(user.email_confirmed_at) || parseAuthDate(user.confirmed_at));
}

function parseAuthDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getMetadataName(user: { user_metadata?: SupabaseAuthUserResponse["user_metadata"] }): string | undefined {
  const value = user.user_metadata?.display_name ?? user.user_metadata?.name;
  return typeof value === "string" && value.trim() ? value : undefined;
}

function validateUuid(value: string, fieldName: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new AuthError(`${fieldName} must be a UUID.`, 400);
  }
}
