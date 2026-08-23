import { createStandardTournamentRepository, createTournamentAccessRepository, TournamentAccessError } from "@/lib/database";
import { saveMatchResult, type LiveTournamentState } from "@/lib/live-scoring";

export const dynamic = "force-dynamic";

const scoreWriteAttempts = new Map<string, { count: number; resetAt: number }>();
const maxScoreWritesPerWindow = 30;
const scoreWriteWindowMs = 60_000;

interface SaveRemoteScoreRequest {
  tournamentCode?: string;
  shareToken?: string;
  matchId?: string;
  teamAPoints?: unknown;
  teamBPoints?: unknown;
  expectedUpdatedAt?: string;
}

export async function POST(request: Request): Promise<Response> {
  if (process.env.LEZGO_ENABLE_SUPABASE_ACCESS !== "1") {
    return Response.json({ ok: false, error: "Tournament access is disabled." }, { status: 503 });
  }

  let body: SaveRemoteScoreRequest;

  try {
    body = await request.json() as SaveRemoteScoreRequest;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.tournamentCode || !body.shareToken || !body.matchId) {
    return Response.json({ ok: false, error: "Tournament code, access code and match are required." }, { status: 400 });
  }

  if (isRateLimited(request, body.tournamentCode)) {
    return Response.json({ ok: false, error: "Too many score attempts." }, { status: 429 });
  }

  const teamAPoints = parseScore(body.teamAPoints);
  const teamBPoints = parseScore(body.teamBPoints);

  if (teamAPoints === null || teamBPoints === null) {
    return Response.json({ ok: false, error: "Indtast en gyldig score." }, { status: 400 });
  }

  if (!body.expectedUpdatedAt) {
    return Response.json({ ok: false, error: "Tournament revision is required." }, { status: 409 });
  }

  try {
    const access = await createTournamentAccessRepository().readByAccess(body.tournamentCode, body.shareToken);

    if (access.kind !== "standard") {
      return Response.json({ ok: false, error: "Remote score entry is only available for standard tournaments." }, { status: 400 });
    }

    const nextState = saveMatchResult(access.state as LiveTournamentState, {
      matchId: body.matchId,
      teamAPoints,
      teamBPoints,
    });
    const saveResult = await createStandardTournamentRepository().save(nextState, {
      legacyLocalId: access.legacyLocalId ?? `remote-${access.tournamentId}`,
      tournamentId: access.tournamentId,
      expectedUpdatedAt: body.expectedUpdatedAt,
    });

    return Response.json({
      ok: true,
      tournamentId: access.tournamentId,
      tournamentCode: access.tournamentCode,
      kind: "standard",
      state: nextState,
      updatedAt: saveResult.updatedAt,
    });
  } catch (error) {
    const status = error instanceof TournamentAccessError
      ? error.status
      : error instanceof Error && error.message.toLocaleLowerCase("en").includes("conflict")
        ? 409
        : 400;
    const message = error instanceof Error ? error.message : "Score could not be saved.";
    return Response.json({ ok: false, error: message }, { status });
  }
}

function isRateLimited(request: Request, tournamentCode: string): boolean {
  const now = Date.now();
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const key = `${forwardedFor}:${tournamentCode.trim().toLocaleUpperCase("en")}`;
  const current = scoreWriteAttempts.get(key);

  if (!current || current.resetAt <= now) {
    scoreWriteAttempts.set(key, { count: 1, resetAt: now + scoreWriteWindowMs });
    return false;
  }

  current.count += 1;
  return current.count > maxScoreWritesPerWindow;
}

function parseScore(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    return null;
  }

  return value;
}
