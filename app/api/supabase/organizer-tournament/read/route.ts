import { assertOrganizerToken, createStandardTournamentRepository, createTeamVsTeamTournamentRepository, OrganizerTokenError } from "@/lib/database";
import { createSupabaseRestClient } from "@/lib/supabase/rest-client";

export const dynamic = "force-dynamic";

interface OrganizerTournamentReadRequest {
  kind?: "standard" | "team-vs-team";
  legacyLocalId?: string;
  organizerToken?: string;
  tournamentId?: string;
}

export async function POST(request: Request): Promise<Response> {
  if (process.env.LEZGO_ENABLE_SUPABASE_ACCESS !== "1") {
    return Response.json({ ok: false, error: "Tournament access is disabled." }, { status: 503 });
  }

  let body: OrganizerTournamentReadRequest;

  try {
    body = await request.json() as OrganizerTournamentReadRequest;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.tournamentId || !body.kind || !body.legacyLocalId) {
    return Response.json({ ok: false, error: "Tournament ID, kind and local ID are required." }, { status: 400 });
  }

  try {
    assertOrganizerToken(body.organizerToken, {
      tournamentId: body.tournamentId,
      kind: body.kind,
      legacyLocalId: body.legacyLocalId,
    });

    const client = createSupabaseRestClient();
    const [tournament] = await client.select<{ updated_at?: string }>("tournaments", `id=eq.${encodeURIComponent(body.tournamentId)}&select=updated_at`);

    if (!tournament) {
      return Response.json({ ok: false, error: "Tournament was not found." }, { status: 404 });
    }

    const state = body.kind === "standard"
      ? await createStandardTournamentRepository(client).read(body.tournamentId)
      : await createTeamVsTeamTournamentRepository(client).read(body.tournamentId);

    return Response.json({
      ok: true,
      kind: body.kind,
      state,
      tournamentId: body.tournamentId,
      updatedAt: tournament.updated_at,
    }, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    const status = error instanceof OrganizerTokenError ? error.status : 500;
    const message = status === 403 ? "Organizer authorization was denied." : error instanceof Error ? error.message : "Could not read organizer tournament.";
    return Response.json({ ok: false, error: message }, { status });
  }
}
