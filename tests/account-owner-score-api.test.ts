// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthError } from "../lib/auth";
import { createMockLiveTournamentState, type LiveTournamentState } from "../lib/live-scoring";

const authMocks = vi.hoisted(() => ({
  readAuthAccessCookie: vi.fn(),
  readAccountFromAccessToken: vi.fn(),
}));

const databaseMocks = vi.hoisted(() => ({
  readStandard: vi.fn(),
  readOwnedMatchScoreVersions: vi.fn(),
  saveOwnedMatchScore: vi.fn(),
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

vi.mock("@/lib/database", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/database")>();

  return {
    ...actual,
    createStandardTournamentRepository: () => ({ read: databaseMocks.readStandard }),
    readOwnedMatchScoreVersions: databaseMocks.readOwnedMatchScoreVersions,
    saveOwnedMatchScore: databaseMocks.saveOwnedMatchScore,
  };
});

vi.mock("@/lib/supabase/rest-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/rest-client")>();

  return {
    ...actual,
    createSupabaseRestClient: () => restClientMocks,
  };
});

import { POST as saveOwnedScore } from "../app/api/account/tournaments/[tournamentId]/score/route";
import { OwnerMatchScoreConflictError } from "../lib/database";

const tournamentId = "00000000-0000-4000-8000-000000000201";
const ownerUserId = "00000000-0000-4000-8000-0000000000a1";
const otherUserId = "00000000-0000-4000-8000-0000000000b2";

describe("STEP 25I-B2 owner match score API", () => {
  beforeEach(() => {
    authMocks.readAuthAccessCookie.mockReset();
    authMocks.readAccountFromAccessToken.mockReset();
    databaseMocks.readStandard.mockReset();
    databaseMocks.readOwnedMatchScoreVersions.mockReset();
    databaseMocks.saveOwnedMatchScore.mockReset();
    restClientMocks.select.mockReset();

    authMocks.readAuthAccessCookie.mockResolvedValue("auth-cookie-token");
    databaseMocks.readStandard.mockResolvedValue(createScoredState("r1-c1", 21, 10));
    databaseMocks.readOwnedMatchScoreVersions.mockResolvedValue({ "r1-c1": 2, "r1-c2": 1 });
    databaseMocks.saveOwnedMatchScore.mockResolvedValue({ scoreVersion: 2, updatedAt: "2026-08-19T12:00:05.000Z" });
  });

  it("allows the owner to save a match score with match-scoped version protection", async () => {
    authMocks.readAccountFromAccessToken.mockResolvedValue(createAccount(ownerUserId));
    restClientMocks.select.mockResolvedValueOnce([createTournamentRow(ownerUserId)]);

    const response = await saveOwnedScore(createScoreRequest("r1-c1", 21, 10, 1), createRouteContext(tournamentId));
    const body = await response.json() as { ok?: boolean; state?: LiveTournamentState; matchScoreVersions?: Record<string, number> };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.state?.results).toEqual([{ matchId: "r1-c1", teamAPoints: 21, teamBPoints: 10 }]);
    expect(body.matchScoreVersions).toEqual({ "r1-c1": 2, "r1-c2": 1 });
    expect(databaseMocks.saveOwnedMatchScore).toHaveBeenCalledWith({
      tournamentId,
      matchId: "r1-c1",
      teamAPoints: 21,
      teamBPoints: 10,
      expectedScoreVersion: 1,
      actorUserId: ownerUserId,
    }, restClientMocks);
  });

  it("returns 409 with the latest state when the same match version is stale", async () => {
    authMocks.readAccountFromAccessToken.mockResolvedValue(createAccount(ownerUserId));
    restClientMocks.select
      .mockResolvedValueOnce([createTournamentRow(ownerUserId)])
      .mockResolvedValueOnce([{ updated_at: "2026-08-19T12:00:06.000Z" }]);
    databaseMocks.readStandard.mockResolvedValue(createScoredState("r1-c1", 22, 8));
    databaseMocks.readOwnedMatchScoreVersions.mockResolvedValue({ "r1-c1": 2 });
    databaseMocks.saveOwnedMatchScore.mockRejectedValue(new OwnerMatchScoreConflictError("Match score conflict.", 2));

    const response = await saveOwnedScore(createScoreRequest("r1-c1", 5, 5, 1), createRouteContext(tournamentId));
    const body = await response.json() as { ok?: boolean; conflict?: boolean; state?: LiveTournamentState; matchScoreVersions?: Record<string, number> };

    expect(response.status).toBe(409);
    expect(body.ok).toBe(false);
    expect(body.conflict).toBe(true);
    expect(body.state?.results).toEqual([{ matchId: "r1-c1", teamAPoints: 22, teamBPoints: 8 }]);
    expect(body.matchScoreVersions).toEqual({ "r1-c1": 2 });
  });

  it("blocks another user from writing a private owned tournament match", async () => {
    authMocks.readAccountFromAccessToken.mockResolvedValue(createAccount(otherUserId));
    restClientMocks.select.mockResolvedValueOnce([createTournamentRow(ownerUserId)]);

    const response = await saveOwnedScore(createScoreRequest("r1-c1", 21, 10, 1), createRouteContext(tournamentId));

    expect(response.status).toBe(403);
    expect(databaseMocks.saveOwnedMatchScore).not.toHaveBeenCalled();
  });

  it("blocks anonymous score writes before reading private rows", async () => {
    authMocks.readAccountFromAccessToken.mockRejectedValue(new AuthError());

    const response = await saveOwnedScore(createScoreRequest("r1-c1", 21, 10, 1), createRouteContext(tournamentId));

    expect(response.status).toBe(401);
    expect(restClientMocks.select).not.toHaveBeenCalled();
    expect(databaseMocks.saveOwnedMatchScore).not.toHaveBeenCalled();
  });
});

function createScoreRequest(matchId: string, teamAPoints: number, teamBPoints: number, expectedScoreVersion: number): Request {
  return new Request(`http://localhost/api/account/tournaments/${tournamentId}/score`, {
    method: "POST",
    body: JSON.stringify({ matchId, teamAPoints, teamBPoints, expectedScoreVersion }),
  });
}

function createTournamentRow(owner_user_id: string) {
  return {
    id: tournamentId,
    owner_user_id,
    team_competition_mode: null,
    updated_at: "2026-08-19T12:00:00.000Z",
  };
}

function createAccount(userId: string) {
  return {
    userId,
    email: `${userId.slice(-2)}@example.com`,
    displayName: "Account",
    role: "user",
  };
}

function createScoredState(matchId: string, teamAPoints: number, teamBPoints: number): LiveTournamentState {
  return {
    ...createMockLiveTournamentState(),
    results: [{ matchId, teamAPoints, teamBPoints }],
  };
}

function createRouteContext(id: string) {
  return {
    params: Promise.resolve({ tournamentId: id }),
  };
}
