# STEP 3 - Supabase Postgres Setup

Dato: 2026-08-12

## Formaal

STEP 3 forbereder kun Supabase Postgres integration. Der er ikke oprettet schema, migrations, API endpoints eller databasekald i appens runtime-flow.

Eksisterende localStorage er fortsat primary persistence.

## Nuværende Environment Setup

Projektet bruger Next.js environment variables via `process.env`.

Nuvaerende environment usage foer STEP 3:

- `GITHUB_PAGES`: bruges til GitHub Pages build og base path
- `NEXT_DIST_DIR`: bruges til build output directory
- `NEXT_PUBLIC_BASE_PATH`: saettes i `next.config.ts` og bruges i browserkode til assets/service worker

Der fandtes ingen `.env`, `.env.local` eller `.env.example` i repoet ved STEP 3-start.

## Nye Environment Variables

Server-only:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Public browser variables til eventuel senere browser-klient:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Vigtigt:

- `SUPABASE_SERVICE_ROLE_KEY` maa aldrig have `NEXT_PUBLIC_` prefix.
- Service role key maa kun bruges server-side.
- Client/browser-kode maa kun bruge anon key.

## .env.example

`.env.example` er oprettet med tomme placeholders:

```text
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

Ingen rigtige credentials maa gemmes i Git.

## Gitignore

`.gitignore` ignorerer fortsat:

- `.env`
- `.env.local`
- `.env.*.local`
- øvrige `.env*` filer

Der er tilfoejet en undtagelse for `.env.example`, saa eksempel-filen kan versioneres uden secrets.

## Supabase Skeleton

Oprettede moduler:

- `lib/supabase/server.ts`
- `lib/supabase/client.ts`

`lib/supabase/server.ts` læser kun:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

`lib/supabase/client.ts` læser kun:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Der er ikke tilfoejet Supabase SDK dependency endnu, og modulerne laver ingen databasekald. De er kun en konfigurationsgrænse til senere steps.

## Persistence

Uændret:

- turneringer gemmes fortsat i localStorage
- settings gemmes fortsat i localStorage
- templates gemmes fortsat i localStorage
- scores gemmes fortsat i localStorage
- TV-view og read-only views bruger fortsat eksisterende dataflow

Der er ikke flyttet data til database.

## Låste Turneringsformater

Der er ikke ændret turneringsmotor, live scoring, ranking, rotation eller scoring.

- Americano: UÆNDRET
- Fast Makker Americano: UÆNDRET
- Mixed Americano: UÆNDRET
- Mexicano: UÆNDRET
- Fast Makker Mexicano: UÆNDRET

## Lokal Opsætning Senere

Naar Supabase-projektet findes, kan lokale credentials saettes i en ikke-versioneret `.env.local`:

```text
SUPABASE_URL=<project-url>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
NEXT_PUBLIC_SUPABASE_URL=<project-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
```

`.env.local` maa ikke committes.

## Vercel Opsætning Senere

I Vercel Project Settings skal samme variables senere oprettes under Environment Variables.

Server-side:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Client-side:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## Manuel Handling I Supabase UI

Efter STEP 3 skal du manuelt:

1. Oprette et Supabase project.
2. Vælge region.
3. Vælge database password.
4. Finde Project URL.
5. Finde anon key.
6. Finde service role key.
7. Sætte værdierne lokalt i `.env.local`.
8. Sætte værdierne senere i Vercel Environment Variables.

Der maa ikke opfindes værdier. Schema, migrations og databasekald hører til et senere step.

## Checkpoint

Checkpoint-navn:

`step-03-supabase-setup`

Testresultater:

- Build: PASS
- Typecheck: PASS
- Lint: PASS
- Tests: PASS, 30 testfiler og 341 tests

Den konkrete commit SHA fremgaar af slutrapporten og `git log`.

Der er ikke pushet til GitHub i STEP 3.
