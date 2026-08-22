// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  completeLoginCodeRecovery,
  createCredentialAccount,
  loginWithCredential,
  normalizeLoginCode,
  normalizeUsername,
  resendCredentialVerification,
  requestLoginCodeRecovery,
  updateLoginCodeWithSession,
  verifyCredentialEmailToken,
} from "../lib/auth";
import { getCredentialEmailRedirectTo, getCredentialRecoveryRedirectTo } from "../lib/auth/credential-redirect";
import { resetAuthRateLimitForTests } from "../lib/auth/rate-limit";

describe("STEP 25I-C1-A credential foundation", () => {
  const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const originalServerUrl = process.env.SUPABASE_URL;
  const originalServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const originalAccountCredentialSecret = process.env.LEZGO_ACCOUNT_CREDENTIAL_SECRET;
  const originalVercelEnv = process.env.VERCEL_ENV;
  const originalPublicAppOrigin = process.env.LEZGO_PUBLIC_APP_ORIGIN;

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    resetAuthRateLimitForTests();

    if (originalSupabaseUrl === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_URL = originalSupabaseUrl;
    }

    if (originalAnonKey === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalAnonKey;
    }

    if (originalServerUrl === undefined) {
      delete process.env.SUPABASE_URL;
    } else {
      process.env.SUPABASE_URL = originalServerUrl;
    }

    if (originalServiceRoleKey === undefined) {
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    } else {
      process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceRoleKey;
    }

    if (originalAccountCredentialSecret === undefined) {
      delete process.env.LEZGO_ACCOUNT_CREDENTIAL_SECRET;
    } else {
      process.env.LEZGO_ACCOUNT_CREDENTIAL_SECRET = originalAccountCredentialSecret;
    }

    if (originalVercelEnv === undefined) {
      delete process.env.VERCEL_ENV;
    } else {
      process.env.VERCEL_ENV = originalVercelEnv;
    }

    if (originalPublicAppOrigin === undefined) {
      delete process.env.LEZGO_PUBLIC_APP_ORIGIN;
    } else {
      process.env.LEZGO_PUBLIC_APP_ORIGIN = originalPublicAppOrigin;
    }
  });

  it("validates username and login code normalization without accepting invalid code shapes", () => {
    expect(normalizeUsername(" Hao_81 ")).toBe("hao_81");
    expect(normalizeLoginCode(" AbC123 ")).toBe("ABC123");
    expect(normalizeLoginCode("abc123")).toBe("ABC123");
    expect(normalizeLoginCode("123456")).toBe("123456");

    expect(() => normalizeUsername("ha")).toThrow();
    expect(() => normalizeUsername("hao-name")).toThrow();
    expect(() => normalizeLoginCode("12345")).toThrow();
    expect(() => normalizeLoginCode("1234567")).toThrow();
    expect(() => normalizeLoginCode("abc-12")).toThrow();
    expect(() => normalizeLoginCode("abc!12")).toThrow();
  });

  it("uses the locked production origin for credential email verification redirects", () => {
    process.env.VERCEL_ENV = "production";

    expect(getCredentialEmailRedirectTo("https://app.lezgopadel.dk/register")).toBe("https://lezgotournament.vercel.app/?accountVerified=verified");
    expect(getCredentialEmailRedirectTo("https://lez-go-tournament.vercel.app/register", "error")).toBe("https://lezgotournament.vercel.app/?accountVerified=error");
  });

  it("uses the locked production reset route for recovery redirects without localhost", () => {
    process.env.VERCEL_ENV = "production";
    process.env.LEZGO_PUBLIC_APP_ORIGIN = "https://lezgotournament.vercel.app";

    const redirectTo = getCredentialRecoveryRedirectTo("https://app.lezgopadel.dk/account");

    expect(redirectTo).toBe("https://lezgotournament.vercel.app/auth/reset");
    expect(redirectTo).not.toContain("localhost");
  });

  it("keeps localhost recovery redirects only for local development", () => {
    delete process.env.VERCEL_ENV;
    delete process.env.LEZGO_PUBLIC_APP_ORIGIN;

    expect(getCredentialRecoveryRedirectTo("http://localhost:3000/account")).toBe("http://localhost:3000/auth/reset");
  });

  it("creates a pending USER account with Supabase email verification and no raw role choice", async () => {
    configureAuthEnv();
    const client = createCredentialProfileClient();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      user: {
        id: "00000000-0000-4000-8000-000000000901",
        email: "user@example.com",
        email_confirmed_at: null,
        confirmed_at: null,
        created_at: "2026-08-20T10:00:00.000Z",
        user_metadata: {
          display_name: "User One",
          username: "hao",
        },
      },
    }), { status: 200 }));

    const result = await createCredentialAccount({
      displayName: " User   One ",
      username: "Hao",
      email: "User@Example.com",
      code: "abc123",
      repeatCode: "ABC123",
      emailRedirectTo: "https://lezgotournament.vercel.app/?accountVerified=verified",
      client,
    });

    expect(result.account).toMatchObject({
      userId: "00000000-0000-4000-8000-000000000901",
      email: "user@example.com",
      displayName: "User One",
      username: "hao",
      role: "user",
    });
    expect(client.insertedProfile?.role).toBe("user");
    expect(fetchMock.mock.calls[0][0]).toBe("https://auth.example.supabase.co/auth/v1/signup");
    const authHeaders = fetchMock.mock.calls[0][1]?.headers as Record<string, string>;
    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string) as { email: string; password: string; email_confirm?: boolean; email_redirect_to: string; data: { username: string; role?: string } };
    expect(body.email).toBe("user@example.com");
    expect(body.password).not.toBe("ABC123");
    expect(JSON.stringify(body)).not.toContain("abc123");
    expect(body.password).toMatch(/^LezGo1![A-Za-z0-9_-]{30,}$/);
    expect(body).not.toHaveProperty("email_confirm");
    expect(body.data.username).toBe("hao");
    expect(body.data).not.toHaveProperty("role");
    expect(body.email_redirect_to).toBe("https://lezgotournament.vercel.app/?accountVerified=verified");
    expect(body.email_redirect_to).not.toContain("ABC123");
    expect(authHeaders.apikey).toBe("anon-key");
    expect(authHeaders.authorization).toBe("Bearer anon-key");
    expect(result.verificationRequired).toBe(true);
  });

  it("enforces username uniqueness case-insensitively before account creation", async () => {
    configureAuthEnv();
    const client = createCredentialProfileClient({
      usernameProfiles: [{
        user_id: "00000000-0000-4000-8000-000000000902",
        display_name: "Existing",
        role: "user",
        username: "hao",
        email: "existing@example.com",
      }],
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));

    await expect(createCredentialAccount({
      displayName: "User One",
      username: "HAO",
      email: "user@example.com",
      code: "abc123",
      repeatCode: "abc123",
      client,
    })).rejects.toMatchObject({ status: 409 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("https://auth.example.supabase.co/auth/v1/admin/users/00000000-0000-4000-8000-000000000902");
    expect(fetchMock.mock.calls.some((call) => String(call[0]).endsWith("/auth/v1/signup"))).toBe(false);
  });

  it("rejects duplicate email before attempting admin user creation", async () => {
    configureAuthEnv();
    const client = createCredentialProfileClient({
      emailProfiles: [{
        user_id: "00000000-0000-4000-8000-000000000922",
        display_name: "Existing",
        role: "user",
        username: "existing",
        email: "user@example.com",
      }],
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));

    await expect(createCredentialAccount({
      displayName: "User One",
      username: "fresh",
      email: "USER@Example.com",
      code: "abc123",
      repeatCode: "abc123",
      client,
    })).rejects.toMatchObject({
      status: 409,
      message: "Email is already used.",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("https://auth.example.supabase.co/auth/v1/admin/users/00000000-0000-4000-8000-000000000922");
    expect(fetchMock.mock.calls.some((call) => String(call[0]).endsWith("/auth/v1/signup"))).toBe(false);
  });

  it("keeps a successfully created username reserved for duplicate real accounts", async () => {
    configureAuthEnv();
    const client = createCredentialProfileClient();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      id: "00000000-0000-4000-8000-000000000903",
      email: "user@example.com",
      user_metadata: {
        display_name: "User One",
        username: "hao",
      },
    }), { status: 200 }));

    await createCredentialAccount({
      displayName: "User One",
      username: "Hao",
      email: "user@example.com",
      code: "abc123",
      repeatCode: "abc123",
      rateLimitKey: "first-device",
      client,
    });

    await expect(createCredentialAccount({
      displayName: "User Two",
      username: "HAO",
      email: "user-two@example.com",
      code: "def456",
      repeatCode: "def456",
      rateLimitKey: "second-device",
      client,
    })).rejects.toMatchObject({ status: 409 });
  });

  it("releases stale unverified username reservations when there are no user data references", async () => {
    configureAuthEnv();
    vi.useFakeTimers({ now: new Date("2026-08-20T12:00:00.000Z") });
    const client = createCredentialProfileClient({
      usernameProfiles: [{
        user_id: "00000000-0000-4000-8000-000000000931",
        display_name: "Old Pending",
        role: "user",
        username: "staleuser",
        email: "old-pending@example.com",
      }],
    });
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: "00000000-0000-4000-8000-000000000931",
        email: "old-pending@example.com",
        email_confirmed_at: null,
        confirmed_at: null,
        created_at: "2026-08-18T10:00:00.000Z",
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: "00000000-0000-4000-8000-000000000932",
        email: "new-owner@example.com",
        email_confirmed_at: null,
        confirmed_at: null,
        created_at: "2026-08-20T12:00:00.000Z",
      }), { status: 200 }));

    const result = await createCredentialAccount({
      displayName: "New Owner",
      username: "StaleUser",
      email: "new-owner@example.com",
      code: "abc123",
      repeatCode: "abc123",
      client,
    });

    expect(result.account.userId).toBe("00000000-0000-4000-8000-000000000932");
    expect(fetchMock.mock.calls[1][0]).toBe("https://auth.example.supabase.co/auth/v1/admin/users/00000000-0000-4000-8000-000000000931");
    expect(fetchMock.mock.calls[1][1]?.method).toBe("DELETE");
  });

  it("cleans up a signup-created auth user if profile persistence fails", async () => {
    configureAuthEnv();
    const client = createCredentialProfileClient({ failInsert: true });
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: "00000000-0000-4000-8000-000000000904",
        email: "partial@example.com",
        email_confirmed_at: null,
        confirmed_at: null,
        created_at: "2026-08-20T10:00:00.000Z",
        user_metadata: {
          display_name: "Partial User",
          username: "partial",
        },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));

    await expect(createCredentialAccount({
      displayName: "Partial User",
      username: "Partial",
      email: "partial@example.com",
      code: "abc123",
      repeatCode: "abc123",
      client,
    })).rejects.toThrow("Profile insert failed");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe("https://auth.example.supabase.co/auth/v1/admin/users/00000000-0000-4000-8000-000000000904");
    expect(fetchMock.mock.calls[1][1]?.method).toBe("DELETE");
  });

  it("blocks account creation if Supabase email confirmation is disabled", async () => {
    configureAuthEnv();
    const client = createCredentialProfileClient();
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: "00000000-0000-4000-8000-000000000930",
        email: "autoverified@example.com",
        email_confirmed_at: "2026-08-20T10:00:00.000Z",
        confirmed_at: "2026-08-20T10:00:00.000Z",
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));

    await expect(createCredentialAccount({
      displayName: "Auto Verified",
      username: "autoverified",
      email: "autoverified@example.com",
      code: "abc123",
      repeatCode: "abc123",
      client,
    })).rejects.toMatchObject({
      status: 503,
      message: "Email verification is not configured.",
    });
    expect(fetchMock.mock.calls[1][0]).toBe("https://auth.example.supabase.co/auth/v1/admin/users/00000000-0000-4000-8000-000000000930");
    expect(fetchMock.mock.calls[1][1]?.method).toBe("DELETE");
  });

  it("authenticates email+code and username+same code as the same Supabase user", async () => {
    configureAuthEnv();
    const client = createCredentialProfileClient({
      usernameProfiles: [{
        user_id: "00000000-0000-4000-8000-000000000901",
        display_name: "User One",
        role: "user",
        username: "hao",
        email: "user@example.com",
      }],
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({
      access_token: "access-token",
      refresh_token: "refresh-token",
      expires_in: 3600,
      user: {
        id: "00000000-0000-4000-8000-000000000901",
        email: "user@example.com",
        email_confirmed_at: "2026-08-20T10:00:00.000Z",
        confirmed_at: "2026-08-20T10:00:00.000Z",
        user_metadata: {
          display_name: "User One",
        },
      },
    }), { status: 200 }));

    const byEmail = await loginWithCredential({ identifier: "User@Example.com", code: "AbC123", client });
    const byUsername = await loginWithCredential({ identifier: "HAO", code: "abc123", client });

    expect(byEmail.account.userId).toBe("00000000-0000-4000-8000-000000000901");
    expect(byUsername.account.userId).toBe(byEmail.account.userId);
    const passwordGrantCalls = fetchMock.mock.calls.filter((call) => String(call[0]).includes("/auth/v1/token?grant_type=password"));
    expect(passwordGrantCalls).toHaveLength(2);
    const requestBodies = passwordGrantCalls.map((call) => JSON.parse(call[1]?.body as string) as { email: string; password: string });
    expect(requestBodies[0].email).toBe("user@example.com");
    expect(requestBodies[1].email).toBe("user@example.com");
    expect(requestBodies[0].password).toMatch(/^LezGo1![A-Za-z0-9_-]{30,}$/);
    expect(requestBodies[1].password).toBe(requestBodies[0].password);
    expect(requestBodies[0].password).not.toBe("ABC123");
  });

  it("preserves the stored profile name during credential login instead of deriving it from the email local-part", async () => {
    configureAuthEnv();
    const client = createCredentialProfileClient({
      usernameProfiles: [{
        user_id: "00000000-0000-4000-8000-000000000902",
        display_name: "Hao Trinh Ngo",
        role: "user",
        username: "haongo",
        email: "haongo81@live.dk",
      }],
    });
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({
      access_token: "access-token",
      refresh_token: "refresh-token",
      expires_in: 3600,
      user: {
        id: "00000000-0000-4000-8000-000000000902",
        email: "haongo81@live.dk",
        email_confirmed_at: "2026-08-20T10:00:00.000Z",
        confirmed_at: "2026-08-20T10:00:00.000Z",
        user_metadata: {},
      },
    }), { status: 200 }));

    const result = await loginWithCredential({ identifier: "HaoNgo81@live.dk", code: "AbC123", client });

    expect(result.account.displayName).toBe("Hao Trinh Ngo");
    expect(result.account.displayName).not.toBe("haongo81");
    expect(result.account.username).toBe("haongo");
    expect(result.account.email).toBe("haongo81@live.dk");
    expect(client.updatedPatches).toEqual([]);
  });

  it("blocks email and username login before Supabase email verification", async () => {
    configureAuthEnv();
    const client = createCredentialProfileClient({
      usernameProfiles: [{
        user_id: "00000000-0000-4000-8000-000000000925",
        display_name: "Pending User",
        role: "user",
        username: "pending",
        email: "pending@example.com",
      }],
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({
      error: "email_not_confirmed",
      error_description: "Email not confirmed",
    }), { status: 400 }));

    await expect(loginWithCredential({ identifier: "pending@example.com", code: "abc123", client })).rejects.toMatchObject({
      status: 403,
      message: "Email is not verified.",
    });
    await expect(loginWithCredential({ identifier: "pending", code: "abc123", client })).rejects.toMatchObject({
      status: 403,
      message: "Email is not verified.",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("verifies a Supabase email confirmation token hash without exposing the LEZGO code", async () => {
    configureAuthEnv();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ user: { id: "00000000-0000-4000-8000-000000000926" } }), { status: 200 }));

    await verifyCredentialEmailToken({
      tokenHash: "hashed-email-token",
      type: "email",
    });

    expect(fetchMock).toHaveBeenCalledWith("https://auth.example.supabase.co/auth/v1/verify", expect.any(Object));
    const requestBody = JSON.parse(fetchMock.mock.calls[0][1]?.body as string) as { token_hash: string; type: string; code?: string };
    expect(requestBody).toEqual({
      token_hash: "hashed-email-token",
      type: "email",
    });
    expect(JSON.stringify(requestBody)).not.toContain("ABC123");
  });

  it("resends verification with a generic response for pending accounts", async () => {
    configureAuthEnv();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);

      if (url.includes("/rest/v1/profiles?")) {
        return new Response(JSON.stringify([{
          user_id: "00000000-0000-4000-8000-000000000927",
          display_name: "Pending User",
          role: "user",
          username: "pending",
          email: "pending@example.com",
        }]), { status: 200 });
      }

      if (url.endsWith("/auth/v1/admin/users/00000000-0000-4000-8000-000000000927")) {
        return new Response(JSON.stringify({
          id: "00000000-0000-4000-8000-000000000927",
          email: "pending@example.com",
          email_confirmed_at: null,
          confirmed_at: null,
          created_at: "2026-08-20T10:00:00.000Z",
        }), { status: 200 });
      }

      if (url.endsWith("/auth/v1/resend")) {
        return new Response(JSON.stringify({ message: "ok" }), { status: 200 });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    const result = await resendCredentialVerification({
      email: "Pending@Example.com",
      redirectTo: "https://lezgotournament.vercel.app/?accountVerified=verified",
      rateLimitKey: "device-a",
    });

    expect(result.message).toBe("If the email can be verified, we have sent a new verification email.");
    const resendCall = fetchMock.mock.calls.find((call) => String(call[0]).endsWith("/auth/v1/resend"));
    expect(resendCall).toBeTruthy();
    const resendBody = JSON.parse(resendCall?.[1]?.body as string) as { email: string; type: string; email_redirect_to: string; code?: string };
    expect(resendBody).toEqual({
      type: "signup",
      email: "pending@example.com",
      email_redirect_to: "https://lezgotournament.vercel.app/?accountVerified=verified",
    });
    expect(JSON.stringify(resendBody)).not.toContain("ABC123");
  });

  it("rate limits repeated verification resend attempts", async () => {
    configureAuthEnv();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);

      if (url.includes("/rest/v1/profiles?")) {
        return new Response(JSON.stringify([]), { status: 200 });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    for (let index = 0; index < 3; index += 1) {
      await expect(resendCredentialVerification({
        email: "pending@example.com",
        rateLimitKey: "device-b",
      })).resolves.toMatchObject({
        message: "If the email can be verified, we have sent a new verification email.",
      });
    }

    await expect(resendCredentialVerification({
      email: "pending@example.com",
      rateLimitKey: "device-b",
    })).rejects.toMatchObject({ status: 429 });
  });

  it("falls back to legacy raw-code Supabase passwords for already-created accounts", async () => {
    configureAuthEnv();
    const client = createCredentialProfileClient({
      usernameProfiles: [{
        user_id: "00000000-0000-4000-8000-000000000923",
        display_name: "Legacy User",
        role: "user",
        username: "legacy",
        email: "legacy@example.com",
      }],
    });
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("{}", { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: "access-token",
        refresh_token: "refresh-token",
        expires_in: 3600,
        user: {
          id: "00000000-0000-4000-8000-000000000923",
          email: "legacy@example.com",
          email_confirmed_at: "2026-08-20T10:00:00.000Z",
          confirmed_at: "2026-08-20T10:00:00.000Z",
          user_metadata: {
            display_name: "Legacy User",
          },
        },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: "00000000-0000-4000-8000-000000000923",
        email: "legacy@example.com",
        email_confirmed_at: "2026-08-20T10:00:00.000Z",
        confirmed_at: "2026-08-20T10:00:00.000Z",
      }), { status: 200 }));

    const result = await loginWithCredential({ identifier: "legacy", code: "abc123", client });
    const passwordGrantCalls = fetchMock.mock.calls.filter((call) => String(call[0]).includes("/auth/v1/token?grant_type=password"));
    const requestBodies = passwordGrantCalls.map((call) => JSON.parse(call[1]?.body as string) as { email: string; password: string });

    expect(result.account.userId).toBe("00000000-0000-4000-8000-000000000923");
    expect(requestBodies[0].password).toMatch(/^LezGo1![A-Za-z0-9_-]{30,}$/);
    expect(requestBodies[0].password).not.toBe("ABC123");
    expect(requestBodies[1]).toEqual({ email: "legacy@example.com", password: "ABC123" });
  });

  it("does not expose username to email mapping when username login fails", async () => {
    configureAuthEnv();
    const client = createCredentialProfileClient();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 401 }));

    await expect(loginWithCredential({ identifier: "missinguser", code: "ABC123", client })).rejects.toMatchObject({
      status: 401,
      message: "Email/username or code is incorrect.",
    });
  });

  it("uses Supabase recovery email with generic privacy-preserving response", async () => {
    configureAuthEnv();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);

      if (url.includes("/rest/v1/profiles?")) {
        return new Response(JSON.stringify([{
          user_id: "00000000-0000-4000-8000-000000000928",
          display_name: "User One",
          role: "user",
          username: "userone",
          email: "user@example.com",
        }]), { status: 200 });
      }

      if (url.endsWith("/auth/v1/admin/users/00000000-0000-4000-8000-000000000928")) {
        return new Response(JSON.stringify({
          id: "00000000-0000-4000-8000-000000000928",
          email: "user@example.com",
          email_confirmed_at: "2026-08-20T10:00:00.000Z",
          confirmed_at: "2026-08-20T10:00:00.000Z",
        }), { status: 200 });
      }

      if (url.endsWith("/auth/v1/recover")) {
        return new Response(JSON.stringify({
          msg: "ok",
        }), { status: 200 });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    const result = await requestLoginCodeRecovery({
      email: "User@Example.com",
      redirectTo: "https://lezgotournament.vercel.app/auth/reset",
    });

    expect(result.message).toBe("If the email address is registered, we have sent instructions for creating a new code.");
    const recoverCall = fetchMock.mock.calls.find((call) => String(call[0]).endsWith("/auth/v1/recover"));
    expect(recoverCall).toBeTruthy();
    const requestBody = JSON.parse(recoverCall?.[1]?.body as string) as { email: string; password?: string; redirect_to: string; options?: { redirect_to?: string } };
    expect(requestBody.email).toBe("user@example.com");
    expect(requestBody).not.toHaveProperty("password");
    expect(requestBody.redirect_to).toBe("https://lezgotournament.vercel.app/auth/reset");
    expect(requestBody.redirect_to).not.toContain("localhost");
    expect(requestBody).not.toHaveProperty("options");
  });

  it("sends the production recovery redirect as top-level redirect_to so Supabase does not fall back to Site URL", async () => {
    configureAuthEnv();
    process.env.VERCEL_ENV = "production";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);

      if (url.includes("/rest/v1/profiles?")) {
        return new Response(JSON.stringify([{
          user_id: "00000000-0000-4000-8000-000000000932",
          display_name: "User One",
          role: "user",
          username: "userone",
          email: "user@example.com",
        }]), { status: 200 });
      }

      if (url.endsWith("/auth/v1/admin/users/00000000-0000-4000-8000-000000000932")) {
        return new Response(JSON.stringify({
          id: "00000000-0000-4000-8000-000000000932",
          email: "user@example.com",
          email_confirmed_at: "2026-08-20T10:00:00.000Z",
        }), { status: 200 });
      }

      if (url.endsWith("/auth/v1/recover")) {
        return new Response(JSON.stringify({ msg: "ok" }), { status: 200 });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    await requestLoginCodeRecovery({
      email: "user@example.com",
      redirectTo: getCredentialRecoveryRedirectTo("https://lez-go-tournament.vercel.app/"),
    });

    const recoverCall = fetchMock.mock.calls.find((call) => String(call[0]).endsWith("/auth/v1/recover"));
    const requestBody = JSON.parse(recoverCall?.[1]?.body as string) as { redirect_to: string; options?: unknown };
    expect(requestBody.redirect_to).toBe("https://lezgotournament.vercel.app/auth/reset");
    expect(requestBody.redirect_to).not.toContain("localhost");
    expect(requestBody.options).toBeUndefined();
  });

  it("does not send recovery instructions for an unverified credential account", async () => {
    configureAuthEnv();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);

      if (url.includes("/rest/v1/profiles?")) {
        return new Response(JSON.stringify([{
          user_id: "00000000-0000-4000-8000-000000000929",
          display_name: "Pending User",
          role: "user",
          username: "pending",
          email: "pending@example.com",
        }]), { status: 200 });
      }

      if (url.endsWith("/auth/v1/admin/users/00000000-0000-4000-8000-000000000929")) {
        return new Response(JSON.stringify({
          id: "00000000-0000-4000-8000-000000000929",
          email: "pending@example.com",
          email_confirmed_at: null,
          confirmed_at: null,
        }), { status: 200 });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    const result = await requestLoginCodeRecovery({
      email: "Pending@Example.com",
      redirectTo: "https://lezgotournament.vercel.app/auth/reset",
    });

    expect(result.message).toBe("If the email address is registered, we have sent instructions for creating a new code.");
    expect(fetchMock.mock.calls.some((call) => String(call[0]).endsWith("/auth/v1/recover"))).toBe(false);
  });

  it("returns the same neutral recovery response for an unknown email without exposing account existence", async () => {
    configureAuthEnv();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);

      if (url.includes("/rest/v1/profiles?")) {
        return new Response(JSON.stringify([]), { status: 200 });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    const result = await requestLoginCodeRecovery({
      email: "unknown@example.com",
      redirectTo: "https://lezgotournament.vercel.app/auth/reset",
    });

    expect(result.message).toBe("If the email address is registered, we have sent instructions for creating a new code.");
    expect(fetchMock.mock.calls.some((call) => String(call[0]).endsWith("/auth/v1/recover"))).toBe(false);
    expect(JSON.stringify(result)).not.toMatch(/unknown@example.com|user_id|role|username/i);
  });

  it("sets a new numeric 6-character code through a valid single-use recovery token without changing account metadata", async () => {
    configureAuthEnv();
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: "recovery-access-token",
        refresh_token: "not-used",
        expires_in: 3600,
        user: {
          id: "00000000-0000-4000-8000-000000000940",
          email: "recover@example.com",
          email_confirmed_at: "2026-08-20T10:00:00.000Z",
          confirmed_at: "2026-08-20T10:00:00.000Z",
        },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: "00000000-0000-4000-8000-000000000940",
        email: "recover@example.com",
        email_confirmed_at: "2026-08-20T10:00:00.000Z",
        confirmed_at: "2026-08-20T10:00:00.000Z",
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: "00000000-0000-4000-8000-000000000940",
        email: "recover@example.com",
        email_confirmed_at: "2026-08-20T10:00:00.000Z",
        confirmed_at: "2026-08-20T10:00:00.000Z",
        app_metadata: { role: "user" },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: "00000000-0000-4000-8000-000000000940",
        email: "recover@example.com",
      }), { status: 200 }));

    await completeLoginCodeRecovery({
      tokenHash: "valid-recovery-token-hash",
      type: "recovery",
      code: "123456",
      repeatCode: "123456",
      rateLimitKey: "device-a",
    });

    expect(fetchMock.mock.calls[0][0]).toBe("https://auth.example.supabase.co/auth/v1/verify");
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toEqual({
      token_hash: "valid-recovery-token-hash",
      type: "recovery",
    });
    expect(fetchMock.mock.calls[1][0]).toBe("https://auth.example.supabase.co/auth/v1/user");
    expect(fetchMock.mock.calls[1][1]?.headers).toEqual(expect.objectContaining({
      authorization: "Bearer recovery-access-token",
    }));
    expect(fetchMock.mock.calls[2][0]).toBe("https://auth.example.supabase.co/auth/v1/admin/users/00000000-0000-4000-8000-000000000940");
    expect(fetchMock.mock.calls[3][0]).toBe("https://auth.example.supabase.co/auth/v1/user");
    const updateBody = JSON.parse(fetchMock.mock.calls[3][1]?.body as string) as { password: string; role?: string; email_confirmed_at?: string };
    expect(updateBody.password).toMatch(/^LezGo1![A-Za-z0-9_-]{30,}$/);
    expect(updateBody.password).not.toBe("123456");
    expect(updateBody).not.toHaveProperty("role");
    expect(updateBody).not.toHaveProperty("email_confirmed_at");
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes("/rest/v1/tournaments"))).toBe(false);
  });

  it("accepts an alphabetic 6-character code through recovery", async () => {
    configureAuthEnv();
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: "recovery-access-token",
        user: {
          id: "00000000-0000-4000-8000-000000000941",
          email: "alpha@example.com",
          email_confirmed_at: "2026-08-20T10:00:00.000Z",
        },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: "00000000-0000-4000-8000-000000000941",
        email: "alpha@example.com",
        email_confirmed_at: "2026-08-20T10:00:00.000Z",
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: "00000000-0000-4000-8000-000000000941",
        email: "alpha@example.com",
        email_confirmed_at: "2026-08-20T10:00:00.000Z",
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: "00000000-0000-4000-8000-000000000941",
        email: "alpha@example.com",
      }), { status: 200 }));

    await completeLoginCodeRecovery({
      tokenHash: "alpha-recovery-token-hash",
      type: "recovery",
      code: "abcdef",
      repeatCode: "ABCDEF",
    });

    const updateBody = JSON.parse(fetchMock.mock.calls[3][1]?.body as string) as { password: string };
    expect(updateBody.password).not.toBe("ABCDEF");
  });

  it("sets a new code from Supabase recovery access-token redirects without re-verifying a token hash", async () => {
    configureAuthEnv();
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: "00000000-0000-4000-8000-000000000942",
        email: "hashless@example.com",
        email_confirmed_at: "2026-08-20T10:00:00.000Z",
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: "00000000-0000-4000-8000-000000000942",
        email: "hashless@example.com",
        email_confirmed_at: "2026-08-20T10:00:00.000Z",
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: "00000000-0000-4000-8000-000000000942",
        email: "hashless@example.com",
      }), { status: 200 }));

    await completeLoginCodeRecovery({
      accessToken: "fragment-recovery-access-token",
      type: "recovery",
      code: "abc123",
      repeatCode: "abc123",
    });

    expect(fetchMock.mock.calls.some((call) => String(call[0]).endsWith("/auth/v1/verify"))).toBe(false);
    expect(fetchMock.mock.calls[0][0]).toBe("https://auth.example.supabase.co/auth/v1/user");
    expect(fetchMock.mock.calls[0][1]?.headers).toEqual(expect.objectContaining({
      authorization: "Bearer fragment-recovery-access-token",
    }));
    const updateBody = JSON.parse(fetchMock.mock.calls[2][1]?.body as string) as { password: string };
    expect(updateBody.password).toMatch(/^LezGo1![A-Za-z0-9_-]{30,}$/);
    expect(updateBody.password).not.toBe("abc123");
  });

  it.each([
    ["5-character code", "12345", "12345"],
    ["7-character code", "1234567", "1234567"],
    ["mismatching confirmation", "abc123", "abc124"],
  ])("rejects recovery before consuming the token for %s", async (_label, code, repeatCode) => {
    configureAuthEnv();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));

    await expect(completeLoginCodeRecovery({
      tokenHash: "valid-recovery-token-hash",
      type: "recovery",
      code,
      repeatCode,
    })).rejects.toMatchObject({ status: 400 });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["invalid", "not-recovery", new Response(JSON.stringify({ error: "bad token" }), { status: 400 })],
    ["expired", "recovery", new Response(JSON.stringify({ error: "expired" }), { status: 403 })],
    ["already-used", "recovery", new Response(JSON.stringify({ error: "already used" }), { status: 400 })],
  ])("rejects an %s recovery token with the same generic message", async (_label, type, response) => {
    configureAuthEnv();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(response);

    await expect(completeLoginCodeRecovery({
      tokenHash: "bad-recovery-token-hash",
      type,
      code: "abc123",
      repeatCode: "abc123",
    })).rejects.toMatchObject({
      status: 400,
      message: "The link is invalid or expired.",
    });

    if (type === "recovery") {
      expect(fetchMock).toHaveBeenCalledWith("https://auth.example.supabase.co/auth/v1/verify", expect.any(Object));
    } else {
      expect(fetchMock).not.toHaveBeenCalled();
    }
  });

  it("updates Supabase with a server-derived password when resetting the 6-character code", async () => {
    configureAuthEnv();
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: "00000000-0000-4000-8000-000000000924",
        email: "reset@example.com",
        email_confirmed_at: "2026-08-20T10:00:00.000Z",
        confirmed_at: "2026-08-20T10:00:00.000Z",
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: "00000000-0000-4000-8000-000000000924",
        email: "reset@example.com",
        email_confirmed_at: "2026-08-20T10:00:00.000Z",
        confirmed_at: "2026-08-20T10:00:00.000Z",
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: "00000000-0000-4000-8000-000000000924",
        email: "reset@example.com",
      }), { status: 200 }));

    await updateLoginCodeWithSession({
      accessToken: "access-token",
      code: "ab12cd",
      repeatCode: "AB12CD",
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0][0]).toBe("https://auth.example.supabase.co/auth/v1/user");
    expect(fetchMock.mock.calls[0][1]?.method).toBe("GET");
    expect(fetchMock.mock.calls[1][0]).toBe("https://auth.example.supabase.co/auth/v1/admin/users/00000000-0000-4000-8000-000000000924");
    expect(fetchMock.mock.calls[1][1]?.method).toBe("GET");
    expect(fetchMock.mock.calls[2][0]).toBe("https://auth.example.supabase.co/auth/v1/user");
    expect(fetchMock.mock.calls[2][1]?.method).toBe("PUT");
    const body = JSON.parse(fetchMock.mock.calls[2][1]?.body as string) as { password: string };
    expect(body.password).toMatch(/^LezGo1![A-Za-z0-9_-]{30,}$/);
    expect(body.password).not.toBe("AB12CD");
  });

  it("rate limits repeated credential login attempts without permanent lock state", async () => {
    configureAuthEnv();
    const client = createCredentialProfileClient();

    for (let index = 0; index < 8; index += 1) {
      await expect(loginWithCredential({
        identifier: "missinguser",
        code: "ABC123",
        rateLimitKey: "device-a",
        client,
      })).rejects.toMatchObject({ status: 401 });
    }

    await expect(loginWithCredential({
      identifier: "missinguser",
      code: "ABC123",
      rateLimitKey: "device-a",
      client,
    })).rejects.toMatchObject({ status: 429 });
  });
});

