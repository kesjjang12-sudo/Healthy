-- 유산소를 "처방 시간"이 아니라 "실제로 한 시간"으로 기록한다.
--
-- 15분을 처방받고 25분을 걸었는데 기록에는 15분만 남으면, 분석 탭의 숫자가
-- 실제로 한 것보다 늘 적게 나온다. 유산소는 근력과 달리 "정해진 만큼"이 아니라
-- "그날 몸 되는 만큼" 하는 것이라 이 차이가 크다.
--
-- ⚠️ 이 파일은 2026-08-14 병합 때 다시 쓴 것이다. 원본은 도감 분리(exercise_catalog)
--    이전에 작성돼서 equipments.name / equipments.description / equipments.target_muscle
--    을 읽었는데, 그 컬럼들은 지금 존재하지 않는다. 그대로 적용했으면 루틴 조회가
--    통째로 깨졌다. 그래서 서버의 현재 정의(pg_get_functiondef)를 출발점으로 삼고
--    유산소 실측에 필요한 것만 얹었다.
--
--    CLAUDE.md 의 "같은 함수를 두 갈래가 각자 고치면 조용히 기능이 사라진다"가
--    바로 이 경우다. 다음에 이 함수들을 고칠 사람도 서버 정의부터 읽을 것.


-- ─────────────────────────────────────────────────────────────
-- 1. 실제 수행 시간을 담을 자리
-- ─────────────────────────────────────────────────────────────

alter table public.daily_routines
    add column if not exists actual_duration_minutes integer;

comment on column public.daily_routines.actual_duration_minutes is
    '유산소를 실제로 수행한 시간(분). 근력 운동이거나 아직 안 받았으면 null.';


-- ─────────────────────────────────────────────────────────────
-- 2. 완료 기록에 실제 시간을 받는다
--
-- 서버가 범위를 다시 확인한다. 화면에서 막아도 값은 클라이언트에서 오고,
-- 240분(4시간)을 넘는 유산소는 오타로 보는 편이 안전하다.
-- ─────────────────────────────────────────────────────────────

