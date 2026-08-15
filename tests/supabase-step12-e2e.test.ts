// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { POST as provisionAccess } from "../app/api/supabase/tournament-access/provision/route";
import { POST as readAccess } from "../app/api/supabase/tournament-access/read/route";
import { saveMatchResult, type LiveTournamentState } from "../lib/live-scoring";
import { createStandardTournamentRepository, createTeamVsTeamTournamentRepository, createTournamentAccessRepository } from "../lib/database";
import { advanceLivePoolPlayState, saveInitialPoolResult } from "../lib/live-scoring";
import { createPoolTournamentFromSetup, createTeamVsTeamTournamentFromSetup, createTournamentFromSetup, type TeamVsTeamTournamentState } from "../lib/tournament-setup";

const runE2E = process.env.RUN_SUPABASE_E2E === "1";
const describeE2E = runE2E ? describe : describe.skip;

describeE2E("STEP 12 secure tournament access", () => {
  const originalAccessFlag = process.env.LEZGO_ENABLE_SUPABASE_ACCESS;
  const createdIds: string[] = [];

  afterEach(async () => {
    if (originalAccessFlag === undefined) {
      delete process.env.LEZGO_ENABLE_SUPABASE_ACCESS;
    } else {
      process.env.LEZGO_ENABLE_SUPABASE_ACCESS = originalAccessFlag;
    }

    const standardRepository = createStandardTournamentRepository();
    const teamRepository = createTeamVsTeamTournamentRepository();

    for (const id of createdIds.splice(0).reverse()) {
      await standardRepository.deleteById(id).catch(() => teamRepository.deleteById(id).catch(() => undefined));
    }
  });

  it("provisions access and reads standard, pool and Team vs Team snapshots from a second device", async () => {
    process.env.LEZGO_ENABLE_SUPABASE_ACCESS = "1";
    const standardRepository = createStandardTournamentRepository();
    const teamRepository = createTeamVsTeamTournamentRepository();

    const standardState = createStandardState();
    const savedStandard = await standardRepository.save(standardState, { legacyLocalId: `STEP_12_TEST_STANDARD_${Date.now()}` });
    createdIds.push(savedStandard.tournamentId);
    const standardAccess = await provision(savedStandard.tournamentId);
    expect(standardAccess.tournamentCode).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(standardAccess.shareToken).toBeTruthy();
    if (!standardAccess.shareToken) throw new Error("Missing standard share token.");

    const standardRead = await read(standardAccess.tournamentCode, standardAccess.shareToken);
    expect(standardRead.kind).toBe("standard");
    expect(standardRead.state).toEqual(standardState);

    const repeatedProvision = await provision(savedStandard.tournamentId);
    expect(repeatedProvision.tournamentCode).toBe(standardAccess.tournamentCode);
    expect(repeatedProvision.shareToken).toMatch(/^\d{4}$/);
    expect(repeatedProvision.tokenVersion).toBe(standardAccess.tokenVersion + 1);

    await expect(read(standardAccess.tournamentCode, standardAccess.shareToken)).rejects.toMatchObject({ status: 403 });
    if (!repeatedProvision.shareToken) throw new Error("Missing renewed standard access code.");
    await expect(read(standardAccess.tournamentCode, getDifferentPin(repeatedProvision.shareToken))).rejects.toMatchObject({ status: 403 });
    await expect(read("ZZZZZZ", standardAccess.shareToken)).rejects.toMatchObject({ status: 404 });
    await expect(read(standardAccess.tournamentCode, "")).rejects.toMatchObject({ status: 400 });

    const poolState = createLaterStagePoolState();
    const savedPool = await standardRepository.save(poolState, { legacyLocalId: `STEP_12_TEST_POOL_${Date.now()}` });
    createdIds.push(savedPool.tournamentId);
    const poolAccess = await provision(savedPool.tournamentId);
    if (!poolAccess.shareToken) throw new Error("Missing pool share token.");
    const poolRead = await read(poolAccess.tournamentCode.toLocaleLowerCase("en"), poolAccess.shareToken);
    expect(poolRead.kind).toBe("standard");
    expect(poolRead.state).toEqual(poolState);

    const teamState = createTeamState();
    const savedTeam = await teamRepository.save(teamState, { legacyLocalId: `STEP_12_TEST_TEAM_${Date.now()}` });
    createdIds.push(savedTeam.tournamentId);
    const teamAccess = await provision(savedTeam.tournamentId);
    if (!teamAccess.shareToken) throw new Error("Missing Team vs Team share token.");
    const teamRead = await read(teamAccess.tournamentCode, teamAccess.shareToken);
    expect(teamRead.kind).toBe("team-vs-team");
    expect(teamRead.state).toEqual(teamState);

    await createTournamentAccessRepository().revoke(teamAccess.tournamentCode);
    await expect(read(teamAccess.tournamentCode, teamAccess.shareToken)).rejects.toMatchObject({ status: 404 });
  }, 40000);
});

async function provision(tournamentId: string): Promise<{ tournamentCode: string; shareToken?: string; tokenVersion: number }> {
  const response = await provisionAccess(new Request("http://localhost/api/supabase/tournament-access/provision", {
    method: "POST",
    body: JSON.stringify({ tournamentId }),
  }));
  const body = await response.json() as { ok: boolean; tournamentCode?: string; shareToken?: string; tokenVersion?: number; error?: string };

  if (!response.ok || !body.ok || !body.tournamentCode) {
    throw new Error(body.error ?? `Provision failed with status ${response.status}.`);
  }

  return { tournamentCode: body.tournamentCode, shareToken: body.shareToken, tokenVersion: body.tokenVersion ?? 0 };
}

function getDifferentPin(pin: string): string {
  return pin === "9999" ? "0000" : "9999";
}

async function read(tournamentCode: string, shareToken: string): Promise<{ kind: string; state: LiveTournamentState | TeamVsTeamTournamentState }> {
  const response = await readAccess(new Request("http://localhost/api/supabase/tournament-access/read", {
    method: "POST",
    body: JSON.stringify({ tournamentCode, shareToken }),
  }));
  const body = await response.json() as { ok: boolean; kind?: string; state?: LiveTournamentState | TeamVsTeamTournamentState; error?: string };

  if (!response.ok || !body.ok || !body.kind || !body.state) {
    throw Object.assign(new Error(body.error ?? `Read failed with status ${response.status}.`), { status: response.status });
  }

  return { kind: body.kind, state: body.state };
}

function createStandardState(): LiveTournamentState {
  const state = createTournamentFromSetup({
    name: "STEP_12_TEST Americano",
    format: "Americano",
    playerText: Array.from({ length: 16 }, (_, index) => `STEP_12_TEST Spiller ${index + 1}`).join("\n"),
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
    name: "STEP_12_TEST Pool",
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
      name: "STEP_12_TEST Team",
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
