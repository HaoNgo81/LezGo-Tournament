// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { assertAdminAccount, readAccountFromAccessToken, requestEmailOtp, upsertAndReadProfile } from "../lib/auth";

describe("STEP 25I account auth foundation", () => {
  const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  afterEach(() => {
    vi.restoreAllMocks();

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
  });

  it("requests Supabase OTP without accepting a client-supplied role", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://auth.example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));

    await requestEmailOtp({
      email: "User@Example.com",
      displayName: "  Hao   Ngo  ",
      redirectTo: "https://lezgotournament.vercel.app/settings",
    });

    const requestBody = JSON.parse(fetchMock.mock.calls[0][1]?.body as string) as { email: string; data: { display_name: string; role?: string } };
    expect(requestBody.email).toBe("user@example.com");
    expect(requestBody.data.display_name).toBe("Hao Ngo");
    expect(requestBody.data).not.toHaveProperty("role");
  });

  it("creates or reads profiles as normal user by default", async () => {
    const client = createProfileMemoryClient("user", { existingProfile: false });

    const account = await upsertAndReadProfile({
      userId: "00000000-0000-4000-8000-000000000902",
      email: "user@example.com",
      displayName: "User One",
    }, client);

    expect(account.role).toBe("user");
    expect(client.insertedRole).toBe("user");
  });

  it("does not demote an existing admin profile during login/profile refresh", async () => {
    const client = createProfileMemoryClient("admin");

    const account = await upsertAndReadProfile({
      userId: "00000000-0000-4000-8000-000000000902",
      email: "admin@example.com",
      displayName: "Updated Admin Name",
    }, client);

    expect(account.role).toBe("admin");
    expect(client.insertedRole).toBe("");
    expect(client.updatedDisplayName).toBe("Updated Admin Name");
  });

  it("denies admin authorization for a normal user and allows trusted admin role", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://auth.example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({
      id: "00000000-0000-4000-8000-000000000902",
      email: "admin-check@example.com",
      email_confirmed_at: "2026-08-20T10:00:00.000Z",
      confirmed_at: "2026-08-20T10:00:00.000Z",
    }), { status: 200 }));

    await expect(assertAdminAccount("access-token", createProfileMemoryClient("user"))).rejects.toMatchObject({ status: 403 });
    await expect(assertAdminAccount("access-token", createProfileMemoryClient("admin"))).resolves.toMatchObject({ role: "admin" });
  });

  it("denies account sessions until Supabase email is verified", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://auth.example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({
      id: "00000000-0000-4000-8000-000000000902",
      email: "pending@example.com",
      email_confirmed_at: null,
      confirmed_at: null,
    }), { status: 200 }));

    await expect(readAccountFromAccessToken("access-token", createProfileMemoryClient("user"))).rejects.toMatchObject({
      status: 403,
      message: "Email is not verified.",
    });
  });
});

function createProfileMemoryClient(role: "admin" | "user", options: { existingProfile?: boolean } = {}) {
  let profileExists = options.existingProfile ?? true;
  const profile = {
    user_id: "00000000-0000-4000-8000-000000000902",
    display_name: "Profile Name",
    role,
  };
  const client = {
    insertedRole: "",
    updatedDisplayName: "",
    async rpc<T>(): Promise<T> {
      throw new Error("rpc is not used.");
    },
    async select<T>(table: string): Promise<T[]> {
      if (table !== "profiles") {
        return [];
      }

      return profileExists ? [profile] as T[] : [];
    },
    async insert<T>(_table: string, rows: Record<string, unknown>): Promise<T[]> {
      client.insertedRole = String(rows.role);
      profileExists = true;
      return [profile] as T[];
    },
    async update<T>(_table: string, _query: string, patch: Record<string, unknown>): Promise<T[]> {
      client.updatedDisplayName = String(patch.display_name);
      profile.display_name = client.updatedDisplayName;
      return [profile] as T[];
    },
    async delete(): Promise<void> {
      return undefined;
    },
  };

  return client;
}
