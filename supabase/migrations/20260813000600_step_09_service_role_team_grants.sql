-- STEP 9 - Service role grants for complete persistence repository reads.
-- Grants are limited to service_role.

grant select on public.team_vs_team_teams to service_role;
grant select on public.team_vs_team_players to service_role;
grant select on public.team_vs_team_matchups to service_role;
grant select on public.team_vs_team_lineups to service_role;
grant select on public.team_vs_team_round_results to service_role;
grant select on public.team_vs_team_tiebreaks to service_role;
