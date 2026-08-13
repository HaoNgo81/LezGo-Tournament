-- STEP 12 - Secure tournament access foundation.
-- Additive only. Existing tournament rows are not changed.

create table if not exists public.tournament_access (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  tournament_code text not null,
  share_token_hash text not null,
  token_version integer not null default 1,
  revoked_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint tournament_access_code_check check (tournament_code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  constraint tournament_access_token_hash_check check (length(share_token_hash) >= 64),
  constraint tournament_access_token_version_check check (token_version > 0),
  constraint tournament_access_tournament_unique unique (tournament_id),
  constraint tournament_access_code_unique unique (tournament_code)
);

create trigger tournament_access_set_updated_at
before update on public.tournament_access
for each row execute function public.set_updated_at();

create index if not exists tournament_access_tournament_id_idx on public.tournament_access(tournament_id);
create index if not exists tournament_access_code_idx on public.tournament_access(tournament_code);

alter table public.tournament_access enable row level security;

grant select, insert, update, delete on public.tournament_access to service_role;
