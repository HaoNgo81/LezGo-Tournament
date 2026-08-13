# STEP 6 - Persistence Boundary

Dato: 2026-08-13

## Scope

STEP 6 etablerer et passivt persistence-adapterlag mellem de eksisterende runtime states og det godkendte Supabase/Postgres-schema fra STEP 5.

Der er ikke oprettet API routes, server actions, Supabase writes eller read-back mapping i dette step.

## Implementeret

- Databasepayload-typer for standardturneringer, pool-play snapshots og Team vs Team.
- Mapper fra `LiveTournamentState` til databaseklar payloadstruktur:
  - `tournaments`
  - `tournament_players`
  - `fixed_pairs`
  - `rounds`
  - `matches`
  - `match_sides`
  - `match_side_players`
  - initiale `tournament_pools`
  - initiale `pool_participants`
- Mapper fra `TeamVsTeamTournamentState` til Team vs Team-tabeller:
  - `team_vs_team_teams`
  - `team_vs_team_players`
  - `team_vs_team_matchups`
  - `team_vs_team_lineups`
  - `team_vs_team_round_results`
  - `team_vs_team_tiebreaks`
- Tests for standard, fixed partner, Mixed Americano og Team vs Team payload-mapping.

## Persistence efter STEP 6

`localStorage` er fortsat primary persistence.

De eksisterende storage keys er uændrede, og adapterlaget kaldes ikke af UI, live scoring, tournament setup, TV-view eller templates.

## Database

Ingen databaseændringer blev foretaget i STEP 6.

STEP 5-schemaet er fortsat den godkendte database-struktur.

## Låste Formater

Følgende formater er ikke ændret:

- Americano
- Fast Makker Americano
- Mixed Americano
- Mexicano
- Fast Makker Mexicano

Team vs Team runtime-logik er heller ikke ændret.

## STEP 7 Risici

- UUID-resolution skal håndteres transaktionelt, når payloads senere skrives til databasen.
- `active_matchup_id` kræver to-faset insert/update eller en legacy-id resolution efter matchups er oprettet.
- Pool-play later stages kræver en særskilt write-plan, før puljespil igen aktiveres i backend-flowet.
- Read-back mapper fra database rows til eksisterende runtime state skal testes mod alle låste formater.
- Synkronisering mellem localStorage og database skal have tydelig konfliktstrategi, før data migreres.
- RLS-policies og share/read tokens skal designes, før browseren får direkte adgang til tournament rows.
