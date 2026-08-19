import { readAccountFromAccessToken, AuthError } from "@/lib/auth";
import { readAuthAccessCookie } from "@/lib/auth/cookies";
import { createSupabaseRestClient } from "@/lib/supabase/rest-client";

export const dynamic = "force-dynamic";

interface TournamentListRow {
  id: string;
  name: string;
  format: string;
  status: "setup" | "active" | "finished";
  updated_at: string;
}

export async function GET(): Promise<Response> {
  try {
    const account = await readAccountFromAccessToken(await readAuthAccessCookie());
    const rows = await createSupabaseRestClient().select<TournamentListRow>(
      "tournaments",
      `owner_user_id=eq.${encodeURIComponent(account.userId)}&select=id,name,format,status,updated_at&order=updated_at.desc`,
    );

    return Response.json({
      ok: true,
      tournaments: rows.map((row) => ({
        id: row.id,
        name: row.name,
        format: row.format,
        status: row.status,
        updatedAt: row.updated_at,
      })),
    }, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    const status = error instanceof AuthError ? error.status : 500;
    return Response.json({ ok: false, error: "Authentication was denied." }, { status });
  }
}
