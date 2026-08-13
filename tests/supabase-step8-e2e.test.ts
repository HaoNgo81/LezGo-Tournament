// @vitest-environment node
import { describe, expect, it } from "vitest";
import { saveMatchResult } from "../lib/live-scoring";
import { createStandardTournamentRepository, createStandardTournamentWritePlan, mapLiveTournamentToPersistencePayload } from "../lib/database";
import { createTournamentFromSetup } from "../lib/tournament-setup";

const runE2E = process.env.RUN_SUPABASE_E2E === "1";
const describeE2E = runE2E ? describe : describe.skip;

describeE2E("STEP 8 Supabase round-trip", () => {
  it("writes, reads back, verifies relations, rolls back invalid data, and cleans up STEP_08_TEST data", async () => {
    const repository = createStandardTournamentRepository();
    const initialState = createTournamentFromSetup({
      name: "STEP_08_TEST Round Trip",
      format: "Americano",
      playerText: Array.from({ length: 4 }, (_, index) => `STEP_08_TEST Spiller ${index + 1}`).join("\n"),
      femalePlayerText: "",
      malePlayerText: "",
      courts: 1,
      rounds: 1,
      scoringMode: "Fast antal point",
      fixedScoreRule: "total",
      fixedScorePoints: 24,
      firstRoundOrder: "manual",
      rankingMode: "matchPointsFirst",
    });
    const state = saveMatchResult(initialState, { matchId: initialState.rounds[0].matches[0].id, teamAPoints: 17, teamBPoints: 7 });
    const saved = await repository.save(state, { legacyLocalId: `STEP_08_TEST_${Date.now()}` });

    try {
      const readBack = await repository.read(saved.tournamentId);

      expect(readBack.tournamentName).toBe(state.tournamentName);
      expect(readBack.format).toBe(state.format);
      expect(readBack.players).toEqual(state.players);
      expect(readBack.rounds).toEqual(state.rounds);
      expect(readBack.results).toEqual(state.results);

      const brokenPayload = mapLiveTournamentToPersistencePayload(state, { legacyLocalId: `STEP_08_TEST_ROLLBACK_${Date.now()}` });
      const brokenPlan = createStandardTournamentWritePlan(brokenPayload);
      const brokenTournamentId = brokenPlan.operations.find((operation) => operation.table === "tournaments")?.rows?.[0]?.id as string;
      const brokenOperations = brokenPlan.operations.map((operation) =>
        operation.table === "match_side_players"
          ? { ...operation, rows: operation.rows?.map((row) => ({ ...row, tournament_player_id: "00000000-0000-4000-8000-999999999999" })) }
          : operation,
      );

      await expect(fetch(`${process.env.SUPABASE_URL?.replace(/\/$/, "")}/rest/v1/rpc/lezgo_save_standard_tournament_snapshot`, {
        method: "POST",
        headers: {
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
          authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ p_operations: brokenOperations }),
      }).then(async (response) => {
        if (response.ok) {
          throw new Error("Expected rollback RPC to fail.");
        }
      })).resolves.toBeUndefined();

      await expect(repository.read(brokenTournamentId)).rejects.toThrow("not found");
      const stillReadable = await repository.read(saved.tournamentId);
      expect(stillReadable.results).toEqual(state.results);
    } finally {
      await repository.deleteById(saved.tournamentId);
      await expect(repository.read(saved.tournamentId)).rejects.toThrow("not found");
    }
  });
});
