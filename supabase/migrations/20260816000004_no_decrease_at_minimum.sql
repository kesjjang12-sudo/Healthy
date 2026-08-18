-- 이미 가장 가벼운 칸이면 "내려볼까요?"를 띄우지 않는다.
--
-- 원터치 피드백이 붙고 나서 처음으로 decrease 경로가 실제로 도는데, 최소
-- 무게(한 칸)에서 힘들다고 답하면 "한 칸 가볍게 → 그대로 5kg" 같은 무의미한
-- 제안이 나왔다. 내려갈 곳이 없으면 제안 자체를 안 하는 게 맞다 — 그 경우
-- 필요한 건 무게 조정이 아니라 다른 운동이고, 그건 트레이너 검수 영역이다.
--
-- 서버의 현재 정의(pg_get_functiondef, 2026-08-16 확인) 위에 얹었다. 저장소의
-- 20260813000004 파일과 달리 서버는 v_step 을 기구별 값(e.weight_step_kg)에서
-- 먼저 읽는다 — 그 개선을 그대로 유지한다.

create or replace function public.weight_suggestion(p_user_id uuid, p_equip_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
    v_step        integer;
    v_current     integer;
    v_recent      record;
    v_easy_count  integer;
begin
    select coalesce(e.weight_step_kg, cat.weight_step_kg) into v_step
    from public.equipments e
    join public.exercise_catalog cat on cat.id = e.catalog_id
    where e.id = p_equip_id;

    if v_step is null then
        return null;
    end if;

    select l.weight_kg into v_current
    from public.user_equipment_levels l
    where l.user_id = p_user_id and l.equip_id = p_equip_id;

    if v_current is null then
        select d.target_weight into v_current
        from public.daily_routines d
        where d.user_id = p_user_id and d.equip_id = p_equip_id and d.target_weight is not null
        order by d.routine_date desc
        limit 1;
    end if;

    if v_current is null then
        return null;
    end if;

    select d.actual_reps, d.target_reps, d.actual_weight_kg, d.target_weight
    into v_recent
    from public.daily_routines d
    where d.user_id = p_user_id
      and d.equip_id = p_equip_id
      and d.is_completed
      and d.actual_reps is not null
      and d.target_reps is not null
    order by d.completed_at desc nulls last
    limit 1;

    if not found then
        return null;
    end if;

    if v_recent.actual_reps < ceil(v_recent.target_reps * 0.7) then
        -- 이미 최소 무게면 내릴 곳이 없다. "가볍게 → 그대로"는 제안이 아니다.
        if v_current <= v_step then
            return null;
        end if;
        return jsonb_build_object(
            'action', 'decrease',
            'current_kg', v_current,
            'suggested_kg', greatest(v_step, v_current - v_step),
            'reason', format('지난번에 목표 %s회 중 %s회를 하셨어요. 무게가 조금 버거우신 것 같습니다.',
                             v_recent.target_reps, v_recent.actual_reps)
        );
    end if;

    select count(*) into v_easy_count
    from (
        select d.actual_reps, d.target_reps
        from public.daily_routines d
        where d.user_id = p_user_id
          and d.equip_id = p_equip_id
          and d.is_completed
          and d.actual_reps is not null
          and d.target_reps is not null
        order by d.completed_at desc nulls last
        limit 2
    ) s
    where s.actual_reps >= s.target_reps;

    if v_easy_count >= 2 then
        return jsonb_build_object(
            'action', 'increase',
            'current_kg', v_current,
            'suggested_kg', v_current + v_step,
            'reason', format('최근 두 번 모두 목표 %s회를 다 채우셨어요.', v_recent.target_reps)
        );
    end if;

    return null;
end;
$function$;