create or replace function public.complete_routine(
    p_routine_id              uuid,
    p_actual_weight_kg        numeric default null,
    p_actual_reps             integer default null,
    p_actual_duration_minutes integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_routine       public.daily_routines;
    v_owner_auth_id uuid;
    -- 완료 1건당 지급 포인트. 지금은 난이도 무관 고정값이고, 나중에 세트·무게
    -- 기준 차등 지급을 붙일 수 있는 자리로 남겨 둔다.
    v_points        constant integer := 10;
begin
    if auth.uid() is null then
        raise exception 'AUTH_REQUIRED' using errcode = '42501';
    end if;

    if p_actual_duration_minutes is not null
       and (p_actual_duration_minutes < 1 or p_actual_duration_minutes > 240) then
        raise exception 'INVALID_DURATION' using errcode = '22023';
    end if;

    select * into v_routine from public.daily_routines where id = p_routine_id;

    if not found then
        raise exception 'ROUTINE_NOT_FOUND' using errcode = 'P0002';
    end if;

    select auth_user_id into v_owner_auth_id from public.users where id = v_routine.user_id;

    if v_owner_auth_id is distinct from auth.uid() then
        raise exception 'FORBIDDEN' using errcode = '42501';
    end if;

    if v_routine.is_completed then
        -- 이미 완료 처리된 걸 다시 눌러도 포인트를 또 주지 않는다.
        return jsonb_build_object('routine', to_jsonb(v_routine), 'points_awarded', 0);
    end if;

    update public.daily_routines
    set is_completed = true,
        actual_weight_kg = p_actual_weight_kg,
        actual_reps = p_actual_reps,
        actual_duration_minutes = p_actual_duration_minutes,
        completed_at = now(),
        points_awarded = v_points
    where id = p_routine_id
    returning * into v_routine;

    update public.users set total_points = total_points + v_points where id = v_routine.user_id;

    return jsonb_build_object('routine', to_jsonb(v_routine), 'points_awarded', v_points);
end;
$$;


-- ─────────────────────────────────────────────────────────────
-- 3. 루틴 조회에 실제 수행 시간을 실어 준다
--
-- 나머지 필드는 서버의 현재 정의 그대로다(도감 필드·사진·기구 위치·무게 제안).
-- ─────────────────────────────────────────────────────────────

create or replace function public.get_daily_routine(
    p_user_id uuid,
    p_date date default current_date
)
returns jsonb
language sql
security definer
set search_path = public
as $$
    select coalesce(jsonb_agg(row order by sort_order, name), '[]'::jsonb)
    from (
        select d.sort_order, cat.name, jsonb_build_object(
            'routine_id', d.id,
            'catalog_id', cat.id,
            'equip_id', e.id,
            'name', cat.name,
            'name_ko', cat.name_ko,
            'station_kind', cat.station_kind,
            'description', cat.description,
            'why_it_matters', cat.why_it_matters,
            'how_to_steps', cat.how_to_steps,
            'form_caution', cat.form_caution,
            'target_muscle', cat.target_muscle,
            'video_url', cat.video_url,
            'image_url', cat.image_url,
            'qr_code_val', e.qr_code_val,
            'location_label', e.location_label,
            'target_weight', d.target_weight,
            'target_sets', d.target_sets,
            'target_reps', d.target_reps,
            'target_duration_minutes', d.target_duration_minutes,
            'actual_duration_minutes', d.actual_duration_minutes,
            'is_completed', d.is_completed,
            'weight_suggestion', case
                when d.is_completed then null
                else public.weight_suggestion(p_user_id, e.id)
            end
        ) as row
        from public.daily_routines d
        join public.exercise_catalog cat on cat.id = d.catalog_id
        left join public.equipments e on e.id = d.equip_id
        where d.user_id = p_user_id and d.routine_date = p_date
    ) s;
$$;


-- ─────────────────────────────────────────────────────────────
-- 4. 분석 요약에서 근력과 유산소를 갈라 센다
--
-- 지금까지 completed_count 하나에 둘을 섞어 놓아서, 칼로리 계산이 유산소를
-- 근력처럼 어림잡고 있었다. 유산소는 실제로 움직인 시간이 있으니 그걸 쓴다.
-- by_muscle 은 근력만 센다 — 유산소에 부위를 매기면 "다리 운동"으로 잡혀
-- 부위 분포가 왜곡된다.
-- ─────────────────────────────────────────────────────────────

create or replace function public.get_workout_summary(p_user_id uuid, p_from date, p_to date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_owner_auth_id   uuid;
    v_completed_count integer;
    v_strength_count  integer;
    v_total_sets      integer;
    v_cardio_count    integer;
    v_cardio_minutes  integer;
    v_by_muscle       jsonb;
begin
    if auth.uid() is null then
        raise exception 'AUTH_REQUIRED' using errcode = '42501';
    end if;

    select auth_user_id into v_owner_auth_id from public.users where id = p_user_id;
    if not found or v_owner_auth_id is distinct from auth.uid() then
        raise exception 'FORBIDDEN' using errcode = '42501';
    end if;

    -- 유산소인지는 처방 단위로 가른다(target_duration_minutes 가 있으면 유산소).
    -- 실제 시간이 없으면 처방 시간으로 대신한다 — 예전 기록에는 실측이 없다.
    select
        count(*),
        count(*) filter (where d.target_duration_minutes is null),
        coalesce(sum(d.target_sets) filter (where d.target_duration_minutes is null), 0),
        count(*) filter (where d.target_duration_minutes is not null),
        coalesce(sum(coalesce(d.actual_duration_minutes, d.target_duration_minutes))
                 filter (where d.target_duration_minutes is not null), 0)
    into v_completed_count, v_strength_count, v_total_sets, v_cardio_count, v_cardio_minutes
    from public.daily_routines d
    where d.user_id = p_user_id and d.is_completed
      and d.routine_date between p_from and p_to;

    select coalesce(
        jsonb_agg(
            jsonb_build_object(
                'target_muscle', t.target_muscle,
                'completed_count', t.completed_count,
                'total_sets', t.total_sets
            )
            order by t.total_sets desc
        ),
        '[]'::jsonb
    )
    into v_by_muscle
    from (
        select cat.target_muscle, count(*) as completed_count, coalesce(sum(d.target_sets), 0) as total_sets
        from public.daily_routines d
        join public.exercise_catalog cat on cat.id = d.catalog_id
        where d.user_id = p_user_id and d.is_completed
          and d.target_duration_minutes is null
          and d.routine_date between p_from and p_to
        group by cat.target_muscle
    ) t;

    return jsonb_build_object(
        'completed_count', v_completed_count,
        'strength_count', v_strength_count,
        'total_sets', v_total_sets,
        'cardio_count', v_cardio_count,
        'cardio_minutes', v_cardio_minutes,
        'by_muscle', v_by_muscle
    );
end;
$$;
