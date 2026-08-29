import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { finishTournament, createMockLiveTournamentState } from "../lib/live-scoring";

const repositoryMocks = vi.hoisted(() => ({
  publishStandard: vi.fn(),
  read: vi.fn(),
  revokeStandard: vi.fn(),
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
    createPublicResultSnapshotRepository: () => ({
      publishStandard: repositoryMocks.publishStandard,
      read: repositoryMocks.read,
      revokeStandard: repositoryMocks.revokeStandard,
    }),
    assertOrganizerToken: (token: string | undefined) => {
      if (token !== "VALID_ORGANIZER_TOKEN") {
        throw new actual.OrganizerTokenError();
      }

      return {
        v: 1,
        scope: "tournament-organizer",
        tournamentId: "00000000-0000-4000-8000-000000000261",
        kind: "standard",
        legacyLocalId: "step-25g-result",
        iat: 0,
      };
    },
  };
});

import { GET as readPublicResult } from "../app/api/result/[resultId]/route";
import { POST as publishPublicResult } from "../app/api/supabase/result-snapshots/publish/route";
import { POST as revokePublicResult } from "../app/api/supabase/result-snapshots/revoke/route";

const previousAccessFlag = process.env.LEZGO_ENABLE_SUPABASE_ACCESS;
const previousPublicOrigin = process.env.LEZGO_PUBLIC_APP_ORIGIN;

