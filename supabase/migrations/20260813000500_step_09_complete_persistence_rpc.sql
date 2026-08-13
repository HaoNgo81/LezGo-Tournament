-- STEP 9 - Complete persistence engine RPC v2.
-- Additive function. No existing data is changed by applying this migration.

create or replace function public.lezgo_save_tournament_snapshot_v2(
  p_operations jsonb,
  p_expected_updated_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  operation_data jsonb;
  row_data jsonb;
  saved_tournament_id uuid;
  existing_updated_at timestamptz;
begin
  if jsonb_typeof(p_operations) <> 'array' then
    raise exception 'Persistence operations must be a JSON array.';
  end if;

  select (row_item->>'id')::uuid
    into saved_tournament_id
  from jsonb_array_elements(
    coalesce(
      (
        select operation_item->'rows'
        from jsonb_array_elements(p_operations) as operation_item
        where operation_item->>'table' = 'tournaments'
        limit 1
      ),
      '[]'::jsonb
    )
  ) as row_item
  limit 1;

  if saved_tournament_id is null then
    raise exception 'A tournament row is required.';
  end if;

  for operation_data in select value from jsonb_array_elements(p_operations) loop
    if operation_data->>'kind' not in ('insert', 'update') then
      raise exception 'Unsupported persistence operation kind: %', operation_data->>'kind';
    end if;
  end loop;

  select updated_at into existing_updated_at
  from public.tournaments
  where id = saved_tournament_id
  for update;

  if existing_updated_at is not null and p_expected_updated_at is not null and existing_updated_at <> p_expected_updated_at then
    raise exception 'Tournament snapshot conflict for %. Expected updated_at %, found %.', saved_tournament_id, p_expected_updated_at, existing_updated_at;
  end if;

  if existing_updated_at is not null then
    delete from public.tournaments where id = saved_tournament_id;
  end if;

  for operation_data in select value from jsonb_array_elements(p_operations) loop
    if operation_data->>'kind' = 'update' then
      continue;
    end if;

    if jsonb_typeof(operation_data->'rows') <> 'array' then
      raise exception 'Persistence operation rows must be a JSON array for table %.', operation_data->>'table';
    end if;

    case operation_data->>'table'
      when 'tournaments' then
        for row_data in select value from jsonb_array_elements(operation_data->'rows') loop
          row_data := row_data || jsonb_build_object('created_at', now(), 'updated_at', now());
          insert into public.tournaments select * from jsonb_populate_record(null::public.tournaments, row_data);
        end loop;
      when 'tournament_players' then
        for row_data in select value from jsonb_array_elements(operation_data->'rows') loop
          row_data := row_data || jsonb_build_object('created_at', now(), 'updated_at', now());
          insert into public.tournament_players select * from jsonb_populate_record(null::public.tournament_players, row_data);
        end loop;
      when 'fixed_pairs' then
        for row_data in select value from jsonb_array_elements(operation_data->'rows') loop
          row_data := row_data || jsonb_build_object('created_at', now(), 'updated_at', now());
          insert into public.fixed_pairs select * from jsonb_populate_record(null::public.fixed_pairs, row_data);
        end loop;
      when 'rounds' then
        for row_data in select value from jsonb_array_elements(operation_data->'rows') loop
          row_data := row_data || jsonb_build_object('created_at', now(), 'updated_at', now());
          insert into public.rounds select * from jsonb_populate_record(null::public.rounds, row_data);
        end loop;
      when 'tournament_pools' then
        for row_data in select value from jsonb_array_elements(operation_data->'rows') loop
          row_data := row_data || jsonb_build_object('created_at', now(), 'updated_at', now());
          insert into public.tournament_pools select * from jsonb_populate_record(null::public.tournament_pools, row_data);
        end loop;
      when 'pool_participants' then
        for row_data in select value from jsonb_array_elements(operation_data->'rows') loop
          row_data := row_data || jsonb_build_object('created_at', now());
          insert into public.pool_participants select * from jsonb_populate_record(null::public.pool_participants, row_data);
        end loop;
      when 'matches' then
        for row_data in select value from jsonb_array_elements(operation_data->'rows') loop
          row_data := row_data || jsonb_build_object('created_at', now(), 'updated_at', now());
          insert into public.matches select * from jsonb_populate_record(null::public.matches, row_data);
        end loop;
      when 'match_sides' then
        for row_data in select value from jsonb_array_elements(operation_data->'rows') loop
          row_data := row_data || jsonb_build_object('created_at', now(), 'updated_at', now());
          insert into public.match_sides select * from jsonb_populate_record(null::public.match_sides, row_data);
        end loop;
      when 'match_side_players' then
        for row_data in select value from jsonb_array_elements(operation_data->'rows') loop
          row_data := row_data || jsonb_build_object('created_at', now());
          insert into public.match_side_players select * from jsonb_populate_record(null::public.match_side_players, row_data);
        end loop;
      when 'team_vs_team_teams' then
        for row_data in select value from jsonb_array_elements(operation_data->'rows') loop
          row_data := row_data || jsonb_build_object('created_at', now(), 'updated_at', now());
          insert into public.team_vs_team_teams select * from jsonb_populate_record(null::public.team_vs_team_teams, row_data);
        end loop;
      when 'team_vs_team_players' then
        for row_data in select value from jsonb_array_elements(operation_data->'rows') loop
          row_data := row_data || jsonb_build_object('created_at', now(), 'updated_at', now());
          insert into public.team_vs_team_players select * from jsonb_populate_record(null::public.team_vs_team_players, row_data);
        end loop;
      when 'team_vs_team_matchups' then
        for row_data in select value from jsonb_array_elements(operation_data->'rows') loop
          row_data := row_data || jsonb_build_object('created_at', now(), 'updated_at', now());
          insert into public.team_vs_team_matchups select * from jsonb_populate_record(null::public.team_vs_team_matchups, row_data);
        end loop;
      when 'team_vs_team_lineups' then
        for row_data in select value from jsonb_array_elements(operation_data->'rows') loop
          row_data := row_data || jsonb_build_object('created_at', now(), 'updated_at', now());
          insert into public.team_vs_team_lineups select * from jsonb_populate_record(null::public.team_vs_team_lineups, row_data);
        end loop;
      when 'team_vs_team_round_results' then
        for row_data in select value from jsonb_array_elements(operation_data->'rows') loop
          row_data := row_data || jsonb_build_object('created_at', now(), 'updated_at', now());
          insert into public.team_vs_team_round_results select * from jsonb_populate_record(null::public.team_vs_team_round_results, row_data);
        end loop;
      when 'team_vs_team_tiebreaks' then
        for row_data in select value from jsonb_array_elements(operation_data->'rows') loop
          row_data := row_data || jsonb_build_object('created_at', now(), 'updated_at', now());
          insert into public.team_vs_team_tiebreaks select * from jsonb_populate_record(null::public.team_vs_team_tiebreaks, row_data);
        end loop;
      else
        raise exception 'Unsupported persistence table: %', operation_data->>'table';
    end case;
  end loop;

  for operation_data in select value from jsonb_array_elements(p_operations) loop
    if operation_data->>'kind' <> 'update' then
      continue;
    end if;

    if operation_data->>'table' = 'team_vs_team_teams' then
      update public.team_vs_team_teams
      set captain_player_id = (operation_data->'values'->>'captain_player_id')::uuid
      where id = (operation_data->'match'->>'id')::uuid;
    elsif operation_data->>'table' = 'tournaments' then
      update public.tournaments
      set active_matchup_id = (operation_data->'values'->>'active_matchup_id')::uuid
      where id = (operation_data->'match'->>'id')::uuid;
    else
      raise exception 'Unsupported update table: %', operation_data->>'table';
    end if;
  end loop;

  return saved_tournament_id;
end;
$$;

revoke all on function public.lezgo_save_tournament_snapshot_v2(jsonb, timestamptz) from public;
revoke all on function public.lezgo_save_tournament_snapshot_v2(jsonb, timestamptz) from anon;
revoke all on function public.lezgo_save_tournament_snapshot_v2(jsonb, timestamptz) from authenticated;
grant execute on function public.lezgo_save_tournament_snapshot_v2(jsonb, timestamptz) to service_role;
