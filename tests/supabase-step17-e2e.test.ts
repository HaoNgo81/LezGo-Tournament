// @vitest-environment node
import { describe, expect, it } from "vitest";
import { POST as readRemoteSessionRoute } from "../app/api/supabase/remote-session/read/route";
import {
  createRemoteSession,
  createStandardTournamentRepository,
  createTeamVsTeamTournamentRepository,
  createTournamentAccessRepository,
  createTournamentHandoffRepository,
} from "../lib/database";
import { advanceLivePoolPlayState, saveInitialPoolResult, saveMatchResult, type LiveTournamentState } from "../lib/live-scoring";
import { createPoolTournamentFromSetup, createTeamVsTeamTournamentFromSetup, createTournamentFromSetup, type TeamVsTeamTournamentState } from "../lib/tournament-setup";

const runE2E = process.env.RUN_SUPABASE_E2E === "1";
const describeE2E = runE2E ? describe : describe.skip;

describeE2E("STEP 17 long-lived read-only remote sessions", () => {
  it("keeps Device B live through a remote session after QR redemption and rejects invalid sessions", async () => {
    process.env.LEZGO_ENABLE_SUPABASE_ACCESS = "1";
    const standardRepository = createStandardTournamentRepository();
    const teamRepository = createTeamVsTeamTournamentRepository();
    const accessRepository = createTournamentAccessRepository();
    const handoffRepository = createTournamentHandoffRepository();
    const createdIds: string[] = [];

    try {
      const initialState = createStandardState("STEP_17_TEST Device A", "Americano", 17, 7);
      const saved = await standardRepository.save(initialState, { legacyLocalId: `STEP_17_TEST_STANDARD_${Date.now()}` });
      createdIds.push(saved.tournamentId);
      const handoff = await handoffRepository.provision(saved.tournamentId);
      const redeemed = await handoffRepository.redeem(handoff.handoffReference);
      const session = createRemoteSession({
        tournamentId: redeemed.tournamentId,
        accessId: redeemed.accessId,
        tokenVersion: redeemed.tokenVersion,
      });

      const deviceBInitial = await readRemoteSessionViaRoute(session.remoteSessionToken);
      expect(deviceBInitial.kind).toBe("standard");
      expect((deviceBInitial.state as LiveTournamentState).results).toEqual(initialState.results);

      const updatedState = saveMatchResult({ ...initialState, results: [] }, {
        matchId: initialState.rounds[0].matches[0].id,
        teamAPoints: 20,
        teamBPoints: 4,
      });
      await standardRepository.save(updatedState, {
        legacyLocalId: `STEP_17_TEST_UPDATE_${Date.now()}`,
        tournamentId: saved.tournamentId,
        expectedUpdatedAt: saved.updatedAt,
      });

      const deviceBAfterSave = await readRemoteSessionViaRoute(session.remoteSessionToken);
      expect((deviceBAfterSave.state as LiveTournamentState).results).toEqual(updatedState.results);
      const deviceBAfterRefresh = await readRemoteSessionViaRoute(session.remoteSessionToken);
      expect((deviceBAfterRefresh.state as LiveTournamentState).results).toEqual(updatedState.results);

      await expect(readRemoteSessionRaw(`${session.remoteSessionToken.slice(0, -1)}x`)).resolves.toMatchObject({ status: 403 });
      const expiredSession = createRemoteSession({
        tournamentId: redeemed.tournamentId,
        accessId: redeemed.accessId,
        tokenVersion: redeemed.tokenVersion,
      }, { now: () => new Date(Date.now() - 13 * 60 * 60 * 1000) });
      await expect(readRemoteSessionRaw(expiredSession.remoteSessionToken)).resolves.toMatchObject({ status: 410 });

      const access = await readAccess(saved.tournamentId);
      await accessRepository.revoke(access.tournament_code);
      await expect(readRemoteSessionRaw(session.remoteSessionToken)).resolves.toMatchObject({ status: 403 });

      const mexicano = await standardRepository.save(createStandardState("STEP_17_TEST Mexicano", "Mexicano", 18, 6), { legacyLocalId: `STEP_17_TEST_MEXICANO_${Date.now()}` });
      createdIds.push(mexicano.tournamentId);
      await expectRemoteSessionForTournament(mexicano.tournamentId, "standard");

      const pool = await standardRepository.save(createLaterStagePoolState(), { legacyLocalId: `STEP_17_TEST_POOL_${Date.now()}` });
      createdIds.push(pool.tournamentId);
      await expectRemoteSessionForTournament(pool.tournamentId, "standard");

      const team = await teamRepository.save(createTeamState(), { legacyLocalId: `STEP_17_TEST_TEAM_${Date.now()}` });
      createdIds.push(team.tournamentId);
      await expectRemoteSessionForTournament(team.tournamentId, "team-vs-team");
    } finally {
      for (const id of [...createdIds].reverse()) {
        await standardRepository.deleteById(id).catch(() => teamRepository.deleteById(id).catch(() => undefined));
      }

      expect(await countRows("tournaments", "name=like.STEP_17_TEST*&select=id")).toBe(0);
    }
  }, 90000);
});

