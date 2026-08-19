-- STEP 25I-B2 - Owner match score write with match-scoped optimistic concurrency.
-- Additive migration. No existing tournament data is deleted or rewritten.

create or replace function public.lezgo_save_owned_match_score_v1(
  p_tournament_id uuid,
  p_legacy_match_id text,
  p_team_a_points integer,
  p_team_b_points integer,
  p_expected_score_version integer,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  tournament_row public.tournaments%rowtype;
  saved_match_id uuid;
  next_score_version integer;
  latest_score_version integer;
  runtime_state jsonb;
  current_results jsonb;
  merged_results jsonb;
  next_runtime_state jsonb;
begin
  if p_actor_user_id is null then
    raise exception 'Authenticated owner is required.';
  end if;

  if p_legacy_match_id is null or length(trim(p_legacy_match_id)) = 0 then
    raise exception 'Match ID is required.';
  end if;

  if p_team_a_points is null or p_team_a_points < 0 or p_team_b_points is null or p_team_b_points < 0 then
    raise exception 'Scores must be non-negative integers.';
  end if;

  if p_expected_score_version is null or p_expected_score_version < 1 then
    raise exception 'Expected score version is required.';
  end if;

  select *
    into tournament_row
  from public.tournaments
  where id = p_tournament_id;

  if not found then
    raise exception 'Tournament was not found.';
  end if;

  if tournament_row.owner_user_id is null
    or (tournament_row.owner_user_id <> p_actor_user_id and not public.lezgo_is_admin(p_actor_user_id)) then
    raise exception 'Tournament owner authorization was denied.';
  end if;

  update public.matches
  set status = 'completed',
      score_version = score_version + 1,
      updated_by_user_id = p_actor_user_id
  where tournament_id = p_tournament_id
    and legacy_match_id = p_legacy_match_id
    and score_version = p_expected_score_version
  returning id, score_version
    into saved_match_id, next_score_version;

  if saved_match_id is null then
    select score_version
      into latest_score_version
    from public.matches
    where tournament_id = p_tournament_id
      and legacy_match_id = p_legacy_match_id;

    if latest_score_version is null then
      raise exception 'Match was not found.';
    end if;

    return jsonb_build_object(
      'ok', false,
      'conflict', true,
      'latestScoreVersion', latest_score_version
    );
  end if;

  update public.match_sides
  set score = case
        when side_number = 1 then p_team_a_points
        when side_number = 2 then p_team_b_points
        else score
      end,
      tie_break_winner = false
  where match_id = saved_match_id
    and side_number in (1, 2);

  select *
    into tournament_row
  from public.tournaments
  where id = p_tournament_id
  for update;

  runtime_state := tournament_row.metadata->'runtimeState';

  if jsonb_typeof(runtime_state) = 'object' then
    current_results := coalesce(runtime_state->'results', '[]'::jsonb);

    select coalesce(jsonb_agg(result_item), '[]'::jsonb)
      into merged_results
    from jsonb_array_elements(current_results) as result_item
    where result_item->>'matchId' <> p_legacy_match_id;

    merged_results := merged_results || jsonb_build_array(jsonb_build_object(
      'matchId', p_legacy_match_id,
      'teamAPoints', p_team_a_points,
      'teamBPoints', p_team_b_points
    ));

    next_runtime_state := jsonb_set(runtime_state, '{results}', merged_results, true);

    if jsonb_typeof(next_runtime_state->'startedMatchIds') = 'array' then
      next_runtime_state := jsonb_set(
        next_runtime_state,
        '{startedMatchIds}',
        (
          select coalesce(jsonb_agg(started_match_id), '[]'::jsonb)
          from jsonb_array_elements_text(next_runtime_state->'startedMatchIds') as started_match_id
          where started_match_id <> p_legacy_match_id
        ),
        true
      );
    end if;

    update public.tournaments
    set metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), '{runtimeState}', next_runtime_state, true),
        updated_by_user_id = p_actor_user_id
    where id = p_tournament_id
    returning *
      into tournament_row;
  else
    update public.tournaments
    set updated_by_user_id = p_actor_user_id,
        metadata = metadata
    where id = p_tournament_id
    returning *
      into tournament_row;
  end if;

  return jsonb_build_object(
    'ok', true,
    'scoreVersion', next_score_version,
    'updatedAt', tournament_row.updated_at
  );
end;
$$;

revoke all on function public.lezgo_save_owned_match_score_v1(uuid, text, integer, integer, integer, uuid) from public;
revoke all on function public.lezgo_save_owned_match_score_v1(uuid, text, integer, integer, integer, uuid) from anon;
revoke all on function public.lezgo_save_owned_match_score_v1(uuid, text, integer, integer, integer, uuid) from authenticated;
grant execute on function public.lezgo_save_owned_match_score_v1(uuid, text, integer, integer, integer, uuid) to service_role;
