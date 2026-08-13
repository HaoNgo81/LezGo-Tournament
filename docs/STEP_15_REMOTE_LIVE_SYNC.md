# STEP 15 - Remote Live Sync

Dato: 2026-08-13

Status: Implementeret lokalt. Ingen push.

## Scope

STEP 15 gør remote/TV-visningen automatisk opdateret, mens `localStorage` fortsat er primary persistence på Device A.

Valgt sync-metode: sikker polling gennem eksisterende server-side API routes.

Supabase Realtime er ikke aktiveret i dette step, fordi den nuværende sikkerhedsmodel holder service-role adgang server-side og ikke giver browseren direkte database-read credentials.

## Database Fix

Root cause før STEP 15 var `public.lezgo_save_tournament_snapshot_v2`.

Ved update af en eksisterende turnering slettede RPC'en tidligere parent-rækken i `public.tournaments`. Da `tournament_access` refererer til `tournaments(id) on delete cascade`, og `tournament_handoffs` refererer videre til `tournament_access(id) on delete cascade`, forsvandt adgang og QR/handoff ved hvert save.

Ny migration:

- `supabase/migrations/20260813001000_step_15_preserve_access_on_snapshot_replace.sql`

Den erstatter RPC'en additivt:

- nye turneringer indsættes som før
- eksisterende turneringer opdaterer parent-rækken i `public.tournaments`
- parent `id` bevares
- `tournament_access` bevares
- `tournament_handoffs` bevares
- snapshot child rows erstattes atomisk i transaktionen
- `expectedUpdatedAt` conflict protection bevares
- rollback bevarer eksisterende snapshot, access og handoff

Der er ingen schemaændring af tabeller, ingen datamigrering og ingen eksisterende turneringsdata er slettet.

## Remote Sync

Remote-visningen poller den sikre read endpoint med 4 sekunders interval.

Statusser:

- Forbinder
- Live
- Forbinder igen
- Offline
- Fejl

Hvis polling fejler, bliver seneste viste snapshot i memory. Lokal primary `localStorage` påvirkes ikke.

Manuel `Opdater` er bevaret.

Remote-visningen accepterer kun nyere `updatedAt` snapshots for samme adgang. Stale eller duplicate snapshots ignoreres.

## Handoff Read

Handoff redeem er read-only som standard. Det betyder, at automatisk TV/remote polling ikke skriver `use_count`/`last_used_at` for hvert poll.

Validering af handoff, expiry, revocation og access sker stadig server-side med service-role.

## Sikkerhed

- `SUPABASE_SERVICE_ROLE_KEY` bruges kun server-side
- ingen service-role key i client bundle
- ingen public writes til anon/authenticated
- RLS er fortsat enabled
- Device B er fortsat read-only
- QR/handoff indeholder kun kortlivet reference, ikke share token

## Verifikation

Ny E2E-test:

- `tests/supabase-step15-e2e.test.ts`

Dækker:

- Device A create
- QR/handoff provision
- Device B read
- Device A save på samme tournament ID
- `tournament_access` overlever save
- `tournament_handoffs` overlever save
- Device B henter ny score
- gentagne saves
- rollback ved simuleret mid-save failure
- stale update conflict
- duplicate update
- Standard Americano
- Fast Makker Americano
- Pool/later-stage
- Team vs Team
- invalid/revoked access
- expired handoff
- orphan/duplicate checks
- cleanup af `STEP_15_TEST` data

## Persistence Efter STEP 15

- Device A: `localStorage` er stadig primary persistence
- Supabase: shadow/read backend
- Device B: read-only remote view med automatisk polling
- Realtime: ikke aktiveret endnu
- locked tournament formats changed: NO
