-- 태블릿에 안 가고도 헬스장에 소속될 수 있게 한다.
--
-- 증상: 테스트 계정으로 로그인하면 운동 루틴이 하나도 안 뜬다.
--
-- 원인. generate_daily_routine 은 기구를 이렇게 고른다.
--
--     from public.equipments e where e.apt_id = v_target_apt_id
--
-- v_target_apt_id 는 coalesce(p_apt_id, v_user.apt_id) 인데, 지금 users.apt_id 를
-- 채워 주는 곳은 kiosk_check_in 하나뿐이다. bootstrap_oauth_profile 은
-- auth_user_id 만 넣고 만든다(insert into users (auth_user_id)). 그래서 태블릿을
-- 한 번도 안 거친 계정 — 익명 테스트 계정, 그리고 집에서 막 가입한 카카오/구글/
-- 전화번호 회원 — 은 apt_id 가 null 이라 기구가 0건으로 잡히고, 루틴도 0개가 된다.
-- 화면에는 "오늘의 운동 0가지"만 떠서 왜 비었는지 알 수가 없다.
--
-- confirm_gym_membership 으로는 못 고친다. 그 함수는 멤버십이 이미 있어야
-- 동작하고(MEMBERSHIP_NOT_FOUND), 멤버십을 만드는 것도 kiosk_check_in 뿐이라
-- 닭과 달걀이 된다.
--
-- 그래서 "지금 로그인한 사람을 이 단지에 넣는다"만 하는 함수를 하나 둔다.
--
-- 보안 관점: p_user_id 를 받지 않는다. 대상은 언제나 auth.uid() 에 연결된 본인
-- 이므로 남의 소속을 건드릴 방법이 없다. anon 에는 열지 않는다 — 로그인한
-- 사람만 자기 계정에 쓸 수 있다. 출석(attendance_logs)은 만들지 않는다.
-- 출석은 "실제로 왔다"는 기록이고 랭킹의 근거라, 집에서 누른 것으로 올라가면
-- 안 된다. 여기서 만드는 건 소속뿐이다.

create or replace function public.join_gym(p_apt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user                    public.users;
    v_has_existing_membership boolean;
begin
    if auth.uid() is null then
        raise exception 'AUTH_REQUIRED' using errcode = '42501';
    end if;

    if p_apt_id is null or not exists (
        select 1 from public.apartments a where a.id = p_apt_id
    ) then
        raise exception 'APARTMENT_NOT_FOUND' using errcode = 'P0002';
    end if;

    select * into v_user from public.users u where u.auth_user_id = auth.uid();

    if not found then
        raise exception 'USER_NOT_FOUND' using errcode = 'P0002';
    end if;

    -- 불변식: 멤버십이 하나라도 있으면 그중 정확히 하나가 is_primary 다.
    -- kiosk_check_in 과 같은 규칙을 쓴다 — 첫 멤버십만 primary 로 만든다.
    v_has_existing_membership := exists (
        select 1 from public.user_gym_memberships m where m.user_id = v_user.id
    );

    -- visit_count 는 0 으로 시작한다. kiosk_check_in 은 1 로 시작하지만 그건
    -- "지금 왔다"는 뜻이고, 여기는 아직 온 적이 없다.
    insert into public.user_gym_memberships (user_id, apt_id, is_primary, visit_count)
    values (v_user.id, p_apt_id, not v_has_existing_membership, 0)
    on conflict (user_id, apt_id) do nothing;

    -- 주 소속이 아직 없으면 이 단지로 잡아 준다. 이미 있으면 건드리지 않는다 —
    -- 소속을 바꾸는 건 confirm_gym_membership 의 일이다.
    if not v_has_existing_membership then
        update public.users set apt_id = p_apt_id where id = v_user.id;
        v_user.apt_id := p_apt_id;
    end if;

    return jsonb_build_object(
        'user_id', v_user.id,
        'apt_id', v_user.apt_id,
        'is_primary', not v_has_existing_membership
    );
end;
$$;

comment on function public.join_gym(uuid) is
    '지금 로그인한 사람을 이 단지 헬스장에 소속시킨다. 태블릿을 못 거친 계정(테스트/카카오/구글)이 루틴을 받을 수 있게 하는 용도. 출석은 만들지 않는다.';

revoke all on function public.join_gym(uuid) from public;
grant execute on function public.join_gym(uuid) to authenticated;
