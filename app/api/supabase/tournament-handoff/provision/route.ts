import { assertOrganizerToken, createTournamentHandoffRepository, OrganizerTokenError, TournamentHandoffError, toHandoffError } from "@/lib/database";

export const dynamic = "force-dynamic";

interface ProvisionHandoffRequest {
  tournamentId?: string;
  organizerToken?: string;
}

export async function POST(request: Request): Promise<Response> {
  if (process.env.LEZGO_ENABLE_SUPABASE_ACCESS !== "1") {
    return Response.json({ ok: false, error: "Tournament access is disabled." }, { status: 503 });
  }

  let body: ProvisionHandoffRequest;

  try {
    body = await request.json() as ProvisionHandoffRequest;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.tournamentId) {
    return Response.json({ ok: false, error: "tournamentId is required." }, { status: 400 });
  }

  try {
    assertOrganizerToken(body.organizerToken, { tournamentId: body.tournamentId });
    const result = await createTournamentHandoffRepository().provision(body.tournamentId);
    const handoffUrl = createHandoffUrl(request, result.handoffReference);

    return Response.json({
      ok: true,
      tournamentId: result.tournamentId,
      handoffReference: result.handoffReference,
      handoffUrl,
      expiresAt: result.expiresAt,
    });
  } catch (error) {
    if (error instanceof OrganizerTokenError) {
      return Response.json({ ok: false, error: "Organizer authorization was denied." }, { status: error.status });
    }

    const handoffError = error instanceof TournamentHandoffError ? error : toHandoffError("Could not provision tournament handoff.", error);
    return Response.json({ ok: false, error: handoffError.message }, { status: handoffError.status });
  }
}

function createHandoffUrl(request: Request, handoffReference: string): string {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const url = new URL(request.url);
  url.pathname = `${basePath}/remote/handoff/${encodeURIComponent(handoffReference)}`.replace(/\/{2,}/g, "/");
  url.search = "";
  url.hash = "";
  return url.toString();
}
