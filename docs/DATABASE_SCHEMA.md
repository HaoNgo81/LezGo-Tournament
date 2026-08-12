# Database Schema Design

Dato: 2026-08-12

STEP 4 er kun database-design. Der er ikke kørt SQL mod Supabase, oprettet tabeller, applied migrations eller flyttet data. `localStorage` er fortsat primary persistence.

## Existing Persistence Audit

Den nuværende app gemmer browser-lokalt via `localStorage`.

Storage keys:

- `lezgo.activeTournament.v1`: valgt aktiv standard-/puljetournament som `LiveTournamentState`
- `lezgo.activeTournaments.v1`: op til 5 aktive standard-/puljetournaments som `LiveTournamentState[]`
- `lezgo.activeTeamVsTeam.v1`: aktiv Team vs Team state som `TeamVsTeamTournamentState`
- `lezgo.completedTournaments.v1`: afsluttede standard-/puljetournaments som `{ id, finishedAt, state }[]`
- `lezgo.completedTeamVsTeamTournaments.v1`: afsluttede Team vs Team tournaments som `{ id, finishedAt, state }[]`
- `lezgo.tournamentSettings.v1`: globale app-/standardindstillinger
- `lezgo.tournamentTemplates.v1`: standardskabeloner

`LiveTournamentState` indeholder:

- `tournamentName`
- `format`
- `status`
- `finishedAt`
- `players`
- `rounds`
- `configuredRounds`
- `courtCount`
- `activeRoundNumber`
- `results`
- `startedMatchIds`
- `scoringMode`
- `fixedScoreRule`
- `fixedScorePoints`
- `timeLimitMinutes`
- `roundTimer`
- `rankingMode`
- `poolPlay`

`TournamentPlayer` er `{ id, name, gender? }`. Mixed Americano bruger `gender`. Fast Makker formater danner par af nabospillere i `players`.

`TournamentRound` er `{ roundNumber, matches, byePlayerIds? }`.

`TournamentMatch` er `{ id, roundNumber, courtNumber, teamA, teamB }`, hvor `teamA` og `teamB` hver har `id` og `playerIds: [string, string]`.

`MatchResult` er `{ matchId, teamAPoints, teamBPoints, tieBreakWinner? }`.

`RoundTimerState` er `{ roundNumber, status, countdownSeconds, remainingSeconds, durationSeconds }`.

Puljespil gemmes i `LiveTournamentState.poolPlay` med:

- `phase`
- `advancementMode`
- `unmatchedResolution`
- `initialStage`
- `initialResults`
- `nextStageResults`
- `finalResults`
- `placementTiebreakResults`
- `placementStage`
- `crossMatchStage`
- `crossMatchFinalStage`

Team vs Team gemmes separat som `TeamVsTeamTournamentState` med:

- `name`, `status`, `finishedAt`
- `scoringMode`, `fixedScoreRule`, `fixedScorePoints`
- `teamCount`, `teams`, `playersPerTeam`
- `competitionMode`, `drawMode`
- `matchFormat`, `maxRounds`
- `activeMatchupId`
- `matchups`
- `knockoutGroups`
- `knockoutPlacements`

Global settings gemmer:

- `scoringMode`
- `courts`
- `rounds`
- `rankingMode`
- `timeLimitMinutes`
- `alarmSound`
- `language`
- `theme`

Templates gemmer:

- `id`
- `title`
- `format`
- `scoringMode`
- `courts`
- `rounds`
- `firstRoundOrder`
- `rankingMode`
- `fixedScoreRule`
- `fixedScorePoints`
- `timeLimitMinutes`

TV, QR og read-only views gemmer ikke separat state. De beregnes ud fra aktiv tournament state.

## Design Principles

- Matchresultater er source of truth for standings.
- Standings, ranks, wins, losses, point difference og pause counts gemmes ikke autoritativt.
- Resultatredigering sker ved at opdatere samme match-result row, ikke ved at akkumulere totals.
- Schemaet skal kunne repræsentere eksisterende state uden at ændre turneringsmotoren.
- Alle primære nøgler bør være `uuid` med Postgres/Supabase default generation.
- Alle timestamps bør være `timestamptz`.
- `updated_at` bør styres af en fælles trigger i en senere migration.
- Format-specifikke edge cases kan bruge `jsonb metadata`, men centrale match-/resultatdata normaliseres.

