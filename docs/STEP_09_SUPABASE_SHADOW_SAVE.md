# STEP 9 - Supabase Shadow Save

Dato: 2026-08-13

Status: Implementeret lokalt. Ingen push.

## Scope

STEP 9 bygger videre på STEP 8 med server-side atomic replace, Team vs Team persistence, pool/later-stage read-back og en sikker shadow-save boundary.

localStorage er stadig primary persistence. Supabase bruges kun som verificeret backend-motor og optional shadow-copy via feature flags.

## Atomic Replace

Save/update af en eksisterende turnering sker via `lezgo_save_tournament_snapshot_v2`.

Flow:

1. Valider operations og tournament id.
2. Lås eksisterende tournament row med `for update`.
3. Sammenlign `updated_at` med klientens `expectedUpdatedAt`, hvis værdien er angivet.
4. Slet eksisterende snapshot for samme tournament id.
5. Lad cascade fjerne child rows.
6. Insert komplet nyt snapshot med samme tournament id.
7. Commit transaktionen.

Hvis en operation fejler, ruller Postgres hele funktionen tilbage, og den eksisterende turnering forbliver uændret.

## Conflict Protection

Optimistic concurrency sker server-side i RPC'en.

Hvis `p_expected_updated_at` ikke matcher den aktuelle databaseversion, fejler update med conflict, og nyere databaseindhold overskrives ikke.

## Persistence

Standard turneringer:

- Americano
- Fast Makker Americano
- Mixed Americano
- Mexicano
- Fast Makker Mexicano
- Pool-play snapshot/read-back for igangværende later-stage state

Team vs Team:

- Teams
- Spillere
- Kaptajner
- Matchups
- Lineups
- Runde-resultater
- Tiebreaks
- Knockout/pool metadata
- Active matchup

## Shadow Save

Shadow-save er implementeret som en server-side API boundary:

`POST /api/supabase/shadow-save`

Den er slået fra som standard.

Klientkald kræver:

- `NEXT_PUBLIC_LEZGO_SUPABASE_SHADOW_SAVE=1`

Server-write kræver:

- `LEZGO_ENABLE_SUPABASE_SHADOW_SAVE=1`

Hvis shadow-save fejler, bliver fejlen fanget i klient-helperen, så den lokale turnering ikke ødelægges.

## Security

- `SUPABASE_SERVICE_ROLE_KEY` bruges kun server-side.
- Ingen service-role key i client helper.
- Ingen public write access.
- RLS bevares.
- RPC execute er kun granted til `postgres` og `service_role`.

## Database Migrations

- `20260813000500_step_09_complete_persistence_rpc.sql`
- `20260813000600_step_09_service_role_team_grants.sql`

## Testdata

Supabase E2E bruger kun tydeligt markerede `STEP_09_TEST` turneringer.

Efter E2E skal:

- `STEP_09_TEST` count være 0
- orphan row checks være 0

## Locked Formats

De låste turneringsformater er ikke ændret sportsligt:

- Americano
- Fast Makker Americano
- Mixed Americano
- Mexicano
- Fast Makker Mexicano

STEP 9 ændrer persistence og read-back, ikke scoring, rotation, banerotation, timer, alarm eller ranglisteberegning.

## Mangler Før Supabase Primary

- Stabil browser-side sync-status og konfliktvisning.
- Mapping mellem localStorage legacy ids og Supabase tournament ids i UI.
- Kontrolleret migration/import af eksisterende lokale turneringer, hvis ønsket.
- Supabase Realtime kan først kobles på efter primary-persistence beslutning.
