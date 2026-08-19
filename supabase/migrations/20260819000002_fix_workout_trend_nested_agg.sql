-- 분석 탭이 "잠시 후 다시 시도해 주세요."만 띄우던 원인을 고친다.
--
-- get_workout_trend 의 추이 계산이 jsonb_agg(...) 안에서 count()·sum() 을
-- 다시 부르고 있었다. Postgres 는 집계 함수를 겹쳐 부르는 것을 허용하지 않아
-- (42803 aggregate function calls cannot be nested) 이 함수는 호출될 때마다
-- 무조건 실패했다. 화면은 그 오류를 잡아 안내 문구로 바꾸므로, 서버가 깨진
-- 것이 아니라 "잠시 후 다시" 하라는 말로만 보였다.
--
-- 고치는 방법은 순서를 나누는 것뿐이다. 칸(bucket)별 집계를 먼저 끝내고,
-- 그 결과 행들을 jsonb_agg 로 묶는다. 계산식과 반환 형태는 그대로 두었다 —
-- 화면은 이미 이 모양을 기대하고 있다.
--
-- 나머지 부분(권한 확인, 기간 검증, 지난 기간 비교)은 서버의 현재 정의를
-- pg_get_functiondef 로 읽어 그대로 옮겼다.

create or replace function public.get_workout_trend(
    p_user_id uuid,
    p_from date,
    p_to date,
    p_bucket text default 'day'
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
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

    if p_bucket = 'week' and v_span % 7 <> 0 then
        raise exception 'INVALID_RANGE' using errcode = '22023';
    end if;

    v_prev_to := p_from - 1;
    v_prev_from := v_prev_to - (v_span - 1);

    -- 칸별 집계를 rolled 에서 끝낸 뒤(여기까지가 count·sum 의 자리),
    -- 그 행들을 jsonb_agg 로 묶는다. 한 문장에 겹쳐 쓰면 42803 이 난다.
    with buckets as (
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
    ),
    rolled as (
        select
            b.bucket_start,
            b.bucket_end,
            count(x.routine_date)                  as completed_count,
            coalesce(sum(x.target_sets), 0)        as total_sets,
            count(distinct x.routine_date)         as workout_days
        from buckets b
        left join done x on x.routine_date between b.bucket_start and b.bucket_end
        group by b.bucket_start, b.bucket_end
    )
    select jsonb_agg(
        jsonb_build_object(
            'bucket_start', r.bucket_start,
            'bucket_end', r.bucket_end,
            'completed_count', r.completed_count,
            'total_sets', r.total_sets,
            'workout_days', r.workout_days
        )
        order by r.bucket_start
    )
    into v_points
    from rolled r;

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
$function$;
