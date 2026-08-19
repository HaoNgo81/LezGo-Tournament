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
  readTeamVsTeam: vi.fn(),
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
    createTeamVsTeamTournamentRepository: () => ({ read: databaseMocks.readTeamVsTeam }),
    createOrganizerToken: () => "OWNER_ORGANIZER_TOKEN",
  };
});

vi.mock("@/lib/supabase/rest-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/rest-client")>();

  return {
    ...actual,
    createSupabaseRestClient: () => restClientMocks,
  };
});

import { GET as openOwnedTournament } from "../app/api/account/tournaments/[tournamentId]/route";

describe("STEP 25I-B1 owner cloud tournament open API", () => {
  beforeEach(() => {
    authMocks.readAuthAccessCookie.mockReset();
    authMocks.readAccountFromAccessToken.mockReset();
    databaseMocks.readStandard.mockReset();
    databaseMocks.readTeamVsTeam.mockReset();
    restClientMocks.select.mockReset();
    authMocks.readAuthAccessCookie.mockResolvedValue("auth-cookie-token");
  });

  it("allows the owner to open an owned standard tournament from Supabase", async () => {
    const state = createCloudState("Cloud restored", 2);
    authMocks.readAccountFromAccessToken.mockResolvedValue(createAccount("00000000-0000-4000-8000-0000000000a1"));
    restClientMocks.select.mockResolvedValue([{
      id: "00000000-0000-4000-8000-000000000101",
      format: "americano",
      legacy_local_id: "cloud restored-americano",
      owner_user_id: "00000000-0000-4000-8000-0000000000a1",
      team_competition_mode: null,
      updated_at: "2026-08-19T10:00:00.000Z",
    }]);
    databaseMocks.readStandard.mockResolvedValue(state);

    const response = await openOwnedTournament(new Request("http://localhost/api/account/tournaments/00000000-0000-4000-8000-000000000101"), createRouteContext("00000000-0000-4000-8000-000000000101"));
    const body = await response.json() as { ok?: boolean; kind?: string; state?: LiveTournamentState; tournamentId?: string; updatedAt?: string; legacyLocalId?: string; organizerToken?: string };

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      kind: "standard",
      tournamentId: "00000000-0000-4000-8000-000000000101",
      updatedAt: "2026-08-19T10:00:00.000Z",
      legacyLocalId: "cloud restored-americano",
      organizerToken: "OWNER_ORGANIZER_TOKEN",
    });
    expect(body.state?.tournamentName).toBe("Cloud restored");
    expect(databaseMocks.readStandard).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000101");
  });

  it("blocks another normal user from opening a private owned tournament", async () => {
    authMocks.readAccountFromAccessToken.mockResolvedValue(createAccount("00000000-0000-4000-8000-0000000000b2"));
    restClientMocks.select.mockResolvedValue([{
      id: "00000000-0000-4000-8000-000000000102",
      format: "americano",
      legacy_local_id: "private-americano",
      owner_user_id: "00000000-0000-4000-8000-0000000000a1",
      team_competition_mode: null,
      updated_at: "2026-08-19T10:00:00.000Z",
    }]);

    const response = await openOwnedTournament(new Request("http://localhost/api/account/tournaments/00000000-0000-4000-8000-000000000102"), createRouteContext("00000000-0000-4000-8000-000000000102"));

    expect(response.status).toBe(403);
    expect(databaseMocks.readStandard).not.toHaveBeenCalled();
  });

  it("blocks anonymous owned tournament opens before reading private rows", async () => {
    authMocks.readAccountFromAccessToken.mockRejectedValue(new AuthError());

    const response = await openOwnedTournament(new Request("http://localhost/api/account/tournaments/00000000-0000-4000-8000-000000000103"), createRouteContext("00000000-0000-4000-8000-000000000103"));

    expect(response.status).toBe(401);
    expect(restClientMocks.select).not.toHaveBeenCalled();
  });
});

function createAccount(userId: string) {
  return {
    userId,
    email: `${userId.slice(-2)}@example.com`,
    displayName: "Account",
    role: "user",
  };
}

function createCloudState(name: string, activeRoundNumber: number): LiveTournamentState {
  return {
    ...createMockLiveTournamentState(),
    tournamentName: name,
    activeRoundNumber,
  };
}

function createRouteContext(tournamentId: string) {
  return {
    params: Promise.resolve({ tournamentId }),
  };
}
