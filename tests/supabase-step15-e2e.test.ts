// @vitest-environment node
import { describe, expect, it } from "vitest";
import { POST as redeemHandoff } from "../app/api/supabase/tournament-handoff/redeem/route";
import {
  createStandardTournamentRepository,
  createStandardTournamentWritePlan,
  createTeamVsTeamTournamentRepository,
  createTournamentAccessRepository,
  createTournamentHandoffRepository,
  mapLiveTournamentToPersistencePayload,
  type TournamentAccessRecord,
  type TournamentHandoffRecord,
} from "../lib/database";
import { advanceLivePoolPlayState, saveInitialPoolResult, saveMatchResult, type LiveTournamentState } from "../lib/live-scoring";
import { createPoolTournamentFromSetup, createTeamVsTeamTournamentFromSetup, createTournamentFromSetup, type TeamVsTeamTournamentState } from "../lib/tournament-setup";

const runE2E = process.env.RUN_SUPABASE_E2E === "1";
const describeE2E = runE2E ? describe : describe.skip;

describeE2E("STEP 15 remote live sync persistence", () => {
  it("preserves access and handoffs across repeated atomic snapshot saves", async () => {
    process.env.LEZGO_ENABLE_SUPABASE_ACCESS = "1";
    const standardRepository = createStandardTournamentRepository();
    const teamRepository = createTeamVsTeamTournamentRepository();
    const handoffRepository = createTournamentHandoffRepository();
    const createdIds: string[] = [];

    try {
      const initialState = createStandardState("STEP_15_TEST Device A", "Americano", 17, 7);
      const saved = await standardRepository.save(initialState, { legacyLocalId: `STEP_15_TEST_STANDARD_${Date.now()}` });
      createdIds.push(saved.tournamentId);
      const handoff = await handoffRepository.provision(saved.tournamentId);
      const accessBefore = await readAccess(saved.tournamentId);
      const handoffsBefore = await readHandoffs(accessBefore.id);
      expect(handoffsBefore).toHaveLength(1);

      const deviceBInitial = await redeem(handoff.handoffReference);
      expect(deviceBInitial.kind).toBe("standard");
      expect((deviceBInitial.state as LiveTournamentState).results).toEqual(initialState.results);

      const savedSecond = await saveScore(standardRepository, initialState, saved.tournamentId, saved.updatedAt, 20, 4);
      const accessAfterSecond = await readAccess(saved.tournamentId);
      const handoffsAfterSecond = await readHandoffs(accessBefore.id);
      expect(savedSecond.tournamentId).toBe(saved.tournamentId);
      expect(accessAfterSecond.id).toBe(accessBefore.id);
      expect(handoffsAfterSecond.map((row) => row.id)).toEqual(handoffsBefore.map((row) => row.id));
      const deviceBAfterSecond = await redeem(handoff.handoffReference);
      expect((deviceBAfterSecond.state as LiveTournamentState).results).toEqual([{ matchId: initialState.rounds[0].matches[0].id, teamAPoints: 20, teamBPoints: 4 }]);

      const savedThird = await saveScore(standardRepository, initialState, saved.tournamentId, savedSecond.updatedAt, 21, 3);
      const savedFourth = await saveScore(standardRepository, initialState, saved.tournamentId, savedThird.updatedAt, 22, 2);
      expect(savedFourth.tournamentId).toBe(saved.tournamentId);
      expect(await countRows("tournaments", `id=eq.${saved.tournamentId}&select=id`)).toBe(1);
      expect((await readHandoffs(accessBefore.id)).map((row) => row.id)).toEqual(handoffsBefore.map((row) => row.id));
      await expectNoDuplicateOrphanRows(saved.tournamentId, countSnapshotMatches(initialState));

      const rollbackOriginal = await standardRepository.read(saved.tournamentId);
      const brokenPlan = createStandardTournamentWritePlan(
        mapLiveTournamentToPersistencePayload({ ...rollbackOriginal, tournamentName: "STEP_15_TEST Rollback Broken" }, { legacyLocalId: `STEP_15_TEST_ROLLBACK_${Date.now()}` }),
        { tournamentId: saved.tournamentId },
      );
      const brokenOperations = [...brokenPlan.operations, { kind: "insert", table: "step_15_forced_failure", rows: [{ id: saved.tournamentId }] }];
      await expect(callRpc("lezgo_save_tournament_snapshot_v2", { p_operations: brokenOperations, p_expected_updated_at: savedFourth.updatedAt ?? null })).rejects.toThrow();
      await expect(standardRepository.read(saved.tournamentId)).resolves.toEqual(rollbackOriginal);
      expect((await readHandoffs(accessBefore.id)).map((row) => row.id)).toEqual(handoffsBefore.map((row) => row.id));

      const staleVersion = savedFourth.updatedAt;
      const conflictA = await saveScore(standardRepository, initialState, saved.tournamentId, staleVersion, 23, 1);
      await expect(saveScore(standardRepository, initialState, saved.tournamentId, staleVersion, 12, 12)).rejects.toThrow("conflict");
      expect((await standardRepository.read(saved.tournamentId)).results).toEqual([{ matchId: initialState.rounds[0].matches[0].id, teamAPoints: 23, teamBPoints: 1 }]);
      await saveScore(standardRepository, initialState, saved.tournamentId, conflictA.updatedAt, 23, 1);
      await expectNoDuplicateOrphanRows(saved.tournamentId, countSnapshotMatches(initialState));

      const fixedState = createStandardState("STEP_15_TEST Fast Makker", "Fast Makker Americano", 17, 7);
      const savedFixed = await standardRepository.save(fixedState, { legacyLocalId: `STEP_15_TEST_FIXED_${Date.now()}` });
      createdIds.push(savedFixed.tournamentId);
      await expect(standardRepository.read(savedFixed.tournamentId)).resolves.toEqual(fixedState);

      const poolState = createLaterStagePoolState();
      const savedPool = await standardRepository.save(poolState, { legacyLocalId: `STEP_15_TEST_POOL_${Date.now()}` });
      createdIds.push(savedPool.tournamentId);
      await expect(standardRepository.read(savedPool.tournamentId)).resolves.toEqual(poolState);

      const teamState = createTeamState();
      const savedTeam = await teamRepository.save(teamState, { legacyLocalId: `STEP_15_TEST_TEAM_${Date.now()}` });
      createdIds.push(savedTeam.tournamentId);
      await expect(teamRepository.read(savedTeam.tournamentId)).resolves.toEqual(teamState);

      await expect(redeem("invalid-reference-with-enough-entropy-1234567890")).rejects.toMatchObject({ status: 403 });
      const revokedAccess = await createTournamentAccessRepository().provision(savedFixed.tournamentId);
      const revokedHandoff = await handoffRepository.provision(savedFixed.tournamentId);
      await createTournamentAccessRepository().revoke(revokedAccess.tournamentCode);
      await expect(redeem(revokedHandoff.handoffReference)).rejects.toMatchObject({ status: 403 });

      const expiredHandoff = await handoffRepository.provision(savedPool.tournamentId, { expiresInSeconds: 30 });
      await expect(handoffRepository.redeem(expiredHandoff.handoffReference, { now: () => new Date(Date.now() + 60_000) })).rejects.toMatchObject({ status: 410 });
    } finally {
      for (const id of [...createdIds].reverse()) {
        await standardRepository.deleteById(id).catch(() => teamRepository.deleteById(id).catch(() => undefined));
      }

      expect(await countRows("tournaments", "name=like.STEP_15_TEST*&select=id")).toBe(0);
    }
  }, 90000);
});

