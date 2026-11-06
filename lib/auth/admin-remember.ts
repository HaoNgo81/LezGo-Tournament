import { createHmac, timingSafeEqual } from "node:crypto";
import { assertSupabaseServerConfig } from "@/lib/supabase/server";

// "Husk mig" for ADMIN accounts (owner decision 2026-11-06): an admin stays signed in for at most 30 days
// after the sign-in itself. Unlike users (400-day sliding window), refreshing the session never moves the
// limit. The sign-in time is kept in the remember cookie, signed with a server secret and bound to the
// admin's user id, so it cannot be moved forward by editing the cookie or reused for another account.

export const adminRememberMaxAgeSeconds = 60 * 60 * 24 * 30;

const valuePrefix = "admin.v1";
// Allow a little clock difference between servers before rejecting a sign-in time in the future.
const clockSkewSeconds = 60;
// A remember session with less than this left is treated as over (no point keeping it for seconds).
const minimumSecondsLeft = 60;
const minimumSecretLength = 16;

export function nowInSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

export function createAdminRememberValue(userId: string, issuedAtSeconds: number): string {
  return `${valuePrefix}.${issuedAtSeconds}.${sign(userId, issuedAtSeconds)}`;
}

export function isAdminRememberValue(value: string | undefined): boolean {
  return typeof value === "string" && value.startsWith(`${valuePrefix}.`);
}

/** The signed sign-in time if the value is valid for this admin and still inside the 30 days, else null. */
export function readAdminRememberIssuedAt(value: string | undefined, userId: string, now = nowInSeconds()): number | null {
  if (!isAdminRememberValue(value) || !userId) {
    return null;
  }

  const [, , issuedAtText, signature, extra] = (value as string).split(".");

  if (extra !== undefined || !issuedAtText || !signature || !/^[1-9]\d{0,11}$/.test(issuedAtText)) {
    return null;
  }

  const issuedAt = Number(issuedAtText);

  if (issuedAt > now + clockSkewSeconds || getAdminRememberSecondsLeft(issuedAt, now) < minimumSecondsLeft) {
    return null;
  }

  let expected: string;

  try {
    expected = sign(userId, issuedAt);
  } catch {
    return null;
  }

  const expectedBytes = Buffer.from(expected, "utf8");
  const actualBytes = Buffer.from(signature, "utf8");
  return expectedBytes.length === actualBytes.length && timingSafeEqual(expectedBytes, actualBytes) ? issuedAt : null;
}

export function getAdminRememberSecondsLeft(issuedAtSeconds: number, now = nowInSeconds()): number {
  return issuedAtSeconds + adminRememberMaxAgeSeconds - now;
}

/**
 * When the admin actually signed in, from the access token's `amr` claim. Supabase keeps this time when
 * the session is refreshed, so it is enforced on the server even if someone renews a copied refresh token
 * directly with Supabase and sends only the access cookie. Null when the token has no usable `amr`.
 * The token must already have been verified (assertAdminAccount does that against Supabase).
 */
export function readSignInTimeFromAccessToken(accessToken: string | undefined): number | null {
  const payload = accessToken?.split(".")[1];

  if (!payload) {
    return null;
  }

  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { amr?: Array<{ method?: unknown; timestamp?: unknown }> };
    // "token_refresh" entries move with every refresh, so they do not count as signing in.
    const times = (Array.isArray(claims.amr) ? claims.amr : [])
      .filter((entry) => entry?.method !== "token_refresh")
      .map((entry) => entry?.timestamp)
      .filter((time): time is number => typeof time === "number" && Number.isFinite(time));
    return times.length ? Math.max(...times) : null;
  } catch {
    return null;
  }
}

/** True when an admin access token comes from a sign-in more than 30 days ago. */
export function isAdminSignInTooOld(accessToken: string | undefined, now = nowInSeconds()): boolean {
  const signedInAt = readSignInTimeFromAccessToken(accessToken);
  return signedInAt !== null && now - signedInAt > adminRememberMaxAgeSeconds;
}

function sign(userId: string, issuedAtSeconds: number): string {
  const configuredSecret = process.env.LEZGO_REMOTE_SESSION_SECRET?.trim();
  const secret = configuredSecret || assertSupabaseServerConfig().serviceRoleKey.trim();

  if (secret.length < minimumSecretLength) {
    throw new Error("Admin remember signing secret is missing or too short.");
  }

  // The purpose label keeps these signatures from being valid for any other signed value in the app.
  return createHmac("sha256", secret).update(`lezgo-admin-remember:${valuePrefix}:${userId}:${issuedAtSeconds}`, "utf8").digest("base64url");
}
