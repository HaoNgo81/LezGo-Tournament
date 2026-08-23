import { createOrganizerToken, createStandardTournamentRepository, createTeamVsTeamTournamentRepository, readOwnedMatchScoreVersions } from "@/lib/database";
import { readOptionalAccountFromAccessToken } from "@/lib/auth";
import { readAuthAccessCookie } from "@/lib/auth/cookies";
import { canManageAccountTournament } from "@/lib/account/tournament-authority";
import { TournamentWriteAccessError } from "@/lib/account/tournament-write-access";
import { createSupabaseRestClient } from "@/lib/supabase/rest-client";
import type { LiveTournamentState } from "@/lib/live-scoring";
import type { TeamVsTeamTournamentState } from "@/lib/tournament-setup";

export const dynamic = "force-dynamic";

interface ShadowSaveRequest {
  kind: "standard" | "team-vs-team";
  legacyLocalId: string;
  tournamentId?: string;
  expectedUpdatedAt?: string;
  state: unknown;
}

interface TournamentAuthorityRow {
  owner_user_id: string | null;
  created_by_user_id: string | null;
  controller_user_id: string | null;
}

interface LatestTournamentRow extends TournamentAuthorityRow {
  id: string;
  format: string;
  legacy_local_id: string | null;
  team_competition_mode: string | null;
  updated_at?: string;
}

