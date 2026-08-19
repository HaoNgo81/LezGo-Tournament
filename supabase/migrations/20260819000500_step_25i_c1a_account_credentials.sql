-- STEP 25I-C1-A - Account username/email credential foundation.
-- Additive migration. Existing profiles and tournament ownership data are preserved.

alter table public.profiles
  add column if not exists username text null,
  add column if not exists username_normalized text null,
  add column if not exists email text null,
  add column if not exists email_normalized text null;

update public.profiles profile
set email = auth_user.email,
    email_normalized = lower(auth_user.email)
from auth.users auth_user
where profile.user_id = auth_user.id
  and profile.email is null;

update public.profiles
set username_normalized = lower(username)
where username is not null
  and username_normalized is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_username_format_check'
  ) then
    alter table public.profiles
      add constraint profiles_username_format_check
      check (
        username is null
        or (
          username = lower(username)
          and username ~ '^[a-z0-9_]{3,30}$'
          and username_normalized = username
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_email_normalized_check'
  ) then
    alter table public.profiles
      add constraint profiles_email_normalized_check
      check (
        email is null
        or (
          email = lower(email)
          and email_normalized = email
        )
      );
  end if;
end $$;

create unique index if not exists profiles_username_normalized_unique_idx
  on public.profiles(username_normalized)
  where username_normalized is not null;

create unique index if not exists profiles_email_normalized_unique_idx
  on public.profiles(email_normalized)
  where email_normalized is not null;

create or replace function public.lezgo_handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  metadata_name text;
  metadata_username text;
begin
  metadata_name := coalesce(
    nullif(trim(new.raw_user_meta_data->>'display_name'), ''),
    nullif(trim(new.raw_user_meta_data->>'name'), ''),
    split_part(new.email, '@', 1)
  );

  metadata_username := lower(nullif(trim(new.raw_user_meta_data->>'username'), ''));

  insert into public.profiles (
    user_id,
    display_name,
    role,
    username,
    username_normalized,
    email,
    email_normalized
  )
  values (
    new.id,
    metadata_name,
    'user',
    case when metadata_username ~ '^[a-z0-9_]{3,30}$' then metadata_username else null end,
    case when metadata_username ~ '^[a-z0-9_]{3,30}$' then metadata_username else null end,
    lower(new.email),
    lower(new.email)
  )
  on conflict (user_id) do update
  set display_name = case
        when public.profiles.display_name = '' then excluded.display_name
        else public.profiles.display_name
      end,
      email = excluded.email,
      email_normalized = excluded.email_normalized,
      username = coalesce(public.profiles.username, excluded.username),
      username_normalized = coalesce(public.profiles.username_normalized, excluded.username_normalized);

  return new;
end;
$$;

revoke all on table public.profiles from anon;
revoke update on table public.profiles from authenticated;
grant select on table public.profiles to authenticated;
grant update(display_name, metadata) on table public.profiles to authenticated;
grant all on table public.profiles to service_role;
