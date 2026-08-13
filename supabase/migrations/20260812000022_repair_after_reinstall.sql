-- 폰 앱을 지웠다 깔면 계정에 영영 못 돌아가는 문제를 고친다.
--
-- 증상(실제 보고): "전화번호로 QR 등록한 사람이 데이터 삭제하고 다시 들어가면
-- QR 또 찍으라고 함 / 관리자 태블릿엔 2번째 방문이시네요 뜨고 / 연동이 안 됨".
--
-- 원인은 두 가지가 겹친 것이다.
--
-- (1) 익명 세션은 자격 증명이 없다. 전화번호 로그인 사용자의 신원은
--     signInAnonymously 로 만든 GoTrue 계정 하나뿐이고, 그 리프레시 토큰은
--     폰 저장소에만 있다. 앱 데이터를 지우면 그 계정으로 다시 로그인할
--     방법이 세상에 없다 — 비밀번호도 이메일도 없으니까.
-- (2) 그런데 users.auth_user_id 에는 그 죽은 계정이 그대로 남아 있고,
--     kiosk_check_in 은 auth_user_id 가 있으면 페어링 코드를 안 준다.
--     그래서 폰은 "QR 찍으세요"라고 하는데 태블릿은 QR 을 안 띄운다.
--     결과적으로 사용자는 자기 계정에 영구히 잠긴다.
--
-- 데이터 자체는 서버에 멀쩡히 있다(그래서 "2번째 방문"이 뜬다). 잃는 건
-- 데이터가 아니라 "이 폰이 그 계정"이라는 연결뿐이다. 그러니 연결을 다시
-- 맺을 길만 열어주면 된다.
--
-- 보안 관점: 페어링 코드를 항상 발급해도 위협 수준은 그대로다. 이미 최초
-- 연결에서 "헬스장에 물리적으로 와서 + 번호를 알고 + 3분 안에 스캔"을 신뢰
-- 근거로 삼고 있고, 재연결도 똑같은 문턱을 넘어야 한다. 원격에서 번호만
-- 알아서는 아무것도 못 한다.


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

    -- 페어링 코드는 이제 "아직 연결 안 된 사람"뿐 아니라 항상 발급한다.
    --
    -- 예전에는 auth_user_id 가 비어 있을 때만 만들었다. 그러면 폰을 바꾸거나
    -- 앱을 지운 사람은 태블릿이 QR 을 안 띄워서 계정에 영영 못 돌아온다
    -- (익명 세션은 자격 증명이 없어 그 계정으로 다시 로그인할 방법이 없다).
    -- 코드를 만들어 두는 것 자체는 부작용이 없다 — 3분 뒤 만료되고, 실제로
    -- 스캔해야만 소비된다.
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
        -- 아직 한 번도 폰을 연결한 적 없는 사람. 태블릿이 QR 화면으로 바로 보낸다.
        -- 이미 연결된 사람에게는 체크인 완료 화면에서 "다시 연결" 선택지로만 보여준다.
        'needs_pairing', v_user.auth_user_id is null,
        'pairing_code', v_pairing_code,
        'visit_count', v_membership.visit_count,
        'prompt_gym_switch', v_is_new_membership and v_has_existing_membership
    );
end;
$$;

comment on function public.kiosk_check_in(uuid, text) is
    '태블릿 체크인. 개인정보는 안 돌려준다. 페어링 코드는 항상 발급해서, 폰을 바꾸거나 앱을 지운 사람도 다시 연결할 수 있게 한다.';

revoke all on function public.kiosk_check_in(uuid, text) from public;
grant execute on function public.kiosk_check_in(uuid, text) to anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 재연결 시 기록이 사라지던 문제도 같이 고친다.
--
-- 앱을 다시 깔면 폰은 새 익명 계정을 만들고, 앱이 켜지는 순간
-- bootstrap_oauth_profile 이 그 계정으로 "빈 users 행"을 하나 만든다.
-- 그 상태로 QR 을 찍으면 complete_pairing 이 병합 분기를 타는데, 병합은
-- "먼저 있던 쪽(v_existing)이 살아남는다"는 규칙이라 방금 만들어진 빈 행이
-- 살아남고 진짜 계정이 흡수돼 버린다. 출석·루틴은 옮겨지지만 포인트와
-- 설문 답변(profile_data)은 옮기는 코드가 없어서 그대로 증발한다.
--
-- 해결: 살아남을 행을 "먼저 있던 쪽"이 아니라 "실체가 있는 쪽"으로 고른다.
-- 방금 부팅하며 만들어진 껍데기 행이면 그걸 버리고 원래 계정에 새 auth 를
-- 붙인다. 진짜 카카오 계정이 그림자 계정을 흡수하는 원래 시나리오는
-- 그대로 두되, 거기서도 포인트·설문이 비어 있으면 물려받게 했다.
-- ─────────────────────────────────────────────────────────────

