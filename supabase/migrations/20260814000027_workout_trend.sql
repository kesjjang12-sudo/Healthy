-- 분석 탭에 "추이" 그래프를 붙이기 위한 시계열 집계.
--
-- 기존 get_workout_summary 는 기간 전체를 한 덩어리로 합쳐서 준다. 그래서
-- "이번 기간에 40세트 했다"는 알 수 있어도 "지난주보다 늘었는지, 요즘 뜸해
-- 졌는지"는 알 수 없다. 시니어에게 가장 큰 동기는 정확한 칼로리 숫자가 아니라
-- "내가 꾸준히 하고 있다"는 그림이라, 그 그림을 그릴 데이터를 따로 만든다.
--
-- 설계에서 중요한 것 두 가지:
--   1. 운동이 없는 날도 0 으로 채워서 돌려준다. 빠뜨리면 쉰 날이 그래프에서
--      사라져 실제보다 꾸준히 한 것처럼 보인다 — 기록을 부풀리는 셈이다.
--   2. 직전 같은 길이 구간의 합계도 같이 준다. "지난주보다 12세트 많아요"
--      한 문장이 막대 일곱 개보다 잘 읽힌다.

create or replace function public.get_workout_trend(
    p_user_id uuid,
    p_from    date,
    p_to      date,
    -- 'day' = 하루씩(최근 7일용), 'week' = 7일씩 묶어서(최근 4주용)
    p_bucket  text default 'day'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_owner_auth_id uuid;
    v_span          integer;
    v_prev_from     date;
    v_prev_to       date;
    v_points        jsonb;
    v_total_sets    integer;
    v_completed     integer;
    v_days          integer;
    v_prev_sets     integer;
    v_prev_days     integer;
begin
    if auth.uid() is null then
        raise exception 'AUTH_REQUIRED' using errcode = '42501';
    end if;

    -- 남의 기록은 못 본다. get_workout_summary 와 같은 기준.
    select auth_user_id into v_owner_auth_id from public.users where id = p_user_id;
    if not found or v_owner_auth_id is distinct from auth.uid() then
        raise exception 'FORBIDDEN' using errcode = '42501';
    end if;

    if p_bucket not in ('day', 'week') then
        raise exception 'INVALID_BUCKET' using errcode = '22023';
    end if;

    if p_to < p_from then
        raise exception 'INVALID_RANGE' using errcode = '22023';
    end if;

    v_span := (p_to - p_from) + 1;

    -- 주 단위는 딱 떨어질 때만 받는다. 30일을 7일씩 자르면 마지막 한 칸이
    -- 이틀짜리가 되는데, 그 칸만 막대가 낮게 나와 "요즘 덜 한다"로 잘못
    -- 읽힌다. 애매하게 잘라 보여주느니 부르는 쪽에서 28일로 맞추게 한다.
    if p_bucket = 'week' and v_span % 7 <> 0 then
        raise exception 'INVALID_RANGE' using errcode = '22023';
    end if;

    v_prev_to := p_from - 1;
    v_prev_from := v_prev_to - (v_span - 1);

    with buckets as (
        -- 오늘(p_to)에서 거꾸로 잘라 나간다. 달력의 주(월~일)에 맞추지 않는
        -- 이유는, 오늘이 수요일이면 이번 주 칸만 사흘짜리가 되어 위와 같은
        -- 착시가 생기기 때문이다. 항상 "오늘부터 7일씩"이라 칸 길이가 같다.
        select
            case when p_bucket = 'week' then p_to - (g * 7 + 6) else p_to - g end as bucket_start,
            case when p_bucket = 'week' then p_to - (g * 7)     else p_to - g end as bucket_end
        from generate_series(
            0,
            case when p_bucket = 'week' then (v_span / 7) - 1 else v_span - 1 end
        ) as g
    ),
    done as (
        select d.routine_date, d.target_sets
        from public.daily_routines d
        where d.user_id = p_user_id
          and d.is_completed
          and d.routine_date between p_from and p_to
    )
    select jsonb_agg(
        jsonb_build_object(
            'bucket_start', b.bucket_start,
            'bucket_end', b.bucket_end,
            'completed_count', count(x.routine_date),
            'total_sets', coalesce(sum(x.target_sets), 0),
            'workout_days', count(distinct x.routine_date)
        )
        order by b.bucket_start
    )
    into v_points
    from buckets b
    left join done x on x.routine_date between b.bucket_start and b.bucket_end
    group by b.bucket_start, b.bucket_end;

    select count(*), coalesce(sum(d.target_sets), 0), count(distinct d.routine_date)
    into v_completed, v_total_sets, v_days
    from public.daily_routines d
    where d.user_id = p_user_id and d.is_completed
      and d.routine_date between p_from and p_to;

    select coalesce(sum(d.target_sets), 0), count(distinct d.routine_date)
    into v_prev_sets, v_prev_days
    from public.daily_routines d
    where d.user_id = p_user_id and d.is_completed
      and d.routine_date between v_prev_from and v_prev_to;

    return jsonb_build_object(
        'bucket', p_bucket,
        'points', coalesce(v_points, '[]'::jsonb),
        'completed_count', v_completed,
        'total_sets', v_total_sets,
        'workout_days', v_days,
        'previous_total_sets', v_prev_sets,
        'previous_workout_days', v_prev_days
    );
end;
$$;

comment on function public.get_workout_trend(uuid, date, date, text) is
    '분석 탭 추이 그래프용 시계열. 운동이 없는 날도 0 으로 채워 주고, 직전 같은 길이 구간의 합계도 같이 준다.';

revoke all on function public.get_workout_trend(uuid, date, date, text) from public;
grant execute on function public.get_workout_trend(uuid, date, date, text) to authenticated;
