import { createHmac } from "node:crypto";
import { createSupabaseRestClient, type SupabaseRestClient } from "@/lib/supabase/rest-client";
import { assertSupabaseServerConfig } from "@/lib/supabase/server";
import { deleteSupabaseAdminAuthUser, isSupabaseAdminAuthUserDeactivated, readSupabaseAdminAuthUser, type SupabaseAdminAuthUser } from "./auth-admin";
import {
  createInternalCredentialEmailFromNormalizedUsername,
  isInternalCredentialEmail,
  toPublicCredentialEmail,
} from "./internal-credential-email";
import { assertAuthRateLimit } from "./rate-limit";
import {
  AuthError,
  getSupabaseAuthConfig,
  upsertAndReadProfile,
  type AuthenticatedAccount,
  type SupabaseAuthSession,
} from "./session";

const genericLoginMessage = "Email/username or code is incorrect.";
const genericRecoveryMessage = "If the email address is registered, we have sent instructions for creating a new code.";
export const usernameOnlyRecoveryMessage = "This account does not have email recovery. Ask an administrator to reset the code.";
const invalidRecoveryLinkMessage = "The link is invalid or expired.";
const unverifiedEmailMessage = "Email is not verified.";
const stalePendingAccountMs = 24 * 60 * 60 * 1000;

export { isInternalCredentialEmail, toPublicCredentialEmail } from "./internal-credential-email";

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
  created_at?: unknown;
  confirmed_at?: unknown;
  email_confirmed_at?: unknown;
  user_metadata?: {
    display_name?: unknown;
    name?: unknown;
    username?: unknown;
  };
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

export function createInternalCredentialEmail(username: string): string {
  return createInternalCredentialEmailFromNormalizedUsername(normalizeUsername(username));
}

export async function createCredentialAccount(input: {
  displayName: string;
  username: string;
  email: string;
  code: string;
  repeatCode: string;
  emailRedirectTo?: string;
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
    const pendingResult = await handlePendingCredentialProfile({
      profile: existingUsername,
      requestedEmail: email,
      redirectTo: input.emailRedirectTo,
      client,
    });

    if (pendingResult.account) {
      return {
        account: pendingResult.account,
        verificationRequired: true,
      };
    }

    if (!pendingResult.cleanedUp) {
      throw new AuthError("Username is not available.", 409);
    }
  }

  const existingEmail = await readProfileByEmail(email, client);

  if (existingEmail) {
    const pendingResult = await handlePendingCredentialProfile({
      profile: existingEmail,
      requestedEmail: email,
      redirectTo: input.emailRedirectTo,
      client,
    });

    if (pendingResult.account) {
      return {
        account: pendingResult.account,
        verificationRequired: true,
      };
    }

    if (!pendingResult.cleanedUp) {
      throw new AuthError("Email is already used.", 409);
    }
  }

  const authResult = await createUnconfirmedAuthUserWithPassword({
    email,
    password: toSupabaseCredentialPassword(email, code),
    displayName,
    username,
    redirectTo: input.emailRedirectTo,
  });
  const authUser = authResult.user;

  if (!authUser?.id || !authUser.email) {
    throw new AuthError("Account could not be created.", 502);
  }

  if (isAuthUserEmailVerified(authUser)) {
    await deleteAuthUserBestEffort(authUser.id);
    throw new AuthError("Email verification is not configured.", 503);
  }

  let account: AuthenticatedAccount;

  try {
    account = await upsertAndReadProfile({
      userId: authUser.id,
      email: authUser.email,
      displayName,
      username,
      updateExistingDisplayName: true,
    }, client);
  } catch (error) {
    await deleteAuthUserBestEffort(authUser.id);
    throw error;
  }

  return {
    account,
    verificationRequired: true,
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
    await assertCredentialAuthUserIsActive(authResult.user.id);
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

    if (error instanceof AuthError && error.message === unverifiedEmailMessage) {
      throw error;
    }

    throw new AuthError(genericLoginMessage, 401);
  }
}

