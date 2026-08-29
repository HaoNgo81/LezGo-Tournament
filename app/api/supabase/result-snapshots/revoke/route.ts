import { assertOrganizerToken, createPublicResultSnapshotRepository, OrganizerTokenError, PublicResultSnapshotError } from "@/lib/database";
import { assertAccountTournamentControllerIfRequired, TournamentWriteAccessError } from "@/lib/account/tournament-write-access";

export const dynamic = "force-dynamic";

interface RevokePublicResultRequest {
  kind?: "standard";
  legacyLocalId?: string;
  organizerToken?: string;
  tournamentId?: string;
}

export async function POST(request: Request): Promise<Response> {
  if (process.env.LEZGO_ENABLE_SUPABASE_ACCESS !== "1") {
    return Response.json({ ok: false, error: "Tournament access is disabled." }, { status: 503 });
  }

  let body: RevokePublicResultRequest;

  try {
    body = await request.json() as RevokePublicResultRequest;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.tournamentId || !body.legacyLocalId || body.kind !== "standard") {
    return Response.json({ ok: false, error: "Public result revoke payload is invalid." }, { status: 400 });
  }

  try {
    assertOrganizerToken(body.organizerToken, {
      tournamentId: body.tournamentId,
      kind: body.kind,
      legacyLocalId: body.legacyLocalId,
    });
    await assertAccountTournamentControllerIfRequired(body.tournamentId);
    await createPublicResultSnapshotRepository().revokeStandard({ tournamentId: body.tournamentId });

    return Response.json({ ok: true }, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    const status = error instanceof OrganizerTokenError || error instanceof PublicResultSnapshotError || error instanceof TournamentWriteAccessError ? error.status : 500;
    const message = error instanceof OrganizerTokenError
      ? "Organizer authorization was denied."
      : error instanceof Error
        ? error.message
        : "Could not disable public result sharing.";
    return Response.json({ ok: false, error: message }, { status });
  }
}
