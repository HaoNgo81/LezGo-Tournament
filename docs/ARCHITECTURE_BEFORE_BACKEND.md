# Architecture Before Backend Migration

Dato: 2026-08-12

Denne audit beskriver den nuvaerende arkitektur foer migration til Vercel backend/API og Supabase Postgres. Dokumentet er et rent arkitektur-notat og indeholder ingen funktionelle aendringer.

## Scope

STEP 1 er kun arkitektur-audit.

Ingen af de laaste turneringsformater er aendret:

- Americano
- Fast Makker Americano
- Mixed Americano
- Mexicano
- Fast Makker Mexicano

Migrationen maa flytte lagring og senere synkronisering, men maa ikke redesigne turneringsmotor, scoring, rotation, banerotation, Mexicano-ranking, Live Score, resultatredigering, timer eller alarm.

## Teknisk Overblik

Appen er en Next.js app med App Router.

- Framework: Next.js 16
- UI: React
- Styling: Tailwind-baserede klasser og globale CSS-variabler
- Tests: Vitest, Testing Library og jsdom
- Package manager: npm
- CI: GitHub Actions
- Nuvaerende hosting: GitHub Pages via statisk export

Der er ingen nuvaerende backend, API-routes eller database-lag i projektet.

Der blev ikke fundet:

- `vercel.json`
- `app/api`
- `pages/api`
- `src`
- Supabase-klient
- server-side persistence

## Arkitekturdiagram

```text
UI
  app/*/page.tsx
  components/*
  hooks/*
    |
    v
Tournament engine
  lib/tournament-engine/*
  lib/tournament-setup/*
  lib/live-scoring/*
  lib/team-vs-team/*
    |
    v
Current persistence
  browser localStorage
```

Den vigtige migrationsgraense er mellem turneringsmotor/live state og persistence. Backend-migrationen boer derfor starte med et repository-/storage-lag omkring eksisterende state, ikke ved at aendre sportslogikken.

## Routing Og UI

De primare sider ligger i `app`.

- `app/page.tsx`: forside/hovedmenu
- `app/new-tournament/page.tsx`: oprettelse af turnering
- `app/live/page.tsx`: live scoring
- `app/tournaments/page.tsx`: aktive og afsluttede turneringer
- `app/templates/page.tsx`: turneringsskabeloner
- `app/settings/page.tsx`: indstillinger
- `app/share/page.tsx`: deling
- `app/qr/page.tsx`: QR-visning
- `app/tv/page.tsx`: TV-/read-only visning
- `app/finish/page.tsx`: afslutningsflow
- `app/team-vs-team/page.tsx`: Team vs Team

UI-komponenterne ligger primart i `components`.

- `components/layout/app-shell.tsx`: app-shell og navigation
- `components/tournament/*`: oprettelse, live scoring, ranglister, kampkort og visninger
- `components/settings/settings-app.tsx`: indstillinger
- `components/preferences/app-preferences.tsx`: tema/sprog-præferencer
- `components/pwa/service-worker-registration.tsx`: service worker registration

Nogle UI-komponenter laeser eller skriver direkte til localStorage via `lib/tournament-setup/storage.ts`, `lib/tournament-settings/settings.ts` og `lib/tournament-templates/templates.ts`.

## Tournament Engine

Turneringslogik er samlet i `lib/tournament-engine` og relaterede domænemoduler.

- `lib/tournament-engine/engine.ts`: overordnet round generation og format-switching
- `lib/tournament-engine/round-generation.ts`: kamp-, bane- og rotationsgenerering
- `lib/tournament-engine/standings.ts`: ranglisteberegning
- `lib/tournament-engine/validation.ts`: validering af turneringsopsætning
- `lib/tournament-engine/types.ts`: centrale typer

Live-state og resultatregistrering ligger i:

- `lib/live-scoring/live-state.ts`
- `lib/live-scoring/pool-play-state.ts`
- `lib/live-scoring/pool-play-progression.ts`

Scoringregler valideres blandt andet i:

- `lib/tournament-setup/scoring.ts`

Puljespil og Team vs Team har egne moduler:

- `lib/tournament-setup/pool-play*.ts`
- `lib/tournament-setup/team-vs-team*.ts`
- `lib/team-vs-team/*`

## Nuværende Persistence

Al persistens er browser-baseret via `localStorage`.

Der blev ikke fundet brug af:

- `sessionStorage`
- `indexedDB`

Nuvaerende localStorage keys:

