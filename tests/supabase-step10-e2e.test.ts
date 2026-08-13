// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { POST } from "../app/api/supabase/shadow-save/route";
import { advanceLivePoolPlayState, saveInitialPoolResult, saveMatchResult, type LiveTournamentState } from "../lib/live-scoring";
import { createStandardTournamentRepository, createTeamVsTeamTournamentRepository } from "../lib/database";
import { createPoolTournamentFromSetup, createTeamVsTeamTournamentFromSetup, createTournamentFromSetup, type TeamVsTeamTournamentState, type TournamentSetupFormat } from "../lib/tournament-setup";

const runE2E = process.env.RUN_SUPABASE_E2E === "1";
const describeE2E = runE2E ? describe : describe.skip;

describeE2E("STEP 10 Supabase shadow-save API integration", () => {
  const originalServerFlag = process.env.LEZGO_ENABLE_SUPABASE_SHADOW_SAVE;
  const createdIds: string[] = [];

  afterEach(async () => {
    if (originalServerFlag === undefined) {
      delete process.env.LEZGO_ENABLE_SUPABASE_SHADOW_SAVE;
    } else {
      process.env.LEZGO_ENABLE_SUPABASE_SHADOW_SAVE = originalServerFlag;
    }

    const standardRepository = createStandardTournamentRepository();
    const teamRepository = createTeamVsTeamTournamentRepository();

    for (const id of createdIds.splice(0).reverse()) {
      await standardRepository.deleteById(id).catch(() => teamRepository.deleteById(id).catch(() => undefined));
    }
  });

  it("shadow-saves locked formats, Team vs Team, pool/later-stage, updates and conflicts through the API", async () => {
    process.env.LEZGO_ENABLE_SUPABASE_SHADOW_SAVE = "1";
    const standardRepository = createStandardTournamentRepository();
    const teamRepository = createTeamVsTeamTournamentRepository();
    const lockedFormats: TournamentSetupFormat[] = [
      "Americano",
      "Mexicano",
      "Fast Makker Americano",
      "Fast Makker Mexicano",
      "Mixed Americano",
    ];

    for (const format of lockedFormats) {
      const state = createLockedFormatState(format);
      const saved = await postShadowSave("standard", `STEP_10_TEST_${format}`, state);
      createdIds.push(saved.tournamentId);
      const readBack = await standardRepository.read(saved.tournamentId);

      expect(readBack).toEqual(state);
    }

    const original = createLockedFormatState("Americano");
    const created = await postShadowSave("standard", "STEP_10_TEST_UPDATE", original);
    createdIds.push(created.tournamentId);
    const modified = saveMatchResult({ ...original, tournamentName: "STEP_10_TEST Updated", results: [] }, {
      matchId: original.rounds[0].matches[0].id,
      teamAPoints: 18,
      teamBPoints: 6,
    });
    const replaced = await postShadowSave("standard", "STEP_10_TEST_UPDATE", modified, {
      tournamentId: created.tournamentId,
      expectedUpdatedAt: created.updatedAt,
    });

    expect(replaced.tournamentId).toBe(created.tournamentId);
    await expect(standardRepository.read(created.tournamentId)).resolves.toEqual(modified);
    await expect(getTournamentRowCount(created.tournamentId)).resolves.toBe(1);

    const staleResponse = await postShadowSaveRaw("standard", "STEP_10_TEST_UPDATE", { ...modified, tournamentName: "STEP_10_TEST Stale" }, {
      tournamentId: created.tournamentId,
      expectedUpdatedAt: created.updatedAt,
    });
    expect(staleResponse.status).toBe(409);
    await expect(standardRepository.read(created.tournamentId)).resolves.toEqual(modified);

    const poolState = createLaterStagePoolState();
    const savedPool = await postShadowSave("standard", "STEP_10_TEST_POOL", poolState);
    createdIds.push(savedPool.tournamentId);
    await expect(standardRepository.read(savedPool.tournamentId)).resolves.toEqual(poolState);

    const teamState = createTeamState();
    const savedTeam = await postShadowSave("team-vs-team", "STEP_10_TEST_TEAM", teamState);
    createdIds.push(savedTeam.tournamentId);
    await expect(teamRepository.read(savedTeam.tournamentId)).resolves.toEqual(teamState);
  }, 40000);
});

async function postShadowSave(kind: "standard" | "team-vs-team", legacyLocalId: string, state: LiveTournamentState | TeamVsTeamTournamentState, options: { tournamentId?: string; expectedUpdatedAt?: string } = {}) {
  const response = await postShadowSaveRaw(kind, legacyLocalId, state, options);
  const body = await response.json() as { ok: boolean; tournamentId?: string; updatedAt?: string; error?: string };

  if (!response.ok || !body.ok || !body.tournamentId) {
    throw new Error(body.error ?? `Shadow-save failed with status ${response.status}.`);
  }

  return { tournamentId: body.tournamentId, updatedAt: body.updatedAt };
}

async function postShadowSaveRaw(kind: "standard" | "team-vs-team", legacyLocalId: string, state: LiveTournamentState | TeamVsTeamTournamentState, options: { tournamentId?: string; expectedUpdatedAt?: string } = {}) {
  return await POST(new Request("http://localhost/api/supabase/shadow-save", {
    method: "POST",
    body: JSON.stringify({ kind, legacyLocalId, state, ...options }),
  }));
}

function createLockedFormatState(format: TournamentSetupFormat): LiveTournamentState {
  const baseInput = {
    name: `STEP_10_TEST ${format}`,
    format,
    playerText: "",
    femalePlayerText: "",
    malePlayerText: "",
    courts: 4,
    rounds: 2,
    scoringMode: "Fast antal point" as const,
    fixedScoreRule: "total" as const,
    fixedScorePoints: 24,
    firstRoundOrder: "manual" as const,
    rankingMode: "matchPointsFirst" as const,
  };
  const state = createTournamentFromSetup(format === "Mixed Americano"
    ? {
        ...baseInput,
        playerText: "",
        femalePlayerText: Array.from({ length: 8 }, (_, index) => `STEP_10_TEST Kvinde ${index + 1}`).join("\n"),
        malePlayerText: Array.from({ length: 8 }, (_, index) => `STEP_10_TEST Mand ${index + 1}`).join("\n"),
      }
    : {
        ...baseInput,
        playerText: Array.from({ length: 16 }, (_, index) => `STEP_10_TEST Spiller ${index + 1}`).join("\n"),
      });

  return saveMatchResult(state, {
    matchId: state.rounds[0].matches[0].id,
    teamAPoints: 17,
    teamBPoints: 7,
  });
}

function createLaterStagePoolState(): LiveTournamentState {
  const state = createPoolTournamentFromSetup({
    name: "STEP_10_TEST Pool Later",
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
      name: "STEP_10_TEST Team",
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

async function getTournamentRowCount(tournamentId: string): Promise<number> {
  const rows = await restSelect<{ id: string }>("tournaments", `id=eq.${tournamentId}&select=id`);
  return rows.length;
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
