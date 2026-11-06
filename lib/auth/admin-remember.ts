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

  if (extra !== undefined || !issuedAtText || !signature || !/^\d{1,12}$/.test(issuedAtText)) {
    return null;
  }

  const issuedAt = Number(issuedAtText);

  if (issuedAt > now + clockSkewSeconds || getAdminRememberSecondsLeft(issuedAt, now) <= 0) {
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

function sign(userId: string, issuedAtSeconds: number): string {
  const secret = process.env.LEZGO_REMOTE_SESSION_SECRET || assertSupabaseServerConfig().serviceRoleKey;
  // The purpose label keeps these signatures from being valid for any other signed value in the app.
  return createHmac("sha256", secret).update(`lezgo-admin-remember:${valuePrefix}:${userId}:${issuedAtSeconds}`, "utf8").digest("base64url");
}
