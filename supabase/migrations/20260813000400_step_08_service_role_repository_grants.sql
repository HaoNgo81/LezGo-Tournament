-- STEP 8 - Service role grants for server-side repository reads and cleanup.
-- Grants are limited to service_role. No public, anon, or authenticated access is added.

grant select on public.tournaments to service_role;
grant select on public.tournament_players to service_role;
grant select on public.rounds to service_role;
grant select on public.matches to service_role;
grant select on public.match_sides to service_role;
grant select on public.match_side_players to service_role;

grant delete on public.tournaments to service_role;
