-- STEP 25N-FIX1 - Narrow server-only admin return-control RPC.
-- The function only returns controller metadata to the authoritative owner.
-- It does not reassign creators, alter owners, delete data, or change tournament
-- scoring/runtime state.

create or replace function public.lezgo_admin_return_tournament_control_v1(
  p_tournament_id uuid,
  p_admin_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  tournament_row public.tournaments%rowtype;
begin
  if p_tournament_id is null then
    raise exception 'Tournament id is required.';
  end if;

  if p_admin_user_id is null or not public.lezgo_is_admin(p_admin_user_id) then
    raise exception 'Admin access was denied.';
  end if;

  select *
    into tournament_row
  from public.tournaments
  where id = p_tournament_id
  for update;

  if not found then
    raise exception 'Tournament was not found.';
  end if;

  if tournament_row.owner_user_id is null then
    raise exception 'Tournament control cannot be returned.';
  end if;

  if tournament_row.owner_user_id = p_admin_user_id then
    raise exception 'Tournament control cannot be returned.';
  end if;

  if tournament_row.controller_user_id is distinct from p_admin_user_id then
    raise exception 'Tournament control cannot be returned.';
  end if;

  update public.tournaments
  set controller_user_id = tournament_row.owner_user_id,
      updated_by_user_id = p_admin_user_id
  where id = p_tournament_id
    and owner_user_id = tournament_row.owner_user_id
    and controller_user_id = p_admin_user_id
  returning *
    into tournament_row;

  if not found then
    raise exception 'Tournament control cannot be returned.';
  end if;

  return jsonb_build_object(
    'id', tournament_row.id,
    'name', tournament_row.name,
    'format', tournament_row.format,
    'status', tournament_row.status,
    'active_round_number', tournament_row.active_round_number,
    'court_count', tournament_row.court_count,
    'configured_rounds', tournament_row.configured_rounds,
    'created_at', tournament_row.created_at,
    'updated_at', tournament_row.updated_at,
    'owner_user_id', tournament_row.owner_user_id,
    'created_by_user_id', tournament_row.created_by_user_id,
    'controller_user_id', tournament_row.controller_user_id
  );
end;
$$;

revoke all on function public.lezgo_admin_return_tournament_control_v1(uuid, uuid) from public;
revoke all on function public.lezgo_admin_return_tournament_control_v1(uuid, uuid) from anon;
revoke all on function public.lezgo_admin_return_tournament_control_v1(uuid, uuid) from authenticated;
grant execute on function public.lezgo_admin_return_tournament_control_v1(uuid, uuid) to service_role;
