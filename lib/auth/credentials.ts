import { createHmac } from "node:crypto";
import { createSupabaseRestClient, type SupabaseRestClient } from "@/lib/supabase/rest-client";
import { assertSupabaseServerConfig } from "@/lib/supabase/server";
import { assertAuthRateLimit } from "./rate-limit";
import {
  AuthError,
  getSupabaseAuthConfig,
  upsertAndReadProfile,
  type AuthenticatedAccount,
  type SupabaseAuthSession,
} from "./session";

const genericLoginMessage = "Email/username or code is incorrect.";
const genericRecoveryMessage = "If the email is linked to an account, we have sent recovery instructions.";

interface CredentialProfileRow {
  user_id: string;
  display_name: string | null;
  role: "admin" | "user";
  username: string | null;
  email: string | null;
}

interface SupabasePasswordAuthResponse {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
  user?: unknown;
}

interface SupabaseAuthUser {
  id?: unknown;
  email?: unknown;
  user_metadata?: {
    display_name?: unknown;
    name?: unknown;
    username?: unknown;
  };
}

interface SupabaseAdminAuthConfig {
  url: string;
  serviceRoleKey: string;
}

export function normalizeUsername(value: string): string {
  const username = value.trim().toLocaleLowerCase("en");

  if (!/^[a-z0-9_]{3,30}$/.test(username)) {
    throw new AuthError("Username is invalid.", 400);
  }

  return username;
}

export function normalizeLoginCode(value: string): string {
  const code = value.trim().toLocaleUpperCase("en");

  if (!/^[A-Z0-9]{6}$/.test(code)) {
    throw new AuthError("Login code is invalid.", 400);
  }

  return code;
}

export function normalizeCredentialEmail(value: string): string {
  const email = value.trim().toLocaleLowerCase("en");

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AuthError("Email is invalid.", 400);
  }

  return email;
}

export async function createCredentialAccount(input: {
  displayName: string;
  username: string;
  email: string;
  code: string;
  repeatCode: string;
  rateLimitKey?: string;
  client?: SupabaseRestClient;
}): Promise<{ account: AuthenticatedAccount; verificationRequired: boolean }> {
  const displayName = sanitizeDisplayName(input.displayName);
  const username = normalizeUsername(input.username);
  const email = normalizeCredentialEmail(input.email);
  const code = normalizeLoginCode(input.code);

  if (normalizeLoginCode(input.repeatCode) !== code) {
    throw new AuthError("Login codes do not match.", 400);
  }

  assertAuthRateLimit("credential-signup", input.rateLimitKey ?? email, { limit: 8, windowMs: 15 * 60 * 1000 });

  const client = input.client ?? createSupabaseRestClient();
  const existingUsername = await readProfileByUsername(username, client);

  if (existingUsername) {
    throw new AuthError("Username is not available.", 409);
  }

  const existingEmail = await readProfileByEmail(email, client);

  if (existingEmail) {
    throw new AuthError("Email is already used.", 409);
  }

  const authResult = await createConfirmedAuthUserWithPassword({
    email,
    password: toSupabaseCredentialPassword(email, code),
    displayName,
    username,
  });
  const authUser = authResult.user;

  if (!authUser?.id || !authUser.email) {
    throw new AuthError("Account could not be created.", 502);
  }

  let account: AuthenticatedAccount;

  try {
    account = await upsertAndReadProfile({
      userId: authUser.id,
      email: authUser.email,
      displayName,
      username,
    }, client);
  } catch (error) {
    await deleteAuthUserBestEffort(authUser.id);
    throw error;
  }

  return {
    account,
    verificationRequired: false,
  };
}

