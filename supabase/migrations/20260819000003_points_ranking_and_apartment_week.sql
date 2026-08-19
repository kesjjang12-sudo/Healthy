-- 랭킹 확장 + 단지 화합의 장.
--
-- 1) get_apartment_leaderboard 에 정렬 기준(p_order)을 추가한다.
--    출석순(기본)과 포인트순 두 가지. 시그니처가 바뀌므로 옛 2-인자 버전을
--    먼저 지운다 — 남겨 두면 PostgREST 가 어느 오버로드인지 못 골라
--    AMBIGUOUS 오류가 난다 (20260815000001 과 같은 사고 예방).
-- 2) apartment_cheers: 단지 응원 이모지. 사진·댓글 없는 최소한의 화합 장치 —
--    하루 한 번, 이모지 하나로 "우리 같이 하고 있다"만 남긴다.
-- 3) get_apartment_week: 이번 주(월~일, Asia/Seoul) 단지 현황 한 방 조회.
--    요일별 출석, 단지 공동 목표(모두 주 2회 = 활동 멤버 수 x 2), 내 출석,
--    응원 집계까지 랭킹 탭 상단 카드가 쓸 것을 전부 담는다.

-- ── 1. 리더보드: 정렬 기준 추가 ────────────────────────────────────────────

drop function if exists public.get_apartment_leaderboard(uuid, integer);

create or replace function public.get_apartment_leaderboard(
    p_apt_id uuid,
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
        -- left_at 이 찍힌 사람은 이 단지를 떠난 사람이다. 출석 기록(l)은 그대로
        -- 두므로 본인 달력·분석에는 계속 보이지만, 여기 순위표에는 안 나온다.
        join public.user_gym_memberships m
          on m.user_id = u.id and m.apt_id = p_apt_id and m.left_at is null
        left join public.attendance_logs l on l.user_id = u.id and l.apt_id = p_apt_id
        group by u.id, u.profile_data, u.total_points, u.created_at
    ) lb
    -- 상위 p_limit 명 + 그 밖이어도 내 순위는 항상 포함(고정 행으로 보여주기 위해)
    where lb.rnk <= p_limit or lb.id = v_me;
end;
$$;

-- ── 2. 응원 이모지 ─────────────────────────────────────────────────────────

create table if not exists public.apartment_cheers (
    id uuid primary key default gen_random_uuid(),
    apt_id uuid not null references public.apartments(id),
    user_id uuid not null references public.users(id),
    emoji text not null check (emoji in ('💪', '🔥', '👏')),
    -- 하루 한 번. 날짜는 한국 시간 기준으로 접는다.
    cheered_on date not null default (now() at time zone 'Asia/Seoul')::date,
    created_at timestamptz not null default now(),
    unique (apt_id, user_id, cheered_on)
);

comment on table public.apartment_cheers is
    '단지 응원 이모지. 하루 한 번, 이모지 하나. 글·사진 없는 최소한의 화합 장치.';

-- 직접 접근은 막고 security definer RPC 로만 읽고 쓴다.
alter table public.apartment_cheers enable row level security;

create index if not exists apartment_cheers_apt_week_idx
    on public.apartment_cheers (apt_id, cheered_on);

-- ── 3. 이번 주 단지 현황 ───────────────────────────────────────────────────

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
    v_days jsonb;
    v_total integer;
    v_mine integer;
    v_cheers jsonb;
    v_my_cheer text;
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
    -- 오히려 김이 샌다. 최근 4주 안에 한 번이라도 출석한 사람 x 주 2회.
    select count(distinct l.user_id) into v_active_count
    from public.attendance_logs l
    where l.apt_id = p_apt_id
      and (l.attended_at at time zone 'Asia/Seoul')::date >= v_week_start - 28;

    -- 요일별 출석 (사람 수 기준 — 같은 사람이 두 번 찍어도 하루 1로 센다)
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
        -- 단지 공동 목표: 활동 멤버 모두가 주 2번씩. 아주 작은 단지도 목표가
        -- 0이 되지 않게 최소 6으로 받친다.
        'goal', greatest(coalesce(v_active_count, 0) * 2, 6),
        'member_count', coalesce(v_member_count, 0),
        'my_checkins', coalesce(v_mine, 0),
        'cheers', v_cheers,
        'my_cheer', v_my_cheer
    );
end;
$$;

-- 오늘의 응원을 남기거나 바꾼다. 반환값은 갱신된 주간 현황 — 앱이 다시
-- 조회하지 않고 바로 그린다.
create or replace function public.cheer_apartment(p_apt_id uuid, p_emoji text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_me uuid;
    v_today date := (now() at time zone 'Asia/Seoul')::date;
begin
    if auth.uid() is null then
        raise exception 'AUTH_REQUIRED' using errcode = '42501';
    end if;

    select id into v_me from public.users where auth_user_id = auth.uid();

    -- 내가 다니는(떠나지 않은) 단지에만 응원을 남길 수 있다.
    if not exists (
        select 1 from public.user_gym_memberships m
        where m.user_id = v_me and m.apt_id = p_apt_id and m.left_at is null
    ) then
        raise exception 'NOT_A_MEMBER' using errcode = '42501';
    end if;

    insert into public.apartment_cheers (apt_id, user_id, emoji, cheered_on)
    values (p_apt_id, v_me, p_emoji, v_today)
    on conflict (apt_id, user_id, cheered_on)
    do update set emoji = excluded.emoji, created_at = now();

    return public.get_apartment_week(p_apt_id);
end;
$$;
