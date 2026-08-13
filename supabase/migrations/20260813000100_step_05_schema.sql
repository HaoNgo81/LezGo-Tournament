-- STEP 5 - LezGo Tournament schema
-- Applies the schema design from docs/DATABASE_SCHEMA.md.
-- No tournament data is inserted by this migration.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  format text not null,
  status text not null,
  scoring_mode text not null,
  fixed_score_rule text null,
  fixed_score_points integer null,
  ranking_mode text null,
  court_count integer null,
  configured_rounds integer null,
  active_round_number integer null,
  time_limit_minutes integer null,
  timer_state jsonb null,
  pool_phase text null,
  pool_advancement_mode text null,
  pool_unmatched_resolution text null,
  team_count integer null,
  players_per_team integer null,
  team_match_format text null,
  team_competition_mode text null,
  team_draw_mode text null,
  active_matchup_id uuid null,
  finished_at timestamptz null,
  legacy_local_id text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tournaments_format_check check (format in (
    'americano',
    'mexicano',
    'mixed-americano',
    'fixed-partner-americano',
    'fixed-partner-mexicano',
    'pool-play',
    'team-vs-team'
  )),
  constraint tournaments_status_check check (status in ('setup', 'active', 'finished')),
  constraint tournaments_scoring_mode_check check (scoring_mode in ('Fri scoring', 'Fast antal point', 'Spil på tid')),
  constraint tournaments_fixed_score_rule_check check (fixed_score_rule is null or fixed_score_rule in ('target', 'total')),
  constraint tournaments_ranking_mode_check check (ranking_mode is null or ranking_mode in ('matchPointsFirst', 'partiPointsFirst')),
  constraint tournaments_court_count_check check (court_count is null or court_count > 0),
  constraint tournaments_configured_rounds_check check (configured_rounds is null or configured_rounds > 0),
  constraint tournaments_active_round_number_check check (active_round_number is null or active_round_number > 0),
  constraint tournaments_time_limit_minutes_check check (time_limit_minutes is null or time_limit_minutes > 0),
  constraint tournaments_fixed_score_points_check check (fixed_score_points is null or fixed_score_points > 0),
  constraint tournaments_pool_phase_check check (pool_phase is null or pool_phase in ('initial', 'placementPools', 'crossMatches', 'finals')),
  constraint tournaments_pool_advancement_mode_check check (pool_advancement_mode is null or pool_advancement_mode in ('placementPools', 'crossMatches')),
  constraint tournaments_pool_unmatched_resolution_check check (pool_unmatched_resolution is null or pool_unmatched_resolution in ('bye', 'walkover')),
  constraint tournaments_players_per_team_check check (players_per_team is null or players_per_team in (4, 6, 8)),
  constraint tournaments_team_match_format_check check (team_match_format is null or team_match_format in ('oneSet', 'bestOfThree')),
  constraint tournaments_team_competition_mode_check check (team_competition_mode is null or team_competition_mode in ('knockout', 'pool')),
  constraint tournaments_team_draw_mode_check check (team_draw_mode is null or team_draw_mode in ('manual', 'random'))
);

create trigger tournaments_set_updated_at
before update on public.tournaments
for each row execute function public.set_updated_at();

create table public.tournament_players (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  legacy_player_id text not null,
  name text not null,
  gender text null,
  display_order integer not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tournament_players_gender_check check (gender is null or gender in ('female', 'male')),
  constraint tournament_players_display_order_check check (display_order > 0),
  constraint tournament_players_legacy_unique unique (tournament_id, legacy_player_id),
  constraint tournament_players_display_order_unique unique (tournament_id, display_order),
  constraint tournament_players_id_tournament_unique unique (id, tournament_id)
);

create trigger tournament_players_set_updated_at
before update on public.tournament_players
for each row execute function public.set_updated_at();

create unique index tournament_players_name_lower_unique
on public.tournament_players (tournament_id, lower(name));

create table public.fixed_pairs (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  legacy_team_id text null,
  player_1_id uuid not null,
  player_2_id uuid not null,
  display_order integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fixed_pairs_players_different_check check (player_1_id <> player_2_id),
  constraint fixed_pairs_display_order_check check (display_order > 0),
  constraint fixed_pairs_display_order_unique unique (tournament_id, display_order),
  constraint fixed_pairs_player_1_fk foreign key (player_1_id, tournament_id) references public.tournament_players(id, tournament_id) on delete cascade,
  constraint fixed_pairs_player_2_fk foreign key (player_2_id, tournament_id) references public.tournament_players(id, tournament_id) on delete cascade
);

