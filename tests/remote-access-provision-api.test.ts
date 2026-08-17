import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const repositoryMocks = vi.hoisted(() => ({
  provisionAccess: vi.fn(),
  provisionHandoff: vi.fn(),
  revoke: vi.fn(),
}));

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
  };
});

import { POST as provisionAccess } from "../app/api/supabase/tournament-access/provision/route";
import { POST as revokeAccess } from "../app/api/supabase/tournament-access/revoke/route";
import { POST as provisionHandoff } from "../app/api/supabase/tournament-handoff/provision/route";

describe("STEP 24B remote access provisioning API", () => {
  const previousAccessFlag = process.env.LEZGO_ENABLE_SUPABASE_ACCESS;

  beforeEach(() => {
    process.env.LEZGO_ENABLE_SUPABASE_ACCESS = "1";
    repositoryMocks.provisionAccess.mockReset();
    repositoryMocks.provisionHandoff.mockReset();
    repositoryMocks.revoke.mockReset();
  });

  afterEach(() => {
    if (previousAccessFlag === undefined) {
      delete process.env.LEZGO_ENABLE_SUPABASE_ACCESS;
    } else {
      process.env.LEZGO_ENABLE_SUPABASE_ACCESS = previousAccessFlag;
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
});

function createJsonRequest(path: string, body: Record<string, unknown>): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}
