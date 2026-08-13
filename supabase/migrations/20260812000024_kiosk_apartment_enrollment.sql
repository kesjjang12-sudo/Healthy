-- 태블릿이 "자기가 어느 단지인지"를 스스로 알게 한다.
--
-- 지금까지 키오스크의 단지 정체성은 빌드 시점 환경변수(EXPO_PUBLIC_FITROUTINE_APT_ID)
-- 하나였다. 그래서 이 값은 "태블릿마다 다른 값"이 아니라 "빌드마다 다른 값"이었다.
-- 같은 앱을 두 단지에 깔면 두 태블릿이 같은 apt_id 로 체크인한다 — B단지 주민이
-- B단지 태블릿에 번호를 눌러도 A단지 계정이 생기고, A단지 랭킹에 올라간다.
-- 단지마다 앱을 따로 빌드해야만 피할 수 있었다.
--
-- 여기서는 단지에 "등록 코드"를 준다. 관리사무소가 태블릿을 설치할 때 코드와
-- 관리자 PIN 을 한 번 입력하면, 그 태블릿이 자기 apt_id 를 기억한다(AsyncStorage).
-- 앱 빌드는 전국 공용 하나가 되고, 주민 동선은 그대로다 — 주민은 여전히 번호만
-- 누르고, 어느 단지 사람인지는 태블릿이 알려준다.
--
-- 주민이 단지를 직접 고르게 하지 않는 건 의도적이다. 소속이 자기신고가 되면
-- 아무 단지나 골라 남의 순위표에 낄 수 있다. 지금처럼 "그 태블릿 앞에 실제로
-- 섰다"는 사실만 소속의 근거로 남긴다(마이그레이션 ..018 이 랭킹 기준을
-- 포인트에서 출석으로 바꾼 것과 같은 이유다).


-- ─────────────────────────────────────────────────────────────
-- 1. 등록 코드
-- ─────────────────────────────────────────────────────────────

alter table public.apartments
    add column if not exists enroll_code text;

-- 사람이 전화로 불러주고 받아 적는 값이다. 그래서 헷갈리는 글자를 아예 뺀다 —
-- I/1, L/1, O/0 를 제외하면 "영일인지 오인지" 되묻는 일이 없다.
create or replace function public.generate_enroll_code()
returns text
language plpgsql
as $$
declare
    v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    v_code     text;
    v_i        integer;
begin
    loop
        v_code := '';
        for v_i in 1..6 loop
            v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::integer, 1);
        end loop;
        exit when not exists (select 1 from public.apartments a where a.enroll_code = v_code);
    end loop;

    return v_code;
end;
$$;

comment on function public.generate_enroll_code() is
    '단지 등록 코드 6자리. 헷갈리는 글자(I/L/O/0/1)는 알파벳에서 제외한다.';

-- 기존 단지 백필. 한 행씩 도는 이유는, 여러 행을 한 UPDATE 로 채우면 함수 안의
-- 중복 검사가 같은 스냅샷을 보게 돼서 서로 같은 코드가 나올 수 있기 때문이다.
do $$
declare
    v_apt record;
begin
    for v_apt in select id from public.apartments where enroll_code is null loop
        update public.apartments set enroll_code = public.generate_enroll_code() where id = v_apt.id;
    end loop;
end;
$$;

create unique index if not exists apartments_enroll_code_key
    on public.apartments (enroll_code);

alter table public.apartments
    alter column enroll_code set default public.generate_enroll_code();
alter table public.apartments
    alter column enroll_code set not null;

comment on column public.apartments.enroll_code is
    '관리사무소가 태블릿 최초 설정 시 입력하는 단지 코드. 이 값 + 관리자 PIN 으로 태블릿이 apt_id 를 받아 간다.';

-- 입력값 정규화. 관리사무소에서 'test-24', 'TEST 24' 처럼 적어 와도 같은 코드로 본다.
create or replace function public.normalize_enroll_code(p_code text)
returns text
language sql
immutable
as $$
    select upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
$$;


-- ─────────────────────────────────────────────────────────────
-- 2. 무차별 대입 방어
-- ─────────────────────────────────────────────────────────────

-- 아래 RPC 는 anon 키로 호출된다(태블릿엔 세션이 없다). PIN 이 네 자리면
-- 코드를 아는 사람이 만 번만 시도하면 뚫린다. 코드 단위로 실패를 세서 막는다.
create table if not exists public.kiosk_enroll_attempts (
    id           uuid primary key default uuid_generate_v4(),
    enroll_code  text not null,
    attempted_at timestamptz not null default now()
);

create index if not exists kiosk_enroll_attempts_code_time_idx
    on public.kiosk_enroll_attempts (enroll_code, attempted_at desc);

comment on table public.kiosk_enroll_attempts is
    '단지 등록 실패 기록. 성공하면 해당 코드의 기록을 지운다 — 정상 설치는 흔적을 남기지 않는다.';

alter table public.kiosk_enroll_attempts enable row level security;
-- 다른 표와 같은 원칙: anon/authenticated 정책 없음, RPC로만 접근한다.


-- ─────────────────────────────────────────────────────────────
-- 3. 태블릿 프로비저닝 RPC
-- ─────────────────────────────────────────────────────────────