## ER Model

```text
tournaments
  |
  +-- tournament_players
  |
  +-- fixed_pairs
  |
  +-- rounds
  |     |
  |     +-- matches
  |           |
  |           +-- match_sides
  |                 |
  |                 +-- match_side_players
  |
  +-- tournament_pools
  |     |
  |     +-- pool_participants
  |
  +-- team_vs_team_teams
  |     |
  |     +-- team_vs_team_players
  |
  +-- team_vs_team_matchups
        |
        +-- team_vs_team_lineups
        +-- team_vs_team_round_results
        +-- team_vs_team_tiebreaks

tournament_templates
```

## Tables

### tournaments

Purpose: one tournament, including standard, pool-play and Team vs Team.

Columns:

- `id uuid primary key`
- `name text not null`
- `format text not null`
- `status text not null`
- `scoring_mode text not null`
- `fixed_score_rule text null`
- `fixed_score_points integer null`
- `ranking_mode text null`
- `court_count integer null`
- `configured_rounds integer null`
- `active_round_number integer null`
- `time_limit_minutes integer null`
- `timer_state jsonb null`
- `pool_phase text null`
- `pool_advancement_mode text null`
- `pool_unmatched_resolution text null`
- `team_count integer null`
- `players_per_team integer null`
- `team_match_format text null`
- `team_competition_mode text null`
- `team_draw_mode text null`
- `active_matchup_id uuid null`
- `finished_at timestamptz null`
- `legacy_local_id text null`
- `metadata jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

Constraints:

- `format in ('americano', 'mexicano', 'mixed-americano', 'fixed-partner-americano', 'fixed-partner-mexicano', 'pool-play', 'team-vs-team')`
- `status in ('setup', 'active', 'finished')`
- `scoring_mode in ('Fri scoring', 'Fast antal point', 'Spil på tid')`
- `ranking_mode is null or ranking_mode in ('matchPointsFirst', 'partiPointsFirst')`
- `court_count is null or court_count > 0`
- `configured_rounds is null or configured_rounds > 0`
- `active_round_number is null or active_round_number > 0`
- `time_limit_minutes is null or time_limit_minutes > 0`
- `fixed_score_points is null or fixed_score_points > 0`

Indexes:

- `tournaments(status)`
- `tournaments(format)`
- `tournaments(updated_at desc)`

Delete behavior:

- Deleting a tournament cascades to players, rounds, matches, pools, Team vs Team rows and results.

### tournament_players

Purpose: player records scoped to one tournament. Do not introduce global player identity yet.

Columns:

- `id uuid primary key`
- `tournament_id uuid not null references tournaments(id) on delete cascade`
- `legacy_player_id text not null`
- `name text not null`
- `gender text null`
- `display_order integer not null`
- `metadata jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

Constraints:

- `gender is null or gender in ('female', 'male')`
- `display_order > 0`
- `unique(tournament_id, legacy_player_id)`
- `unique(tournament_id, display_order)`
- optional `unique(tournament_id, lower(name))` if implemented via expression index

Indexes:

- `tournament_players(tournament_id)`

### fixed_pairs

Purpose: fixed partner pairs for Fast Makker Americano and Fast Makker Mexicano.

Columns:

- `id uuid primary key`
- `tournament_id uuid not null references tournaments(id) on delete cascade`
- `legacy_team_id text null`
- `player_1_id uuid not null references tournament_players(id) on delete cascade`
- `player_2_id uuid not null references tournament_players(id) on delete cascade`
- `display_order integer not null`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

Constraints:

- `player_1_id <> player_2_id`
- `display_order > 0`
- `unique(tournament_id, display_order)`
- players must belong to same tournament. This needs composite foreign keys or a database trigger in the implementation step.

Indexes:

- `fixed_pairs(tournament_id)`

### rounds

Purpose: standard format rounds.

Columns:

