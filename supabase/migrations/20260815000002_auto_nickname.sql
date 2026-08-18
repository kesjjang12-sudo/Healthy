-- 가입할 때 겹치지 않는 닉네임을 자동으로 붙여 준다.
--
-- 지금까지는 닉네임이 없으면 랭킹에서 '회원71ec' 처럼 uuid 조각을 보여줬다.
-- 이웃끼리 보는 화면에 기계가 만든 문자열이 뜨니 자기 줄을 못 찾고, 남의
-- 줄과도 구별이 안 됐다. 실제로 110명 중 106명이 그 상태였다.
--
-- 이름은 앱의 말투에 맞춰 골랐다 — 4060 회원이 이웃에게 보여도 무안하지 않고,
-- 억지스럽지 않은 자연·산 이미지다("꾸준한소나무", "든든한바위").
--
-- 실명은 절대 쓰지 않는다. 닉네임은 랭킹에 그대로 노출되는 값이고, 실명은
-- profile_data.real_name 에 따로 둔다(CLAUDE.md 참고).

create table if not exists public.nickname_words (
    kind text not null check (kind in ('modifier', 'noun')),
    word text not null,
    primary key (kind, word)
);

comment on table public.nickname_words is
    '자동 닉네임 재료. modifier(수식어) x noun(명사) 로 조합한다.';

insert into public.nickname_words (kind, word) values
    ('modifier', '든든한'), ('modifier', '꾸준한'), ('modifier', '성실한'),
    ('modifier', '활기찬'), ('modifier', '씩씩한'), ('modifier', '단단한'),
    ('modifier', '부지런한'), ('modifier', '여유로운'), ('modifier', '다정한'),
    ('modifier', '밝은'), ('modifier', '따뜻한'), ('modifier', '강인한'),
    ('modifier', '유쾌한'), ('modifier', '슬기로운'), ('modifier', '정겨운'),
    ('modifier', '늠름한'), ('modifier', '상쾌한'), ('modifier', '굳센'),
    ('modifier', '힘찬'), ('modifier', '산뜻한'), ('modifier', '튼튼한'),
    ('modifier', '새로운'), ('modifier', '한결같은'), ('modifier', '멋진'),
    ('noun', '바위'), ('noun', '소나무'), ('noun', '참나무'),
    ('noun', '대나무'), ('noun', '느티나무'), ('noun', '은행나무'),
    ('noun', '단풍'), ('noun', '새벽'), ('noun', '아침'),
    ('noun', '햇살'), ('noun', '노을'), ('noun', '바람'),
    ('noun', '구름'), ('noun', '파도'), ('noun', '냇물'),
    ('noun', '언덕'), ('noun', '들판'), ('noun', '능선'),
    ('noun', '정상'), ('noun', '오름'), ('noun', '산길'),
    ('noun', '돌담'), ('noun', '오솔길'), ('noun', '등대'),
    ('noun', '나침반'), ('noun', '씨앗'), ('noun', '뿌리'),
    ('noun', '열매'), ('noun', '이슬'), ('noun', '옹달샘')
on conflict do nothing;

-- 재료를 아무나 바꾸면 안 된다(닉네임 품질이 곧 서비스 인상이다).
alter table public.nickname_words enable row level security;
drop policy if exists nickname_words_read on public.nickname_words;
create policy nickname_words_read on public.nickname_words for select using (true);

/**
 * 겹치지 않는 닉네임 하나를 만든다.
 *
 * 수식어 x 명사 = 24 x 30 = 720 가지다. 회원이 늘어 720 가지가 다 차면
 * 뒤에 숫자를 붙여("든든한바위2") 계속 만들 수 있으므로 언젠가 못 만드는
 * 일은 없다. 숫자는 처음부터 붙이지 않는다 — 대부분의 회원은 숫자 없는
 * 깔끔한 이름을 받는다.
 */
create or replace function public.gen_unique_nickname()
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_name  text;
    v_try   integer := 0;
begin
    -- 1단계: 숫자 없는 조합으로 40번 시도한다.
    while v_try < 40 loop
        select m.word || n.word into v_name
        from public.nickname_words m, public.nickname_words n
        where m.kind = 'modifier' and n.kind = 'noun'
        order by random()
        limit 1;

        if not exists (
            select 1 from public.users u
            where u.profile_data ->> 'nickname' = v_name
        ) then
            return v_name;
        end if;
        v_try := v_try + 1;
    end loop;

    -- 2단계: 조합이 거의 다 찼다. 뒤에 숫자를 붙여 빈 자리를 찾는다.
    -- 닉네임 길이 상한이 12자라 숫자까지 넣어도 넘지 않는 조합만 쓴다.
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
            where u.profile_data ->> 'nickname' = v_name
        ) then
            return v_name;
        end if;
    end loop;

    -- 여기까지 왔다는 건 수만 명이 같은 이름을 쓰고 있다는 뜻이다.
    -- 그래도 가입은 막지 않는다.
    return '회원' || substr(md5(random()::text), 1, 4);
end;
$$;

/**
 * 새 회원에게 닉네임을 붙인다.
 *
 * 트리거로 두는 이유: 회원이 만들어지는 길이 여럿이다(카카오·구글 최초
 * 로그인, 전화번호 로그인, 키오스크 첫 체크인, 테스트 계정). 각 함수마다
 * 넣으면 하나를 빠뜨렸을 때 그 경로로 들어온 사람만 조용히 '회원71ec' 가
 * 된다. 한 곳에서 막는다.
 *
 * nickname_changed_at 은 일부러 넣지 않는다. 자동으로 받은 이름은 본인이
 * 고른 게 아니므로, 2주 제한 없이 바로 바꿀 수 있어야 한다.
 */
create or replace function public.set_default_nickname()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
    if nullif(trim(coalesce(new.profile_data ->> 'nickname', '')), '') is null then
        new.profile_data := coalesce(new.profile_data, '{}'::jsonb)
            || jsonb_build_object('nickname', public.gen_unique_nickname());
    end if;
    return new;
end;
$$;

drop trigger if exists users_set_default_nickname on public.users;
create trigger users_set_default_nickname
    before insert on public.users
    for each row execute function public.set_default_nickname();

-- 이미 가입한 분들 중 닉네임이 비어 있는 사람에게도 붙여 준다.
-- 이미 정해 둔 닉네임은 건드리지 않는다.
do $$
declare
    r record;
begin
    for r in
        select id from public.users
        where nullif(trim(coalesce(profile_data ->> 'nickname', '')), '') is null
        order by created_at
    loop
        update public.users
        set profile_data = coalesce(profile_data, '{}'::jsonb)
            || jsonb_build_object('nickname', public.gen_unique_nickname())
        where id = r.id;
    end loop;
end;
$$;
