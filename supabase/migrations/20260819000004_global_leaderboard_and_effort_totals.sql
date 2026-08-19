-- 전체 랭킹 + 누적 노력 합계.
--
-- 1) get_global_leaderboard: 모든 단지를 한 줄로 세운다. 단지 랭킹과 같은
--    모양에 apt_name 이 추가된다 — "우리 단지 밖에는 누가 있나"가 목표를
--    한 단계 키운다.
-- 2) get_effort_totals: 이번 주·이번 달·전체의 유산소 분과 든 무게 합.
--    분석 탭 "지금까지" 섹션이 쓴다. 무게 합은 실제 기록(actual)이 있으면
--    그걸, 없으면 처방값을 쓴다 — 핀 기구의 칸 수는 kg 이 아니라 근사값이지만,
--    "쌓여 간다"를 보여주는 것이 목적이라 정확도보다 꾸준한 증가가 중요하다.

create or replace function public.get_global_leaderboard(
    p_limit integer default 50,
    p_order text default 'attendance'
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_me uuid;
begin
    if auth.uid() is null then
        raise exception 'AUTH_REQUIRED' using errcode = '42501';
    end if;

    if p_order not in ('attendance', 'points') then
        raise exception 'BAD_ORDER' using errcode = '22023';
    end if;

    select id into v_me from public.users where auth_user_id = auth.uid();

    return coalesce(
        jsonb_agg(
            jsonb_build_object(
                'rank', lb.rnk,
                'nickname', coalesce(lb.profile_data->>'nickname', '회원' || right(lb.id::text, 4)),
                'apt_name', lb.apt_name,
                'attendance_count', lb.attendance_count,
                'total_points', lb.total_points,
                'is_me', lb.id = v_me
            )
            order by lb.rnk
        ),
        '[]'::jsonb
    )
    from (
        select
            u.id,
            u.profile_data,
            u.total_points,
            a.name as apt_name,
            count(distinct (l.attended_at at time zone 'Asia/Seoul')::date) as attendance_count,
            row_number() over (
                order by
                    case when p_order = 'points'
                         then coalesce(u.total_points, 0)
                         else count(distinct (l.attended_at at time zone 'Asia/Seoul')::date)
                    end desc,
                    u.created_at asc
            ) as rnk
        from public.users u
        join public.apartments a on a.id = u.apt_id
        left join public.attendance_logs l on l.user_id = u.id
        where u.apt_id is not null
        group by u.id, u.profile_data, u.total_points, u.created_at, a.name
    ) lb
    where lb.rnk <= p_limit or lb.id = v_me;
end;
$$;

create or replace function public.get_effort_totals()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_me uuid;
    v_week date := date_trunc('week', (now() at time zone 'Asia/Seoul'))::date;
    v_month date := date_trunc('month', (now() at time zone 'Asia/Seoul'))::date;
begin
    if auth.uid() is null then
        raise exception 'AUTH_REQUIRED' using errcode = '42501';
    end if;

    select id into v_me from public.users where auth_user_id = auth.uid();

    return (
        with done as (
            select
                r.routine_date,
                -- 유산소: 실제로 움직인 분(없으면 처방 분)
                case when r.target_duration_minutes is not null
                     then coalesce(r.actual_duration_minutes, r.target_duration_minutes)
                     else 0 end as cardio_minutes,
                -- 근력: 무게 x 세트 x 횟수. 무게 없는 맨몸운동은 0.
                case when r.target_duration_minutes is null
                     then coalesce(r.actual_weight_kg, r.target_weight, 0)
                          * coalesce(r.target_sets, 1)
                          * coalesce(r.actual_reps, r.target_reps, 0)
                     else 0 end as volume_kg
            from public.daily_routines r
            where r.user_id = v_me and r.is_completed
        )
        select jsonb_build_object(
            'week', (select jsonb_build_object(
                'cardio_minutes', coalesce(sum(cardio_minutes), 0),
                'volume_kg', coalesce(sum(volume_kg), 0)::bigint,
                'workouts', count(*))
                from done where routine_date >= v_week),
            'month', (select jsonb_build_object(
                'cardio_minutes', coalesce(sum(cardio_minutes), 0),
                'volume_kg', coalesce(sum(volume_kg), 0)::bigint,
                'workouts', count(*))
                from done where routine_date >= v_month),
            'all', (select jsonb_build_object(
                'cardio_minutes', coalesce(sum(cardio_minutes), 0),
                'volume_kg', coalesce(sum(volume_kg), 0)::bigint,
                'workouts', count(*))
                from done)
        )
    );
end;
$$;
