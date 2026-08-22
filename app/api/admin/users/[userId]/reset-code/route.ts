import { resetManagedAccountLoginCode } from "@/lib/admin/users";
import { AuthError, assertFreshAdminAccountFromCookies } from "@/lib/auth";

export const dynamic = "force-dynamic";

interface ResetCodeBody {
  code?: string;
  mode?: string;
}

export async function POST(request: Request, context: { params: Promise<{ userId: string }> }): Promise<Response> {
  let body: ResetCodeBody;

  try {
    body = await request.json() as ResetCodeBody;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    const { userId } = await context.params;
    const admin = await assertFreshAdminAccountFromCookies();
    const result = await resetManagedAccountLoginCode({
      actor: admin,
      targetUserId: userId,
      code: body.mode === "generate" ? undefined : body.code,
    });

    return Response.json({ ok: true, user: result.user, generatedCode: result.generatedCode }, {
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

  return "Login code could not be reset.";
}
