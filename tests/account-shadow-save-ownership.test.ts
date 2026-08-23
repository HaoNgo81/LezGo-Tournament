// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMockLiveTournamentState } from "../lib/live-scoring";

const authMocks = vi.hoisted(() => ({
  readAuthAccessCookie: vi.fn(),
  readOptionalAccountFromAccessToken: vi.fn(),
}));

const databaseMocks = vi.hoisted(() => ({
  createOrganizerToken: vi.fn(),
  standardSave: vi.fn(),
  teamVsTeamSave: vi.fn(),
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

vi.mock("@/lib/database", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/database")>();

  return {
    ...actual,
    createOrganizerToken: databaseMocks.createOrganizerToken,
    createStandardTournamentRepository: () => ({ save: databaseMocks.standardSave }),
    createTeamVsTeamTournamentRepository: () => ({ save: databaseMocks.teamVsTeamSave }),
  };
});

vi.mock("@/lib/supabase/rest-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/rest-client")>();

  return {
    ...actual,
    createSupabaseRestClient: () => restClientMocks,
  };
});

import { POST as shadowSaveTournament } from "../app/api/supabase/shadow-save/route";

const userId = "00000000-0000-4000-8000-0000000000a1";
const adminId = "00000000-0000-4000-8000-0000000000b2";
const tournamentId = "00000000-0000-4000-8000-000000000501";
const originalShadowSaveFlag = process.env.LEZGO_ENABLE_SUPABASE_SHADOW_SAVE;

