-- 전화번호 문자(SMS OTP) 로그인을 프로필에 잇는다.
--
-- 발송 경로(supabase/functions/send-sms)가 생기면서 signInWithOtp({ phone }) 로
-- 진짜 로그인이 가능해졌다. 그런데 bootstrap_oauth_profile 은 auth.uid() 만 보고
-- 프로필을 만들기 때문에, 키오스크에서 번호로 다니던 사람이 문자 인증으로
-- 로그인하면 방문 이력이 있는 그림자 계정 대신 "빈 프로필"이 새로 생겨 버린다.
--
-- 고침: 이 세션의 auth 사용자에게 검증된 전화번호가 있으면(문자 인증 로그인),
-- 그 번호로 만들어져 있던 users 행을 찾아 잇는다. 신뢰 근거는 QR 페어링(물리적
-- 근접)보다 강한 "지금 그 번호의 문자를 받을 수 있음"이다.
--
-- 분기별 판단:
--   (a) 그 번호의 행이 없다        → 번호가 채워진 프로필을 새로 만든다
--   (b) 있는데 auth 연결이 없다    → 키오스크 그림자 계정. 그대로 잇는다
--   (c) 익명(anonymous) auth 에 연결돼 있다
--       → 갈아끼운다. 익명 세션은 자격 증명이 없어 앱을 지우면 그 계정으로
--         다시 로그인할 방법이 없다(20260812000022 의 재설치 복구와 같은 논리).
--         살아 있는 폰이 있더라도, 문자 인증이 소유 증명으로 더 강하다.
--   (d) 카카오/구글 auth 에 연결돼 있다
--       → 뺏지 않는다. 그 계정의 로그인 수단이 멀쩡히 살아 있으므로 여기서
--         연결을 옮기면 카카오로 다시 로그인했을 때 계정이 두 쪽 난다.
--         PHONE_ALREADY_LINKED 를 던져 "카카오/구글로 로그인하세요"를 안내한다.

create or replace function public.bootstrap_oauth_profile()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user                 public.users;
    v_phone                text;
    v_claimed              public.users;
    v_linked_is_anonymous  boolean;
begin
    if auth.uid() is null then
        raise exception 'AUTH_REQUIRED' using errcode = '42501';
    end if;

    -- 이 세션의 검증된 전화번호. GoTrue 는 '+' 없는 E.164(821012345678)로 저장하므로
    -- DB 저장 포맷(01012345678)으로 되돌린다. 국내 휴대폰이 아니면 없는 셈 친다.
    select public.normalize_phone_number(u.phone) into v_phone
        from auth.users u where u.id = auth.uid();
    if v_phone like '82%' then
        v_phone := '0' || substring(v_phone from 3);
    end if;
    if v_phone !~ '^01[016789][0-9]{7,8}$' then
        v_phone := null;
    end if;

    select * into v_user from public.users where auth_user_id = auth.uid();

    if found then
        -- 재로그인. 프로필에 번호가 아직 없는데 세션이 번호를 증명했다면 채워
        -- 준다(그 번호를 이미 쓰는 행이 있으면 병합 문제라 페어링 쪽에 맡긴다).
        if v_user.phone_number is null and v_phone is not null
           and not exists (select 1 from public.users where phone_number = v_phone)
        then
            update public.users set phone_number = v_phone where id = v_user.id
            returning * into v_user;
        end if;
        return jsonb_build_object('user', to_jsonb(v_user));
    end if;

    if v_phone is not null then
        select * into v_claimed from public.users where phone_number = v_phone;

        if found then
            if v_claimed.auth_user_id is not null then
                select coalesce(u.is_anonymous, false) into v_linked_is_anonymous
                    from auth.users u where u.id = v_claimed.auth_user_id;

                -- (d) 카카오/구글이 살아 있는 계정. auth 행이 지워진 경우(null)는
                -- 어차피 아무도 그 연결로 못 들어오니 익명과 같게 취급한다.
                if not coalesce(v_linked_is_anonymous, true) then
                    raise exception 'PHONE_ALREADY_LINKED' using errcode = 'P0007';
                end if;
            end if;

            -- (b)(c) 그림자 계정이거나 죽은/익명 연결 → 이 세션으로 잇는다.
            update public.users set auth_user_id = auth.uid() where id = v_claimed.id
            returning * into v_user;
            return jsonb_build_object('user', to_jsonb(v_user));
        end if;

        -- (a) 처음 보는 번호 → 번호가 채워진 프로필로 시작한다.
        insert into public.users (auth_user_id, phone_number) values (auth.uid(), v_phone)
        returning * into v_user;
        return jsonb_build_object('user', to_jsonb(v_user));
    end if;

    -- 번호 없는 로그인(카카오/구글/익명). 기존 동작 그대로.
    insert into public.users (auth_user_id) values (auth.uid()) returning * into v_user;
    return jsonb_build_object('user', to_jsonb(v_user));
end;
$$;

comment on function public.bootstrap_oauth_profile() is
    '로그인 직후 호출. 세션에 검증된 전화번호가 있으면(문자 인증) 그 번호의 기존 계정을 잇고, 카카오/구글에 이미 연결된 번호면 PHONE_ALREADY_LINKED 를 던진다.';

revoke all on function public.bootstrap_oauth_profile() from public;
grant execute on function public.bootstrap_oauth_profile() to authenticated;
