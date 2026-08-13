# STEP 11 - Sync Status og Migration Readiness

Dato: 2026-08-13

Status: Implementeret lokalt. Ingen push.

## Scope

STEP 11 gør Supabase shadow-save synlig og diagnostisk, men `localStorage` er stadig primary persistence.

Ingen eksisterende localStorage-data migreres. Ingen database migrations. Ingen turneringsregler ændres.

## Sync UI

Der er tilføjet diskret sync-status på:

- Live scoring for standardformater
- Live scoring for pool/later-stage turneringer
- Team vs Team

Statusser:

- `local-only`: Kun gemt lokalt
- `syncing`: Synkroniserer...
- `synced`: Synkroniseret
- `error`: Synkronisering fejlede
- `conflict`: Konflikt kræver handling

Status påvirker ikke runtime state, scoring, rounds eller navigation.

## Error og Retry UX

Ved shadow-save fejl:

- lokal turnering forbliver gemt
- status viser at lokal gem er bevaret
- brugeren kan trykke `Prøv igen`

Retry bruger eksisterende localStorage mapping og skaber ikke nye Supabase-turneringer, hvis der allerede findes `supabaseTournamentId`.

## Conflict UX

Ved optimistic concurrency conflict:

- Supabase overskrives ikke
- localStorage overskrives ikke
- status sættes til `conflict`
- UI viser lokal ID, Supabase UUID, lokal timestamp og Supabase version

Der er endnu ikke implementeret automatisk merge eller "brug Supabase-version".

## ID Mapping Diagnostic

Mapping ligger fortsat i:

`lezgo.shadowSaveMetadata.v1`

Local ID:

- Standard: `<turneringsnavn>-<format>`
- Team vs Team: `<turneringsnavn>-team-vs-team`

Diagnostic information vises i sync-statuspanelet ved fejl/konflikt.

Hvis mapping mangler eller er korrupt, klassificeres turneringen read-only som `invalid/unmappable` i migration readiness.

## Migration Readiness

Ny read-only analyse:

`analyzeLocalStorageMigrationReadiness()`

Klassificering:

- `local-only`
- `mapped-and-synced`
- `mapped-but-outdated`
- `conflict`
- `invalid/unmappable`

Dry-run rapporterer:

- Total lokale turneringer
- Kan migreres sikkert
- Findes allerede i Supabase
- Konflikter
- Ugyldige

Dry-run skriver ikke til database, ændrer ikke localStorage og kalder ikke Supabase.

## Multi-Device Readiness

Fremtidigt flow:

1. Tablet A opretter turnering.
2. Tablet A shadow-saver til Supabase.
3. Tablet B får adgang via en kontrolleret adgangsmekanisme.
4. Tablet B læser turneringen fra Supabase.
5. Begge enheder bruger optimistic concurrency/versioner ved save.

Der mangler før dette kan aktiveres:

- Stabil tournament code eller share-token
- Read API med adgangskontrol
- Konflikt-UX for flere enheder
- Eventuel Supabase Realtime/subscription model

## Anbefalet Adgangsmodel

Anbefaling: kombination af organizer authentication og tournament access code/share-token.

Model:

- Organizer opretter turnering og ejer write-adgang.
- Delt adgang sker via tournament code/share-token.
- Public brugere får aldrig generel database write.
- Server-side API validerer access token/code.
- Service-role key forbliver kun server-side.

Denne model passer bedst, fordi turneringer ofte skal deles midlertidigt med spillere, dommere eller TV-skærme uden fulde brugerkonti.

## Offline Strategi

Offline skal fortsat fungere sådan:

- localStorage gemmer alle resultater først
- turneringen kan fortsætte uden internet
- shadow-save går i `error`
- retry kan køre senere
- conflicts opdages med Supabase `updated_at`

STEP 11 forringer ikke offline-funktion.

## Database

Ingen nye migrationer.

RLS og ingen public write access bevares.

## Mangler Før Supabase Primary

- Server-side read API med adgangskontrol
- UI til at finde/åbne Supabase-turnering på ny enhed
- Manuel konfliktløsning
- Kontrolleret migration/import af eksisterende localStorage-data
- Beslutning om auth/share-token model
- Realtime design
