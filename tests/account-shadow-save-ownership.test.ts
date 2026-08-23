// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMockLiveTournamentState } from "../lib/live-scoring";

const authMocks = vi.hoisted(() => ({
  readAuthAccessCookie: vi.fn(),
  readOptionalAccountFromAccessToken: vi.fn(),
}));

const databaseMocks = vi.hoisted(() => ({
  createOrganizerToken: vi.fn(),
  readOwnedMatchScoreVersions: vi.fn(),
  standardRead: vi.fn(),
  standardSave: vi.fn(),
  teamVsTeamRead: vi.fn(),
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
    createStandardTournamentRepository: () => ({ read: databaseMocks.standardRead, save: databaseMocks.standardSave }),
    createTeamVsTeamTournamentRepository: () => ({ read: databaseMocks.teamVsTeamRead, save: databaseMocks.teamVsTeamSave }),
    readOwnedMatchScoreVersions: databaseMocks.readOwnedMatchScoreVersions,
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
    databaseMocks.readOwnedMatchScoreVersions.mockReset();
    databaseMocks.standardRead.mockReset();
    databaseMocks.standardSave.mockReset();
    databaseMocks.teamVsTeamRead.mockReset();
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
    databaseMocks.standardRead.mockResolvedValue(createMockLiveTournamentState());
    databaseMocks.readOwnedMatchScoreVersions.mockResolvedValue({});
    restClientMocks.select.mockResolvedValue([]);
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
    const body = await response.json() as { ok?: boolean; tournamentId?: string; organizerToken?: string; matchScoreVersions?: Record<string, number> };

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      tournamentId,
      matchScoreVersions: {},
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

  it("rejects an existing account-owned full snapshot when the client omits the expected revision", async () => {
    authMocks.readOptionalAccountFromAccessToken.mockResolvedValue({
      userId,
      email: "owner@example.com",
      displayName: "Owner",
      role: "user",
    });
    restClientMocks.select
      .mockResolvedValueOnce([createTournamentAuthorityRow(userId, userId, userId)])
      .mockResolvedValueOnce([createTournamentAuthorityRow(userId, userId, userId)]);
    databaseMocks.standardRead.mockResolvedValue({
      ...createMockLiveTournamentState(),
      tournamentName: "STEP 25S Preserved Cup",
      results: [{ matchId: "r1-c1", teamAPoints: 21, teamBPoints: 10 }],
    });
    databaseMocks.readOwnedMatchScoreVersions.mockResolvedValue({ "r1-c1": 2, "r1-c2": 1 });

    const response = await shadowSaveTournament(new Request("http://localhost/api/supabase/shadow-save", {
      method: "POST",
      body: JSON.stringify({
        kind: "standard",
        legacyLocalId: "step-25s-preserved-cup-americano",
        tournamentId,
        state: createMockLiveTournamentState(),
      }),
    }));
    const body = await response.json() as { ok?: boolean; conflict?: boolean; state?: { results?: unknown[] }; matchScoreVersions?: Record<string, number> };

    expect(response.status).toBe(409);
    expect(body).toMatchObject({
      ok: false,
      conflict: true,
      matchScoreVersions: { "r1-c1": 2, "r1-c2": 1 },
    });
    expect(body.state?.results).toEqual([{ matchId: "r1-c1", teamAPoints: 21, teamBPoints: 10 }]);
    expect(databaseMocks.standardSave).not.toHaveBeenCalled();
  });

  it("returns the latest authoritative snapshot when a current controller full snapshot is stale", async () => {
    const latestState = {
      ...createMockLiveTournamentState(),
      tournamentName: "STEP 25S Latest Cup",
      activeRoundNumber: 2,
    };
    authMocks.readOptionalAccountFromAccessToken.mockResolvedValue({
      userId,
      email: "owner@example.com",
      displayName: "Owner",
      role: "user",
    });
    restClientMocks.select
      .mockResolvedValueOnce([createTournamentAuthorityRow(userId, userId, userId)])
      .mockResolvedValueOnce([{
        id: tournamentId,
        format: "americano",
        legacy_local_id: "step-25s-latest-cup-americano",
        owner_user_id: userId,
        created_by_user_id: userId,
        controller_user_id: userId,
        team_competition_mode: null,
        updated_at: "2026-08-23T12:35:00.000Z",
      }]);
    databaseMocks.standardSave.mockRejectedValue(new Error("Snapshot conflict."));
    databaseMocks.standardRead.mockResolvedValue(latestState);
    databaseMocks.readOwnedMatchScoreVersions.mockResolvedValue({ "r1-c1": 2 });

    const response = await shadowSaveTournament(new Request("http://localhost/api/supabase/shadow-save", {
      method: "POST",
      body: JSON.stringify({
        kind: "standard",
        legacyLocalId: "step-25s-latest-cup-americano",
        tournamentId,
        expectedUpdatedAt: "2026-08-23T12:30:00.000Z",
        state: createMockLiveTournamentState(),
      }),
    }));
    const body = await response.json() as { ok?: boolean; conflict?: boolean; state?: { activeRoundNumber?: number }; updatedAt?: string; matchScoreVersions?: Record<string, number> };

    expect(response.status).toBe(409);
    expect(body).toMatchObject({
      ok: false,
      conflict: true,
      updatedAt: "2026-08-23T12:35:00.000Z",
      matchScoreVersions: { "r1-c1": 2 },
    });
    expect(body.state?.activeRoundNumber).toBe(2);
  });
});

function createTournamentAuthorityRow(owner_user_id: string | null, created_by_user_id: string | null, controller_user_id: string | null) {
  return {
    id: tournamentId,
    format: "americano",
    legacy_local_id: "step-25s-cup-americano",
    owner_user_id,
    created_by_user_id,
    controller_user_id,
    team_competition_mode: null,
    updated_at: "2026-08-23T12:00:00.000Z",
  };
}
