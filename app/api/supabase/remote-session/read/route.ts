import { readRemoteSession, RemoteSessionError, toRemoteSessionError } from "@/lib/database";

export const dynamic = "force-dynamic";

const remoteSessionAttempts = new Map<string, { count: number; resetAt: number }>();
const maxRemoteSessionAttemptsPerWindow = 120;
const remoteSessionAttemptWindowMs = 60_000;

interface ReadRemoteSessionRequest {
  remoteSessionToken?: string;
}

export async function POST(request: Request): Promise<Response> {
  if (process.env.LEZGO_ENABLE_SUPABASE_ACCESS !== "1") {
    return Response.json({ ok: false, error: "Tournament access is disabled." }, { status: 503 });
  }

  let body: ReadRemoteSessionRequest;

  try {
    body = await request.json() as ReadRemoteSessionRequest;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const remoteSessionToken = body.remoteSessionToken?.trim() ?? "";

  if (!remoteSessionToken) {
    return Response.json({ ok: false, error: "Remote session was denied." }, { status: 403 });
  }

  if (isRateLimited(request, remoteSessionToken)) {
    return Response.json({ ok: false, error: "Too many access attempts." }, { status: 429 });
  }

  try {
    const result = await readRemoteSession(remoteSessionToken);
    return Response.json({
      ok: true,
      tournamentId: result.tournamentId,
      accessLevel: "read-only",
      kind: result.kind,
      state: result.state,
      updatedAt: result.updatedAt,
      remoteSessionToken,
      remoteSessionExpiresAt: result.remoteSessionExpiresAt,
    });
  } catch (error) {
    const sessionError = error instanceof RemoteSessionError ? error : toRemoteSessionError("Could not read remote session.", error);
    const message = sessionError.reason === "expired" ? "Remote session has expired." : "Remote session was denied.";
    return Response.json({ ok: false, error: message }, { status: sessionError.status });
  }
}

function isRateLimited(request: Request, remoteSessionToken: string): boolean {
  const now = Date.now();
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const tokenBucket = remoteSessionToken.slice(0, 24);
  const key = `${forwardedFor}:${tokenBucket}`;
  const current = remoteSessionAttempts.get(key);

  if (!current || current.resetAt <= now) {
    remoteSessionAttempts.set(key, { count: 1, resetAt: now + remoteSessionAttemptWindowMs });
    return false;
  }

  current.count += 1;
  return current.count > maxRemoteSessionAttemptsPerWindow;
}