async function saveScore(
  repository: ReturnType<typeof createStandardTournamentRepository>,
  baseState: LiveTournamentState,
  tournamentId: string,
  expectedUpdatedAt: string | undefined,
  teamAPoints: number,
  teamBPoints: number,
) {
  const nextState = saveMatchResult({ ...baseState, results: [] }, { matchId: baseState.rounds[0].matches[0].id, teamAPoints, teamBPoints });
  return await repository.save(nextState, {
    legacyLocalId: `STEP_15_TEST_UPDATE_${Date.now()}_${teamAPoints}_${teamBPoints}`,
    tournamentId,
    expectedUpdatedAt,
  });
}

async function redeem(handoffReference: string): Promise<{ kind: string; state: LiveTournamentState | TeamVsTeamTournamentState }> {
  const response = await redeemHandoff(new Request("http://localhost/api/supabase/tournament-handoff/redeem", {
    method: "POST",
    headers: { "x-forwarded-for": `step-15-e2e-${Date.now()}` },
    body: JSON.stringify({ handoffReference }),
  }));
  const body = await response.json() as { ok: boolean; kind?: string; state?: LiveTournamentState | TeamVsTeamTournamentState; error?: string };

  if (!response.ok || !body.ok || !body.kind || !body.state) {
    throw Object.assign(new Error(body.error ?? `Handoff redeem failed with status ${response.status}.`), { status: response.status });
  }

  return { kind: body.kind, state: body.state };
}

