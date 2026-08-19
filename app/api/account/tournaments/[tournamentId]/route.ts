import { createOrganizerToken, createStandardTournamentRepository, createTeamVsTeamTournamentRepository } from "@/lib/database";
import { AuthError, readAccountFromAccessToken } from "@/lib/auth";
import { readAuthAccessCookie } from "@/lib/auth/cookies";
import { createSupabaseRestClient, SupabaseRestClientError } from "@/lib/supabase/rest-client";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{
    tournamentId: string;
  }>;
}

interface OwnedTournamentRow {
  id: string;
  format: string;
  legacy_local_id: string | null;
  owner_user_id: string | null;
  team_competition_mode: string | null;
  updated_at?: string;
}

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  const { tournamentId } = await context.params;

  if (!isUuid(tournamentId)) {
    return Response.json({ ok: false, error: "Tournament ID is invalid." }, { status: 400 });
  }

  try {
    const account = await readAccountFromAccessToken(await readAuthAccessCookie());
    const client = createSupabaseRestClient();
    const [tournament] = await client.select<OwnedTournamentRow>(
      "tournaments",
      `id=eq.${encodeURIComponent(tournamentId)}&select=id,format,legacy_local_id,owner_user_id,team_competition_mode,updated_at`,
    );

    if (!tournament) {
      return Response.json({ ok: false, error: "Tournament was not found." }, { status: 404 });
    }

    if (tournament.owner_user_id !== account.userId && account.role !== "admin") {
      return Response.json({ ok: false, error: "Tournament access was denied." }, { status: 403 });
    }

    const kind = isTeamVsTeamTournament(tournament) ? "team-vs-team" : "standard";
    const state = kind === "team-vs-team"
      ? await createTeamVsTeamTournamentRepository(client).read(tournament.id)
      : await createStandardTournamentRepository(client).read(tournament.id);
    const legacyLocalId = tournament.legacy_local_id ?? undefined;

    return Response.json({
      ok: true,
      kind,
      state,
      tournamentId: tournament.id,
      updatedAt: tournament.updated_at,
      legacyLocalId,
      organizerToken: legacyLocalId ? createOrganizerToken({ tournamentId: tournament.id, kind, legacyLocalId }) : undefined,
    }, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return Response.json({ ok: false, error: "Authentication was denied." }, { status: error.status });
    }

    if (error instanceof SupabaseRestClientError && error.status === 401) {
      return Response.json({ ok: false, error: "Authentication was denied." }, { status: 401 });
    }

    const message = error instanceof Error ? error.message : "Could not open owned tournament.";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

function isTeamVsTeamTournament(tournament: OwnedTournamentRow): boolean {
  return tournament.team_competition_mode === "knockout" || tournament.team_competition_mode === "pool";
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
