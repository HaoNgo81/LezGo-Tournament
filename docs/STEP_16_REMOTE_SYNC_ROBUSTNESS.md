# STEP 16 - Remote Sync Robustness

Dato: 2026-08-13

Status: Implementeret lokalt. Ingen push.

## Scope

STEP 16 forbedrer praktisk drift af multi-device/remote live-visningen oven på STEP 15.

Der er ikke skiftet primary persistence. `localStorage` er fortsat primary persistence på Device A.

Device B / remote view er fortsat read-only.

Ingen turneringsmotor, scoring, ranking, rundealgoritme, Team vs Team runtime eller låst formatlogik er ændret.

## Sync-valg

Polling er bevaret som sync-metode.

Supabase Realtime blev fravalgt i STEP 16, fordi det ville kræve en ny browser/RLS-læsemodel eller client-side database subscription. Den nuværende pollingmodel holder Supabase service credentials server-side og passer bedst til den eksisterende sikkerhedsarkitektur.

## Implementeret Robusthed

Remote polling er gjort mere robust:

- generationsguard, så gamle timer-callbacks ikke kan opdatere ny session
- ingen overlappende poll requests
- backoff ved midlertidige netværks-/serverfejl
- online-event forsøger straks reconnect
- visibilitychange forsøger straks refresh, når fanen bliver synlig igen
- terminale adgangsfejl stopper automatisk polling
- udløbet QR/handoff viser specifik besked og stopper auto-retry
- manuel `Opdater` bevares som fallback
- seneste viste snapshot bliver i memory ved midlertidig fejl
- stale/duplicate snapshots ignoreres fortsat
- polling sætter ikke manuel refresh-knap i loading-state

## Remote Status UI

Banneret viser fortsat:

- Forbinder
- Live
- Forbinder igen
- Offline
- Fejl

STEP 16 tilføjer også:

- Senest tjekket
- Senest opdateret
- Næste forsøg

Tekster er tilføjet på dansk og engelsk.

## Database

Ingen databaseændringer.

Ingen migration.

Ingen RLS-ændring.

Ingen eksisterende data migreret eller slettet.

## Sikkerhed

- `SUPABASE_SERVICE_ROLE_KEY` bruges fortsat kun server-side
- ingen secret i client bundle
- ingen public writes
- RLS bevares
- remote view har ingen write controls
- handoff redeem er fortsat read-only som standard

## Verifikation

Udvidede tests i:

- `tests/remote-tournament-app.test.tsx`

Dækker:

- auto-refresh med nyere snapshot
- stale/duplicate snapshot ignoreres
- midlertidig fejl bevarer seneste snapshot
- backoff efter gentagne fejl
- reconnect ved browser online-event
- udløbet handoff stopper auto polling
- manuel `Opdater` bevares
- remote view ændrer ikke `localStorage`
- standard, pool/later-stage og Team vs Team remote rendering

Supabase E2E fra STEP 15 bruges som regression for Device A -> Supabase -> Device B snapshot-flow.

## Persistence Efter STEP 16

- Device A: `localStorage` primary
- Supabase: shadow/read backend
- Device B: read-only remote live view
- Sync: robust polling
- Realtime: ikke aktiveret
- locked tournament formats changed: NO
