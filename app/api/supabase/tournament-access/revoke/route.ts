import { assertOrganizerToken, createTournamentAccessRepository, OrganizerTokenError, TournamentAccessError } from "@/lib/database";

export const dynamic = "force-dynamic";

interface RevokeAccessRequest {
  tournamentId?: string;
  tournamentCode?: string;
  organizerToken?: string;
}

export async function POST(request: Request): Promise<Response> {
  if (process.env.LEZGO_ENABLE_SUPABASE_ACCESS !== "1") {
    return Response.json({ ok: false, error: "Tournament access is disabled." }, { status: 503 });
  }

  let body: RevokeAccessRequest;

  try {
    body = await request.json() as RevokeAccessRequest;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.tournamentId || !body.tournamentCode) {
    return Response.json({ ok: false, error: "tournamentId and tournamentCode are required." }, { status: 400 });
  }

  try {
    assertOrganizerToken(body.organizerToken, { tournamentId: body.tournamentId });
    await createTournamentAccessRepository().revoke(body.tournamentCode);
    return Response.json({ ok: true });
  } catch (error) {
    const status = error instanceof OrganizerTokenError || error instanceof TournamentAccessError ? error.status : 500;
    const message = error instanceof OrganizerTokenError ? "Organizer authorization was denied." : error instanceof Error ? error.message : "Could not revoke tournament access.";
    return Response.json({ ok: false, error: message }, { status });
  }
}