export async function requestLoginCodeRecovery(input: { email: string; redirectTo?: string; rateLimitKey?: string }): Promise<{ message: string }> {
  const identifier = input.email.trim();
  const lookupKey = identifier.toLocaleLowerCase("en");

  try {
    assertAuthRateLimit("credential-recovery", `${input.rateLimitKey ?? "unknown"}:${lookupKey}`, { limit: 5, windowMs: 60 * 60 * 1000 });
  } catch (error) {
    logCredentialRecoveryDiagnostic("app_rate_limited", { status: 429, category: "app_recovery_rate_limit" });
    throw error;
  }

  const client = createSupabaseRestClient();
  const profile = identifier.includes("@")
    ? await readProfileByEmail(normalizeCredentialEmail(identifier), client)
    : await readProfileByUsername(normalizeUsername(identifier), client);

  if (profile && isInternalCredentialEmail(profile.email)) {
    return {
      message: usernameOnlyRecoveryMessage,
    };
  }

  const email = normalizeCredentialEmail(profile?.email ?? identifier);
  const authUser = profile ? await readSupabaseAdminAuthUser(profile.user_id) : null;

  if (!authUser || !isAuthUserEmailVerified(authUser)) {
    logCredentialRecoveryDiagnostic("skipped", {
      status: 200,
      category: authUser ? "unverified_or_inactive_account" : "no_verified_profile",
    });
    return {
      message: genericRecoveryMessage,
    };
  }

  const config = getSupabaseAuthConfig();
  const response = await fetch(`${config.url}/auth/v1/recover`, {
    method: "POST",
    headers: getAuthHeaders(config.anonKey),
    body: JSON.stringify({
      email,
      redirect_to: input.redirectTo,
    }),
  });
  const body = await parseJson(response);
  const category = response.ok ? "accepted" : getAuthFailureCategory(body);

  logCredentialRecoveryDiagnostic("supabase_recover_response", {
    status: response.status,
    category,
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

export async function changeOwnLoginCode(input: {
  accessToken: string | undefined;
  currentCode: string;
  newCode: string;
  repeatNewCode: string;
  rateLimitKey?: string;
  client?: SupabaseRestClient;
}): Promise<void> {
  if (!input.accessToken) {
    throw new AuthError();
  }

  const currentCode = normalizeLoginCode(input.currentCode);
  const newCode = normalizeLoginCode(input.newCode);

  if (normalizeLoginCode(input.repeatNewCode) !== newCode) {
    throw new AuthError("Login codes do not match.", 400);
  }

  const config = getSupabaseAuthConfig();
  const authUser = await readAuthUserForCredentialUpdate(input.accessToken, config.anonKey);
  assertAuthRateLimit("credential-change-code", `${input.rateLimitKey ?? "unknown"}:${authUser.id}`, { limit: 8, windowMs: 60 * 60 * 1000 });

  const verified = await loginWithCredential({
    identifier: authUser.email,
    code: currentCode,
    rateLimitKey: input.rateLimitKey,
    client: input.client,
  });

  if (verified.account.userId !== authUser.id) {
    throw new AuthError("Current login code is incorrect.", 401);
  }

  await updateLoginCodeWithSession({
    accessToken: input.accessToken,
    code: newCode,
    repeatCode: newCode,
  });
}

export async function completeLoginCodeRecovery(input: { tokenHash?: string; accessToken?: string; type: string; code: string; repeatCode: string; rateLimitKey?: string }): Promise<void> {
  const tokenHash = input.tokenHash?.trim() ?? "";
  const accessToken = input.accessToken?.trim() ?? "";
  const type = input.type.trim();
  const code = normalizeLoginCode(input.code);

  if (normalizeLoginCode(input.repeatCode) !== code) {
    throw new AuthError("Login codes do not match.", 400);
  }

  assertAuthRateLimit("credential-recovery-complete", `${input.rateLimitKey ?? "unknown"}:${(tokenHash || accessToken).slice(0, 32)}`, { limit: 8, windowMs: 60 * 60 * 1000 });

  if (type !== "recovery" || (!tokenHash && !accessToken)) {
    throw new AuthError(invalidRecoveryLinkMessage, 400);
  }

  if (accessToken) {
    await updateLoginCodeWithSession({
      accessToken,
      code,
      repeatCode: code,
    });
    return;
  }

  const config = getSupabaseAuthConfig();
  const response = await fetch(`${config.url}/auth/v1/verify`, {
    method: "POST",
    headers: getAuthHeaders(config.anonKey),
    body: JSON.stringify({
      token_hash: tokenHash,
      type: "recovery",
    }),
  });
  const body = await parseJson(response);

  if (!response.ok || !isPasswordSession(body)) {
    logCredentialAuthFailure("verify_recovery_token", response.status || 400, body);
    throw new AuthError(invalidRecoveryLinkMessage, 400);
  }

  await updateLoginCodeWithSession({
    accessToken: String(body.access_token),
    code,
    repeatCode: code,
  });
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

async function handlePendingCredentialProfile(input: {
  profile: CredentialProfileRow;
  requestedEmail: string;
  redirectTo?: string;
  client: SupabaseRestClient;
}): Promise<{ account?: AuthenticatedAccount; cleanedUp: boolean }> {
  const authUser = await readSupabaseAdminAuthUser(input.profile.user_id);

  if (!authUser) {
    return { cleanedUp: false };
  }

  if (isAuthUserEmailVerified(authUser)) {
    return { cleanedUp: false };
  }

  if (await canReleaseStalePendingCredentialProfile(authUser, input.client)) {
    await deleteAuthUser(authUser.id);
    return { cleanedUp: true };
  }

  if (input.profile.email === input.requestedEmail) {
    await sendSignupVerificationEmail({
      email: input.requestedEmail,
      redirectTo: input.redirectTo,
    });

    return {
      account: profileToAccount(input.profile, input.requestedEmail),
      cleanedUp: false,
    };
  }

  return { cleanedUp: false };
}

export async function resendCredentialVerification(input: { email: string; redirectTo?: string; rateLimitKey?: string }): Promise<{ message: string }> {
  const email = normalizeCredentialEmail(input.email);
  assertAuthRateLimit("credential-verification-resend", `${input.rateLimitKey ?? "unknown"}:${email}`, { limit: 3, windowMs: 60 * 60 * 1000 });

  const client = createSupabaseRestClient();
  const profile = await readProfileByEmail(email, client);
  const authUser = profile ? await readSupabaseAdminAuthUser(profile.user_id) : null;

  if (authUser && !isAuthUserEmailVerified(authUser)) {
    await sendSignupVerificationEmail({
      email,
      redirectTo: input.redirectTo,
    });
  }

  return {
    message: "If the email can be verified, we have sent a new verification email.",
  };
}

export async function verifyCredentialEmailToken(input: { tokenHash: string; type: string }): Promise<void> {
  const tokenHash = input.tokenHash.trim();
  const type = input.type.trim();

  if (!tokenHash || !/^(email|signup)$/.test(type)) {
    throw new AuthError("Verification link is invalid.", 400);
  }

  const config = getSupabaseAuthConfig();
  const response = await fetch(`${config.url}/auth/v1/verify`, {
    method: "POST",
    headers: getAuthHeaders(config.anonKey),
    body: JSON.stringify({
      token_hash: tokenHash,
      type,
    }),
  });
  const body = await parseJson(response);

  if (!response.ok) {
    logCredentialAuthFailure("verify_signup_email", response.status || 400, body);
    throw new AuthError("Email verification failed.", response.status || 401);
  }
}

async function createUnconfirmedAuthUserWithPassword(input: { email: string; password: string; displayName: string; username: string; redirectTo?: string }): Promise<{ user: SupabaseAuthUser & { id: string; email: string } }> {
  const config = getSupabaseAuthConfig();
  const response = await fetch(`${config.url}/auth/v1/signup`, {
    method: "POST",
    headers: getAuthHeaders(config.anonKey),
    body: JSON.stringify({
      email: input.email,
      password: input.password,
      data: {
        display_name: input.displayName,
        username: input.username,
      },
      email_redirect_to: input.redirectTo,
    }),
  });
  const body = await parseJson(response);
  const user = getAuthUserFromBody(body);

  if (!response.ok || !user) {
    logCredentialAuthFailure("signup_user", response.status || 400, body);

    if (isDuplicateEmailAuthError(body)) {
      throw new AuthError("Email is already used.", 409);
    }

    throw new AuthError("Account could not be created.", response.status || 400);
  }

  return {
    user: {
      id: String(user.id),
      email: String(user.email),
      created_at: user.created_at,
      confirmed_at: user.confirmed_at,
      email_confirmed_at: user.email_confirmed_at,
      user_metadata: user.user_metadata,
    },
  };
}

async function deleteAuthUserBestEffort(userId: string): Promise<void> {
  try {
    await deleteAuthUser(userId);
  } catch {
    // Keep the original registration failure. The user-facing error remains generic.
  }
}

async function deleteAuthUser(userId: string): Promise<void> {
  try {
    await deleteSupabaseAdminAuthUser(userId);
  } catch {
    throw new AuthError("Pending account could not be released.", 500);
  }
}

async function sendSignupVerificationEmail(input: { email: string; redirectTo?: string }): Promise<void> {
  const config = getSupabaseAuthConfig();
  const response = await fetch(`${config.url}/auth/v1/resend`, {
    method: "POST",
    headers: getAuthHeaders(config.anonKey),
    body: JSON.stringify({
      type: "signup",
      email: input.email,
      email_redirect_to: input.redirectTo,
    }),
  });
  const body = await parseJson(response);

  if (!response.ok && response.status >= 500) {
    logCredentialAuthFailure("resend_signup_email", response.status || 500, body);
    throw new AuthError("Verification email could not be sent.", response.status || 500);
  }
}

async function canReleaseStalePendingCredentialProfile(authUser: SupabaseAuthUser & { id: string; email: string }, client: SupabaseRestClient): Promise<boolean> {
  const createdAt = parseAuthDate(authUser.created_at);

  if (!createdAt || Date.now() - createdAt.getTime() < stalePendingAccountMs) {
    return false;
  }

  return !(await hasUserDataReferences(authUser.id, client));
}

async function hasUserDataReferences(userId: string, client: SupabaseRestClient): Promise<boolean> {
  const encodedUserId = encodeURIComponent(userId);
  const checks = await Promise.all([
    client.select<{ id: string }>("tournaments", `owner_user_id=eq.${encodedUserId}&select=id&limit=1`),
    client.select<{ id: string }>("tournaments", `updated_by_user_id=eq.${encodedUserId}&select=id&limit=1`),
    client.select<{ id: string }>("matches", `updated_by_user_id=eq.${encodedUserId}&select=id&limit=1`),
  ]);

  return checks.some((rows) => rows.length > 0);
}

async function passwordGrantWithCredential(email: string, code: string): Promise<{ session: SupabaseAuthSession; user: { id: string; email: string; user_metadata?: SupabaseAuthUser["user_metadata"] } }> {
  try {
    return await passwordGrant(email, toSupabaseCredentialPassword(email, code));
  } catch (error) {
    if (error instanceof AuthError && (error.status === 429 || error.message === unverifiedEmailMessage)) {
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
    if (isUnverifiedAuthError(body)) {
      throw new AuthError(unverifiedEmailMessage, 403);
    }

    throw new AuthError(genericLoginMessage, 401);
  }

  if (!isAuthUserEmailVerified(body.user as SupabaseAuthUser)) {
    throw new AuthError(unverifiedEmailMessage, 403);
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

  if (!isAuthUserEmailVerified(body)) {
    throw new AuthError(unverifiedEmailMessage, 403);
  }

  await assertCredentialAuthUserIsActive(String(body.id));

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

export function toSupabaseCredentialPassword(email: string, code: string): string {
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

async function assertCredentialAuthUserIsActive(userId: string): Promise<void> {
  const authUser = await readSupabaseAdminAuthUser(userId);

  if (!authUser || isSupabaseAdminAuthUserDeactivated(authUser)) {
    throw new AuthError(genericLoginMessage, 401);
  }
}

function logCredentialAuthFailure(operation: string, status: number, body: unknown): void {
  console.warn("[auth.credentials] Supabase Auth operation failed", {
    operation,
    status,
    category: getAuthFailureCategory(body),
  });
}

function logCredentialRecoveryDiagnostic(event: string, details: { status: number; category: string }): void {
  console.info("[auth.credentials.recovery] diagnostic", {
    event,
    at: new Date().toISOString(),
    status: details.status,
    category: details.category,
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

function getAuthUserFromBody(value: unknown): SupabaseAuthUser & { id: string; email: string } | null {
  if (isAuthUser(value)) {
    return value;
  }

  const nested = (value as { user?: unknown } | null)?.user;
  return isAuthUser(nested) ? nested : null;
}

function isAuthUserEmailVerified(user: SupabaseAuthUser | SupabaseAdminAuthUser): boolean {
  return Boolean(parseAuthDate(user.email_confirmed_at) || parseAuthDate(user.confirmed_at));
}

function parseAuthDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isUnverifiedAuthError(body: unknown): boolean {
  const category = getAuthFailureCategory(body).toLocaleLowerCase("en");
  return (
    category.includes("email not confirmed") ||
    category.includes("email_not_confirmed") ||
    category.includes("not confirmed") ||
    category.includes("not verified")
  );
}

function profileToAccount(profile: CredentialProfileRow, fallbackEmail: string): AuthenticatedAccount {
  return {
    userId: profile.user_id,
    email: toPublicCredentialEmail(profile.email ?? fallbackEmail),
    displayName: profile.display_name ?? profile.username ?? fallbackEmail.split("@")[0],
    username: profile.username ?? undefined,
    role: profile.role,
  };
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
