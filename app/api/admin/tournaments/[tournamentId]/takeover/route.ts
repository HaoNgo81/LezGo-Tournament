import { AuthError, assertFreshAdminAccountFromCookies } from "@/lib/auth";
import { takeoverManagedTournament } from "@/lib/admin/tournaments";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{
    tournamentId: string;
  }>;
}

export async function POST(_request: Request, context: RouteContext): Promise<Response> {
  const { tournamentId } = await context.params;

  try {
    const admin = await assertFreshAdminAccountFromCookies();
    const tournament = await takeoverManagedTournament({ actor: admin, tournamentId });

    return Response.json({ ok: true, tournament }, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    const status = error instanceof AuthError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Admin takeover failed.";
    return Response.json({ ok: false, error: message }, { status });
  }
}
