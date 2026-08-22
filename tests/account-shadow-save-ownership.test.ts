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

import { POST as shadowSaveTournament } from "../app/api/supabase/shadow-save/route";

const userId = "00000000-0000-4000-8000-0000000000a1";
const tournamentId = "00000000-0000-4000-8000-000000000501";
const originalShadowSaveFlag = process.env.LEZGO_ENABLE_SUPABASE_SHADOW_SAVE;

describe("STEP 25K user-created tournament ownership shadow-save", () => {
  beforeEach(() => {
    authMocks.readAuthAccessCookie.mockReset();
    authMocks.readOptionalAccountFromAccessToken.mockReset();
    databaseMocks.createOrganizerToken.mockReset();
    databaseMocks.standardSave.mockReset();
    databaseMocks.teamVsTeamSave.mockReset();

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
});
