import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const repositoryMocks = vi.hoisted(() => ({
  provisionAccess: vi.fn(),
  provisionHandoff: vi.fn(),
  revoke: vi.fn(),
}));

const authMocks = vi.hoisted(() => ({
  readAuthAccessCookie: vi.fn(),
  readOptionalAccountFromAccessToken: vi.fn(),
}));

const restClientMocks = vi.hoisted(() => ({
  select: vi.fn(),
}));

vi.mock("@/lib/auth/cookies", () => ({
  readAuthAccessCookie: authMocks.readAuthAccessCookie,
}));

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();

  return {
    ...actual,
    readOptionalAccountFromAccessToken: authMocks.readOptionalAccountFromAccessToken,
  };
});

vi.mock("@/lib/supabase/rest-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/rest-client")>();

  return {
    ...actual,
    createSupabaseRestClient: () => restClientMocks,
  };
});

vi.mock("@/lib/database", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/database")>();

  return {
    ...actual,
    createTournamentAccessRepository: () => ({
      provision: repositoryMocks.provisionAccess,
      revoke: repositoryMocks.revoke,
    }),
    createTournamentHandoffRepository: () => ({
      provision: repositoryMocks.provisionHandoff,
    }),
    assertOrganizerToken: (token: string | undefined) => {
      if (token !== "VALID_ORGANIZER_TOKEN") {
        throw new actual.OrganizerTokenError();
      }

      return {
        v: 1,
        scope: "tournament-organizer",
        tournamentId: "00000000-0000-4000-8000-000000000000",
        kind: "standard",
        legacyLocalId: "step-24c-origin-test",
        iat: 0,
      };
    },
  };
});

import { POST as provisionAccess } from "../app/api/supabase/tournament-access/provision/route";
import { POST as revokeAccess } from "../app/api/supabase/tournament-access/revoke/route";
import { POST as provisionHandoff } from "../app/api/supabase/tournament-handoff/provision/route";
import { POST as readOrganizerTournament } from "../app/api/supabase/organizer-tournament/read/route";

