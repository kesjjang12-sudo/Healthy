-- 랭킹 탭. 같은 아파트 단지 내에서만 비교한다(요구사항 확정: 전체 통합 랭킹 아님).
-- 전화번호 등 PII 는 절대 안 돌려주고, 닉네임(없으면 회원+짧은 접미사)과 포인트만.

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
                'total_points', lb.total_points,
                'is_me', lb.id = v_me
            )
            order by lb.rnk
        ),
        '[]'::jsonb
    )
    from (
        select
            u.id, u.profile_data, u.total_points,
            row_number() over (order by u.total_points desc, u.created_at asc) as rnk
        from public.users u
        join public.user_gym_memberships m on m.user_id = u.id and m.apt_id = p_apt_id
    ) lb
    -- 상위 p_limit 명 + 그 밖이어도 내 순위는 항상 포함(고정 행으로 보여주기 위해)
    where lb.rnk <= p_limit or lb.id = v_me;
end;
$$;

comment on function public.get_apartment_leaderboard(uuid, integer) is
    '같은 단지 포인트 랭킹. 닉네임/포인트만 노출, 전화번호 등 PII 없음. 개인 앱 전용.';

revoke all on function public.get_apartment_leaderboard(uuid, integer) from public;
grant execute on function public.get_apartment_leaderboard(uuid, integer) to authenticated;