- `id uuid primary key`
- `tournament_id uuid not null references tournaments(id) on delete cascade`
- `round_number integer not null`
- `status text not null default 'scheduled'`
- `bye_player_ids uuid[] null`
- `metadata jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

Constraints:

- `round_number > 0`
- `status in ('scheduled', 'active', 'completed')`
- `unique(tournament_id, round_number)`

Indexes:

- `rounds(tournament_id, round_number)`

### matches

Purpose: court-level match shell for all standard and pool-style matches.

Columns:

- `id uuid primary key`
- `tournament_id uuid not null references tournaments(id) on delete cascade`
- `round_id uuid null references rounds(id) on delete cascade`
- `legacy_match_id text not null`
- `match_scope text not null`
- `pool_id uuid null references tournament_pools(id) on delete cascade`
- `label text null`
- `court_number integer null`
- `status text not null default 'ready'`
- `started_at timestamptz null`
- `finished_at timestamptz null`
- `metadata jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

`match_scope` examples:

- `standard`
- `pool_initial`
- `pool_placement`
- `pool_cross`
- `pool_final`
- `pool_tiebreak`

Constraints:

- `court_number is null or court_number > 0`
- `status in ('ready', 'running', 'completed')`
- `unique(tournament_id, legacy_match_id)`
- `unique(round_id, court_number)` where `court_number is not null`

Indexes:

- `matches(tournament_id)`
- `matches(round_id, court_number)`
- `matches(pool_id)`
- `matches(status)`

### match_sides

Purpose: two sides per match, with score stored on the side.

Columns:

- `id uuid primary key`
- `match_id uuid not null references matches(id) on delete cascade`
- `side_number integer not null`
- `score integer null`
- `tie_break_winner boolean not null default false`
- `metadata jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

Constraints:

- `side_number in (1, 2)`
- `score is null or score >= 0`
- `unique(match_id, side_number)`
- exactly two sides per match should be enforced by application code or deferred constraint/trigger in a later migration.

Indexes:

- `match_sides(match_id)`

### match_side_players

Purpose: players on each match side. This supports Americano, Mixed Americano, Mexicano and fixed-partner formats with one shared model.

Columns:

- `id uuid primary key`
- `match_side_id uuid not null references match_sides(id) on delete cascade`
- `tournament_player_id uuid not null references tournament_players(id) on delete cascade`
- `display_order integer not null`
- `created_at timestamptz not null`

Constraints:

- `display_order > 0`
- `unique(match_side_id, tournament_player_id)`
- `unique(match_side_id, display_order)`
- player must belong to same tournament as the match. This needs composite foreign keys or a trigger in implementation.

Indexes:

- `match_side_players(match_side_id)`
- `match_side_players(tournament_player_id)`

### tournament_pools

Purpose: pool-play groups and later placement/cross/final groups.

Columns:

- `id uuid primary key`
- `tournament_id uuid not null references tournaments(id) on delete cascade`
- `legacy_pool_id text not null`
- `name text not null`
- `stage text not null`
- `schedule_type text null`
- `display_order integer not null`
- `matches_per_team integer null`
- `metadata jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

Constraints:

- `stage in ('initial', 'placement', 'cross', 'final')`
- `schedule_type is null or schedule_type in ('americanoRotation', 'roundRobin')`
- `matches_per_team is null or matches_per_team in (2, 3)`
- `display_order > 0`
- `unique(tournament_id, stage, legacy_pool_id)`

Indexes:

- `tournament_pools(tournament_id, stage)`

### pool_participants

Purpose: participant membership in a pool. Participants map to `tournament_players`; for pair/team participant types the participant composition can be represented by `metadata` in first migration or normalized later if pool-play becomes active development again.

Columns:

- `id uuid primary key`
- `pool_id uuid not null references tournament_pools(id) on delete cascade`
- `tournament_player_id uuid null references tournament_players(id) on delete cascade`
- `legacy_participant_id text not null`
- `display_order integer not null`
- `metadata jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null`

Constraints:

- `display_order > 0`
- `unique(pool_id, legacy_participant_id)`
- `unique(pool_id, display_order)`

Indexes:

- `pool_participants(pool_id)`

### team_vs_team_teams

Purpose: Team vs Team tournament teams.

Columns:

