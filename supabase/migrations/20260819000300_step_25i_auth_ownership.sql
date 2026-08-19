-- STEP 25I - Account profiles, trusted roles and private tournament ownership.
-- Additive migration. Existing tournament/result rows are not deleted, reset or reassigned.

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  role text not null default 'user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint profiles_role_check check (role in ('admin', 'user')),
  constraint profiles_display_name_check check (length(trim(display_name)) > 0)
);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;

create or replace function public.lezgo_is_admin(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where user_id = p_user_id
      and role = 'admin'
  );
$$;

revoke all on function public.lezgo_is_admin(uuid) from public;
grant execute on function public.lezgo_is_admin(uuid) to authenticated, service_role;

create or replace function public.lezgo_handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  metadata_name text;
begin
  metadata_name := coalesce(
    nullif(trim(new.raw_user_meta_data->>'display_name'), ''),
    nullif(trim(new.raw_user_meta_data->>'name'), ''),
    split_part(new.email, '@', 1)
  );

  insert into public.profiles (user_id, display_name, role)
  values (new.id, metadata_name, 'user')
  on conflict (user_id) do update
  set display_name = excluded.display_name
  where public.profiles.display_name = '';

  return new;
end;
$$;

drop trigger if exists lezgo_auth_user_profile on auth.users;
create trigger lezgo_auth_user_profile
after insert on auth.users
for each row execute function public.lezgo_handle_new_auth_user();

alter table public.tournaments
  add column if not exists owner_user_id uuid null references auth.users(id) on delete set null,
  add column if not exists updated_by_user_id uuid null references auth.users(id) on delete set null,
  add column if not exists privacy text not null default 'private';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tournaments_privacy_check'
  ) then
    alter table public.tournaments
      add constraint tournaments_privacy_check check (privacy in ('private', 'public_result'));
  end if;
end $$;

create index if not exists tournaments_owner_user_id_idx on public.tournaments(owner_user_id);
create index if not exists tournaments_owner_status_idx on public.tournaments(owner_user_id, status);

alter table public.matches
  add column if not exists score_version integer not null default 1,
  add column if not exists updated_by_user_id uuid null references auth.users(id) on delete set null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'matches_score_version_check'
  ) then
    alter table public.matches
      add constraint matches_score_version_check check (score_version > 0);
  end if;
end $$;

create index if not exists matches_score_version_idx on public.matches(tournament_id, legacy_match_id, score_version);

drop policy if exists "Profiles can read own profile" on public.profiles;
create policy "Profiles can read own profile"
on public.profiles
for select
to authenticated
using (user_id = auth.uid() or public.lezgo_is_admin(auth.uid()));

drop policy if exists "Profiles can update own display name" on public.profiles;
create policy "Profiles can update own display name"
on public.profiles
for update
to authenticated
using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and role = (select role from public.profiles where user_id = auth.uid())
);

drop policy if exists "Admins can manage profiles" on public.profiles;
create policy "Admins can manage profiles"
on public.profiles
for all
to authenticated
using (public.lezgo_is_admin(auth.uid()))
with check (public.lezgo_is_admin(auth.uid()));

revoke all on table public.profiles from anon;
grant select, update on table public.profiles to authenticated;
grant all on table public.profiles to service_role;

drop policy if exists "Owners and admins read tournaments" on public.tournaments;
create policy "Owners and admins read tournaments"
on public.tournaments
for select
to authenticated
using (owner_user_id = auth.uid() or public.lezgo_is_admin(auth.uid()));

drop policy if exists "Owners and admins write tournaments" on public.tournaments;
create policy "Owners and admins write tournaments"
on public.tournaments
for all
to authenticated
using (owner_user_id = auth.uid() or public.lezgo_is_admin(auth.uid()))
with check (owner_user_id = auth.uid() or public.lezgo_is_admin(auth.uid()));

create or replace function public.lezgo_can_read_tournament(p_tournament_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tournaments
    where id = p_tournament_id
      and (owner_user_id = auth.uid() or public.lezgo_is_admin(auth.uid()))
  );
$$;

revoke all on function public.lezgo_can_read_tournament(uuid) from public;
grant execute on function public.lezgo_can_read_tournament(uuid) to authenticated, service_role;

do $$
declare
  child_table text;
begin
  foreach child_table in array array[
    'tournament_players',
    'fixed_pairs',
    'rounds',
    'tournament_pools',
    'matches',
    'team_vs_team_teams',
    'team_vs_team_matchups'
  ] loop
    execute format('drop policy if exists "Owners and admins read %s" on public.%I', child_table, child_table);
    execute format(
      'create policy "Owners and admins read %s" on public.%I for select to authenticated using (public.lezgo_can_read_tournament(tournament_id))',
      child_table,
      child_table
    );
  end loop;
end $$;

create or replace function public.lezgo_save_owned_tournament_snapshot_v1(
  p_operations jsonb,
  p_expected_updated_at timestamptz,
  p_actor_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  saved_tournament_id uuid;
  existing_owner_user_id uuid;
begin
  if p_actor_user_id is null then
    raise exception 'Authenticated owner is required.';
  end if;

  select (row_item->>'id')::uuid
    into saved_tournament_id
  from jsonb_array_elements(
    coalesce(
      (
        select operation_item->'rows'
        from jsonb_array_elements(p_operations) as operation_item
        where operation_item->>'table' = 'tournaments'
        limit 1
      ),
      '[]'::jsonb
    )
  ) as row_item
  limit 1;

  if saved_tournament_id is null then
    raise exception 'A tournament row is required.';
  end if;

  select owner_user_id
    into existing_owner_user_id
  from public.tournaments
  where id = saved_tournament_id
  for update;

  if existing_owner_user_id is not null
    and existing_owner_user_id <> p_actor_user_id
    and not public.lezgo_is_admin(p_actor_user_id) then
    raise exception 'Tournament owner authorization was denied.';
  end if;

  saved_tournament_id := public.lezgo_save_tournament_snapshot_v2(p_operations, p_expected_updated_at);

  update public.tournaments
  set owner_user_id = coalesce(existing_owner_user_id, p_actor_user_id),
      updated_by_user_id = p_actor_user_id,
      privacy = 'private'
  where id = saved_tournament_id;

  return saved_tournament_id;
end;
$$;

revoke all on function public.lezgo_save_owned_tournament_snapshot_v1(jsonb, timestamptz, uuid) from public;
revoke all on function public.lezgo_save_owned_tournament_snapshot_v1(jsonb, timestamptz, uuid) from anon;
revoke all on function public.lezgo_save_owned_tournament_snapshot_v1(jsonb, timestamptz, uuid) from authenticated;
grant execute on function public.lezgo_save_owned_tournament_snapshot_v1(jsonb, timestamptz, uuid) to service_role;
