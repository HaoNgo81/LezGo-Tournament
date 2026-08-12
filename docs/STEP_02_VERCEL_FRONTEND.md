# STEP 2 - Vercel Frontend Readiness

Dato: 2026-08-12

## Formaal

STEP 2 goer den eksisterende LezGo Tournament App frontend klar til Vercel root-hosting uden backend, database, API, authentication eller persistence-aendringer.

## Framework

Projektet bruger fortsat:

- Next.js 16
- App Router i `app`
- React
- npm scripts
- Vitest, Testing Library og jsdom

Projektet er ikke konverteret til et andet framework.

## GitHub Pages-Specifik Konfiguration

GitHub Pages er fortsat understoettet via miljoevariablen `GITHUB_PAGES=true`.

GitHub Pages-specifikke dele:

- `next.config.ts` bruger `basePath: "/LezGo-Tournament"` ved `GITHUB_PAGES=true`
- `next.config.ts` bruger `output: "export"` ved `GITHUB_PAGES=true`
- `app/layout.tsx` bruger GitHub Pages base path til icon metadata
- `app/manifest.ts` bruger GitHub Pages base path til `start_url` og icons
- `.github/workflows/pages.yml` bygger med `GITHUB_PAGES=true`

Disse dele er ikke fjernet eller deaktiveret.

## Vercel-Status

Vercel root-hosting fungerer med standard Next.js build, naar `GITHUB_PAGES` ikke er sat.

- Root path: `/`
- Build command: `npm.cmd run build`
- Output: Next.js standard `.next`
- Ekstra `vercel.json`: ikke noedvendig for dette Next.js App Router projekt
- SPA fallback/rewrite: ikke noedvendig, da routes er Next app routes

## Aendringer I STEP 2

`public/sw.js` er opdateret, saa service workerens app shell cache bygger URLs ud fra `self.registration.scope`.

Det betyder:

- PWA-cache virker fra Vercel root `/`
- PWA-cache virker fortsat under GitHub Pages path `/LezGo-Tournament`
- Ingen turneringslogik, scoring, localStorage eller live-state er aendret

## Persistence

Eksisterende browser localStorage er uendret.

Der er ikke tilfoejet:

- Supabase
- Postgres
- database
- backend
- API
- auth
- realtime

## Laaste Turneringsformater

Der er ikke aendret filer i turneringsmotoren eller live scoring.

- Americano: UAENDRET
- Fast Makker Americano: UAENDRET
- Mixed Americano: UAENDRET
- Mexicano: UAENDRET
- Fast Makker Mexicano: UAENDRET

## Routing Der Skal Verificeres Lokalt

Routes:

- `/`
- `/new-tournament`
- `/templates`
- `/tournaments`
- `/settings`
- `/live`
- `/tv`

Kontrol:

- UI-navigation
- direkte route
- browser refresh

Lokal root-verifikation paa dev-server:

- `/`: PASS 200
- `/new-tournament`: PASS 200
- `/templates`: PASS 200
- `/tournaments`: PASS 200
- `/settings`: PASS 200
- `/live`: PASS 200
- `/tv`: PASS 200
- `/manifest.webmanifest`: PASS 200
- `/sw.js`: PASS 200

## Assets Der Skal Verificeres

- `public/lezgo-padel-logo.png`
- `public/app-icon-192.png`
- `public/app-icon-512.png`
- `public/sw.js`
- CSS og JavaScript bundles
- alarmlyde, som genereres via Web Audio og ikke bruger eksterne lydfiler

Lokal asset-verifikation:

- `public/lezgo-padel-logo.png`: PASS 200
- `public/app-icon-192.png`: PASS 200
- `public/app-icon-512.png`: PASS 200

## Testresultater

- Vercel/root build: PASS
- Typecheck: PASS
- Lint: PASS
- Tests: PASS, 30 testfiler og 341 tests
- GitHub Pages build med `GITHUB_PAGES=true`: PASS
- Lokal dev-server: PASS

## Checkpoint

Checkpoint-navn:

`step-02-vercel-frontend`

Den konkrete commit SHA fremgaar af slutrapporten og `git log`.

Der er ikke pushet til GitHub i STEP 2.