- `id uuid primary key`
- `tournament_id uuid not null references tournaments(id) on delete cascade`
- `legacy_team_id text not null`
- `name text not null`
- `captain_player_id uuid null`
- `display_order integer not null`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

Constraints:

- `display_order > 0`
- `unique(tournament_id, legacy_team_id)`
- `unique(tournament_id, display_order)`

Indexes:

- `team_vs_team_teams(tournament_id)`

### team_vs_team_players

Purpose: Team vs Team players scoped to a team.

Columns:

- `id uuid primary key`
- `team_id uuid not null references team_vs_team_teams(id) on delete cascade`
- `legacy_player_id text not null`
- `name text not null`
- `display_order integer not null`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

Constraints:

- `display_order > 0`
- `unique(team_id, legacy_player_id)`
- `unique(team_id, display_order)`

Indexes:

- `team_vs_team_players(team_id)`

### team_vs_team_matchups

Purpose: Team vs Team matchups/bracket/pool rows.

Columns:

- `id uuid primary key`
- `tournament_id uuid not null references tournaments(id) on delete cascade`
- `legacy_matchup_id text not null`
- `label text not null`
- `team_a_id uuid not null references team_vs_team_teams(id) on delete cascade`
- `team_b_id uuid not null references team_vs_team_teams(id) on delete cascade`
- `status text not null default 'ready'`
- `display_order integer not null`
- `metadata jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

Constraints:

- `team_a_id <> team_b_id`
- `display_order > 0`
- `unique(tournament_id, legacy_matchup_id)`

Indexes:

- `team_vs_team_matchups(tournament_id)`

### team_vs_team_lineups

Purpose: selected pairs for each Team vs Team round.

Columns:

- `id uuid primary key`
- `matchup_id uuid not null references team_vs_team_matchups(id) on delete cascade`
- `round_number integer not null`
- `match_number integer not null`
- `team_a_player_1_id uuid not null references team_vs_team_players(id)`
- `team_a_player_2_id uuid not null references team_vs_team_players(id)`
- `team_b_player_1_id uuid not null references team_vs_team_players(id)`
- `team_b_player_2_id uuid not null references team_vs_team_players(id)`
- `override_repeated_pairs boolean not null default false`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

Constraints:

- `round_number in (1, 2, 3)`
- `match_number in (1, 2)`
- `unique(matchup_id, round_number, match_number)`
- paired players must be different and belong to the correct team. Use triggers/composite constraints in implementation.

Indexes:

- `team_vs_team_lineups(matchup_id, round_number)`

### team_vs_team_round_results

Purpose: Team vs Team results per matchup round, submatch, and set.

Columns:

- `id uuid primary key`
- `matchup_id uuid not null references team_vs_team_matchups(id) on delete cascade`
- `round_number integer not null`
- `match_number integer not null`
- `set_number integer not null`
- `team_a_points integer not null`
- `team_b_points integer not null`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

Constraints:

- `round_number in (1, 2, 3)`
- `match_number in (1, 2)`
- `set_number in (1, 2, 3)`
- `team_a_points >= 0`
- `team_b_points >= 0`
- `team_a_points <> team_b_points`
- `unique(matchup_id, round_number, match_number, set_number)`

Indexes:

- `team_vs_team_round_results(matchup_id, round_number)`

### team_vs_team_tiebreaks

Purpose: Match Tie-break after tied Team vs Team rounds.

Columns:

- `id uuid primary key`
- `matchup_id uuid not null references team_vs_team_matchups(id) on delete cascade`
- `team_a_player_1_id uuid not null references team_vs_team_players(id)`
- `team_a_player_2_id uuid not null references team_vs_team_players(id)`
- `team_b_player_1_id uuid not null references team_vs_team_players(id)`
- `team_b_player_2_id uuid not null references team_vs_team_players(id)`
- `team_a_points integer not null`
- `team_b_points integer not null`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

Constraints:

- `team_a_points >= 0`
- `team_b_points >= 0`
- `unique(matchup_id)`
- implementation should enforce at least 10 points and win by 2, matching current domain logic.

Indexes:

- `team_vs_team_tiebreaks(matchup_id)`

### tournament_templates

Purpose: reusable setup templates.

Columns:

- `id uuid primary key`
- `legacy_template_id text null`
- `title text not null`
- `format text not null`
- `settings jsonb not null`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

JSONB is acceptable here because templates are configuration, not transactional match/results state.

Constraints:

- `format in ('Americano', 'Mexicano', 'Mixed Americano', 'Fast Makker Americano', 'Fast Makker Mexicano')`

Indexes:

- `tournament_templates(format)`
- `tournament_templates(updated_at desc)`

## Match Model For Locked Formats

Americano:

- Players stored in `tournament_players`
- Generated pairs stored as two `match_sides`
- Each side has two `match_side_players`
- Scores stored on `match_sides.score`

Mixed Americano:

- Same as Americano
- Gender stored on `tournament_players.gender`
- Mixed partner logic remains in app engine, not database

Mexicano:

- Same match representation as Americano
- Dynamic future rounds are generated by app logic from match results and standings
- Database stores the resulting rows; it does not decide ranking logic

Fast Makker Americano:

- Fixed pairs stored in `fixed_pairs`
- Matches still use `match_sides` and `match_side_players` so scoring UI can remain generic

Fast Makker Mexicano:

- Fixed pairs stored in `fixed_pairs`
- Mexicano ranking of pairs remains app logic
- Match rows store the generated pair-vs-pair schedule

## Source Of Truth For Standings

Match results should be the source of truth.

Do not store authoritative:

- rank
- matchPoints
- pointsFor
- pointsAgainst
- pointDifference
- wins
- draws
- losses
- pauseCount

These should be recalculated from matches/results by existing domain logic. This prevents double-counting when a score is edited.

## Format-Specific Data

Use normal columns for common fields:

- tournament status
- scoring mode
- ranking mode
- court count
- round count
- scores
- players
- match sides

Use `jsonb metadata` for format-specific non-authoritative snapshots and migration compatibility:

- pool unmatched placement groups
- knockout group metadata
- legacy labels
- future compatibility fields

Avoid format-specific tables for Americano/Mixed/Mexicano/Fast Makker because the generic `matches -> match_sides -> match_side_players` model covers them.

Team vs Team is structurally different enough to justify dedicated tables.

## LocalStorage To Database Mapping

| Current localStorage field | Database target |
| --- | --- |
| `state.tournamentName` | `tournaments.name` |
| `state.format` | `tournaments.format` |
| `state.status` | `tournaments.status` |
| `state.finishedAt` | `tournaments.finished_at` |
| `state.scoringMode` | `tournaments.scoring_mode` |
| `state.fixedScoreRule` | `tournaments.fixed_score_rule` |
| `state.fixedScorePoints` | `tournaments.fixed_score_points` |
| `state.rankingMode` | `tournaments.ranking_mode` |
| `state.courtCount` | `tournaments.court_count` |
| `state.configuredRounds` | `tournaments.configured_rounds` |
| `state.activeRoundNumber` | `tournaments.active_round_number` |
| `state.timeLimitMinutes` | `tournaments.time_limit_minutes` |
| `state.roundTimer` | `tournaments.timer_state` |
| `state.players[].id` | `tournament_players.legacy_player_id` |
| `state.players[].name` | `tournament_players.name` |
| `state.players[].gender` | `tournament_players.gender` |
| `state.rounds[].roundNumber` | `rounds.round_number` |
| `state.rounds[].byePlayerIds` | `rounds.bye_player_ids` |
| `match.id` | `matches.legacy_match_id` |
| `match.roundNumber` | `rounds.round_number` / `matches.round_id` |
| `match.courtNumber` | `matches.court_number` |
| `match.teamA.playerIds` | `match_side_players` for `side_number = 1` |
| `match.teamB.playerIds` | `match_side_players` for `side_number = 2` |
| `result.matchId` | `matches.legacy_match_id` |
| `result.teamAPoints` | `match_sides.score` where `side_number = 1` |
| `result.teamBPoints` | `match_sides.score` where `side_number = 2` |
| `result.tieBreakWinner` | `match_sides.tie_break_winner` |
| `poolPlay.phase` | `tournaments.pool_phase` |
| `poolPlay.advancementMode` | `tournaments.pool_advancement_mode` |
| `poolPlay.unmatchedResolution` | `tournaments.pool_unmatched_resolution` |
| `poolPlay.initialStage.pools[]` | `tournament_pools` |
| `poolPlay.initialStage.participants[]` | `pool_participants` plus `tournament_players` |
| `poolPlay.*Results[]` | `match_sides.score` for matches by `match_scope` |
| `TeamVsTeamTournamentState.name` | `tournaments.name` |
| `TeamVsTeamTournamentState.teams[]` | `team_vs_team_teams` |
| `TeamVsTeamTeam.players[]` | `team_vs_team_players` |
| `TeamVsTeamMatchState` | `team_vs_team_matchups` |
| `TeamVsTeamRoundLineup` | `team_vs_team_lineups` |
| `TeamVsTeamRoundResult` | `team_vs_team_round_results` |
| `TeamVsTeamTieBreak` | `team_vs_team_tiebreaks` |
| `TournamentTemplate` | `tournament_templates.settings` plus key columns |
| `TournamentSettings` | remain in `localStorage` for first backend version |

## Templates

Store templates in `tournament_templates`.

Recommended model:

- searchable fields as columns: `title`, `format`, timestamps
- configuration payload as `jsonb settings`

This keeps template migration simple and avoids over-normalizing non-result data.

## Settings

For the first backend version, keep global settings in `localStorage`.

Reason:

- no login/auth exists yet
- settings are device/user preferences, not tournament source-of-truth
- language, theme and alarm sound are naturally local until user accounts exist

Later, after auth, settings can move to a `user_settings` table.

## RLS Strategy

Design only; no policies are implemented in STEP 4.

Tables needing RLS later:

- `tournaments`
- `tournament_players`
- `fixed_pairs`
- `rounds`
- `matches`
- `match_sides`
- `match_side_players`
- `tournament_pools`
- `pool_participants`
- `team_vs_team_*`
- `tournament_templates`

Recommended first backend model:

```text
Frontend
  |
  v
