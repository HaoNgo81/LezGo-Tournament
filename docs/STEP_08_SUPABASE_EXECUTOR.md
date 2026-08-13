# STEP 8 - Supabase Executor

Dato: 2026-08-13

## Scope

STEP 8 implementerer den faktiske server-side Supabase persistence executor for standardturneringer oven på STEP 7 write-plan/read-back-laget.

Appens runtime persistence er ikke skiftet. `localStorage` er stadig primary persistence.

## Implementeret

- Server-side Supabase REST client.
- Server-side standard tournament repository.
- Atomic Postgres RPC til at skrive en komplet standardturnering.
- Read-back fra Supabase rows til eksisterende `LiveTournamentState`.
- Typed persistence errors.
- Server-side validation af input før write/read/delete.
- STEP 8 unit-tests med simuleret atomic rollback.
- STEP 8 Supabase E2E round-trip med midlertidig `STEP_08_TEST` data.

## Database

Additive migrations:

- `supabase/migrations/20260813000200_step_08_standard_persistence_rpc.sql`
- `supabase/migrations/20260813000300_step_08_fix_standard_persistence_rpc.sql`
- `supabase/migrations/20260813000400_step_08_service_role_repository_grants.sql`

Ingen destruktive schemaændringer.

## Atomic Write

Standardturneringer skrives via RPC:

`public.lezgo_save_standard_tournament_snapshot(jsonb)`

Repository flow:

```text
LiveTournamentState
  -> STEP 6 payload
  -> STEP 7 write-plan med UUID resolution
  -> one RPC call
  -> Postgres transaction
```

Hvis en insert fejler, fejler hele RPC-kaldet og Postgres ruller transaktionen tilbage.

RPC'en er insert-only. Den laver ikke overwrite/delete af eksisterende turneringer.

## Save / Update

STEP 8 understøtter sikker insert-only save for standardturneringer.

Idempotent update/replace er ikke aktiveret endnu, fordi overwrite kræver en eksplicit konflikt- og ejerstrategi. Det udskydes til et senere step for ikke at kunne overskrive eksisterende data utilsigtet.

## Read

Repository read henter rows server-side fra:

- `tournaments`
- `tournament_players`
- `rounds`
- `matches`
- `match_sides`
- `match_side_players`

Derefter bruges STEP 7 read-back mapper til at rekonstruere `LiveTournamentState`.

## Team vs Team

Team vs Team har stadig STEP 7 write-plan og UUID-resolution, men STEP 8 repository/RPC round-trip er kun implementeret for standardturneringer.

Team vs Team primary persistence kræver read-back mapper for Team vs Team-tabeller før aktivering.

## Pool-play

Pool-play og later stages er ikke aktiveret i STEP 8 executor.

Standard repository afviser `pool-play`, fordi later-stage read-back endnu ikke er komplet.

## RLS og Security

- RLS baseline fra STEP 5 bevares.
- RPC execute er revoked fra `public`, `anon` og `authenticated`.
- RPC execute er granted til `service_role`.
- Repository REST read/delete grants er kun givet til `service_role`.
- Ingen public database writes.
- Service-role key bruges kun server-side.
- `localStorage` forbliver primary persistence.

## Testdata

Supabase E2E bruger kun navne/legacy IDs med `STEP_08_TEST`.

Efter test blev databasen verificeret:

- `STEP_08_TEST` tournaments: 0
- orphan player rows: 0
- orphan round rows: 0
- orphan match rows: 0
- orphan side rows: 0
- orphan side-player rows: 0

## Mangler før Supabase primary

- UI/server action kobling med auth eller share-token gate.
- Idempotent update/replace med eksplicit ejer-/konfliktstrategi.
- Team vs Team read-back og RPC/repository.
- Pool-play later-stage read-back og RPC/repository.
- Praktisk multi-device test.
- Realtime design.