create or replace function public.complete_pairing(p_pairing_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_pairing                    public.device_pairings;
    v_candidate                  public.users;
    v_existing                   public.users;
    v_membership                 public.user_gym_memberships%rowtype;
    v_candidate_primary_apt_id   uuid;
    v_candidate_phone            varchar(20);
    v_existing_is_placeholder    boolean;
    v_final_user                 public.users;
begin
    if auth.uid() is null then
        raise exception 'AUTH_REQUIRED' using errcode = '42501';
    end if;

    select * into v_pairing from public.device_pairings where pairing_code = p_pairing_code;

    if not found then
        raise exception 'PAIRING_NOT_FOUND' using errcode = 'P0002';
    end if;
    if v_pairing.consumed_at is not null then
        raise exception 'PAIRING_ALREADY_USED' using errcode = 'P0005';
    end if;
    if v_pairing.expires_at < now() then
        raise exception 'PAIRING_EXPIRED' using errcode = 'P0006';
    end if;

    select * into v_candidate from public.users where id = v_pairing.candidate_user_id;

    if v_candidate is null then
        raise exception 'PAIRING_NOT_FOUND' using errcode = 'P0002';
    end if;

    select * into v_existing from public.users where auth_user_id = auth.uid();

    if v_existing is null then
        -- 이 폰에 아직 프로필이 없다. 후보 계정에 그대로 붙인다.
        -- 후보가 다른 auth 에 물려 있었다면(폰을 지웠다 다시 깐 경우) 그 죽은
        -- 연결을 새 것으로 갈아끼운다 — 어차피 그 익명 계정으로는 아무도 다시
        -- 로그인할 수 없다.
        update public.users set auth_user_id = auth.uid() where id = v_candidate.id
        returning * into v_final_user;

    elsif v_existing.id = v_candidate.id then
        -- 이미 페어링된 코드를 다시 스캔한 경우. no-op.
        v_final_user := v_existing;

    else
        -- 앱을 다시 깔면서 부팅 때 만들어진 껍데기인지 본다. 전화번호도 없고
        -- 설문도 안 했고 포인트도 없고 다닌 헬스장도 없으면 버려도 되는 행이다.
        v_existing_is_placeholder :=
            v_existing.phone_number is null
            and coalesce(v_existing.total_points, 0) = 0
            and (v_existing.profile_data->>'onboarded_at') is null
            and not exists (
                select 1 from public.user_gym_memberships where user_id = v_existing.id
            );

        if v_existing_is_placeholder then
            -- 껍데기를 지우고 진짜 계정에 이 폰을 연결한다. 포인트·설문·출석이
            -- 전부 원래 자리에 그대로 남으므로 옮길 것이 없다.
            delete from public.users where id = v_existing.id;

            update public.users set auth_user_id = auth.uid() where id = v_candidate.id
            returning * into v_final_user;
        else
            -- 원래의 병합 시나리오: 카카오/구글로 쓰던 진짜 계정(v_existing)이
            -- 키오스크가 번호로 만든 그림자 계정(v_candidate)을 흡수한다.
            v_candidate_phone := v_candidate.phone_number;

            select apt_id into v_candidate_primary_apt_id
                from public.user_gym_memberships
                where user_id = v_candidate.id and is_primary;

            for v_membership in
                select * from public.user_gym_memberships where user_id = v_candidate.id
            loop
                if exists (
                    select 1 from public.user_gym_memberships
                    where user_id = v_existing.id and apt_id = v_membership.apt_id
                ) then
                    update public.user_gym_memberships
                    set visit_count = visit_count + v_membership.visit_count,
                        first_checked_in_at = least(first_checked_in_at, v_membership.first_checked_in_at),
                        last_checked_in_at = greatest(last_checked_in_at, v_membership.last_checked_in_at)
                    where user_id = v_existing.id and apt_id = v_membership.apt_id;

                    delete from public.user_gym_memberships where id = v_membership.id;
                else
                    update public.user_gym_memberships
                    set user_id = v_existing.id, is_primary = false
                    where id = v_membership.id;
                end if;
            end loop;

            if v_candidate_primary_apt_id is not null
               and not exists (
                   select 1 from public.user_gym_memberships where user_id = v_existing.id and is_primary
               )
            then
                update public.user_gym_memberships set is_primary = true
                    where user_id = v_existing.id and apt_id = v_candidate_primary_apt_id;
                update public.users set apt_id = v_candidate_primary_apt_id where id = v_existing.id;
            end if;

            update public.attendance_logs set user_id = v_existing.id where user_id = v_candidate.id;

            delete from public.daily_routines d
            where d.user_id = v_candidate.id
              and exists (
                  select 1 from public.daily_routines d2
                  where d2.user_id = v_existing.id
                    and d2.equip_id = d.equip_id
                    and d2.routine_date = d.routine_date
              );
            update public.daily_routines set user_id = v_existing.id where user_id = v_candidate.id;

            -- 포인트는 두 쪽을 합친다. 예전엔 아예 옮기지 않아서 그림자 계정에
            -- 쌓인 포인트가 병합될 때마다 사라졌다.
            update public.users
            set total_points = coalesce(total_points, 0) + coalesce(v_candidate.total_points, 0)
            where id = v_existing.id;

            -- 설문을 아직 안 한 계정이면 그림자 쪽 답변을 물려받는다.
            -- 이미 답한 계정의 답을 덮어쓰지는 않는다.
            if (v_existing.profile_data->>'onboarded_at') is null
               and (v_candidate.profile_data->>'onboarded_at') is not null
            then
                update public.users set profile_data = v_candidate.profile_data
                where id = v_existing.id;
            end if;

            delete from public.users where id = v_candidate.id;

            if v_existing.phone_number is null then
                update public.users set phone_number = v_candidate_phone where id = v_existing.id;
            end if;

            select * into v_final_user from public.users where id = v_existing.id;
        end if;
    end if;

    update public.device_pairings
    set consumed_at = now(), consumed_by_auth_user_id = auth.uid()
    where id = v_pairing.id;

    return jsonb_build_object('user', to_jsonb(v_final_user));
end;
$$;

comment on function public.complete_pairing(text) is
    'QR/코드 페어링 완료. 앱 재설치로 생긴 빈 계정은 버리고 원래 계정에 다시 연결한다. 진짜 계정끼리 합칠 때는 포인트를 더하고 설문 답변도 물려받는다.';

revoke all on function public.complete_pairing(text) from public;
grant execute on function public.complete_pairing(text) to authenticated;
