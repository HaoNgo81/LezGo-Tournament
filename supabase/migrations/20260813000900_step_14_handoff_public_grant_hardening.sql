-- STEP 14 - Explicitly harden public privileges for handoff records.
-- Additive security hardening. No data is changed.

revoke all on table public.tournament_handoffs from anon;
revoke all on table public.tournament_handoffs from authenticated;

grant select, insert, update, delete on public.tournament_handoffs to service_role;
