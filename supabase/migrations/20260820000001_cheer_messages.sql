-- 응원을 이모지 하나에서 "한 줄 글"로 넓힌다.
--
-- 같은 단지 사람끼리 서로 보는 게시판이다. 다만 자유게시판은 아니다 —
-- 관리·신고·삭제가 필요한 물건은 지금 감당할 수 없고, 40~60대 이웃끼리
-- 얼굴 아는 사이에서 싸움이 나면 헬스장 자체가 불편해진다. 그래서 구조로
-- 막는다:
--
--   · 하루 한 사람 한 줄 (apartment_cheers 의 unique 그대로)
--   · 60자 제한 — 긴 글은 논쟁이 되고, 짧은 글은 응원이 된다
--   · 닉네임만 보인다 (실명·전화번호 없음)
--   · 비속어는 닉네임과 같은 사전(banned_words)으로 막는다
--   · 답글·좋아요 없음. 주고받기가 시작되면 그때부터 관리가 필요해진다
--
-- 이번 주 글만 보여준다. 지난 글이 쌓여 "게시판"이 되는 걸 막고, 매주
-- 새로 시작하는 느낌을 준다.

alter table public.apartment_cheers
    add column if not exists message text;

alter table public.apartment_cheers
    drop constraint if exists apartment_cheers_message_len;
alter table public.apartment_cheers
    add constraint apartment_cheers_message_len
    check (message is null or char_length(btrim(message)) between 1 and 60);

-- 이모지는 이제 응원 종류가 아니라 "글에 붙는 표정"이다. 기본값을 둬서
-- 글만 쓰고 이모지를 안 고르는 경우를 받는다.
alter table public.apartment_cheers
    alter column emoji set default '💪';

comment on column public.apartment_cheers.message is
    '이웃에게 남기는 응원 한 줄(최대 60자). 비어 있으면 이모지만 남긴 것.';

/**
 * 경험치 -> 호칭 단계. 앱의 GROWTH_LEVELS(features/growth/levels.ts)와 같은 표다.
 * 응원 목록에 호칭 배지를 붙이려고 서버 쪽에도 둔다.
 */
create or replace function public.growth_level_index(p_xp integer)
returns integer
language sql
immutable
as $$
    select case
        when p_xp >= 30000 then 6
        when p_xp >= 15000 then 5
        when p_xp >= 7000  then 4
        when p_xp >= 3000  then 3
        when p_xp >= 1000  then 2
        when p_xp >= 300   then 1
        else 0
    end;
$$;

/**
 * 오늘의 응원 글 남기기. 하루 한 줄, 다시 부르면 내 글을 고친다.
 * 반환값은 이번 주 글 목록 — 앱이 다시 조회하지 않고 바로 그린다.
 */
create or replace function public.post_cheer(p_apt_id uuid, p_message text, p_emoji text default '💪')
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_me uuid;
    v_today date := (now() at time zone 'Asia/Seoul')::date;
    v_text text := btrim(coalesce(p_message, ''));
    v_norm text;
begin
    if auth.uid() is null then
        raise exception 'AUTH_REQUIRED' using errcode = '42501';
    end if;

    select id into v_me from public.users where auth_user_id = auth.uid();

    if not exists (
        select 1 from public.user_gym_memberships m
        where m.user_id = v_me and m.apt_id = p_apt_id and m.left_at is null
    ) then
        raise exception 'NOT_A_MEMBER' using errcode = '42501';
    end if;

    if char_length(v_text) = 0 then
        raise exception 'CHEER_EMPTY' using errcode = '22023';
    end if;
    if char_length(v_text) > 60 then
        raise exception 'CHEER_TOO_LONG' using errcode = '22023';
    end if;

    -- 닉네임과 같은 사전·같은 방식. 공백·문장부호를 끼워 넣는 우회를 막으려고
    -- 한글·영문·숫자만 남기고 부분일치로 본다.
    v_norm := lower(regexp_replace(v_text, '[^0-9a-zA-Z가-힣ㄱ-ㅎㅏ-ㅣ]', '', 'g'));
    if exists (
        select 1 from public.banned_words w
        where v_norm like '%' || w.word || '%'
    ) then
        raise exception 'CHEER_PROFANITY' using errcode = '22023';
    end if;

    insert into public.apartment_cheers (apt_id, user_id, emoji, message, cheered_on)
    values (p_apt_id, v_me, coalesce(p_emoji, '💪'), v_text, v_today)
    on conflict (apt_id, user_id, cheered_on)
    do update set message = excluded.message, emoji = excluded.emoji, created_at = now();

    return public.get_apartment_cheers(p_apt_id);
end;
$$;

/** 내 글 지우기. 오늘 쓴 것만 지울 수 있다. */
create or replace function public.delete_my_cheer(p_apt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_me uuid;
    v_today date := (now() at time zone 'Asia/Seoul')::date;
begin
    if auth.uid() is null then
        raise exception 'AUTH_REQUIRED' using errcode = '42501';
    end if;

    select id into v_me from public.users where auth_user_id = auth.uid();

    delete from public.apartment_cheers
     where apt_id = p_apt_id and user_id = v_me and cheered_on = v_today;

    return public.get_apartment_cheers(p_apt_id);
end;
$$;

/**
 * 이번 주 응원 글. 최신순.
 *
 * 닉네임만 나간다 — 실명(profile_data.real_name)은 절대 여기 실리지 않는다.
 */
create or replace function public.get_apartment_cheers(p_apt_id uuid, p_limit integer default 50)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_me uuid;
    v_today date := (now() at time zone 'Asia/Seoul')::date;
    v_week_start date := date_trunc('week', (now() at time zone 'Asia/Seoul'))::date;
    v_posts jsonb;
    v_mine jsonb;
begin
    if auth.uid() is null then
        raise exception 'AUTH_REQUIRED' using errcode = '42501';
    end if;

    select id into v_me from public.users where auth_user_id = auth.uid();

    select coalesce(jsonb_agg(p order by p->>'created_at' desc), '[]'::jsonb)
      into v_posts
      from (
          select jsonb_build_object(
                     'id', c.id,
                     'nickname', coalesce(u.profile_data->>'nickname', '회원' || right(u.id::text, 4)),
                     'level_index', public.growth_level_index(coalesce(u.total_points, 0)),
                     'message', c.message,
                     'emoji', c.emoji,
                     'cheered_on', c.cheered_on,
                     'created_at', c.created_at,
                     'is_me', c.user_id = v_me
                 ) as p
          from public.apartment_cheers c
          join public.users u on u.id = c.user_id
          where c.apt_id = p_apt_id
            and c.cheered_on >= v_week_start
            and c.message is not null
          order by c.created_at desc
          limit p_limit
      ) s;

    select to_jsonb(c.message) into v_mine
      from public.apartment_cheers c
     where c.apt_id = p_apt_id and c.user_id = v_me and c.cheered_on = v_today;

    return jsonb_build_object(
        'posts', v_posts,
        'my_message', coalesce(v_mine, 'null'::jsonb)
    );
end;
$$;
