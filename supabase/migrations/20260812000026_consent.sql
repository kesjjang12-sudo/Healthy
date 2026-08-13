-- 개인정보 수집·이용 동의를 기록한다.
--
-- 약관 문서만 앱에 띄워 두는 것으로는 부족하다. 개인정보 보호법은 동의를 받았다는
-- 사실을 개인정보처리자가 입증하도록 하고 있어서(제16조제4항 등), "누가 · 언제 ·
-- 어느 버전 문서에 · 어떤 항목을" 동의했는지가 남아야 한다. 화면에 체크박스만
-- 그리고 아무 데도 안 적으면 동의를 안 받은 것과 증명력이 같다.
--
-- 이 테이블은 **추가만 하는 기록(append-only)** 이다. 동의도 한 줄, 철회도 한 줄로
-- 쌓고 지우지 않는다. 지금 상태는 (user_id, consent_key) 별 가장 최근 줄이다.
-- 덮어쓰기로 관리하면 "예전에 동의했다가 철회했다"는 이력이 사라져, 나중에 그
-- 기간의 처리가 정당했는지 설명할 수 없다.

create table if not exists public.user_consents (
    id           uuid primary key default uuid_generate_v4(),
    -- 어느 줄이 더 나중인지 가리는 기준.
    --
    -- recorded_at 으로 정렬하면 안 된다: now() 는 트랜잭션 시작 시각이라 한
    -- 트랜잭션에서 동의와 철회가 같이 일어나면 두 줄의 시각이 완전히 같아지고,
    -- 그러면 "지금 상태"가 뒤집힐 수 있다. 순번은 그런 경우에도 어긋나지 않는다.
    seq          bigint generated always as identity,
    user_id      uuid not null references public.users(id) on delete cascade,
    -- src/features/legal/consent-items.ts 의 ConsentKey 와 같은 값
    consent_key  text not null,
    -- 그때 보여준 문서/항목 구성의 버전. 문서를 고치면 올리고 다시 받는다
    version      text not null,
    agreed       boolean not null,
    -- 'app'(개인 폰) 또는 'kiosk'(공용 태블릿)
    source       text not null default 'app',
    recorded_at  timestamptz not null default now()
);

comment on table public.user_consents is
    '동의·철회 이력. 추가만 하고 지우지 않는다 — 지금 상태는 (user_id, consent_key) 별 최신 줄.';

create index if not exists user_consents_lookup_idx
    on public.user_consents (user_id, consent_key, seq desc);

-- 다른 개인 데이터 테이블과 같은 방침: 정책을 아예 두지 않아 deny-by-default 로
-- 막고, 접근은 아래 security definer RPC 로만 연다.
alter table public.user_consents enable row level security;


-- ─────────────────────────────────────────────────────────────
-- 지금 유효한 동의 상태
-- ─────────────────────────────────────────────────────────────