- `lezgo.activeTournament.v1`
- `lezgo.activeTournaments.v1`
- `lezgo.activeTeamVsTeam.v1`
- `lezgo.completedTournaments.v1`
- `lezgo.completedTeamVsTeamTournaments.v1`
- `lezgo.tournamentSettings.v1`
- `lezgo.tournamentTemplates.v1`

Storage-moduler:

- `lib/tournament-setup/storage.ts`: aktive/afsluttede turneringer
- `lib/tournament-settings/settings.ts`: app- og turneringsindstillinger
- `lib/tournament-templates/templates.ts`: turneringsskabeloner

Konsekvens:

- Data findes kun i den browser/enhed, hvor turneringen er oprettet.
- Flere telefoner/tablets deler ikke state.
- TV-/QR-/read-only visninger er lokale visninger af samme browser-state.
- Supabase-migrationen skal indføre central persistens uden at ændre state-semantikken.

## Live State Og Resultater

`LiveTournamentState` gemmes i dag som et samlet JSON-objekt. State indeholder blandt andet:

- turneringsnavn og format
- spillere/par
- runder og kampe
- aktive runde
- resultater
- scoringMode, fixedScoreRule og fixedScorePoints
- timeLimitMinutes og roundTimer
- rankingMode
- poolPlay metadata

Resultatflowet i standardformater er konceptuelt:

```text
Score input
  |
  v
components/tournament/live-scoring-app.tsx
  |
  v
saveMatchResult()
  |
  v
validateScoreForScoringMode()
  |
  v
LiveTournamentState.results
  |
  v
localStorage
```

Mexicano og Fast Makker Mexicano har dynamiske efterfølgende runder. Ved gemt eller redigeret resultat kan unplayed Mexicano-runder opdateres ud fra den aktuelle rangliste. Den adfærd er låst og skal bevares.

## PWA Og Static Hosting

`app/layout.tsx` registrerer service worker og metadata.

`app/manifest.ts` genererer manifest med base path via `NEXT_PUBLIC_BASE_PATH`.

`public/sw.js` cacher app shell og laver fetch-fallback til cache. Service workerens `APP_SHELL` bruger i dag root-baserede paths. Det skal vurderes separat ved Vercel-migration, men er ikke ændret i STEP 1.

`next.config.ts` skifter konfiguration ved GitHub Pages:

- `GITHUB_PAGES=true` giver statisk export
- `basePath=/LezGo-Tournament`
- `trailingSlash=true`
- `NEXT_PUBLIC_BASE_PATH=/LezGo-Tournament`

Ved Vercel skal GitHub Pages-specifik `basePath` og `output: export` sandsynligvis ikke bruges i production, men ændringen hører til et senere step.

## CI Og Deployment

GitHub Actions:

- `.github/workflows/ci.yml`: build, typecheck, lint og test
- `.github/workflows/pages.yml`: GitHub Pages statisk export

Der er ingen Vercel workflow eller Vercel config endnu.

## Migrationsrisici

1. Sportslogik og persistence er i dag tæt koblet gennem fuld `LiveTournamentState` JSON-lagring.
2. Backend-lag skal bevare eksisterende state-format eller have en kontrolleret adapter.
3. Dynamic Mexicano generation maa ikke blive genberegnet anderledes ved server sync.
4. Resultatredigering skal fortsat erstatte gamle resultater og ikke dobbeltregistrere point.
5. Fast scoring og timed scoring maa ikke ændres som sideeffekt af save-flow migration.
6. TV-/QR-visninger kraever senere en delt turneringsidentitet og central state.
7. LocalStorage-only settings/templates skal enten forblive lokale eller have en bevidst migrationsstrategi.
8. Service worker caching skal vurderes, saa gammel statisk Pages-cache ikke skjuler Vercel-opdateringer.

## Anbefalet Naeste Tekniske Graense

Naeste step boer kun definere en persistence boundary, eksempelvis et lille repository-interface omkring de nuvaerende storage-funktioner.

Sportslogikken boer blive liggende i:

- `lib/tournament-engine/*`
- `lib/live-scoring/*`
- `lib/tournament-setup/*`
- `lib/team-vs-team/*`

Backend/API og Supabase boer senere kobles paa som en alternativ persistence implementation bag samme app-flow.

## Restore Reference

Baseline fra STEP 0:

- Tag: `pre-vercel-backend-v1`
- Backup branch: `backup/pre-vercel-backend-v1`
- Baseline commit: `8c3d1e05d0a59c043da05164f6ad11f233da9c53`

Der er ikke pushet tag, backup branch eller STEP 1-aendringer til GitHub.
