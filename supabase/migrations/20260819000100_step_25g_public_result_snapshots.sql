create table if not exists public.public_result_snapshots (
  id text primary key,
  tournament_id uuid not null references public.tournaments(id) on delete restrict,
  kind text not null default 'standard',
  tournament_name text not null,
  format text not null,
  completed_at timestamptz,
  participant_count integer not null default 0,
  snapshot jsonb not null,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint public_result_snapshots_id_format check (id ~ '^[A-HJ-NP-Z2-9]{12,24}$'),
  constraint public_result_snapshots_kind_check check (kind in ('standard')),
  constraint public_result_snapshots_participant_count_check check (participant_count >= 0),
  constraint public_result_snapshots_snapshot_object_check check (jsonb_typeof(snapshot) = 'object'),
  constraint public_result_snapshots_tournament_unique unique (tournament_id)
);

create index if not exists public_result_snapshots_tournament_id_idx
  on public.public_result_snapshots(tournament_id);

create index if not exists public_result_snapshots_published_at_idx
  on public.public_result_snapshots(published_at);

drop trigger if exists set_public_result_snapshots_updated_at on public.public_result_snapshots;
create trigger set_public_result_snapshots_updated_at
before update on public.public_result_snapshots
for each row
execute function public.set_updated_at();

alter table public.public_result_snapshots enable row level security;

revoke all on table public.public_result_snapshots from anon, authenticated;
grant select on table public.public_result_snapshots to anon, authenticated;

drop policy if exists "Public can read published result snapshots" on public.public_result_snapshots;
create policy "Public can read published result snapshots"
on public.public_result_snapshots
for select
to anon, authenticated
using (published_at is not null);
