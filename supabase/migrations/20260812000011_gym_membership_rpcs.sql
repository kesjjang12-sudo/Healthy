-- 이사(헬스장 변경) 대응 RPC 2종.
--
-- confirm_gym_membership 은 키오스크(체크인 직후 "이 헬스장으로 바꿀까요?" 프롬프트)
-- 와 개인 폰 앱(프로필 탭의 소속 전환) 양쪽에서 호출된다. 그래서 anon 도 호출할 수
-- 있게 열어 두되, authenticated 로 호출됐을 때는 자기 것만 바꿀 수 있게 막는다 —
-- 로그인한 사람이 남의 user_id 를 넣어서 남의 소속을 바꿔버리면 안 되기 때문이다.
-- anon(키오스크) 호출은 auth.uid() 자체가 없으니 이 검사를 건너뛴다 —
-- kiosk_check_in 과 같은 신뢰 모델이다.

create or replace function public.confirm_gym_membership(
    p_user_id     uuid,
    p_apt_id      uuid,
    p_make_primary boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_owner_auth_id uuid;
begin
    select auth_user_id into v_owner_auth_id from public.users where id = p_user_id;

    if not found then
        raise exception 'USER_NOT_FOUND' using errcode = 'P0002';
    end if;

    if auth.uid() is not null and v_owner_auth_id is distinct from auth.uid() then
        raise exception 'FORBIDDEN' using errcode = '42501';
    end if;

    if not exists (
        select 1 from public.user_gym_memberships where user_id = p_user_id and apt_id = p_apt_id
    ) then
        raise exception 'MEMBERSHIP_NOT_FOUND' using errcode = 'P0002';
    end if;

    if p_make_primary then
        -- 부분 유니크 인덱스(user_id 당 is_primary=true 1개)를 지키려면
        -- 기존 primary 를 먼저 내리고 새 걸 올려야 한다.
        update public.user_gym_memberships set is_primary = false
        where user_id = p_user_id and is_primary and apt_id <> p_apt_id;

        update public.user_gym_memberships set is_primary = true
        where user_id = p_user_id and apt_id = p_apt_id;

        update public.users set apt_id = p_apt_id where id = p_user_id;
    end if;

    return jsonb_build_object('user_id', p_user_id, 'apt_id', p_apt_id, 'is_primary', p_make_primary);
end;
$$;

comment on function public.confirm_gym_membership(uuid, uuid, boolean) is
    '이 헬스장을 주 소속으로 바꿀지 결정한다. p_make_primary=false 면 "1회성 방문"으로 그냥 둔다(멤버십은 이미 kiosk_check_in 이 만들어 둔 상태).';

revoke all on function public.confirm_gym_membership(uuid, uuid, boolean) from public;
grant execute on function public.confirm_gym_membership(uuid, uuid, boolean) to anon, authenticated;


-- 프로필 탭에서 "내 헬스장 목록" 보여줄 때 쓴다. 개인 앱 전용이라 authenticated 만
-- 받고, p_user_id 가 본인 것인지 auth.uid() 로 반드시 확인한다(anon 은 아예 거부).

create or replace function public.list_my_gym_memberships(p_user_id uuid)
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
        jsonb_agg(
            jsonb_build_object(
                'apt_id', m.apt_id,
                'apt_name', a.name,
                'is_primary', m.is_primary,
                'visit_count', m.visit_count,
                'first_checked_in_at', m.first_checked_in_at,
                'last_checked_in_at', m.last_checked_in_at
            )
            order by m.is_primary desc, m.last_checked_in_at desc
        ),
        '[]'::jsonb
    )
    from public.user_gym_memberships m
    join public.apartments a on a.id = m.apt_id
    where m.user_id = p_user_id;
end;
$$;

comment on function public.list_my_gym_memberships(uuid) is
    '내가 다닌 헬스장 목록(주 소속 우선, 최근 방문순). 개인 앱 전용, 본인 것만 조회 가능.';

revoke all on function public.list_my_gym_memberships(uuid) from public;
grant execute on function public.list_my_gym_memberships(uuid) to authenticated;
