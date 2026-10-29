-- STEP 40A: harden database functions flagged by the Supabase security advisor (2026-10-29).
--
-- 1. set_updated_at had a mutable search_path. It only calls now() (pg_catalog), so an empty
--    search_path is safe and stops a caller-controlled schema from shadowing it.
-- 2. lezgo_handle_new_auth_user (trigger on auth.users) and rls_auto_enable (event trigger)
--    are SECURITY DEFINER and could be called directly through /rest/v1/rpc by anon and
--    signed-in users. Triggers and event triggers do not need EXECUTE for the role that fires
--    them, so revoking it from API roles changes nothing for sign-up or table creation.
--
-- Not changed on purpose: lezgo_is_admin and lezgo_can_read_tournament stay executable by
-- authenticated users, because 13 row-level security policies call them as that role.

alter function public.set_updated_at() set search_path = '';

revoke execute on function public.lezgo_handle_new_auth_user() from public, anon, authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