export async function loginWithCredential(input: {
  identifier: string;
  code: string;
  rateLimitKey?: string;
  client?: SupabaseRestClient;
}): Promise<{ session: SupabaseAuthSession; account: AuthenticatedAccount }> {
  const identifier = input.identifier.trim();
  const normalizedCode = normalizeLoginCode(input.code);
  const client = input.client ?? createSupabaseRestClient();
  const lookupKey = identifier.toLocaleLowerCase("en");

  assertAuthRateLimit("credential-login", `${input.rateLimitKey ?? "unknown"}:${lookupKey}`, { limit: 8, windowMs: 15 * 60 * 1000 });

  try {
    const email = identifier.includes("@")
      ? normalizeCredentialEmail(identifier)
      : await resolveUsernameToEmail(identifier, client);
    const authResult = await passwordGrantWithCredential(email, normalizedCode);
    const account = await upsertAndReadProfile({
      userId: authResult.user.id,
      email: authResult.user.email,
      displayName: getMetadataName(authResult.user) ?? authResult.user.email.split("@")[0],
    }, client);

    return {
      session: authResult.session,
      account,
    };
  } catch (error) {
    if (error instanceof AuthError && error.status === 429) {
      throw error;
    }

    throw new AuthError(genericLoginMessage, 401);
  }
}

export async function requestLoginCodeRecovery(input: { email: string; redirectTo?: string; rateLimitKey?: string }): Promise<{ message: string }> {
  const email = normalizeCredentialEmail(input.email);
  assertAuthRateLimit("credential-recovery", `${input.rateLimitKey ?? "unknown"}:${email}`, { limit: 5, windowMs: 60 * 60 * 1000 });

  const config = getSupabaseAuthConfig();
  const response = await fetch(`${config.url}/auth/v1/recover`, {
    method: "POST",
    headers: getAuthHeaders(config.anonKey),
    body: JSON.stringify({
      email,
      options: {
        redirect_to: input.redirectTo,
      },
    }),
  });

  if (!response.ok && response.status >= 500) {
    throw new AuthError("Recovery email could not be sent.", response.status);
  }

  return {
    message: genericRecoveryMessage,
  };
}

export async function updateLoginCodeWithSession(input: { accessToken: string | undefined; code: string; repeatCode: string }): Promise<void> {
  if (!input.accessToken) {
    throw new AuthError();
  }

  const code = normalizeLoginCode(input.code);

  if (normalizeLoginCode(input.repeatCode) !== code) {
    throw new AuthError("Login codes do not match.", 400);
  }

  const config = getSupabaseAuthConfig();
  const authUser = await readAuthUserForCredentialUpdate(input.accessToken, config.anonKey);
  const response = await fetch(`${config.url}/auth/v1/user`, {
    method: "PUT",
    headers: {
      apikey: config.anonKey,
      authorization: `Bearer ${input.accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      password: toSupabaseCredentialPassword(authUser.email, code),
    }),
  });

  if (!response.ok) {
    throw new AuthError("Login code could not be updated.", response.status || 401);
  }
}

async function resolveUsernameToEmail(identifier: string, client: SupabaseRestClient): Promise<string> {
  const username = normalizeUsername(identifier);
  const profile = await readProfileByUsername(username, client);

  if (!profile?.email) {
    throw new AuthError(genericLoginMessage, 401);
  }

  return profile.email;
}

async function readProfileByUsername(username: string, client: SupabaseRestClient): Promise<CredentialProfileRow | null> {
  const [profile] = await client.select<CredentialProfileRow>(
    "profiles",
    `username_normalized=eq.${encodeURIComponent(username)}&select=user_id,display_name,role,username,email&limit=1`,
  );
  return profile ?? null;
}

async function readProfileByEmail(email: string, client: SupabaseRestClient): Promise<CredentialProfileRow | null> {
  const [profile] = await client.select<CredentialProfileRow>(
    "profiles",
    `email_normalized=eq.${encodeURIComponent(email)}&select=user_id,display_name,role,username,email&limit=1`,
  );
  return profile ?? null;
}

async function createConfirmedAuthUserWithPassword(input: { email: string; password: string; displayName: string; username: string }): Promise<{ user: { id: string; email: string; user_metadata?: SupabaseAuthUser["user_metadata"] } }> {
  const config = getSupabaseAdminAuthConfig();
  const response = await fetch(`${config.url}/auth/v1/admin/users`, {
    method: "POST",
    headers: getAdminAuthHeaders(config),
    body: JSON.stringify({
      email: input.email,
      password: input.password,
      email_confirm: true,
      data: {
        display_name: input.displayName,
        username: input.username,
      },
    }),
  });
  const body = await parseJson(response);
  const user = getAuthUserFromAdminBody(body);

  if (!response.ok || !user) {
    logCredentialAuthFailure("admin_create_user", response.status || 400, body);

    if (isDuplicateEmailAuthError(body)) {
      throw new AuthError("Email is already used.", 409);
    }

    throw new AuthError("Account could not be created.", response.status || 400);
  }

  return {
    user: {
      id: String(user.id),
      email: String(user.email),
      user_metadata: user.user_metadata,
    },
  };
}

async function deleteAuthUserBestEffort(userId: string): Promise<void> {
  try {
    const config = getSupabaseAdminAuthConfig();
    await fetch(`${config.url}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
      method: "DELETE",
      headers: getAdminAuthHeaders(config),
    });
  } catch {
    // Keep the original registration failure. The user-facing error remains generic.
  }
}

