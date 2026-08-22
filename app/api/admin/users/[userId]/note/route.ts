import { updateManagedAccountAdminNote } from "@/lib/admin/users";
import { AuthError, assertFreshAdminAccountFromCookies } from "@/lib/auth";

export const dynamic = "force-dynamic";

interface NoteBody {
  note?: string;
}

export async function POST(request: Request, context: { params: Promise<{ userId: string }> }): Promise<Response> {
  let body: NoteBody;

  try {
    body = await request.json() as NoteBody;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    const { userId } = await context.params;
    const admin = await assertFreshAdminAccountFromCookies();
    const user = await updateManagedAccountAdminNote({
      actor: admin,
      targetUserId: userId,
      note: String(body.note ?? ""),
    });

    return Response.json({ ok: true, user }, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    const status = error instanceof AuthError ? error.status : 500;
    return Response.json({ ok: false, error: getSafeAdminError(error) }, { status });
  }
}

function getSafeAdminError(error: unknown): string {
  if (error instanceof AuthError) {
    return error.message;
  }

  return "Admin note could not be updated.";
}
