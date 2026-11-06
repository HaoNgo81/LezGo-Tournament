// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { adminRememberMaxAgeSeconds, createAdminRememberValue, isAdminSignInTooOld, readAdminRememberIssuedAt, readSignInTimeFromAccessToken } from "../lib/auth/admin-remember";
import { createAuthCookieHeaders } from "../lib/auth/cookies";

// STEP 42B (owner decision 2026-11-06): "Husk mig" for ADMIN accounts lasts 30 days after the sign-in and
// never moves; users keep the 400-day sliding window.

const cookieMocks = vi.hoisted(() => ({ values: new Map<string, string>() }));
const sessionMocks = vi.hoisted(() => ({ assertAdminAccount: vi.fn() }));
const authRouteMocks = vi.hoisted(() => ({ readAccountFromAccessToken: vi.fn(), refreshAuthenticatedSession: vi.fn(), loginWithCredential: vi.fn() }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = cookieMocks.values.get(name);
      return value ? { name, value } : undefined;
    },
  }),
}));

vi.mock("../lib/auth/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/auth/session")>();
  return { ...actual, assertAdminAccount: sessionMocks.assertAdminAccount };
});

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/auth")>();
  return { ...actual, readAccountFromAccessToken: authRouteMocks.readAccountFromAccessToken, refreshAuthenticatedSession: authRouteMocks.refreshAuthenticatedSession, loginWithCredential: authRouteMocks.loginWithCredential };
});

const adminId = "00000000-0000-4000-8000-0000000042b1";
const otherAdminId = "00000000-0000-4000-8000-0000000042b2";
const day = 60 * 60 * 24;
const now = Math.floor(Date.now() / 1000);
const admin = { userId: adminId, email: "admin@example.com", displayName: "Admin", role: "admin" as const };
const originalSecret = process.env.LEZGO_REMOTE_SESSION_SECRET;

