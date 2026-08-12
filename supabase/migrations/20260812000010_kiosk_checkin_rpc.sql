-- 키오스크 전용 체크인 RPC. sign_in_with_phone 을 대체한다.
--
-- 예전 sign_in_with_phone 은 "번호 입력 = 그 사람으로 로그인"이었고, 그 결과를
-- 태블릿 화면에 그대로 띄웠다(개인 홈 화면). 이제 태블릿은 출입 체크인만 하고
-- 개인 데이터는 절대 보여주지 않는다 — 그래서 이 함수는 이름·전화번호·포인트
-- 같은 걸 하나도 돌려주지 않는다. 돌려주는 건 "몇 번째 방문인지" 숫자와,
-- 폰 앱과 아직 연결이 안 됐으면 QR 페어링 코드뿐이다.
--
-- 예전과 또 다른 점: 번호가 "다른 단지에 등록돼 있으면 거부"하지 않는다. 이사
-- 대응을 위해 한 사람이 여러 단지를 다닐 수 있게 됐기 때문이다. 대신 이미 다른
-- 단지가 주 소속인 사람이 새 단지에서 처음 체크인하면 prompt_gym_switch 를
-- true 로 돌려줘서, 태블릿이 "이 헬스장으로 바꾸시겠어요?"를 물어볼 수 있게 한다.

create or replace function public.kiosk_check_in(
    p_apt_id       uuid,
    p_phone_number text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_phone                     text;
    v_user                      public.users;
    v_membership                public.user_gym_memberships;
    v_is_new_membership         boolean := false;
    v_has_existing_membership   boolean := false;
    v_already_attended_today    boolean;
    v_today                     date := (now() at time zone 'Asia/Seoul')::date;
    v_pairing_code              text;
    v_attempt                   integer;
begin
    v_phone := public.normalize_phone_number(p_phone_number);

    if v_phone !~ '^01[016789][0-9]{7,8}$' then
        raise exception 'INVALID_PHONE_NUMBER' using errcode = '22023';
    end if;

    if p_apt_id is null or not exists (
        select 1 from public.apartments a where a.id = p_apt_id
    ) then
        raise exception 'APARTMENT_NOT_FOUND' using errcode = 'P0002';
    end if;

    select * into v_user from public.users u where u.phone_number = v_phone;

    if not found then
        insert into public.users (apt_id, phone_number) values (p_apt_id, v_phone)
        returning * into v_user;
    end if;

    -- 이 단지 멤버십이 이미 있는지 (재방문인지 새 단지인지)
    select * into v_membership
    from public.user_gym_memberships m
    where m.user_id = v_user.id and m.apt_id = p_apt_id;

    if not found then
        v_is_new_membership := true;
        -- 불변식: 멤버십이 하나라도 있으면 그중 정확히 하나는 is_primary 다
        -- (첫 멤버십은 항상 primary=true 로 생기기 때문). 그래서 "다른 멤버십이
        -- 있는지"만 확인하면 "이미 주 소속이 있는지"를 알 수 있다.
        v_has_existing_membership := exists (
            select 1 from public.user_gym_memberships m where m.user_id = v_user.id
        );

        insert into public.user_gym_memberships (user_id, apt_id, is_primary, visit_count)
        values (v_user.id, p_apt_id, not v_has_existing_membership, 1)
        returning * into v_membership;

        if not v_has_existing_membership then
            update public.users set apt_id = p_apt_id where id = v_user.id;
        end if;
    end if;

    -- 하루/한 헬스장당 출석은 1회만 인정. visit_count 도 이 기준을 따라야 한다 —
    -- 안 그러면 같은 날 실수로 두 번 찍었을 때 방문 횟수가 이중으로 올라간다.
    v_already_attended_today := exists (
        select 1 from public.attendance_logs l
        where l.user_id = v_user.id
          and l.apt_id = p_apt_id
          and (l.attended_at at time zone 'Asia/Seoul')::date = v_today
    );

    if not v_already_attended_today then
        insert into public.attendance_logs (user_id, apt_id) values (v_user.id, p_apt_id);

        -- 방금 새로 만든 멤버십은 이미 visit_count=1 로 시작했으니 여기서 또
        -- 올리지 않는다. 기존 멤버십이었을 때만, 그것도 오늘 처음 온 경우에만 올린다.
        if not v_is_new_membership then
            update public.user_gym_memberships
            set visit_count = visit_count + 1, last_checked_in_at = now()
            where id = v_membership.id
            returning * into v_membership;
        end if;
    end if;

    if v_user.auth_user_id is null then
        for v_attempt in 1..5 loop
            v_pairing_code := lpad(floor(random() * 1000000)::text, 6, '0');
            begin
                insert into public.device_pairings (pairing_code, candidate_user_id, apt_id, expires_at)
                values (v_pairing_code, v_user.id, p_apt_id, now() + interval '3 minutes');
                exit;
            exception when unique_violation then
                if v_attempt = 5 then
                    raise exception 'PAIRING_CODE_GENERATION_FAILED' using errcode = 'P0004';
                end if;
            end;
        end loop;

        return jsonb_build_object(
            'user_id', v_user.id,
            'needs_pairing', true,
            'pairing_code', v_pairing_code,
            'visit_count', v_membership.visit_count,
            'prompt_gym_switch', v_is_new_membership and v_has_existing_membership
        );
    end if;

    return jsonb_build_object(
        'user_id', v_user.id,
        'needs_pairing', false,
        'visit_count', v_membership.visit_count,
        'prompt_gym_switch', v_is_new_membership and v_has_existing_membership
    );
end;
$$;

comment on function public.kiosk_check_in(uuid, text) is
    '태블릿 출입 체크인. 개인정보(이름/포인트/루틴)는 절대 돌려주지 않는다 — user_id, 방문횟수, 페어링 필요 여부뿐.';

revoke all on function public.kiosk_check_in(uuid, text) from public;
grant execute on function public.kiosk_check_in(uuid, text) to anon, authenticated;
