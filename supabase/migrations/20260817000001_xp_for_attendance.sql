-- 출석을 경험치의 최대 원천으로 만든다.
--
-- 포인트(total_points)를 경험치로 재해석해 명예 호칭 7단계(새내기 →
-- 천하장사)를 올라가게 한다. 무게가 아니라 꾸준함이 평가받는 앱이므로,
-- 경험치도 검증 가능한 꾸준함 신호에 가중한다:
--
--   · 체크인(출석):     +30  — 키오스크가 검증하는 가장 정직한 신호
--   · 운동 1개 완료:    +10  — 기존 그대로 (complete_routine)
--   · 한 주 3회째 출석: +50  — 주 단위 보너스. 연속일 스트릭은 4060 에게
--     무리다(쉬는 날이 필요한데 하루 빠지면 깨진다). 주 3회가 기준.
--
-- 하루 1회만 인정되는 기존 규칙(v_already_attended_today) 안쪽에서만 주므로
-- 같은 날 두 번 찍어도 두 번 받지 못한다. 주 보너스는 그 주의 출석일 수가
-- 정확히 3이 되는 순간 한 번만 준다.
--
-- 서버의 현재 정의(pg_get_functiondef, 2026-08-17 확인) 위에 XP 두 줄만
-- 얹었다. 페어링·멤버십·주소속 전환 로직은 그대로다.
--
-- ⚠️ XP 수치(30/10/50)와 호칭 문턱값은 운영 검수 대상.

create or replace function public.kiosk_check_in(p_apt_id uuid, p_phone_number text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
    v_phone                     text;
    v_user                      public.users;
    v_membership                public.user_gym_memberships;
    v_is_new_membership         boolean := false;
    v_has_existing_membership   boolean := false;
    v_already_attended_today    boolean;
    v_prompt_gym_switch         boolean;
    v_today                     date := (now() at time zone 'Asia/Seoul')::date;
    v_pairing_code              text;
    v_attempt                   integer;
    v_week_days                 integer;
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

        -- 출석 경험치. 하루 1회 규칙 안쪽이라 이중 지급이 없다.
        update public.users set total_points = total_points + 30 where id = v_user.id;

        -- 이번 주(월요일 시작) 출석일 수. 방금 넣은 오늘 기록도 포함된다.
        select count(distinct (l.attended_at at time zone 'Asia/Seoul')::date)
        into v_week_days
        from public.attendance_logs l
        where l.user_id = v_user.id
          and (l.attended_at at time zone 'Asia/Seoul')::date >= date_trunc('week', v_today)::date
          and (l.attended_at at time zone 'Asia/Seoul')::date <= v_today;

        -- 정확히 3회째 되는 날에만 — 그래야 한 주에 한 번만 지급된다.
        if v_week_days = 3 then
            update public.users set total_points = total_points + 50 where id = v_user.id;
        end if;

        -- 방금 새로 만든 멤버십은 이미 visit_count=1 로 시작했으니 여기서 또
        -- 올리지 않는다. 기존 멤버십이었을 때만, 그것도 오늘 처음 온 경우에만 올린다.
        if not v_is_new_membership then
            update public.user_gym_memberships
            set visit_count = visit_count + 1, last_checked_in_at = now()
            where id = v_membership.id
            returning * into v_membership;
        end if;
    end if;

    -- 떠났던 헬스장(left_at)에 다시 온 경우도 여기 걸린다. 자동으로 되돌리지
    -- 않고 물어보는 이유는, 옛 헬스장에 하루 들른 것만으로 그 단지 랭킹에
    -- 출석일 전부를 들고 복귀해 버리면 안 되기 때문이다.
    v_prompt_gym_switch :=
        not v_membership.is_primary
        and not v_already_attended_today
        and exists (
            select 1 from public.user_gym_memberships m
            where m.user_id = v_user.id and m.is_primary
        )
        and (
            v_membership.switch_declined_at is null
            or v_membership.switch_declined_at < now() - interval '30 days'
        );

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
            'prompt_gym_switch', v_prompt_gym_switch
        );
    end if;

    return jsonb_build_object(
        'user_id', v_user.id,
        'needs_pairing', false,
        'visit_count', v_membership.visit_count,
        'prompt_gym_switch', v_prompt_gym_switch
    );
end;
$function$;