create trigger fixed_pairs_set_updated_at
before update on public.fixed_pairs
for each row execute function public.set_updated_at();

create table public.rounds (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  round_number integer not null,
  status text not null default 'scheduled',
  bye_player_ids uuid[] null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rounds_round_number_check check (round_number > 0),
  constraint rounds_status_check check (status in ('scheduled', 'active', 'completed')),
  constraint rounds_round_number_unique unique (tournament_id, round_number),
  constraint rounds_id_tournament_unique unique (id, tournament_id)
);

create trigger rounds_set_updated_at
before update on public.rounds
for each row execute function public.set_updated_at();

create table public.tournament_pools (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  legacy_pool_id text not null,
  name text not null,
  stage text not null,
  schedule_type text null,
  display_order integer not null,
  matches_per_team integer null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tournament_pools_stage_check check (stage in ('initial', 'placement', 'cross', 'final')),
  constraint tournament_pools_schedule_type_check check (schedule_type is null or schedule_type in ('americanoRotation', 'roundRobin')),
  constraint tournament_pools_matches_per_team_check check (matches_per_team is null or matches_per_team in (2, 3)),
  constraint tournament_pools_display_order_check check (display_order > 0),
  constraint tournament_pools_legacy_unique unique (tournament_id, stage, legacy_pool_id),
  constraint tournament_pools_id_tournament_unique unique (id, tournament_id)
);

create trigger tournament_pools_set_updated_at
before update on public.tournament_pools
for each row execute function public.set_updated_at();

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  round_id uuid null,
  legacy_match_id text not null,
  match_scope text not null,
  pool_id uuid null,
  label text null,
  court_number integer null,
  status text not null default 'ready',
  started_at timestamptz null,
  finished_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint matches_court_number_check check (court_number is null or court_number > 0),
  constraint matches_status_check check (status in ('ready', 'running', 'completed')),
  constraint matches_scope_check check (match_scope in ('standard', 'pool_initial', 'pool_placement', 'pool_cross', 'pool_final', 'pool_tiebreak')),
  constraint matches_legacy_unique unique (tournament_id, legacy_match_id),
  constraint matches_round_fk foreign key (round_id, tournament_id) references public.rounds(id, tournament_id) on delete cascade,
  constraint matches_pool_fk foreign key (pool_id, tournament_id) references public.tournament_pools(id, tournament_id) on delete cascade,
  constraint matches_round_or_pool_check check (
    (match_scope = 'standard' and round_id is not null)
    or (match_scope <> 'standard' and pool_id is not null)
  ),
  constraint matches_id_tournament_unique unique (id, tournament_id)
);

create unique index matches_round_court_unique
on public.matches (round_id, court_number)
where court_number is not null;

create trigger matches_set_updated_at
before update on public.matches
for each row execute function public.set_updated_at();

create table public.match_sides (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  side_number integer not null,
  score integer null,
  tie_break_winner boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint match_sides_side_number_check check (side_number in (1, 2)),
  constraint match_sides_score_check check (score is null or score >= 0),
  constraint match_sides_side_unique unique (match_id, side_number)
);

create trigger match_sides_set_updated_at
before update on public.match_sides
for each row execute function public.set_updated_at();

create table public.match_side_players (
  id uuid primary key default gen_random_uuid(),
  match_side_id uuid not null references public.match_sides(id) on delete cascade,
  tournament_player_id uuid not null references public.tournament_players(id) on delete cascade,
  display_order integer not null,
  created_at timestamptz not null default now(),
  constraint match_side_players_display_order_check check (display_order > 0),
  constraint match_side_players_player_unique unique (match_side_id, tournament_player_id),
  constraint match_side_players_display_order_unique unique (match_side_id, display_order)
);

create table public.pool_participants (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references public.tournament_pools(id) on delete cascade,
  tournament_player_id uuid null references public.tournament_players(id) on delete cascade,
  legacy_participant_id text not null,
  display_order integer not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint pool_participants_display_order_check check (display_order > 0),
  constraint pool_participants_legacy_unique unique (pool_id, legacy_participant_id),
  constraint pool_participants_display_order_unique unique (pool_id, display_order)
);

create table public.team_vs_team_teams (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  legacy_team_id text not null,
  name text not null,
  captain_player_id uuid null,
  display_order integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint team_vs_team_teams_display_order_check check (display_order > 0),
  constraint team_vs_team_teams_legacy_unique unique (tournament_id, legacy_team_id),
  constraint team_vs_team_teams_display_order_unique unique (tournament_id, display_order),
  constraint team_vs_team_teams_id_tournament_unique unique (id, tournament_id)
);