async function passwordGrantWithCredential(email: string, code: string): Promise<{ session: SupabaseAuthSession; user: { id: string; email: string; user_metadata?: SupabaseAuthUser["user_metadata"] } }> {
  try {
    return await passwordGrant(email, toSupabaseCredentialPassword(email, code));
  } catch (error) {
    if (error instanceof AuthError && error.status === 429) {
      throw error;
    }

    // Compatibility for any account created before STEP 25I-C1-C3 stored the
    // raw 6-character LEZGO code as the Supabase password.
    return passwordGrant(email, code);
  }
}

async function passwordGrant(email: string, password: string): Promise<{ session: SupabaseAuthSession; user: { id: string; email: string; user_metadata?: SupabaseAuthUser["user_metadata"] } }> {
  const config = getSupabaseAuthConfig();
  const response = await fetch(`${config.url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: getAuthHeaders(config.anonKey),
    body: JSON.stringify({
      email,
      password,
    }),
  });
  const body = await parseJson(response);

  if (!response.ok || !isPasswordSession(body)) {
    throw new AuthError(genericLoginMessage, 401);
  }

  return {
    session: toSession(body),
    user: {
      id: String((body.user as SupabaseAuthUser).id),
      email: String((body.user as SupabaseAuthUser).email),
      user_metadata: (body.user as SupabaseAuthUser).user_metadata,
    },
  };
}

async function readAuthUserForCredentialUpdate(accessToken: string | undefined, anonKey: string): Promise<{ id: string; email: string }> {
  if (!accessToken) {
    throw new AuthError();
  }

  const config = getSupabaseAuthConfig();
  const response = await fetch(`${config.url}/auth/v1/user`, {
    method: "GET",
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${accessToken}`,
    },
  });
  const body = await parseJson(response);

  if (!response.ok || !isAuthUser(body)) {
    throw new AuthError("Authentication was denied.", response.status || 401);
  }

  return {
    id: String(body.id),
    email: String(body.email),
  };
}

function toSession(body: SupabasePasswordAuthResponse): SupabaseAuthSession {
  return {
    accessToken: String(body.access_token),
    refreshToken: typeof body.refresh_token === "string" ? body.refresh_token : undefined,
    expiresIn: typeof body.expires_in === "number" ? body.expires_in : undefined,
  };
}

function getAuthHeaders(anonKey: string): HeadersInit {
  return {
    apikey: anonKey,
    authorization: `Bearer ${anonKey}`,
    "content-type": "application/json",
  };
}

function getSupabaseAdminAuthConfig(): SupabaseAdminAuthConfig {
  const authConfig = getSupabaseAuthConfig();
  const serverConfig = assertSupabaseServerConfig();

  return {
    url: authConfig.url,
    serviceRoleKey: serverConfig.serviceRoleKey,
  };
}

