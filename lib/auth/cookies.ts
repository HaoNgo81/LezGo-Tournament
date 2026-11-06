import { cookies } from "next/headers";
import {
  AuthError,
  assertAdminAccount,
  authAccessCookieName,
  authRefreshCookieName,
  type AccountRole,
  type SupabaseAuthSession,
} from "./session";

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

export async function assertFreshAdminAccountFromCookies(): ReturnType<typeof assertAdminAccount> {
  const cookieStore = await cookies();
  const account = await assertAdminAccount(cookieStore.get(authAccessCookieName)?.value);

  if (hasRememberedSession(cookieStore)) {
    throw new AuthError("Admin access requires a fresh login.", 403);
  }

  return account;
}

// "Husk mig" should never log a user out. Every visit renews these cookies (/api/auth/me refreshes the
// session), so this is a sliding window: only a user who does not open the app for 400 days must sign in
// again. 400 days is the longest cookie lifetime browsers accept (Chrome caps Max-Age there).
export const rememberedLoginMaxAgeSeconds = 60 * 60 * 24 * 400;

export function createAuthCookieHeaders(
  session: SupabaseAuthSession,
  options: { remember?: boolean; accountRole?: AccountRole } = {},
): Headers {
  const headers = new Headers();
  const secure = process.env.NODE_ENV === "production";
  const rememberUser = Boolean(options.remember && options.accountRole === "user");
  const accessMaxAge = rememberUser
    ? Math.max(60, Math.min(session.expiresIn ?? 3600, 60 * 60 * 24 * 7))
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
  } else {
    appendExpiredAuthCookie(headers, authRefreshCookieName, secure);
    appendExpiredAuthCookie(headers, authRememberCookieName, secure);
  }

  return headers;
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
  return cookieStore.get(authRememberCookieName)?.value === "1"
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