describe("STEP 24B remote access provisioning API", () => {
  const previousAccessFlag = process.env.LEZGO_ENABLE_SUPABASE_ACCESS;
  const previousPublicOrigin = process.env.LEZGO_PUBLIC_APP_ORIGIN;
  const previousVercelProjectProductionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const previousVercelUrl = process.env.VERCEL_URL;

  beforeEach(() => {
    process.env.LEZGO_ENABLE_SUPABASE_ACCESS = "1";
    delete process.env.LEZGO_PUBLIC_APP_ORIGIN;
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    delete process.env.VERCEL_URL;
    repositoryMocks.provisionAccess.mockReset();
    repositoryMocks.provisionHandoff.mockReset();
    repositoryMocks.revoke.mockReset();
    authMocks.readAuthAccessCookie.mockReset();
    authMocks.readOptionalAccountFromAccessToken.mockReset();
    restClientMocks.select.mockReset();
    authMocks.readAuthAccessCookie.mockRejectedValue(new Error("No account cookie."));
    authMocks.readOptionalAccountFromAccessToken.mockResolvedValue(null);
    restClientMocks.select.mockResolvedValue([]);
  });

  afterEach(() => {
    if (previousAccessFlag === undefined) {
      delete process.env.LEZGO_ENABLE_SUPABASE_ACCESS;
    } else {
      process.env.LEZGO_ENABLE_SUPABASE_ACCESS = previousAccessFlag;
    }
    if (previousPublicOrigin === undefined) {
      delete process.env.LEZGO_PUBLIC_APP_ORIGIN;
    } else {
      process.env.LEZGO_PUBLIC_APP_ORIGIN = previousPublicOrigin;
    }
    if (previousVercelProjectProductionUrl === undefined) {
      delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    } else {
      process.env.VERCEL_PROJECT_PRODUCTION_URL = previousVercelProjectProductionUrl;
    }
    if (previousVercelUrl === undefined) {
      delete process.env.VERCEL_URL;
    } else {
      process.env.VERCEL_URL = previousVercelUrl;
    }
  });

  it("rejects score-entry access provisioning without organizer authorization", async () => {
    const response = await provisionAccess(createJsonRequest("/api/supabase/tournament-access/provision", {
      tournamentId: "00000000-0000-4000-8000-000000000101",
    }));

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ ok: false, error: "Organizer authorization was denied." });
    expect(repositoryMocks.provisionAccess).not.toHaveBeenCalled();
  });

  it("rejects TV handoff provisioning without organizer authorization", async () => {
    const response = await provisionHandoff(createJsonRequest("/api/supabase/tournament-handoff/provision", {
      tournamentId: "00000000-0000-4000-8000-000000000102",
    }));

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ ok: false, error: "Organizer authorization was denied." });
    expect(repositoryMocks.provisionHandoff).not.toHaveBeenCalled();
  });

  it("rejects score-entry access revoke without organizer authorization", async () => {
    const response = await revokeAccess(createJsonRequest("/api/supabase/tournament-access/revoke", {
      tournamentId: "00000000-0000-4000-8000-000000000103",
      tournamentCode: "K7M4XP",
    }));

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ ok: false, error: "Organizer authorization was denied." });
    expect(repositoryMocks.revoke).not.toHaveBeenCalled();
  });

  it("rejects organizer tournament sync reads without organizer authorization", async () => {
    const response = await readOrganizerTournament(createJsonRequest("/api/supabase/organizer-tournament/read", {
      kind: "standard",
      legacyLocalId: "mexicano-mexicano",
      tournamentId: "00000000-0000-4000-8000-000000000104",
    }));

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ ok: false, error: "Organizer authorization was denied." });
  });

  it("blocks stale score-entry access provisioning for an account-owned tournament after controller transfer", async () => {
    restClientMocks.select.mockResolvedValueOnce([createTournamentAuthorityRow(
      "00000000-0000-4000-8000-0000000000a1",
      "00000000-0000-4000-8000-0000000000a1",
      "00000000-0000-4000-8000-0000000000b2",
    )]);
    authMocks.readAuthAccessCookie.mockResolvedValue("stale-user-cookie");
    authMocks.readOptionalAccountFromAccessToken.mockResolvedValue({
      userId: "00000000-0000-4000-8000-0000000000a1",
      email: "owner@example.com",
      displayName: "Owner",
      role: "user",
    });

    const response = await provisionAccess(createAuthorizedAccessRequest("/api/supabase/tournament-access/provision", "00000000-0000-4000-8000-000000000108"));

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: "Du har ikke længere styring af denne turnering.",
    });
    expect(repositoryMocks.provisionAccess).not.toHaveBeenCalled();
  });

  it("blocks stale TV handoff provisioning for an account-owned tournament after controller transfer", async () => {
    restClientMocks.select.mockResolvedValueOnce([createTournamentAuthorityRow(
      "00000000-0000-4000-8000-0000000000a1",
      "00000000-0000-4000-8000-0000000000a1",
      "00000000-0000-4000-8000-0000000000b2",
    )]);
    authMocks.readAuthAccessCookie.mockResolvedValue("stale-user-cookie");
    authMocks.readOptionalAccountFromAccessToken.mockResolvedValue({
      userId: "00000000-0000-4000-8000-0000000000a1",
      email: "owner@example.com",
      displayName: "Owner",
      role: "user",
    });

    const response = await provisionHandoff(createAuthorizedHandoffRequest("http://localhost/api/supabase/tournament-handoff/provision", "00000000-0000-4000-8000-000000000109"));

    expect(response.status).toBe(403);
    expect(repositoryMocks.provisionHandoff).not.toHaveBeenCalled();
  });

  it("allows the current controller to provision score-entry access for an account-owned tournament", async () => {
    restClientMocks.select.mockResolvedValueOnce([createTournamentAuthorityRow(
      "00000000-0000-4000-8000-0000000000a1",
      "00000000-0000-4000-8000-0000000000a1",
      "00000000-0000-4000-8000-0000000000b2",
    )]);
    authMocks.readAuthAccessCookie.mockResolvedValue("admin-controller-cookie");
    authMocks.readOptionalAccountFromAccessToken.mockResolvedValue({
      userId: "00000000-0000-4000-8000-0000000000b2",
      email: "admin@example.com",
      displayName: "Admin",
      role: "admin",
    });
    repositoryMocks.provisionAccess.mockResolvedValue({
      tournamentId: "00000000-0000-4000-8000-000000000110",
      tournamentCode: "K7M4XP",
      shareToken: "2222",
      tokenVersion: 1,
    });

    const response = await provisionAccess(createAuthorizedAccessRequest("/api/supabase/tournament-access/provision", "00000000-0000-4000-8000-000000000110"));

    expect(response.status).toBe(200);
    expect(repositoryMocks.provisionAccess).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000110");
  });

  it("uses the configured reachable public origin for TV handoff links instead of the bind host", async () => {
    process.env.LEZGO_PUBLIC_APP_ORIGIN = "http://192.168.0.60:3015";
    repositoryMocks.provisionHandoff.mockResolvedValue({
      tournamentId: "00000000-0000-4000-8000-000000000105",
      handoffReference: "STEP_24C_HANDOFF_REFERENCE",
      expiresAt: "2026-08-17T20:00:00.000Z",
    });

    const response = await provisionHandoff(createAuthorizedHandoffRequest("http://0.0.0.0:3015/api/supabase/tournament-handoff/provision", "00000000-0000-4000-8000-000000000105"));
    const body = await response.json() as { handoffUrl?: string; expiresAt?: string };

    expect(response.status).toBe(200);
    expect(body.handoffUrl).toBe("http://192.168.0.60:3015/remote/handoff/STEP_24C_HANDOFF_REFERENCE");
    expect(body.handoffUrl).not.toContain("0.0.0.0");
    expect(body.expiresAt).toBe("2026-08-17T20:00:00.000Z");
  });

  it("uses the production Vercel HTTPS origin for TV handoff links when no explicit public origin is configured", async () => {
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "lez-go-tournament.vercel.app";
    repositoryMocks.provisionHandoff.mockResolvedValue({
      tournamentId: "00000000-0000-4000-8000-000000000106",
      handoffReference: "STEP_24C_VERCEL_HANDOFF",
      expiresAt: "2026-08-17T20:05:00.000Z",
    });

    const response = await provisionHandoff(createAuthorizedHandoffRequest("http://0.0.0.0:3015/api/supabase/tournament-handoff/provision", "00000000-0000-4000-8000-000000000106"));
    const body = await response.json() as { handoffUrl?: string };

    expect(response.status).toBe(200);
    expect(body.handoffUrl).toBe("https://lez-go-tournament.vercel.app/remote/handoff/STEP_24C_VERCEL_HANDOFF");
  });

  it("does not expose 0.0.0.0 in TV handoff links even without public origin configuration", async () => {
    repositoryMocks.provisionHandoff.mockResolvedValue({
      tournamentId: "00000000-0000-4000-8000-000000000107",
      handoffReference: "STEP_24C_LOCALHOST_HANDOFF",
      expiresAt: "2026-08-17T20:10:00.000Z",
    });

    const response = await provisionHandoff(createAuthorizedHandoffRequest("http://0.0.0.0:3015/api/supabase/tournament-handoff/provision", "00000000-0000-4000-8000-000000000107"));
    const body = await response.json() as { handoffUrl?: string };

    expect(response.status).toBe(200);
    expect(body.handoffUrl).toBe("http://localhost:3015/remote/handoff/STEP_24C_LOCALHOST_HANDOFF");
    expect(body.handoffUrl).not.toContain("0.0.0.0");
  });
});

function createJsonRequest(path: string, body: Record<string, unknown>): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function createAuthorizedAccessRequest(path: string, tournamentId: string): Request {
  return createJsonRequest(path, {
    tournamentId,
    organizerToken: "VALID_ORGANIZER_TOKEN",
  });
}

function createAuthorizedHandoffRequest(url: string, tournamentId: string): Request {
  return new Request(url, {
    method: "POST",
    body: JSON.stringify({
      tournamentId,
      organizerToken: "VALID_ORGANIZER_TOKEN",
    }),
  });
}

function createTournamentAuthorityRow(owner_user_id: string | null, created_by_user_id: string | null, controller_user_id: string | null) {
  return {
    owner_user_id,
    created_by_user_id,
    controller_user_id,
  };
}
