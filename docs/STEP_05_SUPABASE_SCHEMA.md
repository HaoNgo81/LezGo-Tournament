# STEP 5 - Supabase Schema Migration

Dato: 2026-08-13

## Scope

STEP 5 implementerede det godkendte Postgres-schema fra `docs/DATABASE_SCHEMA.md` som en Supabase migration.

Der er ikke indsat turneringsdata, migreret localStorage-data eller ændret appens runtime persistence.

## Supabase CLI

Supabase CLI er installeret som lokal dev dependency.

- Version: `2.114.0`
- Projekt: `LezGo Tournament`
- Project ref: `xpmgusozijuefxoasfvj`

## Migration

Migration file:

- `supabase/migrations/20260813000100_step_05_schema.sql`

Migration history i remote Supabase viser:

- Local: `20260813000100`
- Remote: `20260813000100`

## Tables Created

16 public tables:

- `tournaments`
- `tournament_players`
- `fixed_pairs`
- `rounds`
- `tournament_pools`
- `matches`
- `match_sides`
- `match_side_players`
- `pool_participants`
- `team_vs_team_teams`
- `team_vs_team_players`
- `team_vs_team_matchups`
- `team_vs_team_lineups`
- `team_vs_team_round_results`
- `team_vs_team_tiebreaks`
- `tournament_templates`

## Database Verification

Remote metadata verification:

- Tables found: 16 / 16
- Primary keys: 16
- Foreign keys: 32
- Check constraints: 182
- Unique constraints: 24
- Indexes: 65
- `updated_at` triggers: 14
- RLS enabled tables: 16 / 16
- RLS policies: 0

Sample row-count verification:

- `tournaments`: 0
- `tournament_players`: 0
- `matches`: 0
- `match_sides`: 0
- `team_vs_team_teams`: 0
- `tournament_templates`: 0

## RLS Baseline

RLS is enabled on all schema tables. No public policies were added in STEP 5.

This matches the planned server-only write model:

```text
Frontend
  |
  v
Vercel API / server actions
  |
  v
Supabase server client
```

## Safety

- No tournament data inserted.
- No localStorage data migrated.
- App persistence remains localStorage.
- No tournament engine files changed.
- No scoring, ranking, round generation, TV-view, timer or alarm logic changed.
- No GitHub push performed.

## Test Results

- Build: PASS
- Typecheck: PASS
- Lint: PASS
- Tests: PASS
- Test files: 30
- Tests: 341

## Checkpoint

Checkpoint tag:

`step-05-supabase-schema`

The exact commit SHA is in the STEP 5 final report.
