// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { OwnerMatchScoreConflictError, readOwnedMatchScoreVersions, saveOwnedMatchScore } from "../lib/database";
import type { SupabaseRestClient } from "../lib/supabase/rest-client";

describe("STEP 25I-B2 owner match score repository helpers", () => {
  it("calls the match-scoped owner score RPC and maps score versions by legacy match id", async () => {
    const client = createClient({
      rpcResult: { ok: true, scoreVersion: 2, updatedAt: "2026-08-19T12:00:05.000Z" },
      versionRows: [
        { legacy_match_id: "r1-c1", score_version: 2 },
        { legacy_match_id: "r1-c2", score_version: 1 },
      ],
    });

    await expect(saveOwnedMatchScore({
      tournamentId: "00000000-0000-4000-8000-000000000201",
      matchId: "r1-c1",
      teamAPoints: 21,
      teamBPoints: 10,
      expectedScoreVersion: 1,
      actorUserId: "00000000-0000-4000-8000-0000000000a1",
    }, client)).resolves.toEqual({
      scoreVersion: 2,
      updatedAt: "2026-08-19T12:00:05.000Z",
    });
    expect(client.rpc).toHaveBeenCalledWith("lezgo_save_owned_match_score_v1", {
      p_tournament_id: "00000000-0000-4000-8000-000000000201",
      p_legacy_match_id: "r1-c1",
      p_team_a_points: 21,
      p_team_b_points: 10,
      p_expected_score_version: 1,
      p_actor_user_id: "00000000-0000-4000-8000-0000000000a1",
    });
    await expect(readOwnedMatchScoreVersions(client, "00000000-0000-4000-8000-000000000201")).resolves.toEqual({
      "r1-c1": 2,
      "r1-c2": 1,
    });
  });

  it("turns stale same-match RPC responses into a typed conflict error", async () => {
    const client = createClient({
      rpcResult: { ok: false, conflict: true, latestScoreVersion: 3 },
      versionRows: [],
    });

    await expect(saveOwnedMatchScore({
      tournamentId: "00000000-0000-4000-8000-000000000201",
      matchId: "r1-c1",
      teamAPoints: 5,
      teamBPoints: 5,
      expectedScoreVersion: 2,
      actorUserId: "00000000-0000-4000-8000-0000000000a1",
    }, client)).rejects.toBeInstanceOf(OwnerMatchScoreConflictError);
  });
});

function createClient({ rpcResult, versionRows }: { rpcResult: unknown; versionRows: Array<{ legacy_match_id: string; score_version: number }> }): SupabaseRestClient {
  return {
    rpc: vi.fn().mockResolvedValue(rpcResult),
    select: vi.fn().mockResolvedValue(versionRows),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
}
