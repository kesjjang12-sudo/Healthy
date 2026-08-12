-- 달력 / 분석 탭용 RPC 3종. 전부 개인 앱 전용(authenticated), 본인 것만 조회 가능.

create or replace function public.get_attendance_days(p_user_id uuid, p_month date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_owner_auth_id uuid;
begin
    if auth.uid() is null then
        raise exception 'AUTH_REQUIRED' using errcode = '42501';
    end if;

    select auth_user_id into v_owner_auth_id from public.users where id = p_user_id;
    if not found or v_owner_auth_id is distinct from auth.uid() then
        raise exception 'FORBIDDEN' using errcode = '42501';
    end if;

    return coalesce(
        jsonb_agg(distinct day order by day),
        '[]'::jsonb
    )
    from (
        select (attended_at at time zone 'Asia/Seoul')::date as day
        from public.attendance_logs
        where user_id = p_user_id
          and date_trunc('month', (attended_at at time zone 'Asia/Seoul')::date) = date_trunc('month', p_month)
    ) days;
end;
$$;

comment on function public.get_attendance_days(uuid, date) is
    '해당 월에 출석한 날짜 목록(어느 헬스장이든). 달력 탭에서 점 찍는 용도.';

revoke all on function public.get_attendance_days(uuid, date) from public;
grant execute on function public.get_attendance_days(uuid, date) to authenticated;


-- 분석 탭 원시 집계. 칼로리 같은 가공값은 여기서 계산하지 않는다 — 공식이 데모
-- 피드백으로 자주 바뀔 것이므로 클라이언트(analysis/calorie.ts)에서 계산한다.

create or replace function public.get_workout_summary(p_user_id uuid, p_from date, p_to date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_owner_auth_id  uuid;
    v_completed_count integer;
    v_total_sets      integer;
    v_by_muscle       jsonb;
begin
    if auth.uid() is null then
        raise exception 'AUTH_REQUIRED' using errcode = '42501';
    end if;

    select auth_user_id into v_owner_auth_id from public.users where id = p_user_id;
    if not found or v_owner_auth_id is distinct from auth.uid() then
        raise exception 'FORBIDDEN' using errcode = '42501';
    end if;

    select count(*), coalesce(sum(d.target_sets), 0)
    into v_completed_count, v_total_sets
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
        group by e.target_muscle
    ) t;

    return jsonb_build_object(
        'completed_count', v_completed_count,
        'total_sets', v_total_sets,
        'by_muscle', v_by_muscle
    );
end;
$$;

comment on function public.get_workout_summary(uuid, date, date) is
    '기간 내 완료 운동 원시 집계(완료 개수, 총 세트, 부위별). 칼로리 등 가공은 클라이언트가 한다.';

revoke all on function public.get_workout_summary(uuid, date, date) from public;
grant execute on function public.get_workout_summary(uuid, date, date) to authenticated;


-- 운동 탭 상단 "DAY_N" 배지용. 어느 헬스장이든 상관없이 평생 출석한 날 수를 센다.

create or replace function public.get_visit_stats(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_owner_auth_id      uuid;
    v_total_days         integer;
    v_first_attended_at  timestamptz;
begin
    if auth.uid() is null then
        raise exception 'AUTH_REQUIRED' using errcode = '42501';
    end if;

    select auth_user_id into v_owner_auth_id from public.users where id = p_user_id;
    if not found or v_owner_auth_id is distinct from auth.uid() then
        raise exception 'FORBIDDEN' using errcode = '42501';
    end if;

    select count(distinct (attended_at at time zone 'Asia/Seoul')::date), min(attended_at)
    into v_total_days, v_first_attended_at
    from public.attendance_logs
    where user_id = p_user_id;

    return jsonb_build_object(
        'total_days', coalesce(v_total_days, 0),
        'first_attended_at', v_first_attended_at
    );
end;
$$;

comment on function public.get_visit_stats(uuid) is
    '평생 출석일 수(DAY_N 배지용)와 첫 출석일. 헬스장 구분 없이 센다.';

revoke all on function public.get_visit_stats(uuid) from public;
grant execute on function public.get_visit_stats(uuid) to authenticated;
