// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createCredentialAccount,
  loginWithCredential,
  normalizeLoginCode,
  normalizeUsername,
  requestLoginCodeRecovery,
} from "../lib/auth";
import { resetAuthRateLimitForTests } from "../lib/auth/rate-limit";

describe("STEP 25I-C1-A credential foundation", () => {
  const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const originalServerUrl = process.env.SUPABASE_URL;
  const originalServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  afterEach(() => {
    vi.restoreAllMocks();
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

  it("creates a USER account with username metadata and no raw role choice", async () => {
    configureAuthEnv();
    const client = createCredentialProfileClient();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      user: {
        id: "00000000-0000-4000-8000-000000000901",
        email: "user@example.com",
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
    expect(fetchMock.mock.calls[0][0]).toBe("https://auth.example.supabase.co/auth/v1/admin/users");
    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string) as { email: string; password: string; email_confirm: boolean; data: { username: string; role?: string } };
    expect(body.email).toBe("user@example.com");
    expect(body.password).toBe("ABC123");
    expect(body.email_confirm).toBe(true);
    expect(body.data.username).toBe("hao");
    expect(body.data).not.toHaveProperty("role");
    expect(result.verificationRequired).toBe(false);
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
    expect(fetchMock).not.toHaveBeenCalled();
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

  it("cleans up an admin-created auth user if profile persistence fails", async () => {
    configureAuthEnv();
    const client = createCredentialProfileClient({ failInsert: true });
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: "00000000-0000-4000-8000-000000000904",
        email: "partial@example.com",
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
        user_metadata: {
          display_name: "User One",
        },
      },
    }), { status: 200 }));

    const byEmail = await loginWithCredential({ identifier: "User@Example.com", code: "AbC123", client });
    const byUsername = await loginWithCredential({ identifier: "HAO", code: "abc123", client });

    expect(byEmail.account.userId).toBe("00000000-0000-4000-8000-000000000901");
    expect(byUsername.account.userId).toBe(byEmail.account.userId);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const requestBodies = fetchMock.mock.calls.map((call) => JSON.parse(call[1]?.body as string) as { email: string; password: string });
    expect(requestBodies).toEqual([
      { email: "user@example.com", password: "ABC123" },
      { email: "user@example.com", password: "ABC123" },
    ]);
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
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      msg: "ok",
    }), { status: 200 }));

    const result = await requestLoginCodeRecovery({
      email: "User@Example.com",
      redirectTo: "https://lezgotournament.vercel.app/settings",
    });

    expect(result.message).toBe("If the email is linked to an account, we have sent recovery instructions.");
    const requestBody = JSON.parse(fetchMock.mock.calls[0][1]?.body as string) as { email: string; password?: string; options: { redirect_to: string } };
    expect(requestBody.email).toBe("user@example.com");
    expect(requestBody).not.toHaveProperty("password");
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
}

interface TestProfile {
  user_id: string;
  display_name: string | null;
  role: "admin" | "user";
  username?: string | null;
  email?: string | null;
}

function createCredentialProfileClient(options: { usernameProfiles?: TestProfile[]; failInsert?: boolean } = {}) {
  const profiles = new Map<string, TestProfile>();
  const usernameProfiles = options.usernameProfiles ?? [];
  const client = {
    insertedProfile: null as null | Record<string, unknown>,
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
