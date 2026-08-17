import { createRemoteSession, createTournamentHandoffRepository, TournamentHandoffError, toHandoffError } from "@/lib/database";

export const dynamic = "force-dynamic";

const handoffAttempts = new Map<string, { count: number; resetAt: number }>();
const maxHandoffAttemptsPerWindow = 20;
const handoffAttemptWindowMs = 60_000;

interface RedeemHandoffRequest {
  handoffReference?: string;
}

export async function POST(request: Request): Promise<Response> {
  if (process.env.LEZGO_ENABLE_SUPABASE_ACCESS !== "1") {
    return Response.json({ ok: false, error: "Tournament access is disabled." }, { status: 503 });
  }

  let body: RedeemHandoffRequest;

  try {
    body = await request.json() as RedeemHandoffRequest;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const handoffReference = body.handoffReference?.trim() ?? "";

  if (!handoffReference) {
    return Response.json({ ok: false, error: "Tournament handoff was denied." }, { status: 403 });
  }

  if (isRateLimited(request, handoffReference)) {
    return Response.json({ ok: false, error: "Too many access attempts." }, { status: 429 });
  }

  try {
    const result = await createTournamentHandoffRepository().redeem(handoffReference);
    return Response.json({
      ok: true,
      tournamentId: result.tournamentId,
      accessLevel: "read-only",
      kind: result.kind,
      state: result.state,
      updatedAt: result.updatedAt,
      ...createRemoteSession({
        tournamentId: result.tournamentId,
        accessId: result.accessId,
        tokenVersion: result.tokenVersion,
      }),
    });
  } catch (error) {
    const handoffError = error instanceof TournamentHandoffError ? error : toHandoffError("Could not redeem tournament handoff.", error);
    const message = handoffError.reason === "expired" ? "Tournament handoff has expired." : "Tournament handoff was denied.";
    return Response.json({ ok: false, error: message }, { status: handoffError.status });
  }
}

function isRateLimited(request: Request, handoffReference: string): boolean {
  const now = Date.now();
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const referenceBucket = handoffReference.slice(0, 12);
  const key = `${forwardedFor}:${referenceBucket}`;
  const current = handoffAttempts.get(key);

  if (!current || current.resetAt <= now) {
    handoffAttempts.set(key, { count: 1, resetAt: now + handoffAttemptWindowMs });
    return false;
  }

  current.count += 1;
  return current.count > maxHandoffAttemptsPerWindow;
}
