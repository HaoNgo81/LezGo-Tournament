import { createTournamentAccessRepository, TournamentAccessError } from "@/lib/database";

export const dynamic = "force-dynamic";

const accessAttempts = new Map<string, { count: number; resetAt: number }>();
const maxAccessAttemptsPerWindow = 20;
const accessAttemptWindowMs = 60_000;

interface ReadAccessRequest {
  tournamentCode?: string;
  shareToken?: string;
}

export async function POST(request: Request): Promise<Response> {
  if (process.env.LEZGO_ENABLE_SUPABASE_ACCESS !== "1") {
    return Response.json({ ok: false, error: "Tournament access is disabled." }, { status: 503 });
  }

  let body: ReadAccessRequest;

  try {
    body = await request.json() as ReadAccessRequest;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.tournamentCode || !body.shareToken) {
    return Response.json({ ok: false, error: "Tournament code and share token are required." }, { status: 400 });
  }

  if (isRateLimited(request, body.tournamentCode)) {
    return Response.json({ ok: false, error: "Too many access attempts." }, { status: 429 });
  }

  try {
    const result = await createTournamentAccessRepository().readByAccess(body.tournamentCode, body.shareToken);
    return Response.json({
      ok: true,
      tournamentId: result.tournamentId,
      tournamentCode: result.tournamentCode,
      kind: result.kind,
      state: result.state,
      updatedAt: result.updatedAt,
    });
  } catch (error) {
    const status = error instanceof TournamentAccessError ? error.status : 500;
    const message = status === 403 || status === 404 ? "Tournament access was denied." : error instanceof Error ? error.message : "Could not read tournament access.";
    return Response.json({ ok: false, error: message }, { status });
  }
}

function isRateLimited(request: Request, tournamentCode: string): boolean {
  const now = Date.now();
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const key = `${forwardedFor}:${tournamentCode.trim().toLocaleUpperCase("en")}`;
  const current = accessAttempts.get(key);

  if (!current || current.resetAt <= now) {
    accessAttempts.set(key, { count: 1, resetAt: now + accessAttemptWindowMs });
    return false;
  }

  current.count += 1;
  return current.count > maxAccessAttemptsPerWindow;
}
