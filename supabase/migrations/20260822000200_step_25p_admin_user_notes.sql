-- STEP 25P - Admin-only internal user notes.
-- Notes are intentionally stored outside public.profiles so normal users never
-- receive them through existing account/profile reads.

create table if not exists public.admin_user_notes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  note text not null default '',
  updated_by_user_id uuid null references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint admin_user_notes_note_length_check check (char_length(note) <= 1000)
);

drop trigger if exists admin_user_notes_set_updated_at on public.admin_user_notes;
create trigger admin_user_notes_set_updated_at
before update on public.admin_user_notes
for each row execute function public.set_updated_at();

alter table public.admin_user_notes enable row level security;

drop policy if exists "Admins can read user notes" on public.admin_user_notes;
create policy "Admins can read user notes"
on public.admin_user_notes
for select
to authenticated
using (public.lezgo_is_admin(auth.uid()));

drop policy if exists "Admins can write user notes" on public.admin_user_notes;
create policy "Admins can write user notes"
on public.admin_user_notes
for all
to authenticated
using (public.lezgo_is_admin(auth.uid()))
with check (public.lezgo_is_admin(auth.uid()));

revoke all on table public.admin_user_notes from anon;
grant select, insert, update, delete on table public.admin_user_notes to authenticated;
grant all on table public.admin_user_notes to service_role;
