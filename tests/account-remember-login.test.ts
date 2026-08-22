// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAuthCookieHeaders, createLogoutCookieHeaders } from "../lib/auth/cookies";
import { logoutOtherSupabaseSessions, refreshAuthenticatedSession } from "../lib/auth/session";

const cookieMocks = vi.hoisted(() => ({
  values: new Map<string, string>(),
}));

const authRouteMocks = vi.hoisted(() => ({
  changeOwnLoginCode: vi.fn(),
  readAccountFromAccessToken: vi.fn(),
  refreshAuthenticatedSession: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = cookieMocks.values.get(name);
      return value ? { name, value } : undefined;
    },
  }),
}));

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/auth")>();
  return {
    ...actual,
    changeOwnLoginCode: authRouteMocks.changeOwnLoginCode,
    readAccountFromAccessToken: authRouteMocks.readAccountFromAccessToken,
    refreshAuthenticatedSession: authRouteMocks.refreshAuthenticatedSession,
  };
});

describe("STEP 25I-C1-C7-FIX1 remember login policy", () => {
  const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalServerSupabaseUrl = process.env.SUPABASE_URL;
  const originalAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const originalServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

  beforeEach(() => {
    cookieMocks.values.clear();
    authRouteMocks.changeOwnLoginCode.mockReset();
    authRouteMocks.readAccountFromAccessToken.mockReset();
    authRouteMocks.refreshAuthenticatedSession.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    restoreEnv("NEXT_PUBLIC_SUPABASE_URL", originalSupabaseUrl);
    restoreEnv("SUPABASE_URL", originalServerSupabaseUrl);
    restoreEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", originalAnonKey);
    restoreEnv("SUPABASE_SERVICE_ROLE_KEY", originalServiceRole);
  });

  it("creates persistent remembered cookies only for verified USER sessions without storing the raw code", () => {
    const headers = createAuthCookieHeaders({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresIn: 3600,
    }, {
      remember: true,
      accountRole: "user",
    });
    const setCookies = headers.getSetCookie().join("\n");

    expect(setCookies).toContain("lezgo_auth_access=access-token");
    expect(setCookies).toContain("lezgo_auth_refresh=refresh-token");
    expect(setCookies).toContain("lezgo_auth_remember=1");
    expect(setCookies).toContain("Max-Age=2592000");
    expect(setCookies).not.toContain("ABC123");
    expect(setCookies).not.toContain("abc123");
  });

  it("does not create persistent remembered cookies for ADMIN even when remember was requested", () => {
    const headers = createAuthCookieHeaders({
      accessToken: "admin-access-token",
      refreshToken: "admin-refresh-token",
      expiresIn: 3600,
    }, {
      remember: true,
      accountRole: "admin",
    });
    const setCookies = headers.getSetCookie();
    const serialized = setCookies.join("\n");

    expect(serialized).toContain("lezgo_auth_access=admin-access-token");
    expect(serialized).toContain("lezgo_auth_refresh=; Path=/; Max-Age=0");
    expect(serialized).toContain("lezgo_auth_remember=; Path=/; Max-Age=0");
    expect(serialized).not.toContain("admin-refresh-token");
    expect(setCookies.find((cookie) => cookie.startsWith("lezgo_auth_access="))).not.toContain("Max-Age=");
  });

  it("clears remembered cookies on explicit logout", () => {
    const setCookies = createLogoutCookieHeaders().getSetCookie().join("\n");

    expect(setCookies).toContain("lezgo_auth_access=; Path=/; Max-Age=0");
    expect(setCookies).toContain("lezgo_auth_refresh=; Path=/; Max-Age=0");
    expect(setCookies).toContain("lezgo_auth_remember=; Path=/; Max-Age=0");
  });

  it("refreshes a remembered verified active USER session through the existing Supabase session mechanism", async () => {
    configureAuthEnv();
    const client = createProfileMemoryClient("user");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);

      if (url.endsWith("/auth/v1/token?grant_type=refresh_token")) {
        return new Response(JSON.stringify({
          access_token: "new-access-token",
          refresh_token: "new-refresh-token",
          expires_in: 3600,
          user: {
            id: "00000000-0000-4000-8000-000000000902",
            email: "user@example.com",
            email_confirmed_at: "2026-08-20T10:00:00.000Z",
            confirmed_at: "2026-08-20T10:00:00.000Z",
          },
        }), { status: 200 });
      }

      if (url.endsWith("/auth/v1/admin/users/00000000-0000-4000-8000-000000000902")) {
        return new Response(JSON.stringify({
          id: "00000000-0000-4000-8000-000000000902",
          email: "user@example.com",
          email_confirmed_at: "2026-08-20T10:00:00.000Z",
          confirmed_at: "2026-08-20T10:00:00.000Z",
        }), { status: 200 });
      }

      throw new Error(`Unexpected fetch ${url}`);
    });

    const result = await refreshAuthenticatedSession("refresh-token", client);

    expect(result.session.accessToken).toBe("new-access-token");
    expect(result.session.refreshToken).toBe("new-refresh-token");
    expect(result.account.role).toBe("user");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects unverified users before creating a remembered refreshed session", async () => {
    configureAuthEnv();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);

      if (url.endsWith("/auth/v1/token?grant_type=refresh_token")) {
        return new Response(JSON.stringify({
          access_token: "new-access-token",
          refresh_token: "new-refresh-token",
          expires_in: 3600,
          user: {
            id: "00000000-0000-4000-8000-000000000903",
            email: "unverified@example.com",
          },
        }), { status: 200 });
      }

      throw new Error(`Unexpected fetch ${url}`);
    });

    await expect(refreshAuthenticatedSession("refresh-token", createProfileMemoryClient("user"))).rejects.toMatchObject({ status: 403 });
  });

  it("restores remembered USER sessions through /api/auth/me and renews remembered cookies", async () => {
    const { AuthError } = await import("../lib/auth");
    const { GET } = await import("../app/api/auth/me/route");
    cookieMocks.values.set("lezgo_auth_remember", "1");
    cookieMocks.values.set("lezgo_auth_refresh", "refresh-token");
    authRouteMocks.readAccountFromAccessToken.mockRejectedValue(new AuthError());
    authRouteMocks.refreshAuthenticatedSession.mockResolvedValue({
      session: {
        accessToken: "new-access-token",
        refreshToken: "new-refresh-token",
        expiresIn: 3600,
      },
      account: createAccount("user"),
    });

    const response = await GET();
    const body = await response.json() as { ok: boolean; remembered?: boolean; account?: { role: string } };
    const setCookies = response.headers.getSetCookie().join("\n");

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.remembered).toBe(true);
    expect(body.account?.role).toBe("user");
    expect(setCookies).toContain("lezgo_auth_refresh=new-refresh-token");
    expect(setCookies).toContain("lezgo_auth_remember=1");
  });

  it("does not accept a remembered USER session that has been promoted to ADMIN", async () => {
    const { AuthError } = await import("../lib/auth");
    const { GET } = await import("../app/api/auth/me/route");
    cookieMocks.values.set("lezgo_auth_remember", "1");
    cookieMocks.values.set("lezgo_auth_refresh", "refresh-token");
    authRouteMocks.readAccountFromAccessToken.mockRejectedValue(new AuthError());
    authRouteMocks.refreshAuthenticatedSession.mockResolvedValue({
      session: {
        accessToken: "new-access-token",
        refreshToken: "new-refresh-token",
        expiresIn: 3600,
      },
      account: createAccount("admin"),
    });

    const response = await GET();
    const setCookies = response.headers.getSetCookie().join("\n");

    expect(response.status).toBe(401);
    expect(setCookies).toContain("lezgo_auth_access=; Path=/; Max-Age=0");
    expect(setCookies).toContain("lezgo_auth_refresh=; Path=/; Max-Age=0");
    expect(setCookies).toContain("lezgo_auth_remember=; Path=/; Max-Age=0");
  });

  it("clears remembered state if refresh validation fails for a remembered deactivated account", async () => {
    const { AuthError } = await import("../lib/auth");
    const { GET } = await import("../app/api/auth/me/route");
    cookieMocks.values.set("lezgo_auth_remember", "1");
    cookieMocks.values.set("lezgo_auth_refresh", "refresh-token");
    authRouteMocks.readAccountFromAccessToken.mockRejectedValue(new AuthError());
    authRouteMocks.refreshAuthenticatedSession.mockRejectedValue(new AuthError("Account is deactivated.", 403));

    const response = await GET();
    const setCookies = response.headers.getSetCookie().join("\n");

    expect(response.status).toBe(401);
    expect(setCookies).toContain("lezgo_auth_access=; Path=/; Max-Age=0");
    expect(setCookies).toContain("lezgo_auth_refresh=; Path=/; Max-Age=0");
    expect(setCookies).toContain("lezgo_auth_remember=; Path=/; Max-Age=0");
  });

  it("clears remembered state if a valid access cookie now resolves to ADMIN", async () => {
    const { GET } = await import("../app/api/auth/me/route");
    cookieMocks.values.set("lezgo_auth_access", "access-token");
    cookieMocks.values.set("lezgo_auth_remember", "1");
    cookieMocks.values.set("lezgo_auth_refresh", "refresh-token");
    authRouteMocks.readAccountFromAccessToken.mockResolvedValue(createAccount("admin"));

    const response = await GET();
    const setCookies = response.headers.getSetCookie().join("\n");

    expect(response.status).toBe(401);
    expect(authRouteMocks.refreshAuthenticatedSession).not.toHaveBeenCalled();
    expect(setCookies).toContain("lezgo_auth_access=; Path=/; Max-Age=0");
    expect(setCookies).toContain("lezgo_auth_refresh=; Path=/; Max-Age=0");
    expect(setCookies).toContain("lezgo_auth_remember=; Path=/; Max-Age=0");
  });

  it("keeps a fresh ADMIN session when only a stale remember marker remains", async () => {
    const { GET } = await import("../app/api/auth/me/route");
    cookieMocks.values.set("lezgo_auth_access", "fresh-admin-access-token");
    cookieMocks.values.set("lezgo_auth_remember", "1");
    authRouteMocks.readAccountFromAccessToken.mockResolvedValue(createAccount("admin"));

    const response = await GET();
    const body = await response.json() as { ok: boolean; account?: { role: string } };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.account?.role).toBe("admin");
    expect(authRouteMocks.refreshAuthenticatedSession).not.toHaveBeenCalled();
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  it("logs out other Supabase sessions while preserving the current session scope", async () => {
    configureAuthEnv();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));

    await logoutOtherSupabaseSessions("current-access-token");

    expect(fetchMock).toHaveBeenCalledWith("https://auth.example.supabase.co/auth/v1/logout?scope=others", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({
        apikey: "anon-key",
        authorization: "Bearer current-access-token",
      }),
    }));
  });

  it("uses the provider logout-other-devices route without clearing the current cookies", async () => {
    configureAuthEnv();
    const { POST } = await import("../app/api/auth/sessions/logout-others/route");
    cookieMocks.values.set("lezgo_auth_access", "current-access-token");
    authRouteMocks.readAccountFromAccessToken.mockResolvedValue(createAccount("user"));
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));

    const response = await POST();
    const body = await response.json() as { ok?: boolean; currentSessionPreserved?: boolean };

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true, currentSessionPreserved: true });
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  it("changes code through the own-account route without accepting a target user id", async () => {
    const { POST } = await import("../app/api/auth/credentials/change-code/route");
    cookieMocks.values.set("lezgo_auth_access", "current-access-token");
    authRouteMocks.changeOwnLoginCode.mockResolvedValue(undefined);

    const response = await POST(new Request("https://lezgotournament.vercel.app/api/auth/credentials/change-code", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "203.0.113.9",
      },
      body: JSON.stringify({
        currentCode: "OLD123",
        newCode: "NEW456",
        repeatNewCode: "NEW456",
        targetUserId: "00000000-0000-4000-8000-000000000999",
      }),
    }));

    expect(response.status).toBe(200);
    expect(authRouteMocks.changeOwnLoginCode).toHaveBeenCalledWith({
      accessToken: "current-access-token",
      currentCode: "OLD123",
      newCode: "NEW456",
      repeatNewCode: "NEW456",
      rateLimitKey: "203.0.113.9",
    });
  });
});

function configureAuthEnv() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://auth.example.supabase.co";
  process.env.SUPABASE_URL = "https://auth.example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

function createProfileMemoryClient(role: "admin" | "user") {
  const profile = {
    user_id: "00000000-0000-4000-8000-000000000902",
    display_name: "Profile Name",
    role,
  };

  return {
    async rpc<T>(): Promise<T> {
      throw new Error("rpc is not used.");
    },
    async select<T>(table: string): Promise<T[]> {
      return table === "profiles" ? [profile] as T[] : [];
    },
    async insert<T>(): Promise<T[]> {
      return [profile] as T[];
    },
    async update<T>(): Promise<T[]> {
      return [profile] as T[];
    },
    async delete(): Promise<void> {
      return undefined;
    },
  };
}

function createAccount(role: "admin" | "user") {
  return {
    userId: "00000000-0000-4000-8000-000000000904",
    email: `${role}@example.com`,
    displayName: `${role} account`,
    username: role,
    role,
  };
}
