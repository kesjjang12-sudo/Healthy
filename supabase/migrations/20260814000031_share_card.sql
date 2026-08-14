-- 오늘 운동을 한 장으로 요약하는 "운동 카드".
--
-- 다 하고 나서 남는 게 없으면 다음에 또 나올 이유도 없다. 오늘 한 걸 숫자로
-- 보여주고 자식들한테 보낼 수 있게 만든다.
--
-- ⚠️ 볼륨은 target_weight(처방 kg)로만 계산한다. actual_weight_kg 에는 지금
--    "핀 몇 칸"이 들어가 있는데, 그건 기구마다 실제 무게가 다른 상대값이라
--    합치면 아무 의미 없는 숫자가 된다. 맨몸·유산소도 무게가 없으니 볼륨에서
--    빠진다(세트·횟수에는 들어간다).

create or replace function public.get_workout_share_card(
    p_user_id uuid,
    p_date    date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_owner_auth_id uuid;
    v_date          date;
    v_first         timestamptz;
    v_last          timestamptz;
    v_result        jsonb;
    v_exercises     jsonb;
    v_muscles       jsonb;
    v_day_count     integer;
begin
    if auth.uid() is null then
        raise exception 'AUTH_REQUIRED' using errcode = '42501';
    end if;

    select auth_user_id into v_owner_auth_id from public.users where id = p_user_id;
    if not found or v_owner_auth_id is distinct from auth.uid() then
        raise exception 'FORBIDDEN' using errcode = '42501';
    end if;

    -- 날짜를 안 주면 오늘. 서버가 UTC 라 한국 날짜로 바꿔서 본다.
    v_date := coalesce(p_date, (now() at time zone 'Asia/Seoul')::date);

    select min(d.completed_at), max(d.completed_at)
    into v_first, v_last
    from public.daily_routines d
    where d.user_id = p_user_id and d.routine_date = v_date and d.is_completed;

    -- 완료한 운동이 하나도 없으면 카드를 만들지 않는다.
    if v_first is null then
        return null;
    end if;

    -- 평생 출석일. "676번째 운동" 같은 자랑거리가 된다.
    select count(distinct (a.attended_at at time zone 'Asia/Seoul')::date)
    into v_day_count
    from public.attendance_logs a
    where a.user_id = p_user_id;

    select jsonb_agg(
        jsonb_build_object(
            'name', cat.name,
            'name_ko', cat.name_ko,
            'target_muscle', cat.target_muscle,
            'sets', d.target_sets,
            'reps', d.target_reps,
            'duration_minutes', d.target_duration_minutes,
            'weight_kg', d.target_weight
        ) order by d.sort_order, cat.name
    )
    into v_exercises
    from public.daily_routines d
    join public.exercise_catalog cat on cat.id = d.catalog_id
    where d.user_id = p_user_id and d.routine_date = v_date and d.is_completed;

    select jsonb_agg(m order by m)
    into v_muscles
    from (
        select distinct cat.target_muscle as m
        from public.daily_routines d
        join public.exercise_catalog cat on cat.id = d.catalog_id
        where d.user_id = p_user_id and d.routine_date = v_date and d.is_completed
          and cat.target_muscle is not null
    ) s;

    select jsonb_build_object(
        'date', v_date,
        -- 마친 시각으로 "저녁 운동"처럼 부른다. 카드 제목에 쓴다.
        'part_of_day', case
            when extract(hour from (v_last at time zone 'Asia/Seoul')) < 6  then '새벽'
            when extract(hour from (v_last at time zone 'Asia/Seoul')) < 11 then '아침'
            when extract(hour from (v_last at time zone 'Asia/Seoul')) < 17 then '낮'
            when extract(hour from (v_last at time zone 'Asia/Seoul')) < 21 then '저녁'
            else '밤'
        end,
        'day_count', v_day_count,
        -- 첫 완료부터 마지막 완료까지. 한 종목만 했으면 0 이 나오는데, 그때는
        -- 화면에서 시간 칸을 빼는 게 맞다(0분이라고 적으면 안 한 것처럼 보인다).
        'duration_minutes', greatest(0, round(extract(epoch from (v_last - v_first)) / 60))::integer,
        'exercise_count', count(*),
        'total_sets', coalesce(sum(d.target_sets), 0),
        'total_reps', coalesce(sum(d.target_sets * d.target_reps), 0),
        'total_minutes_cardio', coalesce(sum(d.target_duration_minutes), 0),
        'total_volume_kg', coalesce(sum(
            case when d.target_weight is not null
                 then d.target_weight * coalesce(d.target_sets, 0) * coalesce(d.target_reps, 0)
                 else 0 end), 0),
        'points', coalesce(sum(d.points_awarded), 0),
        'muscles', coalesce(v_muscles, '[]'::jsonb),
        'exercises', coalesce(v_exercises, '[]'::jsonb)
    )
    into v_result
    from public.daily_routines d
    where d.user_id = p_user_id and d.routine_date = v_date and d.is_completed;

    return v_result;
end;
$$;

comment on function public.get_workout_share_card(uuid, date) is
    '오늘 운동 한 장 요약(공유 카드용). 완료한 운동이 없으면 null. 볼륨은 처방 kg 기준 — 핀 칸 값은 쓰지 않는다.';

revoke all on function public.get_workout_share_card(uuid, date) from public;
grant execute on function public.get_workout_share_card(uuid, date) to authenticated;
