import { cookies } from "next/headers";
import {
  AuthError,
  assertAdminAccount,
  authAccessCookieName,
  authRefreshCookieName,
  type AccountRole,
  type SupabaseAuthSession,
} from "./session";
import { adminRememberMaxAgeSeconds, createAdminRememberValue, getAdminRememberSecondsLeft, isAdminRememberValue, isAdminSignInTooOld, nowInSeconds, readAdminRememberIssuedAt } from "./admin-remember";

export const authRememberCookieName = "lezgo_auth_remember";

export async function readAuthAccessCookie(): Promise<string | undefined> {
  return (await cookies()).get(authAccessCookieName)?.value;
}

export async function readAuthRefreshCookie(): Promise<string | undefined> {
  return (await cookies()).get(authRefreshCookieName)?.value;
}

export async function readAuthRememberCookie(): Promise<boolean> {
  return (await cookies()).get(authRememberCookieName)?.value === "1";
}

export async function readAuthRememberedSessionCookie(): Promise<boolean> {
  const cookieStore = await cookies();
  return hasRememberedSession(cookieStore);
}

/** The signed sign-in time of a remembered ADMIN session for this user, or null (not remembered, expired, forged). */
export async function readAuthAdminRememberIssuedAt(userId: string): Promise<number | null> {
  return readAdminRememberIssuedAt((await cookies()).get(authRememberCookieName)?.value, userId);
}

export async function assertFreshAdminAccountFromCookies(): ReturnType<typeof assertAdminAccount> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(authAccessCookieName)?.value;
  const account = await assertAdminAccount(accessToken);
  const rememberValue = cookieStore.get(authRememberCookieName)?.value;

  // Server-side limit, independent of cookies: admin work needs a sign-in from the last 30 days.
  if (isAdminSignInTooOld(accessToken)) {
    throw new AuthError("Admin access requires a fresh login.", 403);
  }

  // A remembered session is accepted for admin work only when it is a signed ADMIN remember session for
  // this admin inside its 30 days. A USER "Husk mig" session that was later promoted to admin is not.
  if (hasRememberedSession(cookieStore) && readAdminRememberIssuedAt(rememberValue, account.userId) === null) {
    throw new AuthError("Admin access requires a fresh login.", 403);
  }

  return account;
}

// "Husk mig" should never log a user out. Whenever the short-lived access token has expired (about once an
// hour while the app is used), /api/auth/me refreshes the session and sets these cookies again, so this is
// a sliding window: only a user who does not open the app for 400 days must sign in again. 400 days is the
// longest cookie lifetime browsers accept (Chrome caps Max-Age there). Trade-off: a stolen refresh cookie
// also stays usable that long; signing out (or "log ud på alle enheder") revokes it.
// Admins are different: at most 30 days after the sign-in, never sliding (see admin-remember.ts).
export const rememberedLoginMaxAgeSeconds = 60 * 60 * 24 * 400;

export function createAuthCookieHeaders(
  session: SupabaseAuthSession,
  options: {
    remember?: boolean;
    accountRole?: AccountRole;
    /** Required to remember an ADMIN session; the remember cookie is signed for this user id. */
    userId?: string;
    /** When refreshing a remembered ADMIN session: its original sign-in time, so the 30 days never move. */
    adminRememberIssuedAt?: number;
    nowSeconds?: number;
  } = {},
): Headers {
  const headers = new Headers();
  const secure = process.env.NODE_ENV === "production";
  const rememberUser = Boolean(options.remember && options.accountRole === "user");
  const adminRemember = rememberUser ? null : createAdminRememberCookie(options);
  const accessMaxAge = rememberUser
    ? Math.max(60, Math.min(session.expiresIn ?? 3600, 60 * 60 * 24 * 7))
    : adminRemember
    ? Math.max(60, Math.min(session.expiresIn ?? 3600, adminRemember.maxAge))
    : undefined;
  headers.append("Set-Cookie", serializeCookie(authAccessCookieName, session.accessToken, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: accessMaxAge,
  }));

  if (session.refreshToken && rememberUser) {
    headers.append("Set-Cookie", serializeCookie(authRefreshCookieName, session.refreshToken, {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: rememberedLoginMaxAgeSeconds,
    }));
    headers.append("Set-Cookie", serializeCookie(authRememberCookieName, "1", {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: rememberedLoginMaxAgeSeconds,
    }));
  } else if (session.refreshToken && adminRemember) {
    headers.append("Set-Cookie", serializeCookie(authRefreshCookieName, session.refreshToken, {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: adminRemember.maxAge,
    }));
    headers.append("Set-Cookie", serializeCookie(authRememberCookieName, adminRemember.value, {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: adminRemember.maxAge,
    }));
  } else {
    appendExpiredAuthCookie(headers, authRefreshCookieName, secure);
    appendExpiredAuthCookie(headers, authRememberCookieName, secure);
  }

  return headers;
}

function createAdminRememberCookie(options: { remember?: boolean; accountRole?: AccountRole; userId?: string; adminRememberIssuedAt?: number; nowSeconds?: number }): { value: string; maxAge: number } | null {
  if (!options.remember || options.accountRole !== "admin" || !options.userId) {
    return null;
  }

  const now = options.nowSeconds ?? nowInSeconds();
  const issuedAt = options.adminRememberIssuedAt ?? now;
  const maxAge = Math.min(adminRememberMaxAgeSeconds, getAdminRememberSecondsLeft(issuedAt, now));

  // Less than a minute left: let the session end instead of setting a cookie that expires immediately.
  if (maxAge < 60) {
    return null;
  }

  try {
    return { value: createAdminRememberValue(options.userId, issuedAt), maxAge };
  } catch {
    // No signing secret configured: fall back to the old behaviour (admin sessions are not remembered).
    return null;
  }
}

export function createLogoutCookieHeaders(): Headers {
  const headers = new Headers();
  const secure = process.env.NODE_ENV === "production";
  const options = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    path: "/",
    maxAge: 0,
  };
  headers.append("Set-Cookie", serializeCookie(authAccessCookieName, "", options));
  headers.append("Set-Cookie", serializeCookie(authRefreshCookieName, "", options));
  headers.append("Set-Cookie", serializeCookie(authRememberCookieName, "", options));
  return headers;
}

function appendExpiredAuthCookie(headers: Headers, name: string, secure: boolean): void {
  headers.append("Set-Cookie", serializeCookie(name, "", {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 0,
  }));
}

function hasRememberedSession(cookieStore: Awaited<ReturnType<typeof cookies>>): boolean {
  const rememberValue = cookieStore.get(authRememberCookieName)?.value;
  return (rememberValue === "1" || isAdminRememberValue(rememberValue))
    && Boolean(cookieStore.get(authRefreshCookieName)?.value);
}

function serializeCookie(name: string, value: string, options: { httpOnly: boolean; sameSite: "lax"; secure: boolean; path: string; maxAge?: number }): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${options.path}`,
    `SameSite=${options.sameSite}`,
  ];

  if (typeof options.maxAge === "number") {
    parts.splice(2, 0, `Max-Age=${options.maxAge}`);

    if (options.maxAge === 0) {
      parts.splice(3, 0, "Expires=Thu, 01 Jan 1970 00:00:00 GMT");
    }
  }

  if (options.httpOnly) {
    parts.push("HttpOnly");
  }

  if (options.secure) {
    parts.push("Secure");
  }

  return parts.join("; ");
}
