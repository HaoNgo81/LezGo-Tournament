-- STEP 8 - Atomic standard tournament persistence RPC
-- Additive only. No existing data is modified by this migration.

create or replace function public.lezgo_save_standard_tournament_snapshot(p_operations jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  operation jsonb;
  row_data jsonb;
  saved_tournament_id uuid;
begin
  if jsonb_typeof(p_operations) <> 'array' then
    raise exception 'Persistence operations must be a JSON array.';
  end if;

  for operation in select value from jsonb_array_elements(p_operations) loop
    if operation->>'kind' <> 'insert' then
      raise exception 'Unsupported persistence operation kind: %', operation->>'kind';
    end if;

    if jsonb_typeof(operation->'rows') <> 'array' then
      raise exception 'Persistence operation rows must be a JSON array for table %.', operation->>'table';
    end if;
  end loop;

  select (row_item->>'id')::uuid
    into saved_tournament_id
  from jsonb_array_elements(
    coalesce(
      (
        select operation->'rows'
        from jsonb_array_elements(p_operations) as operation
        where operation->>'table' = 'tournaments'
        limit 1
      ),
      '[]'::jsonb
    )
  ) as row_item
  limit 1;

  if saved_tournament_id is null then
    raise exception 'A tournament row is required.';
  end if;

  for operation in select value from jsonb_array_elements(p_operations) loop
    case operation->>'table'
      when 'tournaments' then
        for row_data in select value from jsonb_array_elements(operation->'rows') loop
          if row_data->>'format' = 'team-vs-team' then
            raise exception 'Team vs Team persistence is not supported by this standard tournament RPC.';
          end if;

          insert into public.tournaments (
            id,
            name,
            format,
            status,
            scoring_mode,
            fixed_score_rule,
            fixed_score_points,
            ranking_mode,
            court_count,
            configured_rounds,
            active_round_number,
            time_limit_minutes,
            timer_state,
            pool_phase,
            pool_advancement_mode,
            pool_unmatched_resolution,
            team_count,
            players_per_team,
            team_match_format,
            team_competition_mode,
            team_draw_mode,
            active_matchup_id,
            finished_at,
            legacy_local_id,
            metadata
          ) values (
            (row_data->>'id')::uuid,
            row_data->>'name',
            row_data->>'format',
            row_data->>'status',
            row_data->>'scoring_mode',
            nullif(row_data->>'fixed_score_rule', ''),
            (row_data->>'fixed_score_points')::integer,
            nullif(row_data->>'ranking_mode', ''),
            (row_data->>'court_count')::integer,
            (row_data->>'configured_rounds')::integer,
            (row_data->>'active_round_number')::integer,
            (row_data->>'time_limit_minutes')::integer,
            row_data->'timer_state',
            nullif(row_data->>'pool_phase', ''),
            nullif(row_data->>'pool_advancement_mode', ''),
            nullif(row_data->>'pool_unmatched_resolution', ''),
            (row_data->>'team_count')::integer,
            (row_data->>'players_per_team')::integer,
            nullif(row_data->>'team_match_format', ''),
            nullif(row_data->>'team_competition_mode', ''),
            nullif(row_data->>'team_draw_mode', ''),
            (row_data->>'active_matchup_id')::uuid,
            (row_data->>'finished_at')::timestamptz,
            nullif(row_data->>'legacy_local_id', ''),
            coalesce(row_data->'metadata', '{}'::jsonb)
          );
        end loop;

      when 'tournament_players' then
        for row_data in select value from jsonb_array_elements(operation->'rows') loop
          insert into public.tournament_players (
            id,
            tournament_id,
            legacy_player_id,
            name,
            gender,
            display_order,
            metadata
          ) values (
            (row_data->>'id')::uuid,
            (row_data->>'tournament_id')::uuid,
            row_data->>'legacy_player_id',
            row_data->>'name',
            nullif(row_data->>'gender', ''),
            (row_data->>'display_order')::integer,
            coalesce(row_data->'metadata', '{}'::jsonb)
          );
        end loop;

      when 'fixed_pairs' then
        for row_data in select value from jsonb_array_elements(operation->'rows') loop
          insert into public.fixed_pairs (
            id,
            tournament_id,
            legacy_team_id,
            player_1_id,
            player_2_id,
            display_order
          ) values (
            (row_data->>'id')::uuid,
            (row_data->>'tournament_id')::uuid,
            nullif(row_data->>'legacy_team_id', ''),
            (row_data->>'player_1_id')::uuid,
            (row_data->>'player_2_id')::uuid,
            (row_data->>'display_order')::integer
          );
        end loop;

      when 'rounds' then
        for row_data in select value from jsonb_array_elements(operation->'rows') loop
          insert into public.rounds (
            id,
            tournament_id,
            round_number,
            status,
            bye_player_ids,
            metadata
          ) values (
            (row_data->>'id')::uuid,
            (row_data->>'tournament_id')::uuid,
            (row_data->>'round_number')::integer,
            row_data->>'status',
            coalesce(
              array(select jsonb_array_elements_text(coalesce(row_data->'bye_player_ids', '[]'::jsonb))::uuid),
              array[]::uuid[]
            ),
            coalesce(row_data->'metadata', '{}'::jsonb)
          );
        end loop;

      when 'tournament_pools' then
        for row_data in select value from jsonb_array_elements(operation->'rows') loop
          insert into public.tournament_pools (
            id,
            tournament_id,
            legacy_pool_id,
            name,
            stage,
            schedule_type,
            display_order,
            matches_per_team,
            metadata
          ) values (
            (row_data->>'id')::uuid,
            (row_data->>'tournament_id')::uuid,
            row_data->>'legacy_pool_id',
            row_data->>'name',
            row_data->>'stage',
            nullif(row_data->>'schedule_type', ''),
            (row_data->>'display_order')::integer,
            (row_data->>'matches_per_team')::integer,
            coalesce(row_data->'metadata', '{}'::jsonb)
          );
        end loop;

      when 'pool_participants' then
        for row_data in select value from jsonb_array_elements(operation->'rows') loop
          insert into public.pool_participants (
            pool_id,
            tournament_player_id,
            legacy_participant_id,
            display_order,
            metadata
          ) values (
            (row_data->>'pool_id')::uuid,
            (row_data->>'tournament_player_id')::uuid,
            row_data->>'legacy_participant_id',
            (row_data->>'display_order')::integer,
            coalesce(row_data->'metadata', '{}'::jsonb)
          );
        end loop;

      when 'matches' then
        for row_data in select value from jsonb_array_elements(operation->'rows') loop
          insert into public.matches (
            id,
            tournament_id,
            round_id,
            pool_id,
            legacy_match_id,
            match_scope,
            label,
            court_number,
            status,
            metadata
          ) values (
            (row_data->>'id')::uuid,
            (row_data->>'tournament_id')::uuid,
            (row_data->>'round_id')::uuid,
            (row_data->>'pool_id')::uuid,
            row_data->>'legacy_match_id',
            row_data->>'match_scope',
            nullif(row_data->>'label', ''),
            (row_data->>'court_number')::integer,
            row_data->>'status',
            coalesce(row_data->'metadata', '{}'::jsonb)
          );
        end loop;

      when 'match_sides' then
        for row_data in select value from jsonb_array_elements(operation->'rows') loop
          insert into public.match_sides (
            id,
            match_id,
            side_number,
            score,
            tie_break_winner,
            metadata
          ) values (
            (row_data->>'id')::uuid,
            (row_data->>'match_id')::uuid,
            (row_data->>'side_number')::integer,
            (row_data->>'score')::integer,
            coalesce((row_data->>'tie_break_winner')::boolean, false),
            coalesce(row_data->'metadata', '{}'::jsonb)
          );
        end loop;

      when 'match_side_players' then
        for row_data in select value from jsonb_array_elements(operation->'rows') loop
          insert into public.match_side_players (
            match_side_id,
            tournament_player_id,
            display_order
          ) values (
            (row_data->>'match_side_id')::uuid,
            (row_data->>'tournament_player_id')::uuid,
            (row_data->>'display_order')::integer
          );
        end loop;

      else
        raise exception 'Unsupported persistence table: %', operation->>'table';
    end case;
  end loop;

  return saved_tournament_id;
end;
$$;

revoke all on function public.lezgo_save_standard_tournament_snapshot(jsonb) from public;
revoke all on function public.lezgo_save_standard_tournament_snapshot(jsonb) from anon;
revoke all on function public.lezgo_save_standard_tournament_snapshot(jsonb) from authenticated;
grant execute on function public.lezgo_save_standard_tournament_snapshot(jsonb) to service_role;
