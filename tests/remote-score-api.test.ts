import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMockLiveTournamentState, saveMatchResult } from "../lib/live-scoring";

const repositoryMocks = vi.hoisted(() => ({
  readByAccess: vi.fn(),
  save: vi.fn(),
}));

vi.mock("@/lib/database", () => {
  class TournamentAccessError extends Error {
    readonly status: number;

    constructor(message: string, status: number) {
      super(message);
      this.name = "TournamentAccessError";
      this.status = status;
      Object.setPrototypeOf(this, TournamentAccessError.prototype);
    }
  }

  return {
    createStandardTournamentRepository: () => ({ save: repositoryMocks.save }),
    createTournamentAccessRepository: () => ({ readByAccess: repositoryMocks.readByAccess }),
    TournamentAccessError,
  };
});

import { POST } from "../app/api/supabase/tournament-access/score/route";

describe("STEP 23A remote score API", () => {
  const previousAccessFlag = process.env.LEZGO_ENABLE_SUPABASE_ACCESS;

  beforeEach(() => {
    process.env.LEZGO_ENABLE_SUPABASE_ACCESS = "1";
    repositoryMocks.readByAccess.mockReset();
    repositoryMocks.save.mockReset();
  });

  afterEach(() => {
    process.env.LEZGO_ENABLE_SUPABASE_ACCESS = previousAccessFlag;
  });

  it("saves a standard tournament score through the server-side repository with optimistic concurrency", async () => {
    const state = createMockLiveTournamentState();
    const match = state.rounds[0].matches[0];
    const expectedState = saveMatchResult(state, { matchId: match.id, teamAPoints: 17, teamBPoints: 7 });
    repositoryMocks.readByAccess.mockResolvedValue({
      tournamentId: "00000000-0000-4000-8000-000000000023",
      accessId: "access-23",
      tournamentCode: "K7M4XP",
      tokenVersion: 1,
      kind: "standard",
      state,
      updatedAt: "2026-08-13T12:00:00.000Z",
      legacyLocalId: "local-step-23a",
    });
    repositoryMocks.save.mockResolvedValue({ tournamentId: "00000000-0000-4000-8000-000000000023", updatedAt: "2026-08-13T12:00:05.000Z" });

    const response = await POST(new Request("http://localhost/api/supabase/tournament-access/score", {
      method: "POST",
      body: JSON.stringify({
        tournamentCode: "K7M4XP",
        shareToken: "2222",
        matchId: match.id,
        teamAPoints: 17,
        teamBPoints: 7,
        expectedUpdatedAt: "2026-08-13T12:00:00.000Z",
      }),
    }));
    const body = await response.json() as { ok: boolean; state: typeof state; updatedAt: string };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.state.results).toContainEqual({ matchId: match.id, teamAPoints: 17, teamBPoints: 7 });
    expect(body.state).toEqual(expectedState);
    expect(body.updatedAt).toBe("2026-08-13T12:00:05.000Z");
    expect(repositoryMocks.readByAccess).toHaveBeenCalledWith("K7M4XP", "2222");
    expect(repositoryMocks.save).toHaveBeenCalledWith(expectedState, {
      legacyLocalId: "local-step-23a",
      tournamentId: "00000000-0000-4000-8000-000000000023",
      expectedUpdatedAt: "2026-08-13T12:00:00.000Z",
    });
  });

  it("rejects Team vs Team snapshots from remote score entry", async () => {
    repositoryMocks.readByAccess.mockResolvedValue({
      tournamentId: "00000000-0000-4000-8000-000000000024",
      accessId: "access-24",
      tournamentCode: "K7M4XP",
      tokenVersion: 1,
      kind: "team-vs-team",
      state: { name: "Team test" },
    });

    const response = await POST(new Request("http://localhost/api/supabase/tournament-access/score", {
      method: "POST",
      body: JSON.stringify({
        tournamentCode: "K7M4XP",
        shareToken: "2222",
        matchId: "match-1",
        teamAPoints: 17,
        teamBPoints: 7,
      }),
    }));

    expect(response.status).toBe(400);
    expect(repositoryMocks.save).not.toHaveBeenCalled();
  });

  it("rejects invalid score payloads before reading or writing tournament data", async () => {
    const response = await POST(new Request("http://localhost/api/supabase/tournament-access/score", {
      method: "POST",
      body: JSON.stringify({
        tournamentCode: "K7M4XP",
        shareToken: "2222",
        matchId: "match-1",
        teamAPoints: 17,
        teamBPoints: "",
      }),
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ ok: false, error: "Indtast en gyldig score." });
    expect(repositoryMocks.readByAccess).not.toHaveBeenCalled();
    expect(repositoryMocks.save).not.toHaveBeenCalled();
  });

  it("returns a typed conflict response without hiding the save failure", async () => {
    const state = createMockLiveTournamentState();
    repositoryMocks.readByAccess.mockResolvedValue({
      tournamentId: "00000000-0000-4000-8000-000000000025",
      accessId: "access-25",
      tournamentCode: "K7M4XP",
      tokenVersion: 1,
      kind: "standard",
      state,
    });
    repositoryMocks.save.mockRejectedValue(new Error("Conflict: newer version exists."));

    const response = await POST(new Request("http://localhost/api/supabase/tournament-access/score", {
      method: "POST",
      body: JSON.stringify({
        tournamentCode: "K7M4XP",
        shareToken: "2222",
        matchId: state.rounds[0].matches[0].id,
        teamAPoints: 17,
        teamBPoints: 7,
      }),
    }));

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ ok: false, error: "Conflict: newer version exists." });
  });

  it("does not expose the route when tournament access is disabled", async () => {
    process.env.LEZGO_ENABLE_SUPABASE_ACCESS = "0";

    const response = await POST(new Request("http://localhost/api/supabase/tournament-access/score", {
      method: "POST",
      body: JSON.stringify({
        tournamentCode: "K7M4XP",
        shareToken: "2222",
        matchId: "match-1",
        teamAPoints: 17,
        teamBPoints: 7,
      }),
    }));

    expect(response.status).toBe(503);
    expect(repositoryMocks.readByAccess).not.toHaveBeenCalled();
    expect(repositoryMocks.save).not.toHaveBeenCalled();
  });
});
