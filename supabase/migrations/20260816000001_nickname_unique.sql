-- 닉네임을 한 사람만 쓰게 한다.
--
-- 가입할 때 지어 주는 이름은 이미 겹치지 않는데(20260815000002), 직접 바꾸는
-- 쪽은 아무 검사가 없었다. 그래서 이웃이 쓰는 이름을 그대로 적어 넣을 수
-- 있었고, 랭킹에 같은 이름이 둘 나란히 서면 누가 누군지 알 수가 없다.
--
-- 검사만 넣으면 동시에 같은 이름을 보낸 두 요청이 둘 다 통과하는 창이 남아서,
-- 유일 색인으로 막고 검사는 안내 문구를 위해 둔다. 지금 중복이 하나도 없는
-- 것을 확인하고 거는 색인이다.

-- 대소문자만 다른 이름("healthy" / "Healthy")도 같은 이름으로 본다 —
-- 랭킹에서 옆에 놓으면 구별이 안 된다. 앞뒤 공백도 지우고 비교한다.
create unique index if not exists users_nickname_unique_idx
    on public.users ((lower(trim(profile_data ->> 'nickname'))))
    where nullif(trim(coalesce(profile_data ->> 'nickname', '')), '') is not null;

-- 자동 생성 쪽도 같은 기준으로 비교하게 맞춘다. 색인과 기준이 다르면
-- "안 겹친다"고 판단해 만든 이름이 insert 에서 색인에 걸려 가입이 실패한다.
create or replace function public.gen_unique_nickname()
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
    v_name  text;
    v_try   integer := 0;
begin
    while v_try < 40 loop
        select m.word || n.word into v_name
        from public.nickname_words m, public.nickname_words n
        where m.kind = 'modifier' and n.kind = 'noun'
        order by random()
        limit 1;

        if not exists (
            select 1 from public.users u
            where lower(trim(u.profile_data ->> 'nickname')) = lower(trim(v_name))
        ) then
            return v_name;
        end if;
        v_try := v_try + 1;
    end loop;

    for v_try in 2..9999 loop
        select m.word || n.word into v_name
        from public.nickname_words m, public.nickname_words n
        where m.kind = 'modifier' and n.kind = 'noun'
          and char_length(m.word || n.word) + char_length(v_try::text) <= 12
        order by random()
        limit 1;

        v_name := v_name || v_try::text;
        if not exists (
            select 1 from public.users u
            where lower(trim(u.profile_data ->> 'nickname')) = lower(trim(v_name))
        ) then
            return v_name;
        end if;
    end loop;

    -- 여기까지 왔으면 조합이 동난 것이다. 무작위 꼬리를 8자로 늘려 잡는다 —
    -- 4자였을 때는 색인에 걸려 가입 자체가 실패할 여지가 있었다.
    return '회원' || substr(md5(random()::text), 1, 8);
end;
$function$;

-- 서버의 현재 정의(pg_get_functiondef)에 중복 검사만 얹은 것이다.
-- 비속어 필터·2주 제한·테스트 계정 예외는 그대로 둔다.
create or replace function public.update_nickname(p_nickname text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
    v_user       public.users;
    v_norm       text;
    v_is_test    boolean;
    v_changed_at timestamptz;
begin
    if auth.uid() is null then
        raise exception 'AUTH_REQUIRED' using errcode = '42501';
    end if;

    select * into v_user from public.users where auth_user_id = auth.uid();
    if not found then
        raise exception 'USER_NOT_FOUND' using errcode = 'P0002';
    end if;

    p_nickname := trim(coalesce(p_nickname, ''));
    if char_length(p_nickname) < 2 or char_length(p_nickname) > 12 then
        raise exception 'NICKNAME_INVALID' using errcode = '22023';
    end if;

    -- 같은 이름으로 다시 저장하는 건 변경이 아니다 — 2주 창을 소모하지 않는다.
    if p_nickname = coalesce(v_user.profile_data ->> 'nickname', '') then
        return jsonb_build_object('user', to_jsonb(v_user));
    end if;

    -- 공백·문장부호를 끼워 넣는 우회("시.발", "시 발")를 막으려고 한글·영문·
    -- 숫자만 남기고 전부 지운 뒤 부분일치로 찾는다.
    v_norm := lower(regexp_replace(p_nickname, '[^0-9a-zA-Z가-힣ㄱ-ㅎㅏ-ㅣ]', '', 'g'));
    if exists (
        select 1 from public.banned_words w
        where v_norm like '%' || w.word || '%'
    ) then
        raise exception 'NICKNAME_PROFANITY' using errcode = '22023';
    end if;

    -- 이웃이 이미 쓰는 이름은 막는다. 내 행은 빼고 본다 — 대소문자만 바꾸는
    -- 것("healthy" → "Healthy")은 남의 이름을 가져가는 게 아니라서다.
    if exists (
        select 1 from public.users u
        where u.id <> v_user.id
          and lower(trim(u.profile_data ->> 'nickname')) = lower(trim(p_nickname))
    ) then
        raise exception 'NICKNAME_TAKEN' using errcode = '22023';
    end if;

    -- 테스트 계정(익명 세션 + 전화번호 없음)은 2주 제한을 안 받는다.
    -- 전화번호가 붙은 익명 세션은 실제 회원(전화번호 로그인)이므로 제한 대상이다.
    v_is_test := coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
                 and v_user.phone_number is null;

    v_changed_at := nullif(v_user.profile_data ->> 'nickname_changed_at', '')::timestamptz;
    if not v_is_test
       and v_changed_at is not null
       and v_changed_at > now() - interval '14 days' then
        -- 다음 가능 시각을 코드 뒤에 붙여 보낸다. 클라이언트가 "8월 27일부터
        -- 가능합니다"처럼 날짜로 안내할 수 있게.
        raise exception 'NICKNAME_RATE_LIMITED:%',
            to_char((v_changed_at + interval '14 days') at time zone 'utc',
                    'YYYY-MM-DD"T"HH24:MI:SS"Z"')
            using errcode = '22023';
    end if;

    update public.users u
    set profile_data = u.profile_data
        || jsonb_build_object('nickname', p_nickname, 'nickname_changed_at', now())
    where u.id = v_user.id
    returning * into v_user;

    return jsonb_build_object('user', to_jsonb(v_user));

-- 위 검사와 update 사이에 다른 사람이 같은 이름을 채 간 경우. 색인이 막아
-- 주므로 데이터는 안전하고, 여기서는 같은 안내로 바꿔 준다.
exception
    when unique_violation then
        raise exception 'NICKNAME_TAKEN' using errcode = '22023';
end;
$function$;