describe("STEP 25G public result API", () => {
  beforeEach(() => {
    process.env.LEZGO_ENABLE_SUPABASE_ACCESS = "1";
    process.env.LEZGO_PUBLIC_APP_ORIGIN = "https://app.lezgopadel.dk";
    repositoryMocks.publishStandard.mockReset();
    repositoryMocks.read.mockReset();
    repositoryMocks.revokeStandard.mockReset();
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
  });

  it("publishes a completed result with organizer authorization and returns a public URL", async () => {
    const state = finishTournament(createMockLiveTournamentState(), "2026-08-19T18:30:00.000Z");
    repositoryMocks.publishStandard.mockResolvedValue({
      resultId: "ABCDEFGHJKLM2345",
      tournamentId: "00000000-0000-4000-8000-000000000261",
      tournamentName: state.tournamentName,
      format: state.format,
      formatLabel: "Americano",
      participantCount: 8,
      rows: [],
    });

    const response = await publishPublicResult(new Request("https://lezgotournament.vercel.app/api/supabase/result-snapshots/publish", {
      method: "POST",
      body: JSON.stringify({
        kind: "standard",
        legacyLocalId: "step-25g-result",
        organizerToken: "VALID_ORGANIZER_TOKEN",
        tournamentId: "00000000-0000-4000-8000-000000000261",
        state,
      }),
    }));
    const body = await response.json() as { ok: boolean; resultUrl?: string };

    expect(response.status).toBe(200);
    expect(body.resultUrl).toBe("https://lezgotournament.vercel.app/result/ABCDEFGHJKLM2345");
    expect(body.resultUrl).not.toMatch(/token|secret|pin|share/i);
    expect(repositoryMocks.publishStandard).toHaveBeenCalledWith({
      tournamentId: "00000000-0000-4000-8000-000000000261",
      state,
    });
  });

  it("falls back to the working Vercel result origin instead of stale custom domain for unreachable request origins", async () => {
    const state = finishTournament(createMockLiveTournamentState(), "2026-08-19T18:30:00.000Z");
    repositoryMocks.publishStandard.mockResolvedValue({
      resultId: "ABCDEFGHJKLM2345",
      tournamentId: "00000000-0000-4000-8000-000000000261",
      tournamentName: state.tournamentName,
      format: state.format,
      formatLabel: "Americano",
      participantCount: 8,
      rows: [],
    });

    const response = await publishPublicResult(new Request("http://0.0.0.0:3015/api/supabase/result-snapshots/publish", {
      method: "POST",
      body: JSON.stringify({
        kind: "standard",
        legacyLocalId: "step-25g-result",
        organizerToken: "VALID_ORGANIZER_TOKEN",
        tournamentId: "00000000-0000-4000-8000-000000000261",
        state,
      }),
    }));
    const body = await response.json() as { ok: boolean; resultUrl?: string };

    expect(response.status).toBe(200);
    expect(body.resultUrl).toBe("https://lezgotournament.vercel.app/result/ABCDEFGHJKLM2345");
    expect(body.resultUrl).not.toContain("app.lezgopadel.dk");
    expect(body.resultUrl).not.toContain("lez-go-tournament.vercel.app");
  });

  it("rejects result publishing without organizer authorization", async () => {
    const response = await publishPublicResult(new Request("http://localhost/api/supabase/result-snapshots/publish", {
      method: "POST",
      body: JSON.stringify({
        kind: "standard",
        legacyLocalId: "step-25g-result",
        tournamentId: "00000000-0000-4000-8000-000000000261",
        state: finishTournament(createMockLiveTournamentState()),
      }),
    }));

    expect(response.status).toBe(403);
    expect(repositoryMocks.publishStandard).not.toHaveBeenCalled();
  });

  it("revokes a public result with organizer authorization", async () => {
    const response = await revokePublicResult(new Request("https://lezgotournament.vercel.app/api/supabase/result-snapshots/revoke", {
      method: "POST",
      body: JSON.stringify({
        kind: "standard",
        legacyLocalId: "step-25g-result",
        organizerToken: "VALID_ORGANIZER_TOKEN",
        tournamentId: "00000000-0000-4000-8000-000000000261",
      }),
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true });
    expect(repositoryMocks.revokeStandard).toHaveBeenCalledWith({
      tournamentId: "00000000-0000-4000-8000-000000000261",
    });
  });

  it("blocks unauthenticated revocation attempts without organizer authorization", async () => {
    const response = await revokePublicResult(new Request("https://lezgotournament.vercel.app/api/supabase/result-snapshots/revoke", {
      method: "POST",
      body: JSON.stringify({
        kind: "standard",
        legacyLocalId: "step-25g-result",
        tournamentId: "00000000-0000-4000-8000-000000000261",
      }),
    }));

    expect(response.status).toBe(403);
    expect(repositoryMocks.revokeStandard).not.toHaveBeenCalled();
  });

  it("blocks stale former-controller result publishing for an account-owned tournament", async () => {
    const state = finishTournament(createMockLiveTournamentState(), "2026-08-19T18:30:00.000Z");
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

    const response = await publishPublicResult(new Request("https://lezgotournament.vercel.app/api/supabase/result-snapshots/publish", {
      method: "POST",
      body: JSON.stringify({
        kind: "standard",
        legacyLocalId: "step-25g-result",
        organizerToken: "VALID_ORGANIZER_TOKEN",
        tournamentId: "00000000-0000-4000-8000-000000000261",
        state,
      }),
    }));

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: "Du har ikke længere styring af denne turnering.",
    });
    expect(repositoryMocks.publishStandard).not.toHaveBeenCalled();
  });

  it("reads a public result snapshot without returning private access material", async () => {
    repositoryMocks.read.mockResolvedValue({
      resultId: "ABCDEFGHJKLM2345",
      tournamentId: "00000000-0000-4000-8000-000000000261",
      tournamentName: "Result Test",
      rows: [{ id: "p1", rank: 1, name: "Hao", matchPoints: 3, scorePoints: 21 }],
    });

    const response = await readPublicResult(
      new Request("http://localhost/api/result/ABCDEFGHJKLM2345"),
      { params: Promise.resolve({ resultId: "ABCDEFGHJKLM2345" }) },
    );
    const body = await response.json() as Record<string, unknown>;
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(200);
    expect(serialized).toContain("Result Test");
    expect(serialized).not.toMatch(/organizerToken|shareToken|serviceRole|SUPABASE_SERVICE_ROLE_KEY|secret|owner|email|password/i);
  });

  it("handles malformed public result IDs safely", async () => {
    repositoryMocks.read.mockRejectedValue(new (await import("@/lib/database")).PublicResultSnapshotError("Public result was not found.", 404));

    const response = await readPublicResult(
      new Request("http://localhost/api/result/bad-token"),
      { params: Promise.resolve({ resultId: "bad-token" }) },
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ ok: false, error: "Public result was not found." });
  });
});

function createTournamentAuthorityRow(owner_user_id: string | null, created_by_user_id: string | null, controller_user_id: string | null) {
  return {
    owner_user_id,
    created_by_user_id,
    controller_user_id,
  };
}