function tokenWithAmr(amr: unknown): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "HS256" })}.${encode({ sub: adminId, role: "authenticated", amr })}.signature`;
}

function cookie(headers: Headers, name: string): string | undefined {
  return headers.getSetCookie().find((value) => value.startsWith(`${name}=`));
}

function maxAge(setCookie: string | undefined): number | undefined {
  const match = setCookie?.match(/Max-Age=(\d+)/);
  return match ? Number(match[1]) : undefined;
}

describe("admin remember login: 30 days from sign-in", () => {
  beforeAll(() => {
    process.env.LEZGO_REMOTE_SESSION_SECRET = "test-secret-for-admin-remember";
  });

  afterAll(() => {
    if (originalSecret === undefined) delete process.env.LEZGO_REMOTE_SESSION_SECRET;
    else process.env.LEZGO_REMOTE_SESSION_SECRET = originalSecret;
  });

  beforeEach(() => {
    cookieMocks.values.clear();
    sessionMocks.assertAdminAccount.mockReset();
    authRouteMocks.readAccountFromAccessToken.mockReset();
    authRouteMocks.refreshAuthenticatedSession.mockReset();
  });

  afterEach(() => vi.restoreAllMocks());

  it("remembers an admin sign-in for 30 days with a signed cookie", () => {
    const headers = createAuthCookieHeaders({ accessToken: "a", refreshToken: "r", expiresIn: 3600 }, { remember: true, accountRole: "admin", userId: adminId, nowSeconds: now });

    expect(maxAge(cookie(headers, "lezgo_auth_refresh"))).toBe(30 * day);
    expect(maxAge(cookie(headers, "lezgo_auth_remember"))).toBe(30 * day);
    expect(maxAge(cookie(headers, "lezgo_auth_access"))).toBe(3600);
    const rememberValue = decodeURIComponent(cookie(headers, "lezgo_auth_remember")!.split(";")[0].split("=")[1]);
    expect(readAdminRememberIssuedAt(rememberValue, adminId, now)).toBe(now);
  });

  it("keeps the original sign-in time when the session is refreshed, so the 30 days never move", () => {
    const signedInTenDaysAgo = now - 10 * day;
    const headers = createAuthCookieHeaders({ accessToken: "a", refreshToken: "r", expiresIn: 3600 }, { remember: true, accountRole: "admin", userId: adminId, adminRememberIssuedAt: signedInTenDaysAgo, nowSeconds: now });

    expect(maxAge(cookie(headers, "lezgo_auth_refresh"))).toBe(20 * day);
    expect(maxAge(cookie(headers, "lezgo_auth_remember"))).toBe(20 * day);
  });

  it("ends the remembered admin session after 30 days", () => {
    const headers = createAuthCookieHeaders({ accessToken: "a", refreshToken: "r", expiresIn: 3600 }, { remember: true, accountRole: "admin", userId: adminId, adminRememberIssuedAt: now - adminRememberMaxAgeSeconds, nowSeconds: now });

    expect(cookie(headers, "lezgo_auth_refresh")).toContain("Max-Age=0");
    expect(cookie(headers, "lezgo_auth_remember")).toContain("Max-Age=0");
  });

  it("users keep the 400-day window", () => {
    const headers = createAuthCookieHeaders({ accessToken: "a", refreshToken: "r", expiresIn: 3600 }, { remember: true, accountRole: "user", userId: adminId });
    expect(maxAge(cookie(headers, "lezgo_auth_refresh"))).toBe(400 * day);
  });

  it("rejects a remember value that is forged, moved forward, expired, from the future or for another admin", () => {
    const valid = createAdminRememberValue(adminId, now - day);
    const [prefix, version, , signature] = valid.split(".");

    expect(readAdminRememberIssuedAt(valid, adminId, now)).toBe(now - day);
    expect(readAdminRememberIssuedAt(valid, otherAdminId, now)).toBeNull();
    expect(readAdminRememberIssuedAt(`${prefix}.${version}.${now}.${signature}`, adminId, now)).toBeNull();
    expect(readAdminRememberIssuedAt(`${valid}x`, adminId, now)).toBeNull();
    expect(readAdminRememberIssuedAt(createAdminRememberValue(adminId, now - 31 * day), adminId, now)).toBeNull();
    expect(readAdminRememberIssuedAt(createAdminRememberValue(adminId, now + 600), adminId, now)).toBeNull();
    expect(readAdminRememberIssuedAt("1", adminId, now)).toBeNull();
  });

  it("/api/auth/me renews a remembered admin session inside the 30 days and keeps the sign-in time", async () => {
    const { AuthError } = await import("../lib/auth");
    const { GET } = await import("../app/api/auth/me/route");
    cookieMocks.values.set("lezgo_auth_remember", createAdminRememberValue(adminId, now - 10 * day));
    cookieMocks.values.set("lezgo_auth_refresh", "refresh-token");
    authRouteMocks.readAccountFromAccessToken.mockRejectedValue(new AuthError());
    authRouteMocks.refreshAuthenticatedSession.mockResolvedValue({ session: { accessToken: "new-a", refreshToken: "new-r", expiresIn: 3600 }, account: admin });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(cookie(response.headers, "lezgo_auth_refresh")).toContain("lezgo_auth_refresh=new-r");
    const left = maxAge(cookie(response.headers, "lezgo_auth_remember"))!;
    expect(left).toBeGreaterThan(20 * day - 120);
    expect(left).toBeLessThanOrEqual(20 * day);
  });

  it("/api/auth/me logs out an admin whose remember cookie is expired or belongs to someone else", async () => {
    const { AuthError } = await import("../lib/auth");
    const { GET } = await import("../app/api/auth/me/route");

    for (const value of [createAdminRememberValue(adminId, now - 31 * day), createAdminRememberValue(otherAdminId, now)]) {
      cookieMocks.values.set("lezgo_auth_remember", value);
      cookieMocks.values.set("lezgo_auth_refresh", "refresh-token");
      authRouteMocks.readAccountFromAccessToken.mockRejectedValue(new AuthError());
      authRouteMocks.refreshAuthenticatedSession.mockResolvedValue({ session: { accessToken: "new-a", refreshToken: "new-r", expiresIn: 3600 }, account: admin });

      const response = await GET();
      expect(response.status).toBe(401);
      expect(cookie(response.headers, "lezgo_auth_refresh")).toContain("Max-Age=0");
    }
  });

  it("/api/auth/me keeps a remembered admin with a still-valid access token signed in", async () => {
    const { GET } = await import("../app/api/auth/me/route");
    cookieMocks.values.set("lezgo_auth_access", "access-token");
    cookieMocks.values.set("lezgo_auth_remember", createAdminRememberValue(adminId, now - day));
    cookieMocks.values.set("lezgo_auth_refresh", "refresh-token");
    authRouteMocks.readAccountFromAccessToken.mockResolvedValue(admin);

    const response = await GET();
    expect(response.status).toBe(200);
    expect(authRouteMocks.refreshAuthenticatedSession).not.toHaveBeenCalled();
  });

  it("reads the real sign-in time from the access token and ignores token refreshes", () => {
    expect(readSignInTimeFromAccessToken(tokenWithAmr([{ method: "password", timestamp: now - 5 * day }]))).toBe(now - 5 * day);
    expect(readSignInTimeFromAccessToken(tokenWithAmr([{ method: "password", timestamp: now - 40 * day }, { method: "token_refresh", timestamp: now }]))).toBe(now - 40 * day);
    expect(readSignInTimeFromAccessToken(tokenWithAmr(undefined))).toBeNull();
    expect(readSignInTimeFromAccessToken("not-a-jwt")).toBeNull();
    expect(isAdminSignInTooOld(tokenWithAmr([{ method: "password", timestamp: now - 31 * day }]), now)).toBe(true);
    expect(isAdminSignInTooOld(tokenWithAmr([{ method: "otp", timestamp: now - 29 * day }]), now)).toBe(false);
  });

  it("admin pages refuse a session whose sign-in is older than 30 days even without any remember cookie", async () => {
    // Someone renewed a copied refresh token directly with Supabase and sends only the new access cookie.
    const { assertFreshAdminAccountFromCookies } = await import("../lib/auth/cookies");
    sessionMocks.assertAdminAccount.mockResolvedValue(admin);
    cookieMocks.values.set("lezgo_auth_access", tokenWithAmr([{ method: "password", timestamp: now - 31 * day }, { method: "token_refresh", timestamp: now }]));
    await expect(assertFreshAdminAccountFromCookies()).rejects.toMatchObject({ status: 403 });

    cookieMocks.values.set("lezgo_auth_access", tokenWithAmr([{ method: "password", timestamp: now - day }]));
    await expect(assertFreshAdminAccountFromCookies()).resolves.toEqual(admin);
  });

  it("ends a remembered admin session in the last minute instead of granting another hour", async () => {
    expect(readAdminRememberIssuedAt(createAdminRememberValue(adminId, now - adminRememberMaxAgeSeconds + 30), adminId, now)).toBeNull();
    const { AuthError } = await import("../lib/auth");
    const { GET } = await import("../app/api/auth/me/route");
    cookieMocks.values.set("lezgo_auth_remember", createAdminRememberValue(adminId, now - adminRememberMaxAgeSeconds + 30));
    cookieMocks.values.set("lezgo_auth_refresh", "refresh-token");
    authRouteMocks.readAccountFromAccessToken.mockRejectedValue(new AuthError());
    authRouteMocks.refreshAuthenticatedSession.mockResolvedValue({ session: { accessToken: "new-a", refreshToken: "new-r", expiresIn: 3600 }, account: admin });

    const response = await GET();
    expect(response.status).toBe(401);
  });

  it("a demoted admin with an admin remember cookie continues as a normal 400-day user", async () => {
    const { AuthError } = await import("../lib/auth");
    const { GET } = await import("../app/api/auth/me/route");
    cookieMocks.values.set("lezgo_auth_remember", createAdminRememberValue(adminId, now - day));
    cookieMocks.values.set("lezgo_auth_refresh", "refresh-token");
    authRouteMocks.readAccountFromAccessToken.mockRejectedValue(new AuthError());
    authRouteMocks.refreshAuthenticatedSession.mockResolvedValue({ session: { accessToken: "new-a", refreshToken: "new-r", expiresIn: 3600 }, account: { ...admin, role: "user" } });

    const response = await GET();
    expect(response.status).toBe(200);
    expect(cookie(response.headers, "lezgo_auth_remember")).toContain("lezgo_auth_remember=1;");
    expect(maxAge(cookie(response.headers, "lezgo_auth_remember"))).toBe(400 * day);
  });

  it("does not remember an admin, and says so, when no usable signing secret exists", async () => {
    process.env.LEZGO_REMOTE_SESSION_SECRET = "   ";
    const previousServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    try {
      const headers = createAuthCookieHeaders({ accessToken: "a", refreshToken: "r", expiresIn: 3600 }, { remember: true, accountRole: "admin", userId: adminId });
      expect(cookie(headers, "lezgo_auth_remember")).toContain("Max-Age=0");
      expect(cookie(headers, "lezgo_auth_refresh")).toContain("Max-Age=0");
    } finally {
      process.env.LEZGO_REMOTE_SESSION_SECRET = "test-secret-for-admin-remember";
      if (previousServiceRole !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = previousServiceRole;
    }
  });

  it("signing in as admin with Husk mig sets the signed 30-day cookie and reports 30 days", async () => {
    const { POST } = await import("../app/api/auth/credentials/login/route");
    authRouteMocks.loginWithCredential.mockResolvedValue({ session: { accessToken: "a", refreshToken: "r", expiresIn: 3600 }, account: admin });

    const response = await POST(new Request("http://localhost/api/auth/credentials/login", { method: "POST", body: JSON.stringify({ identifier: "admin", code: "x", remember: true }) }));
    const body = await response.json() as { remembered?: boolean; rememberedDays?: number };

    expect(body).toMatchObject({ remembered: true, rememberedDays: 30 });
    expect(cookie(response.headers, "lezgo_auth_remember")).toMatch(/^lezgo_auth_remember=admin\.v1\./);
    expect(maxAge(cookie(response.headers, "lezgo_auth_refresh"))).toBe(30 * day);
  });

  it("signing in without Husk mig remembers nobody", async () => {
    const { POST } = await import("../app/api/auth/credentials/login/route");
    authRouteMocks.loginWithCredential.mockResolvedValue({ session: { accessToken: "a", refreshToken: "r", expiresIn: 3600 }, account: admin });

    const response = await POST(new Request("http://localhost/api/auth/credentials/login", { method: "POST", body: JSON.stringify({ identifier: "admin", code: "x" }) }));
    expect(await response.json()).toMatchObject({ remembered: false });
    expect(cookie(response.headers, "lezgo_auth_remember")).toContain("Max-Age=0");
  });

  it("admin pages accept a valid 30-day admin session, but not a promoted user's remember session", async () => {
    const { assertFreshAdminAccountFromCookies } = await import("../lib/auth/cookies");
    sessionMocks.assertAdminAccount.mockResolvedValue(admin);
    cookieMocks.values.set("lezgo_auth_access", "access-token");
    cookieMocks.values.set("lezgo_auth_refresh", "refresh-token");

    cookieMocks.values.set("lezgo_auth_remember", createAdminRememberValue(adminId, now - day));
    await expect(assertFreshAdminAccountFromCookies()).resolves.toEqual(admin);

    cookieMocks.values.set("lezgo_auth_remember", "1");
    await expect(assertFreshAdminAccountFromCookies()).rejects.toMatchObject({ status: 403 });

    cookieMocks.values.set("lezgo_auth_remember", createAdminRememberValue(adminId, now - 31 * day));
    await expect(assertFreshAdminAccountFromCookies()).rejects.toMatchObject({ status: 403 });
  });
});
