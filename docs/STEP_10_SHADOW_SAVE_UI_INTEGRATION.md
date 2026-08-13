# STEP 10 - Shadow-Save UI Integration

Dato: 2026-08-13

Status: Implementeret lokalt. Ingen push.

## Scope

STEP 10 integrerer Supabase shadow-save i appens normale save-flow, mens `localStorage` fortsat er primary persistence.

Turneringsmotorer, scoring, rotationer, banerotationer, timer, alarm og Team vs Team-regler er ikke ændret.

## Save Flow

Når en aktiv turnering gemmes:

1. Runtime state gemmes først i `localStorage`.
2. Lokal shadow-save metadata opdateres.
3. Hvis feature flag er aktivt, køres en async shadow-save til server API.
4. Fejl i shadow-save påvirker ikke den lokale turnering.

Normal load læser stadig fra `localStorage`.

## Feature Flags

Client queue:

`NEXT_PUBLIC_LEZGO_SUPABASE_SHADOW_SAVE=1`

Server write:

`LEZGO_ENABLE_SUPABASE_SHADOW_SAVE=1`

Begge skal være aktive, før browser-flowet kan skrive en shadow copy til Supabase.

Hurtig deaktivering:

- Fjern eller sæt et af flagene til andet end `1`.
- Default er disabled.

## ID Mapping

Mapping gemmes separat i localStorage under:

`lezgo.shadowSaveMetadata.v1`

Metadata key er den eksisterende lokale tournament id:

- Standard: `<turneringsnavn>-<format>`
- Team vs Team: `<turneringsnavn>-team-vs-team`

Når Supabase returnerer `tournamentId`, gemmes den som `supabaseTournamentId`. Næste save sender samme id tilbage, så atomic replace opdaterer samme Supabase-turnering i stedet for at oprette en ny.

## Sync Metadata

Metadata indeholder:

- `supabaseTournamentId`
- `lastLocalSaveAt`
- `lastSuccessfulShadowSaveAt`
- `lastShadowSaveVersion`
- `status`
- `lastError`

## Sync Status

Interne statusser:

- `local-only`
- `syncing`
- `synced`
- `error`
- `conflict`

Status påvirker ikke turneringsafviklingen.

Der er endnu ikke tilføjet synlig UI-status, fordi STEP 10 kan gennemføres sikkert uden større UI/designændring.

## Conflict Handling

Ved HTTP 409:

- lokal state ændres ikke
- Supabase overskrives ikke
- status sættes til `conflict`
- eksisterende mapping/version bevares

Ingen automatisk konfliktløsning er implementeret endnu.

## Retry / Duplicate Safety

Der er ingen aggressiv background sync.

Browseren undgår duplicate initial shadow-save requests ved at blokere flere samtidige shadow-saves for samme local id. Efter første succes genbruges samme Supabase UUID.

## Database

Ingen nye database migrations i STEP 10.

STEP 10 bruger STEP 9 RPC'en:

`lezgo_save_tournament_snapshot_v2`

## Testdata

Supabase E2E bruger kun `STEP_10_TEST` data.

Efter E2E skal:

- `STEP_10_TEST` tournament count være 0
- orphan row checks være 0

## Mangler Før Supabase Primary

- Synlig sync-status i UI, hvis ønsket.
- Brugerflow til konfliktvisning og manuel konfliktløsning.
- Kontrolleret import/migration af eksisterende lokale turneringer.
- Supabase read ved app-start, når primary persistence besluttes.
- Realtime sync design.
