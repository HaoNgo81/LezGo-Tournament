# STEP 21 - Vercel Deployment Readiness

## 1. Current architecture

LEZGO Tournament App is a Next.js app targeting Vercel for frontend and server API routes. Supabase/Postgres is already integrated for shadow-save, tournament access, handoff, remote sessions, read-back, and polling. `localStorage` is still the primary persistence for Device A. Device B/remote/TV remains read-only.

Locked tournament formats remain unchanged:

- Americano
- Fast Makker Americano
- Mixed Americano
- Mexicano
- Fast Makker Mexicano

## 2. Vercel compatibility

Current versions:

- Next.js: 16.3.0
- React: 19.2.8
- React DOM: 19.2.8

Scripts:

- `npm.cmd run build` -> `next build`
- `npm.cmd run typecheck` -> `tsc --noEmit`
- `npm.cmd run lint` -> `eslint .`
- `npm.cmd run test` -> `vitest run`

The app builds as a normal Vercel Next.js app when `GITHUB_PAGES` is not set. API routes are dynamic and are not statically exported in the normal Vercel build.

## 3. Supabase compatibility

Supabase server-side access goes through server API routes and server-only helpers. Browser writes to Supabase are not enabled directly. Shadow-save is feature-flagged and failure does not replace `localStorage` as primary persistence.

The current Supabase schema is assumed to be the approved schema from STEP 5 and later approved persistence steps.

## 4. Environment variables required

Required for Supabase-backed production features:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `LEZGO_ENABLE_SUPABASE_SHADOW_SAVE`
- `NEXT_PUBLIC_LEZGO_SUPABASE_SHADOW_SAVE`
- `LEZGO_ENABLE_SUPABASE_ACCESS`
- `LEZGO_REMOTE_SESSION_SECRET`

Build/deployment mode variables:

- Do not set `GITHUB_PAGES` on Vercel.
- Do not set `NEXT_DIST_DIR` on Vercel unless there is a specific debugging need.
- `NEXT_PUBLIC_BASE_PATH` is currently set by `next.config.ts` from `GITHUB_PAGES`; Vercel should use the default empty root path.

Test-only:

- `RUN_SUPABASE_E2E`

## 5. PUBLIC variables