create trigger team_vs_team_teams_set_updated_at
before update on public.team_vs_team_teams
for each row execute function public.set_updated_at();

create table public.team_vs_team_players (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.team_vs_team_teams(id) on delete cascade,
  legacy_player_id text not null,
  name text not null,
  display_order integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint team_vs_team_players_display_order_check check (display_order > 0),
  constraint team_vs_team_players_legacy_unique unique (team_id, legacy_player_id),
  constraint team_vs_team_players_display_order_unique unique (team_id, display_order)
);

create trigger team_vs_team_players_set_updated_at
before update on public.team_vs_team_players
for each row execute function public.set_updated_at();

alter table public.team_vs_team_teams
add constraint team_vs_team_teams_captain_fk
foreign key (captain_player_id) references public.team_vs_team_players(id) on delete set null;

create table public.team_vs_team_matchups (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  legacy_matchup_id text not null,
  label text not null,
  team_a_id uuid not null,
  team_b_id uuid not null,
  status text not null default 'ready',
  display_order integer not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint team_vs_team_matchups_teams_different_check check (team_a_id <> team_b_id),
  constraint team_vs_team_matchups_display_order_check check (display_order > 0),
  constraint team_vs_team_matchups_legacy_unique unique (tournament_id, legacy_matchup_id),
  constraint team_vs_team_matchups_status_check check (status in ('ready', 'running', 'completed')),
  constraint team_vs_team_matchups_team_a_fk foreign key (team_a_id, tournament_id) references public.team_vs_team_teams(id, tournament_id) on delete cascade,
  constraint team_vs_team_matchups_team_b_fk foreign key (team_b_id, tournament_id) references public.team_vs_team_teams(id, tournament_id) on delete cascade
);

create trigger team_vs_team_matchups_set_updated_at
before update on public.team_vs_team_matchups
for each row execute function public.set_updated_at();

alter table public.tournaments
add constraint tournaments_active_matchup_fk
foreign key (active_matchup_id) references public.team_vs_team_matchups(id) on delete set null;

create table public.team_vs_team_lineups (
  id uuid primary key default gen_random_uuid(),
  matchup_id uuid not null references public.team_vs_team_matchups(id) on delete cascade,
  round_number integer not null,
  match_number integer not null,
  team_a_player_1_id uuid not null references public.team_vs_team_players(id),
  team_a_player_2_id uuid not null references public.team_vs_team_players(id),
  team_b_player_1_id uuid not null references public.team_vs_team_players(id),
  team_b_player_2_id uuid not null references public.team_vs_team_players(id),
  override_repeated_pairs boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint team_vs_team_lineups_round_number_check check (round_number in (1, 2, 3)),
  constraint team_vs_team_lineups_match_number_check check (match_number in (1, 2)),
  constraint team_vs_team_lineups_unique unique (matchup_id, round_number, match_number),
  constraint team_vs_team_lineups_team_a_players_different_check check (team_a_player_1_id <> team_a_player_2_id),
  constraint team_vs_team_lineups_team_b_players_different_check check (team_b_player_1_id <> team_b_player_2_id)
);

create trigger team_vs_team_lineups_set_updated_at
before update on public.team_vs_team_lineups
for each row execute function public.set_updated_at();

create table public.team_vs_team_round_results (
  id uuid primary key default gen_random_uuid(),
  matchup_id uuid not null references public.team_vs_team_matchups(id) on delete cascade,
  round_number integer not null,
  match_number integer not null,
  set_number integer not null,
  team_a_points integer not null,
  team_b_points integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint team_vs_team_round_results_round_number_check check (round_number in (1, 2, 3)),
  constraint team_vs_team_round_results_match_number_check check (match_number in (1, 2)),
  constraint team_vs_team_round_results_set_number_check check (set_number in (1, 2, 3)),
  constraint team_vs_team_round_results_team_a_points_check check (team_a_points >= 0),
  constraint team_vs_team_round_results_team_b_points_check check (team_b_points >= 0),
  constraint team_vs_team_round_results_no_draw_check check (team_a_points <> team_b_points),
  constraint team_vs_team_round_results_unique unique (matchup_id, round_number, match_number, set_number)
);

create trigger team_vs_team_round_results_set_updated_at
before update on public.team_vs_team_round_results
for each row execute function public.set_updated_at();

