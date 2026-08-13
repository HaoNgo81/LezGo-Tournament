// @vitest-environment node
import { describe, expect, it } from "vitest";
import { saveMatchResult } from "../lib/live-scoring";
import {
  createStandardTournamentRepository,
  createTeamVsTeamTournamentRepository,
  createStandardTournamentWritePlan,
  mapLiveTournamentToPersistencePayload,
} from "../lib/database";
import { createPoolTournamentFromSetup, createTeamVsTeamTournamentFromSetup, createTournamentFromSetup, type TeamVsTeamTournamentState } from "../lib/tournament-setup";

const runE2E = process.env.RUN_SUPABASE_E2E === "1";
const describeE2E = runE2E ? describe : describe.skip;

describeE2E("STEP 9 complete Supabase persistence", () => {
  it("round-trips standard, fixed partner, pool, Team vs Team, update, rollback and conflict", async () => {
    const standardRepository = createStandardTournamentRepository();
    const teamRepository = createTeamVsTeamTournamentRepository();
    const createdIds: string[] = [];

    try {
      const standardState = createStandardState("STEP_09_TEST Standard", "Americano");
      const savedStandard = await standardRepository.save(standardState, { legacyLocalId: `STEP_09_TEST_STANDARD_${Date.now()}` });
      createdIds.push(savedStandard.tournamentId);
      await expect(standardRepository.read(savedStandard.tournamentId)).resolves.toMatchObject({
        tournamentName: standardState.tournamentName,
        format: standardState.format,
        results: standardState.results,
      });

      const fixedState = createStandardState("STEP_09_TEST Fast Makker", "Fast Makker Americano");
      const savedFixed = await standardRepository.save(fixedState, { legacyLocalId: `STEP_09_TEST_FIXED_${Date.now()}` });
      createdIds.push(savedFixed.tournamentId);
      const fixedReadBack = await standardRepository.read(savedFixed.tournamentId);
      expect(fixedReadBack.players).toEqual(fixedState.players);
      expect(fixedReadBack.rounds).toEqual(fixedState.rounds);

      const modifiedFixed = saveMatchResult({ ...fixedReadBack, results: [] }, { matchId: fixedReadBack.rounds[0].matches[0].id, teamAPoints: 18, teamBPoints: 6 });
      const updatedFixed = await standardRepository.save(modifiedFixed, {
        legacyLocalId: `STEP_09_TEST_FIXED_${Date.now()}`,
        tournamentId: savedFixed.tournamentId,
      });
      const updatedFixedReadBack = await standardRepository.read(savedFixed.tournamentId);
      expect(updatedFixed.saveMode).toBe("replace");
      expect(updatedFixed.tournamentId).toBe(savedFixed.tournamentId);
      expect(updatedFixedReadBack.results).toEqual([{ matchId: fixedReadBack.rounds[0].matches[0].id, teamAPoints: 18, teamBPoints: 6 }]);

      const poolState = createPoolTournamentFromSetup({
        name: "STEP_09_TEST Pool",
        participantType: "pair",
        participantText: ["Par A", "Par B", "Par C", "Par D"].join("\n"),
        poolCount: 2,
        participantsPerPool: 2,
        advancementMode: "crossMatches",
        unmatchedResolution: "bye",
        scoringMode: "Fri scoring",
        rankingMode: "matchPointsFirst",
      });
      const savedPool = await standardRepository.save(poolState, { legacyLocalId: `STEP_09_TEST_POOL_${Date.now()}` });
      createdIds.push(savedPool.tournamentId);
      await expect(standardRepository.read(savedPool.tournamentId)).resolves.toEqual(poolState);

      const teamState = createTeamState();
      const savedTeam = await teamRepository.save(teamState, { legacyLocalId: `STEP_09_TEST_TEAM_${Date.now()}` });
      createdIds.push(savedTeam.tournamentId);
      await expect(teamRepository.read(savedTeam.tournamentId)).resolves.toEqual(teamState);

      await expect(teamRepository.read("00000000-0000-4000-8000-000000009999")).rejects.toThrow("not found");

      const rollbackOriginal = await standardRepository.read(savedStandard.tournamentId);
      const brokenPayload = mapLiveTournamentToPersistencePayload({ ...rollbackOriginal, tournamentName: "STEP_09_TEST Broken" }, { legacyLocalId: `STEP_09_TEST_BROKEN_${Date.now()}` });
      const brokenPlan = createStandardTournamentWritePlan(brokenPayload, { tournamentId: savedStandard.tournamentId });
      const brokenOperations = brokenPlan.operations.map((operation) =>
        operation.table === "match_side_players"
          ? { ...operation, rows: operation.rows?.map((row) => ({ ...row, tournament_player_id: "00000000-0000-4000-8000-999999999999" })) }
          : operation,
      );

      await expect(callRpc("lezgo_save_tournament_snapshot_v2", { p_operations: brokenOperations, p_expected_updated_at: null })).rejects.toThrow();
      await expect(standardRepository.read(savedStandard.tournamentId)).resolves.toEqual(rollbackOriginal);

      const conflictOriginal = await standardRepository.read(savedFixed.tournamentId);
      const aState = { ...conflictOriginal, tournamentName: "STEP_09_TEST Conflict A" };
      const bState = { ...conflictOriginal, tournamentName: "STEP_09_TEST Conflict B" };
      const staleVersion = await getTournamentUpdatedAt(savedFixed.tournamentId);
      await standardRepository.save(aState, {
        legacyLocalId: `STEP_09_TEST_CONFLICT_A_${Date.now()}`,
        tournamentId: savedFixed.tournamentId,
        expectedUpdatedAt: staleVersion,
      });

      await expect(standardRepository.save(bState, {
        legacyLocalId: `STEP_09_TEST_CONFLICT_B_${Date.now()}`,
        tournamentId: savedFixed.tournamentId,
        expectedUpdatedAt: staleVersion,
      })).rejects.toThrow("conflict");
      await expect(standardRepository.read(savedFixed.tournamentId)).resolves.toMatchObject({ tournamentName: "STEP_09_TEST Conflict A" });
    } finally {
      for (const id of createdIds.reverse()) {
        await standardRepository.deleteById(id).catch(() => teamRepository.deleteById(id).catch(() => undefined));
      }
    }
  }, 30000);
});

