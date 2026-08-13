-- SMS 인증으로 로그인했을 때 원래 쓰던 계정을 찾아 준다.
--
-- 이게 없으면 문자 인증 로그인은 "로그인"이 아니라 매번 새 가입이 된다.
--
-- bootstrap_oauth_profile 은 users 를 auth_user_id 로만 찾는다. 그런데 문자
-- 인증은 GoTrue 계정을 새로 만들므로 auth.uid() 가 예전과 다르다. 그래서
-- 번호가 같아도 못 찾고 빈 프로필을 하나 더 만든다 — 사용자 입장에서는
-- 인증까지 다 했는데 기록이 전부 사라진 것으로 보인다. QR 페어링으로
-- 만들어 둔 계정(전화번호가 들어 있는 그 계정)이 그대로 고아가 된다.
--
-- 그래서 "JWT 에 검증된 전화번호가 있으면 그 번호의 계정을 내 것으로 잇는다"를
-- 넣는다.
--
-- 보안 관점: 여기서 믿는 건 클라이언트가 보낸 값이 아니라 GoTrue 가 발급한
-- JWT 의 phone 클레임이다. 그 값은 실제로 그 번호로 간 문자를 받아 인증을
-- 통과해야만 채워진다. 예전에 지운 sign_in_with_phone("번호만 알면 로그인")과
-- 다른 지점이 정확히 여기다 — 번호를 아는 것으로는 부족하고, 그 번호를 지금
-- 들고 있어야 한다.


-- E.164(+821012345678) → 저장 포맷(01012345678).
-- normalize_phone_number 는 숫자만 남기므로 +82 가 82 로 남는다. 국가번호를
-- 0 으로 되돌리는 건 이 함수가 맡는다.
create or replace function public.local_phone_from_e164(p_phone text)
returns text
language sql
immutable
as $$
    select case
        when s.digits like '82%' then '0' || substring(s.digits from 3)
        else s.digits
    end
    from (select public.normalize_phone_number(p_phone) as digits) s;
$$;

comment on function public.local_phone_from_e164(text) is
    'GoTrue 의 E.164 전화번호를 이 저장소의 저장 포맷(01012345678)으로 바꾼다.';

revoke all on function public.local_phone_from_e164(text) from public;


create or replace function public.bootstrap_oauth_profile()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user  public.users;
    v_phone text;
begin
    if auth.uid() is null then
        raise exception 'AUTH_REQUIRED' using errcode = '42501';
    end if;

    select * into v_user from public.users where auth_user_id = auth.uid();

    if found then
        return jsonb_build_object('user', to_jsonb(v_user));
    end if;

    -- 이 auth 신원으로는 처음이다. 문자 인증으로 들어온 거라면 번호로 기존
    -- 계정을 찾아본다. 카카오/구글/익명은 phone 클레임이 없어 그냥 건너뛴다.
    v_phone := public.local_phone_from_e164(nullif(auth.jwt() ->> 'phone', ''));

    if v_phone is not null and v_phone <> '' then
        select * into v_user from public.users u where u.phone_number = v_phone;

        if found then
            -- 예전 auth 연결(앱을 지워 못 쓰게 된 익명 계정 등)을 새 것으로
            -- 갈아끼운다. complete_pairing 이 재연결에서 하는 것과 같은 처리다.
            update public.users set auth_user_id = auth.uid() where id = v_user.id
            returning * into v_user;

            return jsonb_build_object('user', to_jsonb(v_user));
        end if;
    end if;

    -- 정말 처음 보는 사람이다. 번호를 아는 경우(문자 인증) 같이 넣어 둔다 —
    -- 나중에 태블릿에서 같은 번호로 체크인해도 계정이 갈라지지 않는다.
    insert into public.users (auth_user_id, phone_number)
    values (auth.uid(), nullif(v_phone, ''))
    returning * into v_user;

    return jsonb_build_object('user', to_jsonb(v_user));
end;
$$;

comment on function public.bootstrap_oauth_profile() is
    '로그인 직후 호출. auth_user_id 로 찾고, 없으면 JWT 의 검증된 전화번호로 기존 계정을 찾아 잇는다. 그래도 없으면 새로 만든다.';

revoke all on function public.bootstrap_oauth_profile() from public;
grant execute on function public.bootstrap_oauth_profile() to authenticated;
