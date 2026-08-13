# STEP 7 - Supabase Integration Boundary

Dato: 2026-08-13

## Scope

STEP 7 bygger videre på STEP 6 persistence payloads uden at skifte appens aktive persistence.

Der er ikke migreret eksisterende `localStorage`-data, ikke skrevet turneringsdata til Supabase og ikke ændret de låste turneringsformater.

## Implementeret

- Transaktionel write-plan for standardturneringer.
- Transaktionel write-plan for Team vs Team.
- UUID-resolution mellem runtime/client refs og database UUIDs.
- To-faset relation for Team vs Team:
  - teams indsættes først uden `captain_player_id`
  - players indsættes
  - team captain UUIDs opdateres
  - matchups indsættes
  - tournament `active_matchup_id` opdateres
- Read-back mapper fra standard Supabase rows til eksisterende `LiveTournamentState`.
- Konfliktstrategi hvor `localStorage` fortsat er primary persistence.
- Server-side guard, så `SUPABASE_SERVICE_ROLE_KEY` ikke kan læses fra browser-runtime.

## Database

Ingen databaseændringer blev foretaget i STEP 7.

Der er ikke oprettet nye migrations eller RLS policies. STEP 5-schemaet er fortsat gældende.

## UUID Mapping

STEP 7 bruger `clientRef` fra STEP 6 payloads til at oprette et deterministisk `idMap` før write-planen bygges.

Eksempler:

- `tournament` -> database UUID
- `player:p1` -> `tournament_players.id`
- `round:1` -> `rounds.id`
- `match:r1-c1` -> `matches.id`
- `match-side:r1-c1:1` -> `match_sides.id`

Write-planen indeholder kun database UUIDs i relationsfelter som `tournament_id`, `round_id`, `match_id`, `player_1_id` og `tournament_player_id`.

## Read-back

Read-back mapperen genskaber standard `LiveTournamentState` ud fra row-grupper:

- `tournaments`
- `tournament_players`
- `rounds`
- `matches`
- `match_sides`
- `match_side_players`

Standings gemmes ikke i databasen. De beregnes fortsat af eksisterende runtime-logik ud fra match results.

## Konfliktstrategi

Indtil Supabase er verificeret som primary persistence:

- `localStorage` vinder, hvis der er lokale usynkroniserede ændringer.
- Nyere `localStorage` vinder over ældre Supabase state.
- Nyere Supabase kan bruges, hvis localStorage ikke har usynkroniserede ændringer.
- Manglende/ugyldige timestamps giver `manual-review`.

Der slettes eller overskrives ikke localStorage automatisk.

## RLS og Adgang

RLS baseline fra STEP 5 er uændret:

- RLS enabled på alle tabeller.
- Ingen public policies.
- Privilegerede writes skal gå via server-side kode.
- Browseren må ikke få service-role key.

STEP 7 tilføjer ingen direkte browser write-adgang.

## Secrets

`SUPABASE_SERVICE_ROLE_KEY` tilgås kun via server-konfigurationsmodulet.

Server-konfigurationsmodulet kaster en fejl, hvis det kaldes fra en browser-lignende runtime.

## Persistence efter STEP 7

`localStorage` er stadig primary persistence.

Supabase write-plan og read-back mapping er klar til at blive koblet på i et senere step, men de bruges ikke af UI-flowet endnu.

## Mangler før Supabase kan blive primary

- Faktisk server-side Supabase repository/transaction executor.
- Read-back mapping for Team vs Team rows.
- Read-back mapping for pool-play later stages.
- Sikker API/server action med request validation.
- Konflikt- og merge-UX ved eksisterende localStorage data.
- Share-token eller auth-baseret RLS-policy design.
- Praktisk end-to-end test mod Supabase med non-production data.
