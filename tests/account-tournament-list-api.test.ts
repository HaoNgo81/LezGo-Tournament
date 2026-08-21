// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  readAuthAccessCookie: vi.fn(),
  readAccountFromAccessToken: vi.fn(),
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
    readAccountFromAccessToken: authMocks.readAccountFromAccessToken,
  };
});

vi.mock("@/lib/supabase/rest-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/rest-client")>();

  return {
    ...actual,
    createSupabaseRestClient: () => restClientMocks,
  };
});

import { GET as listAccountTournaments } from "../app/api/account/tournaments/route";

const userId = "00000000-0000-4000-8000-0000000000a1";
const otherUserId = "00000000-0000-4000-8000-0000000000b2";

describe("STEP 25I-C1-C8A account tournament controller list API", () => {
  beforeEach(() => {
    authMocks.readAuthAccessCookie.mockReset();
    authMocks.readAccountFromAccessToken.mockReset();
    restClientMocks.select.mockReset();
    authMocks.readAuthAccessCookie.mockResolvedValue("auth-cookie-token");
    authMocks.readAccountFromAccessToken.mockResolvedValue({
      userId,
      email: "owner@example.com",
      displayName: "Owner",
      role: "user",
    });
  });

  it("lists creator, controller and legacy owner tournaments without leaking unrelated rows", async () => {
    restClientMocks.select.mockResolvedValue([
      createTournamentRow("Creator visible", userId, userId, otherUserId),
      createTournamentRow("Controller visible", otherUserId, otherUserId, userId),
      createTournamentRow("Legacy visible", userId, null, null),
      createTournamentRow("Unrelated", otherUserId, otherUserId, otherUserId),
    ]);

    const response = await listAccountTournaments();
    const body = await response.json() as { tournaments: Array<{ name: string; canManage: boolean; managementState: string; updatedAt?: string }> };

    expect(response.status).toBe(200);
    expect(body.tournaments.map((tournament) => tournament.name)).toEqual([
      "Creator visible",
      "Controller visible",
      "Legacy visible",
    ]);
    expect(body.tournaments.map((tournament) => tournament.managementState)).toEqual([
      "readOnly",
      "controller",
      "controller",
    ]);
    expect(body.tournaments.map((tournament) => tournament.canManage)).toEqual([
      false,
      true,
      true,
    ]);
    expect(body.tournaments[0].updatedAt).toBe("2026-08-20T10:00:00.000Z");
    expect(restClientMocks.select).toHaveBeenCalledWith(
      "tournaments",
      expect.stringContaining("created_by_user_id.eq."),
    );
  });

  it("marks finished account tournaments as completed in the presentation state", async () => {
    restClientMocks.select.mockResolvedValue([
      {
        ...createTournamentRow("Finished Cup", userId, userId, userId),
        status: "finished",
      },
    ]);

    const response = await listAccountTournaments();
    const body = await response.json() as { tournaments: Array<{ name: string; canManage: boolean; managementState: string; status: string }> };

    expect(response.status).toBe(200);
    expect(body.tournaments).toEqual([
      expect.objectContaining({
        name: "Finished Cup",
        status: "finished",
        canManage: true,
        managementState: "completed",
      }),
    ]);
  });
});

function createTournamentRow(name: string, owner_user_id: string, created_by_user_id: string | null, controller_user_id: string | null) {
  return {
    id: `00000000-0000-4000-8000-${name.length.toString().padStart(12, "0")}`,
    name,
    format: "mexicano",
    status: "active",
    updated_at: "2026-08-20T10:00:00.000Z",
    owner_user_id,
    created_by_user_id,
    controller_user_id,
  };
}
