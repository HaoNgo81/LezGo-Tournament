// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  readAuthAccessCookie: vi.fn(),
  readVerifiedAuthUserIdFromAccessToken: vi.fn(),
  assertAuthUserIdIsActive: vi.fn(),
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
    readVerifiedAuthUserIdFromAccessToken: authMocks.readVerifiedAuthUserIdFromAccessToken,
    assertAuthUserIdIsActive: authMocks.assertAuthUserIdIsActive,
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

describe("STEP 25Y-D2 private account tournament list API", () => {
  beforeEach(() => {
    authMocks.readAuthAccessCookie.mockReset();
    authMocks.readVerifiedAuthUserIdFromAccessToken.mockReset();
    authMocks.assertAuthUserIdIsActive.mockReset();
    restClientMocks.select.mockReset();
    authMocks.readAuthAccessCookie.mockResolvedValue("auth-cookie-token");
    authMocks.readVerifiedAuthUserIdFromAccessToken.mockResolvedValue(userId);
    authMocks.assertAuthUserIdIsActive.mockResolvedValue(undefined);
  });

  it("lists creator and legacy owner tournaments without leaking controller-only or unrelated rows", async () => {
    restClientMocks.select.mockResolvedValue([
      createTournamentRow("Creator visible", userId, userId, otherUserId),
      createTournamentRow("Controller hidden", otherUserId, otherUserId, userId),
      createTournamentRow("Legacy visible", userId, null, null),
      createTournamentRow("Unrelated", otherUserId, otherUserId, otherUserId),
    ]);

    const response = await listAccountTournaments();
    const body = await response.json() as { tournaments: Array<{ name: string; canManage: boolean; managementState: string; updatedAt?: string }> };

    expect(response.status).toBe(200);
    expect(body.tournaments.map((tournament) => tournament.name)).toEqual([
      "Legacy visible",
      "Creator visible",
    ]);
    expect(body.tournaments.map((tournament) => tournament.managementState)).toEqual([
      "controller",
      "readOnly",
    ]);
    expect(body.tournaments.map((tournament) => tournament.canManage)).toEqual([
      true,
      false,
    ]);
    expect(body.tournaments[0].updatedAt).toBe("2026-08-20T10:00:00.000Z");
    expect(restClientMocks.select).toHaveBeenCalledWith(
      "tournaments",
      expect.not.stringContaining("controller_user_id.eq."),
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

  it("sorts controller, read-only and completed tournaments by newest cloud update inside each group", async () => {
    restClientMocks.select.mockResolvedValue([
      { ...createTournamentRow("Old completed", userId, userId, userId), status: "finished", updated_at: "2026-08-22T08:00:00.000Z" },
      { ...createTournamentRow("New read only", userId, userId, otherUserId), updated_at: "2026-08-22T12:00:00.000Z" },
      { ...createTournamentRow("Old controller", userId, userId, userId), updated_at: "2026-08-22T09:00:00.000Z" },
      { ...createTournamentRow("New completed", userId, userId, userId), status: "finished", updated_at: "2026-08-22T13:00:00.000Z" },
      { ...createTournamentRow("New controller", userId, userId, userId), updated_at: "2026-08-22T14:00:00.000Z" },
      { ...createTournamentRow("Old read only", userId, userId, otherUserId), updated_at: "2026-08-22T07:00:00.000Z" },
    ]);

    const response = await listAccountTournaments();
    const body = await response.json() as { tournaments: Array<{ id: string; name: string; managementState: string; updatedAt: string }> };

    expect(response.status).toBe(200);
    expect(body.tournaments.map((tournament) => tournament.name)).toEqual([
      "New controller",
      "Old controller",
      "New read only",
      "Old read only",
      "New completed",
      "Old completed",
    ]);
    expect(body.tournaments.map((tournament) => tournament.managementState)).toEqual([
      "controller",
      "controller",
      "readOnly",
      "readOnly",
      "completed",
      "completed",
    ]);
    expect(body.tournaments[0].id).toBe(createTournamentRow("New controller", userId, userId, userId).id);
  });

  it("starts the active-account check and tournament metadata query in parallel after token verification", async () => {
    const events: string[] = [];
    let resolveActiveCheck: () => void = () => undefined;
    let resolveTournamentRows: (rows: ReturnType<typeof createTournamentRow>[]) => void = () => undefined;

    authMocks.assertAuthUserIdIsActive.mockImplementation(async () => {
      events.push("active-started");
      await new Promise<void>((resolve) => {
        resolveActiveCheck = resolve;
      });
      events.push("active-resolved");
    });
    restClientMocks.select.mockImplementation(async () => {
      events.push("rows-started");
      return await new Promise<ReturnType<typeof createTournamentRow>[]>((resolve) => {
        resolveTournamentRows = resolve;
      });
    });

    const responsePromise = listAccountTournaments();
    await Promise.resolve();
    await Promise.resolve();

    expect(events).toEqual(["active-started", "rows-started"]);

    resolveTournamentRows([createTournamentRow("Parallel Cup", userId, userId, userId)]);
    await Promise.resolve();
    expect(events).toEqual(["active-started", "rows-started"]);

    resolveActiveCheck();

    const response = await responsePromise;
    const body = await response.json() as { tournaments: Array<{ name: string }> };

    expect(response.status).toBe(200);
    expect(response.headers.get("server-timing")).toContain("active_data");
    expect(body.tournaments.map((tournament) => tournament.name)).toEqual(["Parallel Cup"]);
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