Client-safe variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_LEZGO_SUPABASE_SHADOW_SAVE`
- `NEXT_PUBLIC_BASE_PATH`

## 6. SERVER ONLY variables

Server-only variables:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `LEZGO_ENABLE_SUPABASE_SHADOW_SAVE`
- `LEZGO_ENABLE_SUPABASE_ACCESS`
- `LEZGO_REMOTE_SESSION_SECRET`
- `GITHUB_PAGES`
- `NEXT_DIST_DIR`
- `RUN_SUPABASE_E2E`

`SUPABASE_SERVICE_ROLE_KEY` must never receive a `NEXT_PUBLIC_` prefix.

## 7. Secret scan result

Result: PASS with one local-build caveat.

Checked:

- Source files: no actual secret values found.
- Git diff: no actual secret values found.
- `.next/static` client bundles: no server secret values found.
- Client Component server-boundary scan: no Client Component imports server Supabase/database repositories.
- `.env.local`: ignored by Git and not tracked.

Caveat:

- Local `.next/cache` contains env values in Turbopack cache files after local build. This directory is ignored and must not be uploaded, committed, or used as the deployment artifact. Vercel should build from source with env vars configured in the Vercel project.

## 8. API route status

All Supabase API routes are dynamic:

- `/api/supabase/shadow-save`
- `/api/supabase/tournament-access/provision`
- `/api/supabase/tournament-access/read`
- `/api/supabase/tournament-handoff/provision`
- `/api/supabase/tournament-handoff/redeem`
- `/api/supabase/remote-session/read`

These routes are compatible with Vercel server execution and are not exported as static pages.

## 9. PWA status

PWA assets exist:

- `public/app-icon-192.png`
- `public/app-icon-512.png`
- `public/app-icon.png`
- `public/lezgo-padel-logo.png`
- `public/sw.js`
- `app/manifest.ts`

STEP 21 added a production service worker activation cleanup: old `lezgo-padel-*` caches are deleted while the current cache is preserved. Development/LAN behavior still unregisters the service worker and clears caches.

## 10. Remote/TV status

Remote/TV remains based on:

- QR/handoff provisioning
- short-lived handoff redemption
- read-only remote session token
- polling/recovery from STEP 15-17
- Device B read-only UI

Handoff URLs are generated from the incoming request origin, so Vercel preview/production URLs should work without hardcoded hostnames.

## 11. Security status

Status: PASS for deployment readiness.

- Service-role key is accessed only through server helpers.
- Browser Supabase config uses only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Device B uses read-only session/read endpoints.
- Access, handoff, and remote-session routes are feature-flagged by server env vars.
- Remote-session token has `remote-read` scope and 12-hour lifetime.
- Remote-session validation checks tournament id, access id, token version, expiry, and revocation.
- Rate limits exist for access, handoff redemption, and remote-session read.

Recommendation:

- Set `LEZGO_REMOTE_SESSION_SECRET` in Vercel to a strong independent secret. The code has a service-role fallback, but production should not rely on that fallback for session signing.

## 12. Regression result

Automated regression:

- Build: PASS
- Typecheck: PASS
- Lint: PASS
- Tests: PASS, 413 passed and 8 skipped

Included regression coverage for:

- Locked tournament generators and scoring behavior
- Fast scoring / timed scoring behavior
- Remote access/session flows
- Service worker production/dev behavior
- STEP 20B form reset, format tap-vs-scroll, scoring visibility, and Baner/Runder editing

Physical regression already approved before STEP 21:

- Tournament setup works on real Device A/mobile.
- Format selection works.
- Mobile scroll does not select format.
- Form state does not reset.
- Baner/Runder edit naturally without `03` / `010`.

## 13. GitHub Pages legacy findings

GitHub Pages support remains conditional:

- `next.config.ts` uses `output: "export"` only when `GITHUB_PAGES=true`.
- `basePath` is `/LezGo-Tournament` only when `GITHUB_PAGES=true`.
- `app/layout.tsx` and `app/manifest.ts` use `/LezGo-Tournament` only in GitHub Pages mode.
- `.github/workflows/pages.yml` sets `GITHUB_PAGES=true` and `NEXT_DIST_DIR=.next-pages`.

Vercel should not set `GITHUB_PAGES`, so it will use root path and server API routes normally.

## 14. Production origin findings

Findings:

- No production functionality depends on `192.168.0.60`, `localhost:3015`, or another LAN host.
- `allowedDevOrigins: ["192.168.0.60"]` exists in `next.config.ts` for physical LAN development and does not create a production origin dependency.
- Share links and handoff links use the current browser/request origin.
- Relative API calls such as `/api/supabase/...` are Vercel-compatible.

Minor note:

- `components/tournament/share-tournament-app.tsx` starts with a harmless SSR fallback origin and replaces it with `window.location.origin` after mount.

## 15. Required changes before deployment

Required in Vercel project settings before deployment:

- Add all required environment variable names listed in section 4.
- Do not set `GITHUB_PAGES`.
- Do not upload `.next`, `.env.local`, `.vercel`, or local cache directories.
- Deploy from source repository.
- Verify Supabase project URL and keys are set in the correct Vercel environments.
- Use a strong independent `LEZGO_REMOTE_SESSION_SECRET`.

No database migration, RLS change, destructive change, DNS change, or secret rotation was required in STEP 21.

## 16. Risks

- `package.json` uses `latest` for Next.js/React-related packages. Vercel installs could change behavior if lockfile is not honored. Deployment should use the committed lockfile with `npm ci`.
- Supabase E2E tests are skipped unless `RUN_SUPABASE_E2E=1`; run them intentionally before switching Supabase to primary persistence.
- Remote/session API route rate limiting uses in-memory Maps, which are best-effort in serverless environments.
- `localStorage` remains primary persistence, so cross-device Device A editing is not yet primary-Supabase.

## 17. Exact recommended deployment procedure

1. Push the approved STEP 21 commit and tag to GitHub only after explicit approval.
2. Create/import the Vercel project from the GitHub repository.
3. Use default Vercel Next.js settings.
4. Ensure Vercel does not set `GITHUB_PAGES`.
5. Add Vercel environment variables by name from section 4.
6. Trigger a Vercel preview deployment.
7. Test on Vercel preview:
   - `/`
   - `/new-tournament`
   - `/live`
   - `/share`
   - `/remote`
   - `/tv`
   - QR/handoff flow
   - Device A save -> Device B polling update
8. Test mobile, tablet, desktop, and TV layout.
9. Only after preview approval, promote or deploy production.
10. Configure `app.lezgopadel.dk` DNS only in a later approved step.

## 18. Exact rollback procedure

1. In Vercel, promote the previous known-good deployment.
2. If needed, disable Supabase feature flags:
   - `LEZGO_ENABLE_SUPABASE_SHADOW_SAVE`
   - `NEXT_PUBLIC_LEZGO_SUPABASE_SHADOW_SAVE`
   - `LEZGO_ENABLE_SUPABASE_ACCESS`
3. Keep localStorage primary persistence active.
4. Do not alter Supabase schema during rollback.
5. If code rollback is required, checkout the previous local/Git tag and redeploy that commit.

## STEP 21 Status Summary

- STEP 21 status: PASS
- Vercel readiness: PASS
- Supabase readiness: PASS
- PWA readiness: PASS
- Remote Device B: PASS
- Device B read-only: PASS
- Secret scan: PASS for source, git diff, and client static bundle
- Database changed: NO
- Supabase schema changed: NO
- RLS changed: NO
- Tournament algorithms changed: NO
- Scoring calculations changed: NO
- Locked formats changed: NO
- Push performed: NO
- Deployment performed: NO
- DNS changed: NO
