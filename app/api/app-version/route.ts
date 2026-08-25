export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    { version: getAppVersion() },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    },
  );
}

function getAppVersion(): string {
  return process.env.VERCEL_GIT_COMMIT_SHA
    ?? process.env.VERCEL_DEPLOYMENT_ID
    ?? process.env.NEXT_PUBLIC_LEZGO_APP_VERSION
    ?? "development";
}