async function readAccess(tournamentId: string): Promise<TournamentAccessRecord> {
  const rows = await restSelect<TournamentAccessRecord>("tournament_access", `tournament_id=eq.${tournamentId}&select=*`);
  const access = rows[0];

  if (!access) {
    throw new Error(`Missing tournament_access for ${tournamentId}.`);
  }

  return access;
}

async function readHandoffs(accessId: string): Promise<TournamentHandoffRecord[]> {
  return await restSelect<TournamentHandoffRecord>("tournament_handoffs", `tournament_access_id=eq.${accessId}&select=*&order=created_at.asc`);
}

async function expectNoDuplicateOrphanRows(tournamentId: string, expectedMatchCount: number): Promise<void> {
  expect(await countRows("matches", `tournament_id=eq.${tournamentId}&select=id`)).toBe(expectedMatchCount);
  expect(await countRows("tournament_access", `tournament_id=eq.${tournamentId}&select=id`)).toBe(1);
  const matches = await restSelect<{ id: string }>("matches", `tournament_id=eq.${tournamentId}&select=id`);
  const matchIds = matches.map((match) => match.id);
  const sides = matchIds.length ? await restSelect<{ id: string }>("match_sides", `match_id=in.(${matchIds.join(",")})&select=id`) : [];
  expect(sides.length).toBe(expectedMatchCount * 2);
}

async function countRows(table: string, query: string): Promise<number> {
  return (await restSelect<{ id: string }>(table, query)).length;
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

function createStandardState(name: string, format: "Americano" | "Fast Makker Americano", teamAPoints: number, teamBPoints: number): LiveTournamentState {
  const playerCount = 16;
  const initialState = createTournamentFromSetup({
    name,
    format,
    playerText: Array.from({ length: playerCount }, (_, index) => `STEP_15_TEST Spiller ${index + 1}`).join("\n"),
    femalePlayerText: "",
    malePlayerText: "",
    courts: 4,
    rounds: 2,
    scoringMode: "Fast antal point",
    fixedScoreRule: "total",
    fixedScorePoints: 24,
    firstRoundOrder: "manual",
    rankingMode: "matchPointsFirst",
  });

  return saveMatchResult(initialState, { matchId: initialState.rounds[0].matches[0].id, teamAPoints, teamBPoints });
}

function countSnapshotMatches(state: LiveTournamentState): number {
  return state.rounds.reduce((count, round) => count + round.matches.length, 0);
}

function createLaterStagePoolState(): LiveTournamentState {
  const state = createPoolTournamentFromSetup({
    name: "STEP_15_TEST Pool",
    participantType: "pair",
    participantText: ["Par A", "Par B", "Par C", "Par D"].join("\n"),
    poolCount: 2,
    participantsPerPool: 2,
    advancementMode: "crossMatches",
    unmatchedResolution: "bye",
    scoringMode: "Fri scoring",
    rankingMode: "matchPointsFirst",
  });
  const scored = state.poolPlay?.initialStage.pools.reduce((currentState, pool) => saveInitialPoolResult(currentState, {
    matchId: pool.encounters[0].id,
    teamAPoints: 21,
    teamBPoints: 18,
  }), state) ?? state;

  return advanceLivePoolPlayState(scored);
}

function createTeamState(): TeamVsTeamTournamentState {
  const state = {
    ...createTeamVsTeamTournamentFromSetup({
      name: "STEP_15_TEST Team",
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