function createStandardState(name: string, format: "Americano" | "Fast Makker Americano") {
  const playerCount = format === "Americano" ? 4 : 8;
  const initialState = createTournamentFromSetup({
    name,
    format,
    playerText: Array.from({ length: playerCount }, (_, index) => `STEP_09_TEST Spiller ${index + 1}`).join("\n"),
    femalePlayerText: "",
    malePlayerText: "",
    courts: format === "Americano" ? 1 : 2,
    rounds: 1,
    scoringMode: "Fast antal point",
    fixedScoreRule: "total",
    fixedScorePoints: 24,
    firstRoundOrder: "manual",
    rankingMode: "matchPointsFirst",
  });

  return saveMatchResult(initialState, { matchId: initialState.rounds[0].matches[0].id, teamAPoints: 17, teamBPoints: 7 });
}

function createTeamState(): TeamVsTeamTournamentState {
  const state = {
    ...createTeamVsTeamTournamentFromSetup({
      name: "STEP_09_TEST Team",
      scoringMode: "Fri scoring",
      teamCount: 2,
      competitionMode: "knockout",
      drawMode: "manual",
      playersPerTeam: 4,
      matchFormat: "oneSet",
      teams: [createTeam("a", "Hold A"), createTeam("b", "Hold B")],
    }),
    status: "active" as const,
  };
  const matchup = state.matchups[0];

  return {
    ...state,
    matchups: [
      {
        ...matchup,
        lineups: [
          {
            roundNumber: 1,
            match1: { teamAPlayerIds: ["a1", "a2"], teamBPlayerIds: ["b1", "b2"] },
            match2: { teamAPlayerIds: ["a3", "a4"], teamBPlayerIds: ["b3", "b4"] },
          },
        ],
        roundResults: [
          {
            roundNumber: 1,
            match1: { sets: [{ teamAPoints: 6, teamBPoints: 2 }] },
            match2: { sets: [{ teamAPoints: 3, teamBPoints: 6 }] },
          },
        ],
      },
    ],
  };
}

function createTeam(idPrefix: string, name: string) {
  return {
    id: `team-${idPrefix}`,
    name,
    captainPlayerId: `${idPrefix}1`,
    players: Array.from({ length: 4 }, (_, index) => ({ id: `${idPrefix}${index + 1}`, name: `${name} spiller ${index + 1}` })),
  };
}

async function getTournamentUpdatedAt(tournamentId: string): Promise<string> {
  const rows = await restSelect<{ updated_at: string }>("tournaments", `id=eq.${tournamentId}&select=updated_at`);
  const updatedAt = rows[0]?.updated_at;

  if (!updatedAt) {
    throw new Error("Missing updated_at for conflict test.");
  }

  return updatedAt;
}

async function callRpc(functionName: string, body: Record<string, unknown>): Promise<unknown> {
  const response = await fetch(`${process.env.SUPABASE_URL?.replace(/\/$/, "")}/rest/v1/rpc/${functionName}`, {
    method: "POST",
    headers: getServiceHeaders(),
    body: JSON.stringify(body),
  });
  const text = await response.text();

  if (!response.ok) {
    throw new Error(text || response.statusText);
  }

  return text ? JSON.parse(text) : null;
}

async function restSelect<T>(table: string, query: string): Promise<T[]> {
  const response = await fetch(`${process.env.SUPABASE_URL?.replace(/\/$/, "")}/rest/v1/${table}?${query}`, {
    headers: getServiceHeaders(),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return await response.json() as T[];
}

function getServiceHeaders(): HeadersInit {
  return {
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""}`,
    "content-type": "application/json",
  };
}
