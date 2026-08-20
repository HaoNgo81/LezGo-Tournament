import { AuthError, readAccountFromAccessToken } from "@/lib/auth";
import { readAuthAccessCookie } from "@/lib/auth/cookies";
import { OwnerMatchScoreConflictError, readOwnedMatchScoreVersions, saveOwnedMatchScore, createStandardTournamentRepository } from "@/lib/database";
import { canManageAccountTournament } from "@/lib/account/tournament-authority";
import { createSupabaseRestClient, SupabaseRestClientError } from "@/lib/supabase/rest-client";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{
    tournamentId: string;
  }>;
}

interface OwnedTournamentRow {
  id: string;
  owner_user_id: string | null;
  controller_user_id: string | null;
  team_competition_mode: string | null;
  updated_at?: string;
}

interface SaveOwnedScoreRequest {
  matchId?: string;
  teamAPoints?: unknown;
  teamBPoints?: unknown;
  expectedScoreVersion?: unknown;
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const { tournamentId } = await context.params;

  if (!isUuid(tournamentId)) {
    return Response.json({ ok: false, error: "Tournament ID is invalid." }, { status: 400 });
  }

  let body: SaveOwnedScoreRequest;

  try {
    body = await request.json() as SaveOwnedScoreRequest;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.matchId?.trim()) {
    return Response.json({ ok: false, error: "Match ID is required." }, { status: 400 });
  }

  const teamAPoints = parseScore(body.teamAPoints);
  const teamBPoints = parseScore(body.teamBPoints);
  const expectedScoreVersion = parseScoreVersion(body.expectedScoreVersion);

  if (teamAPoints === null || teamBPoints === null) {
    return Response.json({ ok: false, error: "Indtast en gyldig score." }, { status: 400 });
  }

  if (expectedScoreVersion === null) {
    return Response.json({ ok: false, error: "Expected score version is required." }, { status: 400 });
  }

  try {
    const account = await readAccountFromAccessToken(await readAuthAccessCookie());
    const client = createSupabaseRestClient();
    const tournament = await readOwnedTournament(client, tournamentId);

    if (!tournament) {
      return Response.json({ ok: false, error: "Tournament was not found." }, { status: 404 });
    }

    if (!canManageAccountTournament(tournament, account.userId)) {
      return Response.json({ ok: false, error: "Du har ikke længere adgang til at ændre denne turnering." }, { status: 403 });
    }

    if (isTeamVsTeamTournament(tournament)) {
      return Response.json({ ok: false, error: "Owner score sync is only available for standard tournaments." }, { status: 400 });
    }

    const saveResult = await saveOwnedMatchScore({
      tournamentId,
      matchId: body.matchId,
      teamAPoints,
      teamBPoints,
      expectedScoreVersion,
      actorUserId: account.userId,
    }, client);
    const state = await createStandardTournamentRepository(client).read(tournamentId);
    const matchScoreVersions = await readOwnedMatchScoreVersions(client, tournamentId);

    return Response.json({
      ok: true,
      kind: "standard",
      state,
      tournamentId,
      updatedAt: saveResult.updatedAt,
      matchScoreVersions,
    }, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    if (error instanceof OwnerMatchScoreConflictError) {
      const client = createSupabaseRestClient();
      const state = await createStandardTournamentRepository(client).read(tournamentId);
      const matchScoreVersions = await readOwnedMatchScoreVersions(client, tournamentId);
      const [latestTournament] = await client.select<{ updated_at?: string }>("tournaments", `id=eq.${encodeURIComponent(tournamentId)}&select=updated_at`);

      return Response.json({
        ok: false,
        error: "The score was changed on another device. The latest score has been loaded.",
        conflict: true,
        kind: "standard",
        state,
        tournamentId,
        updatedAt: latestTournament?.updated_at,
        matchScoreVersions,
      }, { status: 409 });
    }

    if (error instanceof AuthError) {
      return Response.json({ ok: false, error: "Authentication was denied." }, { status: error.status });
    }

    if (error instanceof SupabaseRestClientError && error.status === 401) {
      return Response.json({ ok: false, error: "Authentication was denied." }, { status: 401 });
    }

    const message = error instanceof Error ? error.message : "Score could not be saved.";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

async function readOwnedTournament(client: ReturnType<typeof createSupabaseRestClient>, tournamentId: string): Promise<OwnedTournamentRow | null> {
  const [tournament] = await client.select<OwnedTournamentRow>(
    "tournaments",
    `id=eq.${encodeURIComponent(tournamentId)}&select=id,owner_user_id,controller_user_id,team_competition_mode,updated_at`,
  );
  return tournament ?? null;
}

function isTeamVsTeamTournament(tournament: OwnedTournamentRow): boolean {
  return tournament.team_competition_mode === "knockout" || tournament.team_competition_mode === "pool";
}

function parseScore(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    return null;
  }

  return value;
}

function parseScoreVersion(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    return null;
  }

  return value;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
