// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ManagedTournament } from "../lib/admin/tournaments";

const authMocks = vi.hoisted(() => ({
  assertFreshAdminAccountFromCookies: vi.fn(),
}));

const adminTournamentMocks = vi.hoisted(() => ({
  listManagedTournaments: vi.fn(),
  takeoverManagedTournament: vi.fn(),
}));

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/auth")>();
  return {
    ...actual,
    assertFreshAdminAccountFromCookies: authMocks.assertFreshAdminAccountFromCookies,
  };
});

vi.mock("@/lib/admin/tournaments", () => ({
  listManagedTournaments: adminTournamentMocks.listManagedTournaments,
  takeoverManagedTournament: adminTournamentMocks.takeoverManagedTournament,
}));

describe("STEP 25I-C1-C8B admin tournament API boundary", () => {
  beforeEach(() => {
    authMocks.assertFreshAdminAccountFromCookies.mockReset();
    adminTournamentMocks.listManagedTournaments.mockReset();
    adminTournamentMocks.takeoverManagedTournament.mockReset();
  });

  it("allows admins to list safe tournament management data", async () => {
    const { GET } = await import("../app/api/admin/tournaments/route");
    const admin = createAccount("admin");
    authMocks.assertFreshAdminAccountFromCookies.mockResolvedValue(admin);
    adminTournamentMocks.listManagedTournaments.mockResolvedValue([managedTournament]);

    const response = await GET();
    const body = await response.json() as { ok: boolean; tournaments: ManagedTournament[] };

    expect(response.status).toBe(200);
    expect(body.tournaments).toEqual([managedTournament]);
    expect(JSON.stringify(body)).not.toMatch(/organizerToken|shareToken|serviceRole|SUPABASE_SERVICE_ROLE_KEY|secret/i);
    expect(adminTournamentMocks.listManagedTournaments).toHaveBeenCalledWith(admin);
  });

  it("blocks normal, anonymous and unverified accounts from all-tournament list", async () => {
    const { AuthError } = await import("../lib/auth");
    const { GET } = await import("../app/api/admin/tournaments/route");

    for (const error of [
      new AuthError("Admin access was denied.", 403),
      new AuthError("Authentication was denied.", 401),
      new AuthError("Email is not verified.", 403),
    ]) {
      authMocks.assertFreshAdminAccountFromCookies.mockRejectedValueOnce(error);

      const response = await GET();

      expect(response.status).toBe(error.status);
      expect(adminTournamentMocks.listManagedTournaments).not.toHaveBeenCalled();
    }
  });

  it("allows admins to take over by updating controller only through trusted service", async () => {
    const { POST } = await import("../app/api/admin/tournaments/[tournamentId]/takeover/route");
    const admin = createAccount("admin");
    authMocks.assertFreshAdminAccountFromCookies.mockResolvedValue(admin);
    adminTournamentMocks.takeoverManagedTournament.mockResolvedValue({ ...managedTournament, isControlledByCurrentAdmin: true });

    const response = await POST(new Request("http://localhost/api/admin/tournaments/00000000-0000-4000-8000-000000000101/takeover", { method: "POST" }), {
      params: Promise.resolve({ tournamentId: "00000000-0000-4000-8000-000000000101" }),
    });
    const body = await response.json() as { ok: boolean; tournament: ManagedTournament };

    expect(response.status).toBe(200);
    expect(body.tournament.isControlledByCurrentAdmin).toBe(true);
    expect(adminTournamentMocks.takeoverManagedTournament).toHaveBeenCalledWith({
      actor: admin,
      tournamentId: "00000000-0000-4000-8000-000000000101",
    });
  });

  it("blocks non-admin takeover attempts before service mutation", async () => {
    const { AuthError } = await import("../lib/auth");
    const { POST } = await import("../app/api/admin/tournaments/[tournamentId]/takeover/route");
    authMocks.assertFreshAdminAccountFromCookies.mockRejectedValue(new AuthError("Admin access was denied.", 403));

    const response = await POST(new Request("http://localhost/api/admin/tournaments/00000000-0000-4000-8000-000000000101/takeover", { method: "POST" }), {
      params: Promise.resolve({ tournamentId: "00000000-0000-4000-8000-000000000101" }),
    });

    expect(response.status).toBe(403);
    expect(adminTournamentMocks.takeoverManagedTournament).not.toHaveBeenCalled();
  });

  it("requires a fresh admin session for takeover and does not mutate on stale auth", async () => {
    const { AuthError } = await import("../lib/auth");
    const { POST } = await import("../app/api/admin/tournaments/[tournamentId]/takeover/route");
    authMocks.assertFreshAdminAccountFromCookies.mockRejectedValue(new AuthError("Admin access requires a fresh login.", 403));

    const response = await POST(new Request("http://localhost/api/admin/tournaments/00000000-0000-4000-8000-000000000101/takeover", { method: "POST" }), {
      params: Promise.resolve({ tournamentId: "00000000-0000-4000-8000-000000000101" }),
    });
    const body = await response.json() as { ok: boolean; error: string };

    expect(response.status).toBe(403);
    expect(body.error).toBe("Admin access requires a fresh login.");
    expect(adminTournamentMocks.takeoverManagedTournament).not.toHaveBeenCalled();
  });

  it("hides raw database takeover errors from the user", async () => {
    const { POST } = await import("../app/api/admin/tournaments/[tournamentId]/takeover/route");
    authMocks.assertFreshAdminAccountFromCookies.mockResolvedValue(createAccount("admin"));
    adminTournamentMocks.takeoverManagedTournament.mockRejectedValue(new Error("permission denied for table tournaments"));

    const response = await POST(new Request("http://localhost/api/admin/tournaments/00000000-0000-4000-8000-000000000101/takeover", { method: "POST" }), {
      params: Promise.resolve({ tournamentId: "00000000-0000-4000-8000-000000000101" }),
    });
    const body = await response.json() as { ok: boolean; error: string };

    expect(response.status).toBe(500);
    expect(body.error).toBe("Overtagelse mislykkedes. Prøv igen.");
    expect(JSON.stringify(body)).not.toMatch(/permission denied|table tournaments|sql|postgres/i);
  });
});

function createAccount(role: "admin" | "user") {
  return {
    userId: "00000000-0000-4000-8000-00000000ad01",
    email: `${role}@example.com`,
    displayName: `${role} account`,
    username: role,
    role,
  };
}

const managedTournament: ManagedTournament = {
  id: "00000000-0000-4000-8000-000000000101",
  name: "Admin Cup",
  format: "mexicano",
  status: "active",
  activeRoundNumber: 1,
  courtCount: 2,
  configuredRounds: 5,
  createdAt: "2026-08-20T10:00:00.000Z",
  updatedAt: "2026-08-20T11:00:00.000Z",
  creator: { userId: "00000000-0000-4000-8000-0000000000a1", displayName: "Creator One", username: "creator" },
  controller: { userId: "00000000-0000-4000-8000-0000000000b2", displayName: "Controller Two", username: "controller" },
  isControlledByCurrentAdmin: false,
};
