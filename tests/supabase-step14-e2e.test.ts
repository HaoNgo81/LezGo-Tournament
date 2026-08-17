// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { POST as provisionHandoff } from "../app/api/supabase/tournament-handoff/provision/route";
import { POST as redeemHandoff } from "../app/api/supabase/tournament-handoff/redeem/route";
import { advanceLivePoolPlayState, saveInitialPoolResult, saveMatchResult, type LiveTournamentState } from "../lib/live-scoring";
import {
  createStandardTournamentRepository,
  createTeamVsTeamTournamentRepository,
  createOrganizerToken,
  createTournamentAccessRepository,
  createTournamentHandoffRepository,
  type TournamentHandoffRecord,
} from "../lib/database";
import { createPoolTournamentFromSetup, createTeamVsTeamTournamentFromSetup, createTournamentFromSetup, type TeamVsTeamTournamentState } from "../lib/tournament-setup";

const runE2E = process.env.RUN_SUPABASE_E2E === "1";
const describeE2E = runE2E ? describe : describe.skip;

describeE2E("STEP 14 secure QR handoff", () => {
  const originalAccessFlag = process.env.LEZGO_ENABLE_SUPABASE_ACCESS;
  const createdIds: string[] = [];

  afterEach(async () => {
    if (originalAccessFlag === undefined) {
      delete process.env.LEZGO_ENABLE_SUPABASE_ACCESS;
    } else {
      process.env.LEZGO_ENABLE_SUPABASE_ACCESS = originalAccessFlag;
    }

    await cleanupCreatedRows(createdIds);
    createdIds.splice(0);
  });

  it("opens standard, pool and Team vs Team snapshots through short-lived handoff references", async () => {
    process.env.LEZGO_ENABLE_SUPABASE_ACCESS = "1";
    const standardRepository = createStandardTournamentRepository();
    const teamRepository = createTeamVsTeamTournamentRepository();

    const standardState = createStandardState();
    const savedStandard = await standardRepository.save(standardState, { legacyLocalId: `STEP_14_TEST_STANDARD_${Date.now()}` });
    createdIds.push(savedStandard.tournamentId);
    const standardHandoff = await provision(savedStandard.tournamentId, createOrganizerToken({ tournamentId: savedStandard.tournamentId, kind: "standard", legacyLocalId: "STEP_14_ORGANIZER" }));
    expect(standardHandoff.handoffUrl).toContain("/remote/handoff/");
    expect(standardHandoff.handoffUrl).not.toContain("share");
    const standardRead = await redeem(standardHandoff.handoffReference);
    expect(standardRead.kind).toBe("standard");
    expect(standardRead.state).toEqual(standardState);
    const standardReadAgain = await redeem(standardHandoff.handoffReference);
    expect(standardReadAgain.state).toEqual(standardState);

    const poolState = createLaterStagePoolState();
    const savedPool = await standardRepository.save(poolState, { legacyLocalId: `STEP_14_TEST_POOL_${Date.now()}` });
    createdIds.push(savedPool.tournamentId);
    const poolHandoff = await provision(savedPool.tournamentId, createOrganizerToken({ tournamentId: savedPool.tournamentId, kind: "standard", legacyLocalId: "STEP_14_POOL_ORGANIZER" }));
    const poolRead = await redeem(poolHandoff.handoffReference);
    expect(poolRead.kind).toBe("standard");
    expect(poolRead.state).toEqual(poolState);

    const teamState = createTeamState();
    const savedTeam = await teamRepository.save(teamState, { legacyLocalId: `STEP_14_TEST_TEAM_${Date.now()}` });
    createdIds.push(savedTeam.tournamentId);
    const teamHandoff = await provision(savedTeam.tournamentId, createOrganizerToken({ tournamentId: savedTeam.tournamentId, kind: "team-vs-team", legacyLocalId: "STEP_14_TEAM_ORGANIZER" }));
    const teamRead = await redeem(teamHandoff.handoffReference);
    expect(teamRead.kind).toBe("team-vs-team");
    expect(teamRead.state).toEqual(teamState);

    await expect(redeem("manipulated-reference-with-enough-entropy-1234567890")).rejects.toMatchObject({ status: 403 });

    const access = await createTournamentAccessRepository().provision(savedStandard.tournamentId);
    await createTournamentAccessRepository().revoke(access.tournamentCode);
    const revokedHandoff = await createTournamentHandoffRepository().provision(savedStandard.tournamentId).catch((error: unknown) => error);
    expect(revokedHandoff).toMatchObject({ status: 403 });

    const expired = await createTournamentHandoffRepository().provision(savedPool.tournamentId, { expiresInSeconds: 30 });
    await expect(createTournamentHandoffRepository().redeem(expired.handoffReference, { now: () => new Date(Date.now() + 60_000) })).rejects.toMatchObject({ status: 410 });

    for (let attempt = 0; attempt < 21; attempt += 1) {
      await redeemRaw("rate-limit-reference-with-enough-entropy-1234567890");
    }
    const limitedResponse = await redeemRaw("rate-limit-reference-with-enough-entropy-1234567890");
    expect(limitedResponse.status).toBe(429);
  }, 60000);
});

