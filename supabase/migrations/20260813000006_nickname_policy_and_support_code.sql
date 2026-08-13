-- 닉네임 정책 + 고객대응용 계정번호
--
-- 1) 계정번호(support_code) — 고객대응 때 "회원님 계정번호가 어떻게 되세요?"
--    하고 물을 값. uuid 는 전화로 불러줄 수 없어서 숫자 8자리(0000-0000)로
--    만든다. 난수 + unique 인덱스라 절대 겹치지 않는다.
--
-- 2) 닉네임 변경 규칙 — 2주에 한 번만 바꿀 수 있다(테스트 계정 제외).
--    비속어가 들어간 닉네임은 거부한다. 규칙은 전부 서버(update_nickname)가
--    지킨다 — 클라이언트 검사는 우회할 수 있기 때문이다. 같은 이유로
--    update_profile_data 는 이제 nickname 키를 받지 않는다.

-- ───────────────────────────────────────────────────────────────
-- 1. 계정번호
-- ───────────────────────────────────────────────────────────────

alter table public.users add column if not exists support_code varchar(9);

create unique index if not exists users_support_code_key
    on public.users (support_code);

-- 0000-0000 ~ 9999-9999, 1억 가지. 시니어에게 전화로 불러 달라고 할 값이라
-- 문자 없이 숫자만 쓴다. 겹치면 다시 뽑는다.
create or replace function public.gen_support_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
    v_code text;
begin
    loop
        v_code := lpad(floor(random() * 10000)::text, 4, '0')
                  || '-'
                  || lpad(floor(random() * 10000)::text, 4, '0');
        exit when not exists (select 1 from public.users where support_code = v_code);
    end loop;
    return v_code;
end;
$$;

-- 새 회원은 만들어질 때 자동으로 번호를 받는다.
create or replace function public.set_support_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if new.support_code is null then
        new.support_code := public.gen_support_code();
    end if;
    return new;
end;
$$;

drop trigger if exists users_set_support_code on public.users;
create trigger users_set_support_code
    before insert on public.users
    for each row execute function public.set_support_code();

-- 기존 회원 채우기. 한 문장짜리 update 는 같은 문장 안에서 바뀐 행이 안 보여
-- 이론상 겹칠 수 있으므로, 한 명씩 돌며 뽑는다.
do $$
declare
    v_id uuid;
begin
    for v_id in select id from public.users where support_code is null loop
        update public.users set support_code = public.gen_support_code() where id = v_id;
    end loop;
end;
$$;

-- ───────────────────────────────────────────────────────────────
-- 2. 비속어 목록
-- ───────────────────────────────────────────────────────────────
--
-- 코드에 박지 않고 테이블로 둔다 — 새 우회 표기가 발견될 때마다 배포 없이
-- 한 줄 insert 로 막을 수 있다. RLS 만 켜고 정책은 안 만든다: 목록 자체를
-- 클라이언트에 노출하면 우회 표기를 찾는 힌트가 된다. security definer
-- 함수(update_nickname)만 읽는다.

create table if not exists public.banned_words (
    word text primary key
);

alter table public.banned_words enable row level security;

insert into public.banned_words (word) values
    ('시발'), ('씨발'), ('시빨'), ('씨빨'), ('씌발'), ('ㅅㅂ'), ('ㅆㅂ'), ('ㅆㅃ'),
    ('병신'), ('븅신'), ('빙신'), ('ㅂㅅ'),
    ('지랄'), ('ㅈㄹ'),
    ('새끼'), ('색끼'), ('색기'), ('색히'), ('쉐끼'),
    ('개새'), ('개색'), ('개넘'), ('개년'), ('개놈'),
    ('좆'), ('좃'), ('존나'), ('졸라'), ('ㅈㄴ'),
    ('썅'), ('씹'),
    ('니미'), ('느금'), ('니애미'), ('니애비'), ('애미없'), ('앰창'), ('엠창'),
    ('걸레'), ('창녀'), ('창놈'),
    ('자지'), ('보지'), ('꼬추'), ('불알'), ('후장'),
    ('강간'), ('성폭행'), ('섹스'), ('야동'), ('몸캠'), ('조건만남'),
    ('미친놈'), ('미친년'), ('또라이'), ('돌아이'),
    ('fuck'), ('fck'), ('shit'), ('bitch'), ('asshole'), ('sex')
on conflict (word) do nothing;

-- ───────────────────────────────────────────────────────────────
-- 3. 닉네임 변경 RPC
-- ───────────────────────────────────────────────────────────────

create or replace function public.update_nickname(p_nickname text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
end;
$$;

-- ───────────────────────────────────────────────────────────────
-- 4. update_profile_data 는 이제 닉네임을 받지 않는다
-- ───────────────────────────────────────────────────────────────
--
-- 여기로 nickname 을 보내면 비속어 검사도 2주 제한도 안 거치게 된다.
-- 거부하는 대신 조용히 떼어낸다 — 성별·연령대 등 나머지 키는 그대로
-- 저장돼야 하고, 옛 클라이언트가 nickname 을 섞어 보내도 화면이 죽으면
-- 안 되기 때문이다.

create or replace function public.update_profile_data(p_user_id uuid, p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user public.users;
begin
    if jsonb_typeof(coalesce(p_patch, 'null'::jsonb)) <> 'object' then
        raise exception 'INVALID_PROFILE_PATCH' using errcode = '22023';
    end if;

    p_patch := p_patch - 'nickname' - 'nickname_changed_at';

    update public.users u
    set profile_data = u.profile_data || p_patch
    where u.id = p_user_id
    returning * into v_user;

    if not found then
        raise exception 'USER_NOT_FOUND' using errcode = 'P0002';
    end if;

    return to_jsonb(v_user);
end;
$$;