export async function POST(request: Request): Promise<Response> {
  if (process.env.LEZGO_ENABLE_SUPABASE_SHADOW_SAVE !== "1") {
    return Response.json({ ok: false, error: "Supabase shadow-save is disabled." }, { status: 503 });
  }

  let body: ShadowSaveRequest;

  try {
    body = await request.json() as ShadowSaveRequest;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.legacyLocalId?.trim()) {
    return Response.json({ ok: false, error: "legacyLocalId is required." }, { status: 400 });
  }

  if (body.tournamentId && !isUuid(body.tournamentId)) {
    return Response.json({ ok: false, error: "Tournament ID is invalid." }, { status: 400 });
  }

  try {
    const account = await readOptionalShadowSaveAccount();
    const existingAuthority = await readExistingTournamentAuthority(body.tournamentId);
    const ownerUserId = resolveShadowSaveActorUserId(existingAuthority, account?.userId);

    if (body.kind === "standard" && isLiveTournamentState(body.state)) {
      const result = await createStandardTournamentRepository().save(body.state, {
        legacyLocalId: body.legacyLocalId,
        tournamentId: body.tournamentId,
        expectedUpdatedAt: body.expectedUpdatedAt,
        ownerUserId,
      });
      return Response.json({
        ok: true,
        tournamentId: result.tournamentId,
        updatedAt: result.updatedAt,
        saveMode: result.saveMode,
        organizerToken: createOrganizerToken({ tournamentId: result.tournamentId, kind: body.kind, legacyLocalId: body.legacyLocalId }),
      });
    }

    if (body.kind === "team-vs-team" && isTeamVsTeamTournamentState(body.state)) {
      const result = await createTeamVsTeamTournamentRepository().save(body.state, {
        legacyLocalId: body.legacyLocalId,
        tournamentId: body.tournamentId,
        expectedUpdatedAt: body.expectedUpdatedAt,
        ownerUserId,
      });
      return Response.json({
        ok: true,
        tournamentId: result.tournamentId,
        updatedAt: result.updatedAt,
        saveMode: result.saveMode,
        organizerToken: createOrganizerToken({ tournamentId: result.tournamentId, kind: body.kind, legacyLocalId: body.legacyLocalId }),
      });
    }

    return Response.json({ ok: false, error: "Invalid shadow-save payload." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Shadow-save failed.";
    const normalizedMessage = message.toLocaleLowerCase("en");
    const status = error instanceof TournamentWriteAccessError
      ? error.status
      : normalizedMessage.includes("authorization") || normalizedMessage.includes("authenticated")
      ? 403
      : normalizedMessage.includes("conflict") ? 409 : 500;

    if (status === 409 && body.tournamentId) {
      return await createSnapshotConflictResponse(body.tournamentId);
    }

    const errorMessage = error instanceof TournamentWriteAccessError
      ? error.message
      : status === 403
      ? "Du har ikke længere styring af denne turnering."
      : status === 409 ? "Tournament snapshot conflict." : "Shadow-save failed.";
    return Response.json({ ok: false, error: errorMessage }, { status });
  }
}

async function createSnapshotConflictResponse(tournamentId: string): Promise<Response> {
  const client = createSupabaseRestClient();
  const [tournament] = await client.select<LatestTournamentRow>(
    "tournaments",
    `id=eq.${encodeURIComponent(tournamentId)}&select=id,format,legacy_local_id,owner_user_id,created_by_user_id,controller_user_id,team_competition_mode,updated_at`,
  );

  if (!tournament) {
    return Response.json({ ok: false, error: "Tournament snapshot conflict.", conflict: true }, { status: 409 });
  }

  const kind = isTeamVsTeamTournament(tournament) ? "team-vs-team" : "standard";
  const state = kind === "team-vs-team"
    ? await createTeamVsTeamTournamentRepository(client).read(tournament.id)
    : await createStandardTournamentRepository(client).read(tournament.id);
  const matchScoreVersions = kind === "standard"
    ? await readOwnedMatchScoreVersions(client, tournament.id)
    : undefined;

  return Response.json({
    ok: false,
    error: "The tournament was changed on another device. The latest data has been loaded.",
    conflict: true,
    kind,
    state,
    tournamentId: tournament.id,
    updatedAt: tournament.updated_at,
    legacyLocalId: tournament.legacy_local_id ?? undefined,
    matchScoreVersions,
    canRead: true,
    canManage: true,
    createdByUserId: tournament.created_by_user_id,
    controllerUserId: tournament.controller_user_id,
    ownerUserId: tournament.owner_user_id,
  }, {
    status: 409,
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}

async function readExistingTournamentAuthority(tournamentId: string | undefined): Promise<TournamentAuthorityRow | null> {
  if (!tournamentId) {
    return null;
  }

  const [row] = await createSupabaseRestClient().select<TournamentAuthorityRow>(
    "tournaments",
    `id=eq.${encodeURIComponent(tournamentId)}&select=owner_user_id,created_by_user_id,controller_user_id`,
  );

  return row ?? null;
}

function resolveShadowSaveActorUserId(tournament: TournamentAuthorityRow | null, accountUserId: string | undefined): string | undefined {
  if (!tournament) {
    return accountUserId;
  }

  if (!isAccountControlledTournament(tournament)) {
    return accountUserId;
  }

  if (!accountUserId) {
    throw new TournamentWriteAccessError();
  }

  if (!canManageAccountTournament(tournament, accountUserId)) {
    throw new TournamentWriteAccessError();
  }

  return accountUserId;
}

function isAccountControlledTournament(tournament: TournamentAuthorityRow): boolean {
  return Boolean(tournament.owner_user_id || tournament.created_by_user_id || tournament.controller_user_id);
}

function isTeamVsTeamTournament(tournament: LatestTournamentRow): boolean {
  return tournament.team_competition_mode === "knockout" || tournament.team_competition_mode === "pool";
}

async function readOptionalShadowSaveAccount() {
  try {
    return await readOptionalAccountFromAccessToken(await readAuthAccessCookie());
  } catch {
    return null;
  }
}

function isLiveTournamentState(value: unknown): value is LiveTournamentState {
  return Boolean(
    value &&
    typeof value === "object" &&
    "tournamentName" in value &&
    "format" in value &&
    "players" in value &&
    "rounds" in value &&
    "results" in value,
  );
}

function isTeamVsTeamTournamentState(value: unknown): value is TeamVsTeamTournamentState {
  return Boolean(
    value &&
    typeof value === "object" &&
    "name" in value &&
    "teamCount" in value &&
    "teams" in value &&
    "matchups" in value,
  );
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