async function expectRemoteSessionForTournament(tournamentId: string, expectedKind: "standard" | "team-vs-team"): Promise<void> {
  const handoff = await createTournamentHandoffRepository().provision(tournamentId);
  const redeemed = await createTournamentHandoffRepository().redeem(handoff.handoffReference);
  const session = createRemoteSession({
    tournamentId: redeemed.tournamentId,
    accessId: redeemed.accessId,
    tokenVersion: redeemed.tokenVersion,
  });
  const read = await readRemoteSessionViaRoute(session.remoteSessionToken);
  expect(read.kind).toBe(expectedKind);
}

async function readRemoteSessionViaRoute(remoteSessionToken: string): Promise<{ kind: string; state: LiveTournamentState | TeamVsTeamTournamentState }> {
  const response = await readRemoteSessionRaw(remoteSessionToken);
  const body = await response.json() as { ok: boolean; kind?: string; state?: LiveTournamentState | TeamVsTeamTournamentState; error?: string };

  if (!response.ok || !body.ok || !body.kind || !body.state) {
    throw Object.assign(new Error(body.error ?? `Remote session read failed with status ${response.status}.`), { status: response.status });
  }

  return { kind: body.kind, state: body.state };
}

async function readRemoteSessionRaw(remoteSessionToken: string): Promise<Response> {
  return await readRemoteSessionRoute(new Request("http://localhost/api/supabase/remote-session/read", {
    method: "POST",
    headers: { "x-forwarded-for": `step-17-e2e-${Date.now()}-${Math.random()}` },
    body: JSON.stringify({ remoteSessionToken }),
  }));
}

async function countRows(table: string, query: string): Promise<number> {
  return (await restSelect<{ id: string }>(table, query)).length;
}

async function readAccess(tournamentId: string) {
  const rows = await restSelect<{ tournament_code: string }>("tournament_access", `tournament_id=eq.${tournamentId}&select=tournament_code`);
  const access = rows[0];

  if (!access) {
    throw new Error(`Missing tournament_access for ${tournamentId}.`);
  }

  return access;
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

function createStandardState(name: string, format: "Americano" | "Mexicano", teamAPoints: number, teamBPoints: number): LiveTournamentState {
  const initialState = createTournamentFromSetup({
    name,
    format,
    playerText: Array.from({ length: 16 }, (_, index) => `STEP_17_TEST Spiller ${index + 1}`).join("\n"),
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

function createLaterStagePoolState(): LiveTournamentState {
  const state = createPoolTournamentFromSetup({
    name: "STEP_17_TEST Pool",
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
      name: "STEP_17_TEST Team",
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