async function provision(tournamentId: string, organizerToken: string): Promise<{ handoffReference: string; handoffUrl: string; expiresAt: string }> {
  const response = await provisionHandoff(new Request("http://localhost/api/supabase/tournament-handoff/provision", {
    method: "POST",
    body: JSON.stringify({ tournamentId, organizerToken }),
  }));
  const body = await response.json() as { ok: boolean; handoffReference?: string; handoffUrl?: string; expiresAt?: string; error?: string };

  if (!response.ok || !body.ok || !body.handoffReference || !body.handoffUrl || !body.expiresAt) {
    throw new Error(body.error ?? `Handoff provision failed with status ${response.status}.`);
  }

  return { handoffReference: body.handoffReference, handoffUrl: body.handoffUrl, expiresAt: body.expiresAt };
}

async function redeem(handoffReference: string): Promise<{ kind: string; state: LiveTournamentState | TeamVsTeamTournamentState }> {
  const response = await redeemRaw(handoffReference);
  const body = await response.json() as { ok: boolean; kind?: string; state?: LiveTournamentState | TeamVsTeamTournamentState; error?: string };

  if (!response.ok || !body.ok || !body.kind || !body.state) {
    throw Object.assign(new Error(body.error ?? `Handoff redeem failed with status ${response.status}.`), { status: response.status });
  }

  return { kind: body.kind, state: body.state };
}

async function redeemRaw(handoffReference: string): Promise<Response> {
  return await redeemHandoff(new Request("http://localhost/api/supabase/tournament-handoff/redeem", {
    method: "POST",
    headers: { "x-forwarded-for": "step-14-e2e" },
    body: JSON.stringify({ handoffReference }),
  }));
}

function createStandardState(): LiveTournamentState {
  const state = createTournamentFromSetup({
    name: "STEP_14_TEST Americano",
    format: "Americano",
    playerText: Array.from({ length: 16 }, (_, index) => `STEP_14_TEST Spiller ${index + 1}`).join("\n"),
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

  return saveMatchResult(state, { matchId: state.rounds[0].matches[0].id, teamAPoints: 17, teamBPoints: 7 });
}

function createLaterStagePoolState(): LiveTournamentState {
  const state = createPoolTournamentFromSetup({
    name: "STEP_14_TEST Pool",
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
      name: "STEP_14_TEST Team",
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

async function cleanupCreatedRows(createdIds: string[]): Promise<void> {
  const standardRepository = createStandardTournamentRepository();
  const teamRepository = createTeamVsTeamTournamentRepository();

  for (const id of [...createdIds].reverse()) {
    await standardRepository.deleteById(id).catch(() => teamRepository.deleteById(id).catch(() => undefined));
  }

  const remainingTestRows = await restSelect<{ id: string }>("tournaments", "name=like.STEP_14_TEST*&select=id");
  const remainingHandoffRows = await restSelect<TournamentHandoffRecord>("tournament_handoffs", "metadata=not.is.null&select=*");

  expect(remainingTestRows).toHaveLength(0);
  expect(remainingHandoffRows.filter((row) => createdIds.some((id) => row.metadata?.tournament_id === id))).toHaveLength(0);
}

async function restSelect<T>(table: string, query: string): Promise<T[]> {
  const response = await fetch(`${process.env.SUPABASE_URL?.replace(/\/$/, "")}/rest/v1/${table}?${query}`, {
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
      authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""}`,
      "content-type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return await response.json() as T[];
}
