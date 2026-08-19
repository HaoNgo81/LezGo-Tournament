// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { GET as readPublicResult } from "../app/api/result/[resultId]/route";
import { POST as publishPublicResult } from "../app/api/supabase/result-snapshots/publish/route";
import { createOrganizerToken, createStandardTournamentRepository } from "../lib/database";
import { finishTournament, createMockLiveTournamentState, saveMatchResult } from "../lib/live-scoring";
import { createSupabaseRestClient } from "../lib/supabase/rest-client";

const runE2E = process.env.RUN_SUPABASE_E2E === "1";
const describeE2E = runE2E ? describe : describe.skip;

describeE2E("STEP 25G public final result sharing", () => {
  const originalAccessFlag = process.env.LEZGO_ENABLE_SUPABASE_ACCESS;
  const createdTournamentIds: string[] = [];
  const createdResultIds: string[] = [];

  afterEach(async () => {
    if (originalAccessFlag === undefined) {
      delete process.env.LEZGO_ENABLE_SUPABASE_ACCESS;
    } else {
      process.env.LEZGO_ENABLE_SUPABASE_ACCESS = originalAccessFlag;
    }

    const client = createSupabaseRestClient();
    const standardRepository = createStandardTournamentRepository(client);

    for (const resultId of createdResultIds.splice(0).reverse()) {
      await client.delete("public_result_snapshots", `id=eq.${encodeURIComponent(resultId)}`).catch(() => undefined);
    }

    for (const tournamentId of createdTournamentIds.splice(0).reverse()) {
      await standardRepository.deleteById(tournamentId).catch(() => undefined);
    }
  });

  it("publishes a final result snapshot and reads it from a clean public route", async () => {
    process.env.LEZGO_ENABLE_SUPABASE_ACCESS = "1";
    const standardRepository = createStandardTournamentRepository();
    const activeState = {
      ...createMockLiveTournamentState(),
      tournamentName: "STEP_25G_TEST Final Result",
    };
    const scoredState = saveMatchResult(activeState, {
      matchId: activeState.rounds[0].matches[0].id,
      teamAPoints: 21,
      teamBPoints: 9,
    });
    const finishedState = finishTournament(scoredState, "2026-08-19T19:00:00.000Z");
    const saved = await standardRepository.save(finishedState, { legacyLocalId: "STEP_25G_TEST_FINAL_RESULT" });
    createdTournamentIds.push(saved.tournamentId);

    const response = await publishPublicResult(new Request("https://lez-go-tournament.vercel.app/api/supabase/result-snapshots/publish", {
      method: "POST",
      body: JSON.stringify({
        kind: "standard",
        legacyLocalId: "STEP_25G_TEST_FINAL_RESULT",
        organizerToken: createOrganizerToken({ tournamentId: saved.tournamentId, kind: "standard", legacyLocalId: "STEP_25G_TEST_FINAL_RESULT" }),
        tournamentId: saved.tournamentId,
        state: finishedState,
      }),
    }));
    const body = await response.json() as { ok: boolean; resultId?: string; resultUrl?: string; snapshot?: { rows?: Array<{ rank: number; name: string; scorePoints?: number }> }; error?: string };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.resultId).toMatch(/^[A-HJ-NP-Z2-9]{12,24}$/);

    if (!body.resultId) {
      throw new Error("Missing resultId.");
    }

    createdResultIds.push(body.resultId);
    expect(body.resultUrl).toBe(`https://lez-go-tournament.vercel.app/result/${body.resultId}`);
    expect(body.resultUrl).not.toMatch(/token|secret|pin|share/i);

    const readResponse = await readPublicResult(
      new Request(`https://lez-go-tournament.vercel.app/api/result/${body.resultId}`),
      { params: Promise.resolve({ resultId: body.resultId }) },
    );
    const readBody = await readResponse.json() as { ok: boolean; snapshot?: { tournamentName?: string; rows?: Array<{ rank: number; name: string; scorePoints?: number }> } };

    expect(readResponse.status).toBe(200);
    expect(readBody.ok).toBe(true);
    expect(readBody.snapshot?.tournamentName).toBe("STEP_25G_TEST Final Result");
    expect(readBody.snapshot?.rows).toEqual(body.snapshot?.rows);
    expect(JSON.stringify(readBody)).not.toMatch(/organizerToken|shareToken|serviceRole|SUPABASE_SERVICE_ROLE_KEY|secret/i);
  }, 30000);
});
