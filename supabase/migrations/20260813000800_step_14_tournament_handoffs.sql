-- STEP 14 - Secure short-lived QR/device handoff references.
-- Additive only. Existing tournament data and access rows are not changed.

create table if not exists public.tournament_handoffs (
  id uuid primary key default gen_random_uuid(),
  tournament_access_id uuid not null references public.tournament_access(id) on delete cascade,
  handoff_token_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  first_used_at timestamptz null,
  last_used_at timestamptz null,
  use_count integer not null default 0,
  revoked_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  constraint tournament_handoffs_token_hash_check check (handoff_token_hash ~ '^[a-f0-9]{64}$'),
  constraint tournament_handoffs_expires_after_created check (expires_at > created_at),
  constraint tournament_handoffs_use_count_check check (use_count >= 0),
  constraint tournament_handoffs_token_hash_unique unique (handoff_token_hash)
);

create trigger tournament_handoffs_set_updated_at
before update on public.tournament_handoffs
for each row execute function public.set_updated_at();

create index if not exists tournament_handoffs_access_id_idx on public.tournament_handoffs(tournament_access_id);
create index if not exists tournament_handoffs_token_hash_idx on public.tournament_handoffs(handoff_token_hash);
create index if not exists tournament_handoffs_expires_at_idx on public.tournament_handoffs(expires_at);

alter table public.tournament_handoffs enable row level security;

grant select, insert, update, delete on public.tournament_handoffs to service_role;