create or replace function public.get_my_consents(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_owner_auth_id uuid;
begin
    if auth.uid() is null then
        raise exception 'AUTH_REQUIRED' using errcode = '42501';
    end if;

    select auth_user_id into v_owner_auth_id from public.users where id = p_user_id;
    if not found or v_owner_auth_id is distinct from auth.uid() then
        raise exception 'FORBIDDEN' using errcode = '42501';
    end if;

    return coalesce(
        (
            select jsonb_object_agg(
                latest.consent_key,
                jsonb_build_object(
                    'agreed', latest.agreed,
                    'version', latest.version,
                    'recorded_at', latest.recorded_at
                )
            )
            from (
                select distinct on (c.consent_key)
                    c.consent_key, c.agreed, c.version, c.recorded_at
                from public.user_consents c
                where c.user_id = p_user_id
                order by c.consent_key, c.seq desc
            ) latest
        ),
        '{}'::jsonb
    );
end;
$$;

comment on function public.get_my_consents(uuid) is
    '항목별 현재 동의 상태(가장 최근 줄). 프로필 화면이 철회 스위치를 그릴 때 쓴다.';

revoke all on function public.get_my_consents(uuid) from public;
grant execute on function public.get_my_consents(uuid) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 동의 기록
-- ─────────────────────────────────────────────────────────────

create or replace function public.record_consents(
    p_user_id  uuid,
    p_version  text,
    p_consents jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user          public.users;
    v_owner_auth_id uuid;
    v_key           text;
    v_agreed        boolean;
    -- src/features/legal/consent-items.ts 의 REQUIRED_CONSENT_KEYS 와 맞춰야 한다.
    -- 화면에서 이미 막지만 서버에서 한 번 더 본다 — 화면을 거치지 않고 이 RPC 를
    -- 직접 부르면 필수 동의 없이 가입된 계정이 생긴다.
    v_required constant text[] := array['age_14', 'terms', 'privacy', 'health_records'];
    v_known    constant text[] := array['age_14', 'terms', 'privacy', 'health_records', 'pain_areas'];
begin
    if auth.uid() is null then
        raise exception 'AUTH_REQUIRED' using errcode = '42501';
    end if;

    select * into v_user from public.users where id = p_user_id;
    if not found then
        raise exception 'USER_NOT_FOUND' using errcode = 'P0002';
    end if;

    v_owner_auth_id := v_user.auth_user_id;
    if v_owner_auth_id is distinct from auth.uid() then
        raise exception 'FORBIDDEN' using errcode = '42501';
    end if;

    if coalesce(btrim(p_version), '') = '' then
        raise exception 'CONSENT_VERSION_REQUIRED' using errcode = '22023';
    end if;

    if jsonb_typeof(p_consents) is distinct from 'object' then
        raise exception 'INVALID_CONSENT_PAYLOAD' using errcode = '22023';
    end if;

    -- 모르는 항목이 섞여 들어오면 조용히 저장하지 않는다. 오탈자로 만들어진
    -- 항목이 쌓이면 나중에 "이 사람이 무엇에 동의했나"를 못 읽는다.
    for v_key in select jsonb_object_keys(p_consents) loop
        if not (v_key = any (v_known)) then
            raise exception 'UNKNOWN_CONSENT_KEY' using errcode = '22023';
        end if;
    end loop;

    foreach v_key in array v_required loop
        if coalesce((p_consents->>v_key)::boolean, false) is not true then
            raise exception 'CONSENT_REQUIRED' using errcode = '22023';
        end if;
    end loop;

    foreach v_key in array v_known loop
        if p_consents ? v_key then
            v_agreed := coalesce((p_consents->>v_key)::boolean, false);

            insert into public.user_consents (user_id, consent_key, version, agreed, source)
            values (p_user_id, v_key, btrim(p_version), v_agreed, 'app');
        end if;
    end loop;

    -- 화면이 매번 동의 이력을 조회하지 않고도 "다시 받아야 하나"를 판단할 수
    -- 있도록 요약을 프로필에 같이 둔다. 정본은 위 테이블이다.
    update public.users
    set profile_data = profile_data || jsonb_build_object(
        'consent', jsonb_build_object(
            'version', btrim(p_version),
            'agreed_at', now(),
            'pain_areas', coalesce((p_consents->>'pain_areas')::boolean, false)
        )
    )
    where id = p_user_id
    returning * into v_user;

    return jsonb_build_object('user', to_jsonb(v_user));
end;
$$;

comment on function public.record_consents(uuid, text, jsonb) is
    '동의 화면에서 받은 항목을 한 번에 기록한다. 필수 항목이 빠지면 거부한다.';

revoke all on function public.record_consents(uuid, text, jsonb) from public;
grant execute on function public.record_consents(uuid, text, jsonb) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 선택 동의 철회
--
-- 철회는 기록만 남기고 끝나면 안 된다. 개인정보처리방침에 "동의를 거두시면 바로
-- 지웁니다"라고 적어 놓고 데이터를 안 지우면 그 방침이 거짓말이 된다. 그래서
-- pain_areas 철회는 profile_data 에서 그 값을 실제로 삭제한다.
-- ─────────────────────────────────────────────────────────────

create or replace function public.revoke_consent(
    p_user_id     uuid,
    p_consent_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user          public.users;
    v_owner_auth_id uuid;
    v_version       text;
    v_optional constant text[] := array['pain_areas'];
begin
    if auth.uid() is null then
        raise exception 'AUTH_REQUIRED' using errcode = '42501';
    end if;

    select * into v_user from public.users where id = p_user_id;
    if not found then
        raise exception 'USER_NOT_FOUND' using errcode = 'P0002';
    end if;

    v_owner_auth_id := v_user.auth_user_id;
    if v_owner_auth_id is distinct from auth.uid() then
        raise exception 'FORBIDDEN' using errcode = '42501';
    end if;

    -- 필수 동의는 여기서 거둘 수 없다. 그건 서비스를 안 쓰겠다는 뜻이라 탈퇴로
    -- 처리해야 하는데, 철회 스위치로 조용히 처리하면 동의 없이 계정만 남는다.
    if not (p_consent_key = any (v_optional)) then
        raise exception 'CONSENT_NOT_REVOCABLE' using errcode = '22023';
    end if;

    -- 철회도 이력이다. 어느 버전에 동의했던 걸 거뒀는지 같이 남긴다.
    select version into v_version
    from public.user_consents
    where user_id = p_user_id and consent_key = p_consent_key
    order by seq desc
    limit 1;

    insert into public.user_consents (user_id, consent_key, version, agreed, source)
    values (p_user_id, p_consent_key, coalesce(v_version, 'unknown'), false, 'app');

    if p_consent_key = 'pain_areas' then
        update public.users
        set profile_data = (profile_data - 'pain_areas')
            || jsonb_build_object(
                'consent',
                coalesce(profile_data->'consent', '{}'::jsonb) || '{"pain_areas": false}'::jsonb
            )
        where id = p_user_id
        returning * into v_user;
    end if;

    return jsonb_build_object('user', to_jsonb(v_user));
end;
$$;

comment on function public.revoke_consent(uuid, text) is
    '선택 동의 철회. pain_areas 는 기록만 남기는 게 아니라 저장된 값도 실제로 지운다.';

revoke all on function public.revoke_consent(uuid, text) from public;
grant execute on function public.revoke_consent(uuid, text) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 키오스크(공용 태블릿) 동의
--
-- 태블릿은 Auth 세션이 없는 anon 이라 위 함수들을 쓸 수 없다. 받는 정보도
-- 전화번호 하나뿐이라 항목이 다르다. 화면에 수집 고지를 상시로 띄우고, 번호를
-- 눌러 체크인한 사실을 그 항목에 대한 동의로 기록한다.
--
-- anon 이 남의 user_id 로 이 함수를 부를 수는 있다. 다만 남길 수 있는 건
-- "전화번호 수집에 동의함" 한 줄뿐이고, 키오스크가 anon 키로 체크인 자체를
-- 대신할 수 있다는 점(README 의 키오스크 신뢰 모델)에서 더 넓어지는 권한이 없다.
-- ─────────────────────────────────────────────────────────────

create or replace function public.record_kiosk_consent(
    p_user_id uuid,
    p_version text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if coalesce(btrim(p_version), '') = '' then
        raise exception 'CONSENT_VERSION_REQUIRED' using errcode = '22023';
    end if;

    if not exists (select 1 from public.users where id = p_user_id) then
        raise exception 'USER_NOT_FOUND' using errcode = 'P0002';
    end if;

    -- 매번 체크인할 때마다 부르므로 같은 버전은 하루에 한 줄이면 충분하다.
    -- 안 그러면 매일 오는 분의 기록이 동의 줄로만 수천 개가 된다.
    if exists (
        select 1 from public.user_consents
        where user_id = p_user_id
          and consent_key = 'kiosk_phone'
          and version = btrim(p_version)
          and agreed
          and recorded_at >= (now() at time zone 'Asia/Seoul')::date
    ) then
        return;
    end if;

    insert into public.user_consents (user_id, consent_key, version, agreed, source)
    values (p_user_id, 'kiosk_phone', btrim(p_version), true, 'kiosk');
end;
$$;

comment on function public.record_kiosk_consent(uuid, text) is
    '키오스크 전화번호 수집 고지에 대한 동의 기록. 같은 날 같은 버전은 한 줄만 남긴다.';

revoke all on function public.record_kiosk_consent(uuid, text) from public;
grant execute on function public.record_kiosk_consent(uuid, text) to anon, authenticated;
