-- 유산소를 "실제로 몇 분 했는지" 로 기록한다.
--
-- 지금까지 유산소는 완료 버튼을 누르면 처방 시간(target_duration_minutes)을
-- 그대로 수행한 것으로 기록했다. 근력의 "처방 횟수 = 실제 수행" 가정을 그대로
-- 가져온 것인데, 유산소에서는 이 가정이 잘 안 맞는다 — 15분 처방을 받고 8분만
-- 걷다 내려오거나, 반대로 걷다 보니 25분을 하는 일이 흔하다. 그걸 전부 15분으로
-- 적어 두면 분석 탭의 숫자가 사실과 달라진다.
--
-- 그래서 실제 수행 시간을 따로 받는 칸을 만든다. 폰 앱이 시작~완료 사이를 재서
-- 채워 넣고, 사람이 그 값을 고칠 수 있다.

alter table public.daily_routines
    add column if not exists actual_duration_minutes integer;

comment on column public.daily_routines.actual_duration_minutes is
    '유산소를 실제로 수행한 시간(분). target_duration_minutes 는 처방값, 이건 실제 수행값. 근력 운동이면 null.';


-- ─────────────────────────────────────────────────────────────
-- complete_routine 에 실제 수행 시간을 받는 인자를 추가한다.
--
-- 기본값이 있는 인자를 덧붙이기만 하면 3-인자 호출이 두 함수 모두에 걸려
-- "function is not unique" 가 난다. 그래서 옛 시그니처를 지우고 다시 만든다.
-- ─────────────────────────────────────────────────────────────

drop function if exists public.complete_routine(uuid, numeric, integer);

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
    v_is_cardio     boolean;
    v_duration      integer;
    -- 완료 1건당 지급 포인트. 지금은 난이도 무관 고정값이고, 나중에 세트·무게
    -- 기준 차등 지급을 붙일 수 있는 자리로 남겨 둔다.
    v_points        constant integer := 10;
    -- 사람이 실제로 할 수 있는 범위. 폰 앱도 같은 값으로 막지만, 여기서 한 번 더
    -- 본다 — 잘못 눌린 세 자리(예: 350분)가 그대로 저장되면 분석 탭 숫자가
    -- 통째로 망가진다.
    v_min_minutes   constant integer := 1;
    v_max_minutes   constant integer := 240;
begin
    if auth.uid() is null then
        raise exception 'AUTH_REQUIRED' using errcode = '42501';
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

    v_is_cardio := v_routine.target_duration_minutes is not null;

    if p_actual_duration_minutes is not null
       and (p_actual_duration_minutes < v_min_minutes or p_actual_duration_minutes > v_max_minutes) then
        raise exception 'INVALID_DURATION' using errcode = '22023';
    end if;

    -- 시간은 유산소에만 의미가 있다. 근력 행에 분이 들어오면 버린다.
    -- 반대로 유산소인데 시간이 안 들어오면 null 로 남긴다 — 처방값을 실제
    -- 수행값 자리에 베껴 넣으면 "모른다"와 "처방대로 했다"를 구분할 수 없게 된다.
    v_duration := case when v_is_cardio then p_actual_duration_minutes else null end;

    update public.daily_routines
    set is_completed = true,
        actual_weight_kg = p_actual_weight_kg,
        actual_reps = p_actual_reps,
        actual_duration_minutes = v_duration,
        completed_at = now(),
        points_awarded = v_points
    where id = p_routine_id
    returning * into v_routine;

    update public.users set total_points = total_points + v_points where id = v_routine.user_id;

    return jsonb_build_object('routine', to_jsonb(v_routine), 'points_awarded', v_points);
end;
$$;

comment on function public.complete_routine(uuid, numeric, integer, integer) is
    '운동 완료 처리 + 포인트 지급. 개인 앱 전용, 본인 루틴만 완료할 수 있다. 유산소는 실제 수행 시간(분)을 함께 받는다.';

revoke all on function public.complete_routine(uuid, numeric, integer, integer) from public;
grant execute on function public.complete_routine(uuid, numeric, integer, integer) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 달력에서 지난 날짜를 볼 때도 처방값이 아니라 실제로 한 시간이 보여야 한다.
-- ─────────────────────────────────────────────────────────────

create or replace function public.get_daily_routine(
    p_user_id uuid,
    p_date    date default current_date
)
returns jsonb
language sql
security definer
set search_path = public
as $$
    select coalesce(jsonb_agg(row order by sort_order, name), '[]'::jsonb)
    from (
        select d.sort_order, e.name, jsonb_build_object(
            'routine_id', d.id,
            'equip_id', e.id,
            'name', e.name,
            'description', e.description,
            'target_muscle', e.target_muscle,
            'video_url', e.video_url,
            'qr_code_val', e.qr_code_val,
            'target_weight', d.target_weight,
            'target_sets', d.target_sets,
            'target_reps', d.target_reps,
            'target_duration_minutes', d.target_duration_minutes,
            'actual_duration_minutes', d.actual_duration_minutes,
            'is_completed', d.is_completed
        ) as row
        from public.daily_routines d
        join public.equipments e on e.id = d.equip_id
        where d.user_id = p_user_id and d.routine_date = p_date
    ) rows;
$$;

comment on function public.get_daily_routine(uuid, date) is
    '해당 날짜의 루틴을 기구 정보(쉬운 설명·유산소 처방/실제 시간 포함)와 함께 돌려준다.';

revoke all on function public.get_daily_routine(uuid, date) from public;
grant execute on function public.get_daily_routine(uuid, date) to anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 분석 탭: 유산소를 근력과 섞지 않고 따로 집계한다.
--
-- 유산소 행은 세트가 1로 들어가 있다(스키마상 세트를 비울 수 없어서 넣은
-- 값이다). 그걸 근력 세트 합계에 그대로 더하면 "총 세트"가 부풀고, 부위별
-- 막대에도 '유산소 1세트' 같은 줄이 생긴다 — 시간으로 한 운동을 세트로
-- 세는 셈이라 둘 다 틀린 숫자다. 그래서 근력 집계에서는 빼고, 유산소는
-- 분(分) 합계로 따로 돌려준다.
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

    select
        count(*),
        count(*) filter (where d.target_duration_minutes is null),
        coalesce(sum(d.target_sets) filter (where d.target_duration_minutes is null), 0),
        count(*) filter (where d.target_duration_minutes is not null),
        -- 옛 기록(이 마이그레이션 전에 완료한 유산소)은 실제 시간이 비어 있다.
        -- 그때는 처방 시간으로 대신 센다 — 당시 앱이 그렇게 기록한 것과 같은 값이다.
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
        select e.target_muscle, count(*) as completed_count, coalesce(sum(d.target_sets), 0) as total_sets
        from public.daily_routines d
        join public.equipments e on e.id = d.equip_id
        where d.user_id = p_user_id and d.is_completed
          and d.routine_date between p_from and p_to
          and d.target_duration_minutes is null
        group by e.target_muscle
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

comment on function public.get_workout_summary(uuid, date, date) is
    '기간 내 완료 운동 원시 집계. 근력(개수·세트·부위별)과 유산소(개수·분)를 나눠서 돌려준다. 칼로리 등 가공은 클라이언트가 한다.';

revoke all on function public.get_workout_summary(uuid, date, date) from public;
grant execute on function public.get_workout_summary(uuid, date, date) to authenticated;