function configureAuthEnv() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://auth.example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  process.env.SUPABASE_URL = "https://auth.example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
  process.env.LEZGO_ACCOUNT_CREDENTIAL_SECRET = "account-credential-secret";
}

interface TestProfile {
  user_id: string;
  display_name: string | null;
  role: "admin" | "user";
  username?: string | null;
  email?: string | null;
}

function createCredentialProfileClient(options: { usernameProfiles?: TestProfile[]; emailProfiles?: TestProfile[]; failInsert?: boolean } = {}) {
  const profiles = new Map<string, TestProfile>();
  const usernameProfiles = options.usernameProfiles ?? [];
  const emailProfiles = options.emailProfiles ?? [];

  for (const profile of [...usernameProfiles, ...emailProfiles]) {
    profiles.set(profile.user_id, profile);
  }

  const client = {
    insertedProfile: null as null | Record<string, unknown>,
    updatedPatches: [] as Array<Record<string, unknown>>,
    async rpc<T>(): Promise<T> {
      throw new Error("rpc is not used.");
    },
    async select<T>(table: string, query: string): Promise<T[]> {
      if (table !== "profiles") {
        return [];
      }

      if (query.includes("username_normalized=eq.")) {
        const username = decodeURIComponent(query.match(/username_normalized=eq\.([^&]+)/)?.[1] ?? "");
        return [
          ...usernameProfiles.filter((profile) => profile.username === username),
          ...Array.from(profiles.values()).filter((profile) => profile.username === username),
        ] as T[];
      }

      if (query.includes("email_normalized=eq.")) {
        const email = decodeURIComponent(query.match(/email_normalized=eq\.([^&]+)/)?.[1] ?? "");
        return [
          ...emailProfiles.filter((profile) => profile.email === email),
          ...Array.from(profiles.values()).filter((profile) => profile.email === email),
        ] as T[];
      }

      const userId = decodeURIComponent(query.match(/user_id=eq\.([^&]+)/)?.[1] ?? "");
      return profiles.has(userId) ? [profiles.get(userId)] as T[] : [];
    },
    async insert<T>(_table: string, rows: Record<string, unknown>): Promise<T[]> {
      if (options.failInsert) {
        throw new Error("Profile insert failed");
      }

      client.insertedProfile = rows;
      const profile = {
        user_id: String(rows.user_id),
        display_name: String(rows.display_name),
        role: "user" as const,
        username: typeof rows.username === "string" ? rows.username : null,
        email: typeof rows.email === "string" ? rows.email : null,
      };
      profiles.set(profile.user_id, profile);
      return [profile] as T[];
    },
    async update<T>(_table: string, query: string, patch: Record<string, unknown>): Promise<T[]> {
      client.updatedPatches.push(patch);
      const userId = decodeURIComponent(query.match(/user_id=eq\.([^&]+)/)?.[1] ?? "");
      const existing = profiles.get(userId) ?? {
        user_id: userId,
        display_name: "",
        role: "user" as const,
      };
      const updated = {
        ...existing,
        display_name: typeof patch.display_name === "string" ? patch.display_name : existing.display_name,
        username: typeof patch.username === "string" ? patch.username : existing.username,
        email: typeof patch.email === "string" ? patch.email : existing.email,
      };
      profiles.set(userId, updated);
      return [updated] as T[];
    },
    async delete(): Promise<void> {
      return undefined;
    },
  };

  return client;
}
