import { assertOrganizerToken, createTournamentAccessRepository, OrganizerTokenError, TournamentAccessError } from "@/lib/database";
import { assertAccountTournamentControllerIfRequired, TournamentWriteAccessError } from "@/lib/account/tournament-write-access";

export const dynamic = "force-dynamic";

interface ProvisionAccessRequest {
  tournamentId?: string;
  organizerToken?: string;
}

export async function POST(request: Request): Promise<Response> {
  if (process.env.LEZGO_ENABLE_SUPABASE_ACCESS !== "1") {
    return Response.json({ ok: false, error: "Tournament access is disabled." }, { status: 503 });
  }

  let body: ProvisionAccessRequest;

  try {
    body = await request.json() as ProvisionAccessRequest;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.tournamentId) {
    return Response.json({ ok: false, error: "tournamentId is required." }, { status: 400 });
  }

  try {
    assertOrganizerToken(body.organizerToken, { tournamentId: body.tournamentId });
    await assertAccountTournamentControllerIfRequired(body.tournamentId);
    const result = await createTournamentAccessRepository().provision(body.tournamentId);
    return Response.json({
      ok: true,
      tournamentId: result.tournamentId,
      tournamentCode: result.tournamentCode,
      shareToken: result.shareToken || undefined,
      tokenVersion: result.tokenVersion,
    });
  } catch (error) {
    const status = error instanceof OrganizerTokenError || error instanceof TournamentAccessError || error instanceof TournamentWriteAccessError ? error.status : 500;
    const message = error instanceof OrganizerTokenError ? "Organizer authorization was denied." : error instanceof Error ? error.message : "Could not provision tournament access.";
    return Response.json({ ok: false, error: message }, { status });
  }
}
