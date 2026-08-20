-- 단지 주간 현황에 "다 같이 걸은 거리"와 "다 같이 든 무게"를 더한다.
--
-- 출석 횟수만으로는 "우리 단지가 이만큼 했다"가 잘 안 와닿는다. 거리(km)와
-- 무게(kg)는 숫자가 커서 자랑이 되고, 개인 분석의 "지금까지"와 같은 단위라
-- 내 몫이 단지 합계에 얹히는 게 보인다.
--
-- 목표 기준 인원도 올린다. 활동 멤버 14명 x 2 = 28회는 목표로 너무 작았다
-- (오너 피드백). 헬스장 하나에 최소 30명은 다닌다고 보고 바닥을 깐다:
--
--   기준 인원 N = max(최근 4주 출석자, 30)
--   · 출석 목표 = N x 2      (모두 주 2번)
--   · 유산소 목표 = N x 30분  (주 2번 x 15분)
--   · 무게 목표  = N x 3000kg (주 2번 x 1500kg)
--
-- 서버의 현재 정의(pg_get_functiondef, 2026-08-19 확인) 위에 얹었다.

create or replace function public.get_apartment_week(p_apt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_me uuid;
    v_today date := (now() at time zone 'Asia/Seoul')::date;
    v_week_start date := date_trunc('week', (now() at time zone 'Asia/Seoul'))::date;
    v_member_count integer;
    v_active_count integer;
    /** 목표 계산의 기준 인원. 실제 활동자와 30명 중 큰 쪽. */
    v_basis integer;
    v_days jsonb;
    v_total integer;
    v_mine integer;
    v_cheers jsonb;
    v_my_cheer text;
    v_cardio integer;
    v_volume bigint;
begin
    if auth.uid() is null then
        raise exception 'AUTH_REQUIRED' using errcode = '42501';
    end if;

    select id into v_me from public.users where auth_user_id = auth.uid();

    select count(*) into v_member_count
    from public.user_gym_memberships m
    where m.apt_id = p_apt_id and m.left_at is null;

    -- 목표의 기준은 "실제로 나오는 사람"이다. 가입만 하고 안 나오는 계정까지
    -- 목표에 넣으면(멤버 85명 -> 목표 170회) 영영 못 채우는 숫자가 되어
    -- 오히려 김이 샌다. 최근 4주 안에 한 번이라도 출석한 사람.
    select count(distinct l.user_id) into v_active_count
    from public.attendance_logs l
    where l.apt_id = p_apt_id
      and (l.attended_at at time zone 'Asia/Seoul')::date >= v_week_start - 28;

    v_basis := greatest(coalesce(v_active_count, 0), 30);

    with days as (
        select v_week_start + i as d from generate_series(0, 6) as i
    ),
    daily as (
        select (l.attended_at at time zone 'Asia/Seoul')::date as d,
               count(distinct l.user_id) as c
        from public.attendance_logs l
        where l.apt_id = p_apt_id
          and (l.attended_at at time zone 'Asia/Seoul')::date >= v_week_start
        group by 1
    )
    select jsonb_agg(
               jsonb_build_object('date', days.d, 'count', coalesce(daily.c, 0))
               order by days.d
           ),
           coalesce(sum(daily.c), 0)
      into v_days, v_total
      from days left join daily on daily.d = days.d;

    select count(distinct (l.attended_at at time zone 'Asia/Seoul')::date)
      into v_mine
      from public.attendance_logs l
     where l.apt_id = p_apt_id and l.user_id = v_me
       and (l.attended_at at time zone 'Asia/Seoul')::date >= v_week_start;

    -- 단지 전체가 이번 주에 움직인 양. 계산식은 개인 get_effort_totals 와 같다.
    -- "지금 이 단지에 속한 사람"의 기록만 센다(떠난 사람 기록은 빠진다).
    select
        coalesce(sum(case when r.target_duration_minutes is not null
                          then coalesce(r.actual_duration_minutes, r.target_duration_minutes)
                          else 0 end), 0),
        coalesce(sum(case when r.target_duration_minutes is null
                          then coalesce(r.actual_weight_kg, r.target_weight, 0)
                               * coalesce(r.target_sets, 1)
                               * coalesce(r.actual_reps, r.target_reps, 0)
                          else 0 end), 0)::bigint
      into v_cardio, v_volume
      from public.daily_routines r
      join public.user_gym_memberships m
        on m.user_id = r.user_id and m.apt_id = p_apt_id and m.left_at is null
     where r.is_completed and r.routine_date >= v_week_start;

    select coalesce(jsonb_agg(jsonb_build_object('emoji', emoji, 'count', c) order by c desc), '[]'::jsonb)
      into v_cheers
      from (
          select emoji, count(*) as c
          from public.apartment_cheers
          where apt_id = p_apt_id and cheered_on >= v_week_start
          group by emoji
      ) s;

    select emoji into v_my_cheer
      from public.apartment_cheers
     where apt_id = p_apt_id and user_id = v_me and cheered_on = v_today;

    return jsonb_build_object(
        'week_start', v_week_start,
        'days', coalesce(v_days, '[]'::jsonb),
        'total_checkins', coalesce(v_total, 0),
        'goal', v_basis * 2,
        'member_count', coalesce(v_member_count, 0),
        'my_checkins', coalesce(v_mine, 0),
        'cheers', v_cheers,
        'my_cheer', v_my_cheer,
        'cardio_minutes', v_cardio,
        'goal_cardio_minutes', v_basis * 30,
        'volume_kg', v_volume,
        'goal_volume_kg', v_basis::bigint * 3000
    );
end;
$$;