-- 단지 이름은 PIN 을 맞힌 뒤에만 돌려준다. 코드만으로 "○○아파트"가 나오면
-- 코드를 긁어서 단지 목록을 만들 수 있다.
--
-- ⚠️ 이 저장소의 다른 RPC 들과 달리 실패를 예외로 던지지 않는다. 예외를 던지면
-- 그 호출의 트랜잭션이 통째로 롤백되면서, 바로 위에서 기록한 실패 시도까지
-- 같이 사라진다 — 즉 아무리 틀려도 카운터가 0 이라 잠금이 영영 걸리지 않는다.
-- 실패 횟수를 남기는 게 이 함수의 방어 자체이므로, 여기서는 상태를 값으로
-- 돌려주고 예외 변환은 클라이언트가 한다.
create or replace function public.resolve_apartment_for_kiosk(
    p_enroll_code text,
    p_pin         text
)
returns jsonb
language plpgsql
security definer
-- extensions 를 빼면 안 된다. Supabase 는 pgcrypto 를 public 이 아니라
-- extensions 스키마에 설치하므로, search_path 를 public 으로만 고정하면
-- crypt() 를 못 찾아 "function crypt(text, text) does not exist" 로 죽는다.
set search_path = public, extensions
as $$
declare
    v_code     text;
    v_apt      public.apartments;
    v_exists   boolean;
    v_failures integer;
begin
    v_code := public.normalize_enroll_code(p_enroll_code);

    -- 코드가 존재하는지 보기 전에 먼저 막는다. 존재 여부로 코드를 훑는 것도 같이 막힌다.
    select count(*) into v_failures
    from public.kiosk_enroll_attempts t
    where t.enroll_code = v_code
      and t.attempted_at > now() - interval '15 minutes';

    if v_failures >= 10 then
        return jsonb_build_object('status', 'locked');
    end if;

    select * into v_apt from public.apartments a where a.enroll_code = v_code;
    -- found 는 바로 뒤 insert 가 덮어쓴다. 지금 붙잡아 둬야 한다.
    v_exists := found;

    if not v_exists or v_apt.kiosk_pin_hash is null
       or v_apt.kiosk_pin_hash <> crypt(coalesce(p_pin, ''), v_apt.kiosk_pin_hash) then
        insert into public.kiosk_enroll_attempts (enroll_code) values (v_code);

        -- PIN 미설정 단지는 따로 알려준다. 관리사무소가 "코드가 틀렸나" 하고
        -- 붙잡고 있는 대신 할 일(PIN 설정)을 바로 알 수 있어야 한다.
        if v_exists and v_apt.kiosk_pin_hash is null then
            return jsonb_build_object('status', 'pin_not_set');
        end if;

        return jsonb_build_object('status', 'invalid');
    end if;

    -- 정상 설치는 흔적을 남기지 않는다. 오타 몇 번 치고 성공한 관리자가
    -- 다음 태블릿에서 잠기면 안 된다.
    delete from public.kiosk_enroll_attempts t where t.enroll_code = v_code;

    return jsonb_build_object('status', 'ok', 'apt_id', v_apt.id, 'apt_name', v_apt.name);
end;
$$;

comment on function public.resolve_apartment_for_kiosk(text, text) is
    '태블릿 최초 설정. 등록 코드 + 관리자 PIN 을 확인하고 apt_id 를 돌려준다. 실패는 예외가 아니라 status 로 온다(실패 기록이 롤백되면 안 되므로).';

revoke all on function public.resolve_apartment_for_kiosk(text, text) from public;
grant execute on function public.resolve_apartment_for_kiosk(text, text) to anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 4. verify_kiosk_pin: 폐기 예정이지만, 그 전에 고장난 것부터 고친다
-- ─────────────────────────────────────────────────────────────

-- 이 함수도 search_path 가 public 뿐이라 crypt() 를 못 찾는다. 지금까지
-- 드러나지 않은 건 PIN 을 정한 단지가 하나도 없어서다 — kiosk_pin_hash 가
-- null 이면 crypt() 를 부르기 전에 true 로 빠져나간다. 즉 어느 단지든 PIN 을
-- 설정하는 순간 태블릿 설정이 오류로 죽었을 것이다. 본문은 그대로 두고
-- search_path 만 고친다.
--
-- 지우지 않는 이유는 이미 설치된 구버전 앱(빌드에 apt_id 가 박혀 있는)이 아직
-- 이걸 호출하기 때문이다. 그 태블릿들이 새 버전을 받고 나면 다음 마이그레이션에서 지운다.
create or replace function public.verify_kiosk_pin(p_apt_id uuid, p_pin text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_hash text;
begin
    select kiosk_pin_hash into v_hash from public.apartments where id = p_apt_id;

    if v_hash is null then
        -- PIN 을 아직 안 정한 단지는(시범 단계) 항상 통과시킨다.
        return true;
    end if;

    return v_hash = crypt(coalesce(p_pin, ''), v_hash);
end;
$$;

comment on function public.verify_kiosk_pin(uuid, text) is
    '[deprecated] resolve_apartment_for_kiosk 를 쓸 것. PIN 미설정 단지를 무조건 통과시키므로 다단지에서는 안전하지 않다.';

revoke all on function public.verify_kiosk_pin(uuid, text) from public;
grant execute on function public.verify_kiosk_pin(uuid, text) to anon, authenticated;