create table public.team_vs_team_tiebreaks (
  id uuid primary key default gen_random_uuid(),
  matchup_id uuid not null references public.team_vs_team_matchups(id) on delete cascade,
  team_a_player_1_id uuid not null references public.team_vs_team_players(id),
  team_a_player_2_id uuid not null references public.team_vs_team_players(id),
  team_b_player_1_id uuid not null references public.team_vs_team_players(id),
  team_b_player_2_id uuid not null references public.team_vs_team_players(id),
  team_a_points integer not null,
  team_b_points integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint team_vs_team_tiebreaks_team_a_points_check check (team_a_points >= 0),
  constraint team_vs_team_tiebreaks_team_b_points_check check (team_b_points >= 0),
  constraint team_vs_team_tiebreaks_team_a_players_different_check check (team_a_player_1_id <> team_a_player_2_id),
  constraint team_vs_team_tiebreaks_team_b_players_different_check check (team_b_player_1_id <> team_b_player_2_id),
  constraint team_vs_team_tiebreaks_unique unique (matchup_id),
  constraint team_vs_team_tiebreaks_win_by_two_check check (
    greatest(team_a_points, team_b_points) >= 10
    and abs(team_a_points - team_b_points) >= 2
  )
);

create trigger team_vs_team_tiebreaks_set_updated_at
before update on public.team_vs_team_tiebreaks
for each row execute function public.set_updated_at();

create table public.tournament_templates (
  id uuid primary key default gen_random_uuid(),
  legacy_template_id text null,
  title text not null,
  format text not null,
  settings jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tournament_templates_format_check check (format in (
    'Americano',
    'Mexicano',
    'Mixed Americano',
    'Fast Makker Americano',
    'Fast Makker Mexicano'
  ))
);

create trigger tournament_templates_set_updated_at
before update on public.tournament_templates
for each row execute function public.set_updated_at();

create index tournaments_status_idx on public.tournaments(status);
create index tournaments_format_idx on public.tournaments(format);
create index tournaments_updated_at_idx on public.tournaments(updated_at desc);
create index tournament_players_tournament_id_idx on public.tournament_players(tournament_id);
create index fixed_pairs_tournament_id_idx on public.fixed_pairs(tournament_id);
create index rounds_tournament_round_number_idx on public.rounds(tournament_id, round_number);
create index tournament_pools_tournament_stage_idx on public.tournament_pools(tournament_id, stage);
create index matches_tournament_id_idx on public.matches(tournament_id);
create index matches_round_court_idx on public.matches(round_id, court_number);
create index matches_pool_id_idx on public.matches(pool_id);
create index matches_status_idx on public.matches(status);
create index match_sides_match_id_idx on public.match_sides(match_id);
create index match_side_players_match_side_id_idx on public.match_side_players(match_side_id);
create index match_side_players_tournament_player_id_idx on public.match_side_players(tournament_player_id);
create index pool_participants_pool_id_idx on public.pool_participants(pool_id);
create index team_vs_team_teams_tournament_id_idx on public.team_vs_team_teams(tournament_id);
create index team_vs_team_players_team_id_idx on public.team_vs_team_players(team_id);
create index team_vs_team_matchups_tournament_id_idx on public.team_vs_team_matchups(tournament_id);
create index team_vs_team_lineups_matchup_round_idx on public.team_vs_team_lineups(matchup_id, round_number);
create index team_vs_team_round_results_matchup_round_idx on public.team_vs_team_round_results(matchup_id, round_number);
create index team_vs_team_tiebreaks_matchup_id_idx on public.team_vs_team_tiebreaks(matchup_id);
create index tournament_templates_format_idx on public.tournament_templates(format);
create index tournament_templates_updated_at_idx on public.tournament_templates(updated_at desc);

alter table public.tournaments enable row level security;
alter table public.tournament_players enable row level security;
alter table public.fixed_pairs enable row level security;
alter table public.rounds enable row level security;
alter table public.tournament_pools enable row level security;
alter table public.matches enable row level security;
alter table public.match_sides enable row level security;
alter table public.match_side_players enable row level security;
alter table public.pool_participants enable row level security;
alter table public.team_vs_team_teams enable row level security;
alter table public.team_vs_team_players enable row level security;
alter table public.team_vs_team_matchups enable row level security;
alter table public.team_vs_team_lineups enable row level security;
alter table public.team_vs_team_round_results enable row level security;
alter table public.team_vs_team_tiebreaks enable row level security;
alter table public.tournament_templates enable row level security;