function getAdminAuthHeaders(config: SupabaseAdminAuthConfig): HeadersInit {
  return {
    apikey: config.serviceRoleKey,
    authorization: `Bearer ${config.serviceRoleKey}`,
    "content-type": "application/json",
  };
}

function toSupabaseCredentialPassword(email: string, code: string): string {
  const normalizedEmail = normalizeCredentialEmail(email);
  const normalizedCode = normalizeLoginCode(code);
  const secret = getCredentialPasswordSecret();
  const digest = createHmac("sha256", secret)
    .update("lezgo-account-code-v1", "utf8")
    .update("\0", "utf8")
    .update(normalizedEmail, "utf8")
    .update("\0", "utf8")
    .update(normalizedCode, "utf8")
    .digest("base64url");

  return `LezGo1!${digest}`;
}

function getCredentialPasswordSecret(): string {
  const accountSecret = process.env.LEZGO_ACCOUNT_CREDENTIAL_SECRET?.trim();

  if (accountSecret) {
    return accountSecret;
  }

  const remoteSessionSecret = process.env.LEZGO_REMOTE_SESSION_SECRET?.trim();

  if (remoteSessionSecret) {
    return remoteSessionSecret;
  }

  return assertSupabaseServerConfig().serviceRoleKey;
}

function logCredentialAuthFailure(operation: string, status: number, body: unknown): void {
  console.warn("[auth.credentials] Supabase Auth operation failed", {
    operation,
    status,
    category: getAuthFailureCategory(body),
  });
}

function getAuthFailureCategory(body: unknown): string {
  if (!body || typeof body !== "object") {
    return "unknown";
  }

  const code = (body as { code?: unknown; error_code?: unknown }).code ?? (body as { code?: unknown; error_code?: unknown }).error_code;
  if (typeof code === "string" && code.trim()) {
    return code.trim().slice(0, 80);
  }

  const message = (body as { message?: unknown; error_description?: unknown }).message ?? (body as { message?: unknown; error_description?: unknown }).error_description;
  if (typeof message === "string" && message.trim()) {
    return message.trim().replace(/[^\w\s.-]/g, "").slice(0, 80);
  }

  return "unknown";
}

function isDuplicateEmailAuthError(body: unknown): boolean {
  const category = getAuthFailureCategory(body).toLocaleLowerCase("en");
  return category.includes("email") && (
    category.includes("already") ||
    category.includes("registered") ||
    category.includes("exists")
  );
}

async function parseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function isPasswordSession(value: unknown): value is Required<Pick<SupabasePasswordAuthResponse, "access_token" | "user">> & SupabasePasswordAuthResponse {
  return Boolean(
    value &&
    typeof value === "object" &&
    typeof (value as SupabasePasswordAuthResponse).access_token === "string" &&
    isAuthUser((value as SupabasePasswordAuthResponse).user),
  );
}

function isAuthUser(value: unknown): value is SupabaseAuthUser & { id: string; email: string } {
  return Boolean(
    value &&
    typeof value === "object" &&
    typeof (value as SupabaseAuthUser).id === "string" &&
    typeof (value as SupabaseAuthUser).email === "string",
  );
}

function getAuthUserFromAdminBody(value: unknown): SupabaseAuthUser & { id: string; email: string } | null {
  if (isAuthUser(value)) {
    return value;
  }

  const nested = (value as { user?: unknown } | null)?.user;
  return isAuthUser(nested) ? nested : null;
}

function getMetadataName(user: { user_metadata?: SupabaseAuthUser["user_metadata"] }): string | undefined {
  const value = user.user_metadata?.display_name ?? user.user_metadata?.name;
  return typeof value === "string" && value.trim() ? value : undefined;
}

function sanitizeDisplayName(value: string): string {
  const displayName = value.trim().replace(/\s+/g, " ").slice(0, 80);

  if (!displayName) {
    throw new AuthError("Name is required.", 400);
  }

  return displayName;
}