describe("STEP 25K user-created tournament ownership shadow-save", () => {
  beforeEach(() => {
    authMocks.readAuthAccessCookie.mockReset();
    authMocks.readOptionalAccountFromAccessToken.mockReset();
    databaseMocks.createOrganizerToken.mockReset();
    databaseMocks.standardSave.mockReset();
    databaseMocks.teamVsTeamSave.mockReset();
    restClientMocks.select.mockReset();

    process.env.LEZGO_ENABLE_SUPABASE_SHADOW_SAVE = "1";
    authMocks.readAuthAccessCookie.mockResolvedValue("auth-cookie-token");
    authMocks.readOptionalAccountFromAccessToken.mockResolvedValue({
      userId,
      email: "owner@example.com",
      displayName: "Owner",
      role: "user",
    });
    databaseMocks.createOrganizerToken.mockReturnValue("STEP_25K_ORGANIZER_TOKEN");
    databaseMocks.standardSave.mockResolvedValue({
      tournamentId,
      updatedAt: "2026-08-21T10:00:00.000Z",
      saveMode: "insert",
    });
  });

  afterEach(() => {
    if (originalShadowSaveFlag === undefined) {
      delete process.env.LEZGO_ENABLE_SUPABASE_SHADOW_SAVE;
    } else {
      process.env.LEZGO_ENABLE_SUPABASE_SHADOW_SAVE = originalShadowSaveFlag;
    }
  });

  it("uses the authenticated USER as the ownership actor for a new standard tournament", async () => {
    const state = {
      ...createMockLiveTournamentState(),
      tournamentName: "STEP 25K Owner Cup",
    };

    const response = await shadowSaveTournament(new Request("http://localhost/api/supabase/shadow-save", {
      method: "POST",
      body: JSON.stringify({
        kind: "standard",
        legacyLocalId: "step-25k-owner-cup-americano",
        state,
      }),
    }));
    const body = await response.json() as { ok?: boolean; tournamentId?: string; organizerToken?: string };

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      tournamentId,
      organizerToken: "STEP_25K_ORGANIZER_TOKEN",
    });
    expect(authMocks.readOptionalAccountFromAccessToken).toHaveBeenCalledWith("auth-cookie-token");
    expect(databaseMocks.standardSave).toHaveBeenCalledWith(
      expect.objectContaining({
        tournamentName: "STEP 25K Owner Cup",
      }),
      expect.objectContaining({
        legacyLocalId: "step-25k-owner-cup-americano",
        ownerUserId: userId,
      }),
    );
    expect(databaseMocks.teamVsTeamSave).not.toHaveBeenCalled();
  });

  it("keeps legacy unauthenticated shadow-save working without assigning an owner", async () => {
    authMocks.readAuthAccessCookie.mockRejectedValue(new Error("headers are not available"));
    authMocks.readOptionalAccountFromAccessToken.mockResolvedValue(null);
    databaseMocks.standardSave.mockResolvedValue({
      tournamentId,
      updatedAt: "2026-08-21T10:00:00.000Z",
      saveMode: "insert",
    });
    const state = {
      ...createMockLiveTournamentState(),
      tournamentName: "STEP 25O Legacy Cup",
    };

    const response = await shadowSaveTournament(new Request("http://localhost/api/supabase/shadow-save", {
      method: "POST",
      body: JSON.stringify({
        kind: "standard",
        legacyLocalId: "step-25o-legacy-cup-americano",
        state,
      }),
    }));
    const body = await response.json() as { ok?: boolean; tournamentId?: string };

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, tournamentId });
    expect(databaseMocks.standardSave).toHaveBeenCalledWith(
      expect.objectContaining({
        tournamentName: "STEP 25O Legacy Cup",
      }),
      expect.objectContaining({
        legacyLocalId: "step-25o-legacy-cup-americano",
        ownerUserId: undefined,
      }),
    );
  });

  it("blocks anonymous snapshot updates to existing account-owned tournaments", async () => {
    authMocks.readAuthAccessCookie.mockRejectedValue(new Error("headers are not available"));
    authMocks.readOptionalAccountFromAccessToken.mockResolvedValue(null);
    restClientMocks.select.mockResolvedValueOnce([createTournamentAuthorityRow(userId, userId, userId)]);
    const state = {
      ...createMockLiveTournamentState(),
      tournamentName: "STEP 25R Owned Cup",
    };

    const response = await shadowSaveTournament(new Request("http://localhost/api/supabase/shadow-save", {
      method: "POST",
      body: JSON.stringify({
        kind: "standard",
        legacyLocalId: "step-25r-owned-cup-americano",
        tournamentId,
        state,
      }),
    }));

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: "Du har ikke længere styring af denne turnering.",
    });
    expect(databaseMocks.standardSave).not.toHaveBeenCalled();
  });

  it("blocks a stale former controller from replacing an account-owned snapshot after takeover", async () => {
    authMocks.readOptionalAccountFromAccessToken.mockResolvedValue({
      userId,
      email: "owner@example.com",
      displayName: "Owner",
      role: "user",
    });
    restClientMocks.select.mockResolvedValueOnce([createTournamentAuthorityRow(userId, userId, adminId)]);
    const state = {
      ...createMockLiveTournamentState(),
      tournamentName: "STEP 25R Taken Over Cup",
    };

    const response = await shadowSaveTournament(new Request("http://localhost/api/supabase/shadow-save", {
      method: "POST",
      body: JSON.stringify({
        kind: "standard",
        legacyLocalId: "step-25r-taken-over-cup-americano",
        tournamentId,
        state,
      }),
    }));

    expect(response.status).toBe(403);
    expect(databaseMocks.standardSave).not.toHaveBeenCalled();
  });

  it("allows the current controller to replace an existing account-owned snapshot", async () => {
    authMocks.readOptionalAccountFromAccessToken.mockResolvedValue({
      userId: adminId,
      email: "admin@example.com",
      displayName: "Admin",
      role: "admin",
    });
    restClientMocks.select.mockResolvedValueOnce([createTournamentAuthorityRow(userId, userId, adminId)]);
    const state = {
      ...createMockLiveTournamentState(),
      tournamentName: "STEP 25R Controlled Cup",
    };

    const response = await shadowSaveTournament(new Request("http://localhost/api/supabase/shadow-save", {
      method: "POST",
      body: JSON.stringify({
        kind: "standard",
        legacyLocalId: "step-25r-controlled-cup-americano",
        tournamentId,
        expectedUpdatedAt: "2026-08-23T09:00:00.000Z",
        state,
      }),
    }));

    expect(response.status).toBe(200);
    expect(databaseMocks.standardSave).toHaveBeenCalledWith(
      expect.objectContaining({
        tournamentName: "STEP 25R Controlled Cup",
      }),
      expect.objectContaining({
        legacyLocalId: "step-25r-controlled-cup-americano",
        tournamentId,
        expectedUpdatedAt: "2026-08-23T09:00:00.000Z",
        ownerUserId: adminId,
      }),
    );
  });
});

function createTournamentAuthorityRow(owner_user_id: string | null, created_by_user_id: string | null, controller_user_id: string | null) {
  return {
    owner_user_id,
    created_by_user_id,
    controller_user_id,
  };
}
