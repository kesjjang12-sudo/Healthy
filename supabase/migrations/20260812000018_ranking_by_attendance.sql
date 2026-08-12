-- 랭킹 기준을 포인트에서 출석 횟수로 바꾼다.
--
-- 포인트는 완료 버튼을 누르기만 하면 쌓인다 — 실제로 그 무게를 들었는지,
-- 자세가 맞았는지 검증할 방법이 없다. 반면 출석은 키오스크 체크인이 있어야만
-- 기록되므로(kiosk_check_in), 최소한 "그 헬스장에 실제로 왔다"는 사실은
-- 조작하기 어렵다. 랭킹처럼 다른 사람과 비교하는 기능은 검증 가능한 지표를
-- 써야 공정하다.
--
-- 이 단지에서 출석한 날 수(distinct day)로 순위를 매긴다. 포인트는 응답에
-- 계속 넣어 두되(운동 탭 등 다른 곳에서 여전히 쓰이므로) 정렬 기준에서는 뺀다.

create or replace function public.get_apartment_leaderboard(p_apt_id uuid, p_limit integer default 50)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_me uuid;
begin
    if auth.uid() is null then
        raise exception 'AUTH_REQUIRED' using errcode = '42501';
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
                order by count(distinct (l.attended_at at time zone 'Asia/Seoul')::date) desc,
                         u.created_at asc
            ) as rnk
        from public.users u
        join public.user_gym_memberships m on m.user_id = u.id and m.apt_id = p_apt_id
        left join public.attendance_logs l on l.user_id = u.id and l.apt_id = p_apt_id
        group by u.id, u.profile_data, u.total_points, u.created_at
    ) lb
    -- 상위 p_limit 명 + 그 밖이어도 내 순위는 항상 포함(고정 행으로 보여주기 위해)
    where lb.rnk <= p_limit or lb.id = v_me;
end;
$$;

comment on function public.get_apartment_leaderboard(uuid, integer) is
    '같은 단지 출석 랭킹(포인트 아님 — 자기신고라 검증 불가). 닉네임/출석횟수/포인트만 노출, PII 없음.';

revoke all on function public.get_apartment_leaderboard(uuid, integer) from public;
grant execute on function public.get_apartment_leaderboard(uuid, integer) to authenticated;
