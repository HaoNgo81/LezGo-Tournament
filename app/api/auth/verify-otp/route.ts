import { createAuthCookieHeaders, verifyEmailOtp, AuthError } from "@/lib/auth";

export const dynamic = "force-dynamic";

interface VerifyOtpBody {
  email?: string;
  token?: string;
  displayName?: string;
}

export async function POST(request: Request): Promise<Response> {
  let body: VerifyOtpBody;

  try {
    body = await request.json() as VerifyOtpBody;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    const result = await verifyEmailOtp({
      email: body.email ?? "",
      token: body.token ?? "",
      displayName: body.displayName,
    });

    return Response.json({
      ok: true,
      account: result.account,
    }, {
      headers: createAuthCookieHeaders(result.session, { accountRole: result.account.role }),
    });
  } catch (error) {
    const status = error instanceof AuthError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Email verification failed.";
    return Response.json({ ok: false, error: message }, { status });
  }
}
