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

export async function assertFreshAdminAccountFromCookies(): ReturnType<typeof assertAdminAccount> {
  const cookieStore = await cookies();
  const account = await assertAdminAccount(cookieStore.get(authAccessCookieName)?.value);

  if (cookieStore.get(authRememberCookieName)?.value === "1") {
    throw new AuthError("Admin access requires a fresh login.", 403);
  }

  return account;
}

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
      maxAge: 60 * 60 * 24 * 30,
    }));
    headers.append("Set-Cookie", serializeCookie(authRememberCookieName, "1", {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
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

function serializeCookie(name: string, value: string, options: { httpOnly: boolean; sameSite: "lax"; secure: boolean; path: string; maxAge?: number }): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${options.path}`,
    `SameSite=${options.sameSite}`,
  ];

  if (typeof options.maxAge === "number") {
    parts.splice(2, 0, `Max-Age=${options.maxAge}`);
  }

  if (options.httpOnly) {
    parts.push("HttpOnly");
  }

  if (options.secure) {
    parts.push("Secure");
  }

  return parts.join("; ");
}
