// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createStandardTournamentRepository } from "../lib/database";
import { createSupabaseRestClient } from "../lib/supabase/rest-client";
import { createTournamentFromSetup } from "../lib/tournament-setup";

const runE2E = process.env.RUN_SUPABASE_E2E === "1";
const describeE2E = runE2E ? describe : describe.skip;

interface ProfileRow {
  user_id: string;
}

interface OwnedTournamentRow {
  id: string;
  name: string;
  created_by_user_id: string | null;
  controller_user_id: string | null;
  owner_user_id: string | null;
  legacy_local_id: string | null;
  status: string;
}

describeE2E("STEP 25K owned tournament cloud creation", () => {
  it("creates an authoritative USER-owned row and blocks another actor from taking management", async () => {
    const client = createSupabaseRestClient();
    const repository = createStandardTournamentRepository(client);
    const [creator] = await client.select<ProfileRow>(
      "profiles",
      "username_normalized=eq.lezgotakeovertest&select=user_id&limit=1",
    );

    if (!creator) {
      throw new Error("Missing lezgotakeovertest profile for STEP 25K E2E.");
    }

    const state = createTournamentFromSetup({
      name: `STEP_25K_FIX4_${Date.now()}`,
      format: "Americano",
      playerText: "Hao\nMartin\nRonnie\nSimon",
      femalePlayerText: "",
      malePlayerText: "",
      courts: 1,
      rounds: 2,
      scoringMode: "Fast antal point",
      fixedScoreRule: "target",
      fixedScorePoints: 21,
      firstRoundOrder: "manual",
      rankingMode: "matchPointsFirst",
    });
    const legacyLocalId = `${state.tournamentName.toLocaleLowerCase("da")}-americano`;
    const saved = await repository.save(state, {
      legacyLocalId,
      ownerUserId: creator.user_id,
    });

    try {
      const [row] = await client.select<OwnedTournamentRow>(
        "tournaments",
        `id=eq.${encodeURIComponent(saved.tournamentId)}&select=id,name,created_by_user_id,controller_user_id,owner_user_id,legacy_local_id,status`,
      );
      const accountRows = await client.select<OwnedTournamentRow>(
        "tournaments",
        `or=(created_by_user_id.eq.${encodeURIComponent(creator.user_id)},controller_user_id.eq.${encodeURIComponent(creator.user_id)},owner_user_id.eq.${encodeURIComponent(creator.user_id)})&select=id,name,created_by_user_id,controller_user_id,owner_user_id,legacy_local_id,status`,
      );
      const matchRows = await client.select<{ legacy_match_id: string; score_version: number }>(
        "matches",
        `tournament_id=eq.${encodeURIComponent(saved.tournamentId)}&select=legacy_match_id,score_version`,
      );

      expect(row).toMatchObject({
        id: saved.tournamentId,
        name: state.tournamentName,
        created_by_user_id: creator.user_id,
        controller_user_id: creator.user_id,
        owner_user_id: creator.user_id,
        legacy_local_id: legacyLocalId,
        status: "active",
      });
      expect(accountRows.map((accountRow) => accountRow.id)).toContain(saved.tournamentId);
      expect(matchRows.length).toBeGreaterThan(0);
      expect(matchRows.every((matchRow) => matchRow.score_version === 1)).toBe(true);

      await expect(repository.save(state, {
        legacyLocalId,
        tournamentId: saved.tournamentId,
        ownerUserId: "00000000-0000-4000-8000-00000000b0b0",
      })).rejects.toThrow(/authorization was denied|Could not save tournament snapshot/i);
    } finally {
      await repository.deleteById(saved.tournamentId).catch(() => undefined);
    }
  }, 30000);
});