Vercel API routes/server actions
  |
  v
Supabase server client
```

Writes should initially go through server-only code with `SUPABASE_SERVICE_ROLE_KEY`. Browser write access should not be granted until auth and RLS policies are designed in detail.

Read-only public/TV access can later use share tokens or dedicated read policies. Do not expose unrestricted table writes through the browser anon key.

## Realtime

The row-level model supports future TV/live updates:

- score change: update `match_sides`
- match status change: update `matches`
- round progress: update `rounds` or derive from `matches`
- tournament status/timer: update `tournaments`

This avoids broadcasting one large JSON blob for every small update.

## Migrations Plan

Do not apply these in STEP 4. This is only the recommended order.

1. `001_enable_extensions_and_helpers`: uuid helper and `updated_at` helper design
2. `002_create_tournaments`
3. `003_create_tournament_players`
4. `004_create_fixed_pairs`
5. `005_create_rounds`
6. `006_create_matches`
7. `007_create_match_sides`
8. `008_create_match_side_players`
9. `009_create_pool_tables`
10. `010_create_team_vs_team_teams_and_players`
11. `011_create_team_vs_team_matchups`
12. `012_create_team_vs_team_lineups`
13. `013_create_team_vs_team_results_and_tiebreaks`
14. `014_create_tournament_templates`
15. `015_add_indexes`
16. `016_enable_rls_without_public_policies`

SQL drafts should be created in a later step and reviewed before execution.

## Backward Compatibility

The migration should serialize the current localStorage state into rows while preserving legacy IDs in `legacy_*` columns. The tournament engine can continue to operate with its existing in-memory types while an adapter maps database rows back into `LiveTournamentState` during the transition.

The database must adapt to current app state. The current locked sports logic must not be simplified to fit the database.

## Safety

- No schema was created in Supabase.
- No migrations were applied.
- No data was moved.
- No SQL was executed.
- `localStorage` remains primary persistence.
- Locked tournament formats were not changed.
- No push was performed.

## STEP 4 Test Results

- Build: PASS
- Typecheck: PASS
- Lint: PASS
- Tests: PASS
- Test files: 30
- Tests: 341
