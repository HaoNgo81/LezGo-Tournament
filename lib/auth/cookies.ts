import { cookies } from "next/headers";
import { authAccessCookieName, authRefreshCookieName, type SupabaseAuthSession } from "./session";

export async function readAuthAccessCookie(): Promise<string | undefined> {
  return (await cookies()).get(authAccessCookieName)?.value;
}

export function createAuthCookieHeaders(session: SupabaseAuthSession): Headers {
  const headers = new Headers();
  const secure = process.env.NODE_ENV === "production";
  const maxAge = Math.max(60, Math.min(session.expiresIn ?? 3600, 60 * 60 * 24 * 7));
  headers.append("Set-Cookie", serializeCookie(authAccessCookieName, session.accessToken, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge,
  }));

  if (session.refreshToken) {
    headers.append("Set-Cookie", serializeCookie(authRefreshCookieName, session.refreshToken, {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    }));
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
  return headers;
}

function serializeCookie(name: string, value: string, options: { httpOnly: boolean; sameSite: "lax"; secure: boolean; path: string; maxAge: number }): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${options.path}`,
    `Max-Age=${options.maxAge}`,
    `SameSite=${options.sameSite}`,
  ];

  if (options.httpOnly) {
    parts.push("HttpOnly");
  }

  if (options.secure) {
    parts.push("Secure");
  }

  return parts.join("; ");
}
