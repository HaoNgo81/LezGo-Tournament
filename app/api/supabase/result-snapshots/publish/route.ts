import { assertOrganizerToken, createPublicResultSnapshotRepository, OrganizerTokenError, PublicResultSnapshotError } from "@/lib/database";
import type { LiveTournamentState } from "@/lib/live-scoring";
import { CURRENT_PUBLIC_RESULT_ORIGIN, createResultUrl, normalizeOptionalPublicResultOrigin } from "@/lib/results-sharing";

export const dynamic = "force-dynamic";

interface PublishPublicResultRequest {
  kind?: "standard";
  legacyLocalId?: string;
  organizerToken?: string;
  state?: unknown;
  tournamentId?: string;
}

export async function POST(request: Request): Promise<Response> {
  if (process.env.LEZGO_ENABLE_SUPABASE_ACCESS !== "1") {
    return Response.json({ ok: false, error: "Tournament access is disabled." }, { status: 503 });
  }

  let body: PublishPublicResultRequest;

  try {
    body = await request.json() as PublishPublicResultRequest;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.tournamentId || !body.legacyLocalId || body.kind !== "standard" || !isLiveTournamentState(body.state)) {
    return Response.json({ ok: false, error: "Public result payload is invalid." }, { status: 400 });
  }

  try {
    assertOrganizerToken(body.organizerToken, {
      tournamentId: body.tournamentId,
      kind: body.kind,
      legacyLocalId: body.legacyLocalId,
    });

    const snapshot = await createPublicResultSnapshotRepository().publishStandard({
      tournamentId: body.tournamentId,
      state: body.state,
    });
    const resultUrl = createResultUrl(resolvePublicResultOrigin(request), snapshot.resultId);

    return Response.json({
      ok: true,
      resultId: snapshot.resultId,
      resultUrl,
      snapshot,
    }, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    const status = error instanceof OrganizerTokenError || error instanceof PublicResultSnapshotError ? error.status : 500;
    const message = error instanceof OrganizerTokenError
      ? "Organizer authorization was denied."
      : error instanceof Error
        ? error.message
        : "Could not publish public result.";
    return Response.json({ ok: false, error: message }, { status });
  }
}

function resolvePublicResultOrigin(request: Request): string {
  const requestOrigin = getReachableRequestOrigin(request);
  return normalizeOptionalPublicResultOrigin(requestOrigin ?? undefined) ?? CURRENT_PUBLIC_RESULT_ORIGIN;
}

function getReachableRequestOrigin(request: Request): string | null {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host")?.split(",")[0]?.trim();

  if (!host) {
    return getReachableUrlOrigin(request.url);
  }

  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const requestProtocol = getRequestProtocol(request.url);
  const origin = `${forwardedProto || requestProtocol}//${host}`;

  try {
    const url = new URL(origin);
    return url.hostname === "0.0.0.0" || url.hostname === "::" ? null : url.origin;
  } catch {
    return null;
  }
}

function getRequestProtocol(requestUrl: string): string {
  try {
    return new URL(requestUrl).protocol === "https:" ? "https:" : "http:";
  } catch {
    return "http:";
  }
}

function getReachableUrlOrigin(requestUrl: string): string | null {
  try {
    const url = new URL(requestUrl);
    return url.hostname === "0.0.0.0" || url.hostname === "::" ? null : url.origin;
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
    "status" in value &&
    "players" in value &&
    "rounds" in value &&
    "results" in value,
  );
}
