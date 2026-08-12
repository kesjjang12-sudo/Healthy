-- 핏루틴 전체 설치 스크립트 (한 번에 실행용)
--
-- Supabase 대시보드 > SQL Editor 에 이 파일 전체를 붙여넣고 Run 하면 끝난다.
-- supabase/migrations/ 의 파일들과 seed.sql 을 순서대로 합친 것이고,
-- 전부 idempotent 라 여러 번 실행해도 안전하다.
--
-- CLI 를 쓴다면 이 파일 대신 `npx supabase db push` 를 쓰는 편이 낫다.
-- 그쪽이 마이그레이션 이력을 관리해 준다.


-- ═══════════════════════════════════════════════════════════
-- 20260812000001_init_schema.sql
-- ═══════════════════════════════════════════════════════════

-- 핏루틴(FitRoutine) 하이브리드 DB 스키마
-- 고정 핵심 데이터(인증/포인트/관계)는 일반 컬럼, 가변 데이터는 JSONB.

create extension if not exists "uuid-ossp";

-- 1. 아파트 단지
create table if not exists public.apartments (
    id          uuid primary key default uuid_generate_v4(),
    name        varchar(255) not null,
    address     text,
    created_at  timestamptz default now()
);

-- 2. 유저 (하이브리드 설계)
create table if not exists public.users (
    id            uuid primary key default uuid_generate_v4(),
    apt_id        uuid references public.apartments(id) on delete cascade,
    phone_number  varchar(20) unique not null,
    total_points  integer default 0,
    role          varchar(20) default 'resident',
    -- 성별, 연령대, 운동목적, 부상이력 등 기획 변경이 잦은 데이터
    profile_data  jsonb default '{}'::jsonb,
    created_at    timestamptz default now()
);

-- 3. 기구 및 영상
create table if not exists public.equipments (
    id             uuid primary key default uuid_generate_v4(),
    apt_id         uuid references public.apartments(id) on delete cascade,
    qr_code_val    varchar(255) unique not null,
    name           varchar(100) not null,
    target_muscle  varchar(50),
    video_url      text not null,
    created_at     timestamptz default now()
);

-- 4. 유저별 맞춤 루틴
create table if not exists public.daily_routines (
    id             uuid primary key default uuid_generate_v4(),
    user_id        uuid references public.users(id) on delete cascade,
    equip_id       uuid references public.equipments(id) on delete cascade,
    routine_date   date default current_date,
    target_weight  integer,
    target_sets    integer,
    target_reps    integer,
    is_completed   boolean default false,
    created_at     timestamptz default now()
);

-- 5. 출석 기록
create table if not exists public.attendance_logs (
    id           uuid primary key default uuid_generate_v4(),
    user_id      uuid references public.users(id) on delete cascade,
    attended_at  timestamptz default now()
);


-- ─────────────────────────────────────────────────────────────
-- 무결성 제약
-- ─────────────────────────────────────────────────────────────

-- 하루/한 기구당 루틴은 1건. AI 루틴 생성이 중복 실행돼도 행이 불어나지 않게 한다.
create unique index if not exists daily_routines_user_equip_date_key
    on public.daily_routines (user_id, equip_id, routine_date);

alter table public.users
    drop constraint if exists users_role_check;
alter table public.users
    add constraint users_role_check
    check (role in ('resident', 'manager', 'admin'));

alter table public.users
    drop constraint if exists users_total_points_check;
alter table public.users
    add constraint users_total_points_check
    check (total_points >= 0);

-- profile_data 는 항상 객체(오브젝트)여야 한다. 배열/스칼라가 섞이면 조회 쿼리가 깨진다.
alter table public.users
    drop constraint if exists users_profile_data_is_object;
alter table public.users
    add constraint users_profile_data_is_object
    check (jsonb_typeof(profile_data) = 'object');


-- ─────────────────────────────────────────────────────────────
-- 인덱스 (조회 경로 기준)
-- ─────────────────────────────────────────────────────────────

-- 단지 단위 조회(관리자 대시보드, 단지별 통계)
create index if not exists users_apt_id_idx on public.users (apt_id);
create index if not exists equipments_apt_id_idx on public.equipments (apt_id);

-- JSONB 검색: profile_data @> '{"goal":"diet"}' 같은 포함 질의용
create index if not exists users_profile_data_gin_idx
    on public.users using gin (profile_data jsonb_path_ops);

-- 오늘의 루틴 조회
create index if not exists daily_routines_user_date_idx
    on public.daily_routines (user_id, routine_date desc);

-- 출석 스트릭/최근 출석 조회
create index if not exists attendance_logs_user_attended_idx
    on public.attendance_logs (user_id, attended_at desc);

-- ═══════════════════════════════════════════════════════════
-- 20260812000002_rls_and_auth.sql
-- ═══════════════════════════════════════════════════════════

-- RLS 정책 + 태블릿 번호 인증 RPC
--
-- 배경: 헬스장 태블릿은 공용 기기라 Supabase Auth 세션을 들고 있지 않고
-- anon 키만 가진다. 따라서 유저/루틴/출석 테이블은 anon 에게 직접 노출하지 않고,
-- security definer 함수(RPC)로만 접근시킨다.

alter table public.apartments     enable row level security;
alter table public.users          enable row level security;
alter table public.equipments     enable row level security;
alter table public.daily_routines enable row level security;
alter table public.attendance_logs enable row level security;

-- 단지 정보와 기구 정보는 읽기 전용 공개(태블릿 초기 화면, QR 스캔 시 필요).
drop policy if exists "apartments are readable" on public.apartments;
create policy "apartments are readable"
    on public.apartments for select
    to anon, authenticated
    using (true);

drop policy if exists "equipments are readable" on public.equipments;
create policy "equipments are readable"
    on public.equipments for select
    to anon, authenticated
    using (true);

-- users / daily_routines / attendance_logs 에는 anon 정책을 두지 않는다.
-- => RLS deny-by-default. service_role 과 security definer 함수만 통과한다.


-- ─────────────────────────────────────────────────────────────
-- 전화번호 정규화 / 검증
-- ─────────────────────────────────────────────────────────────

create or replace function public.normalize_phone_number(p_phone text)
returns text
language sql
immutable
as $$
    select regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
$$;

comment on function public.normalize_phone_number(text) is
    '입력에서 숫자만 남긴다. 저장 포맷은 하이픈 없는 01012345678.';


-- ─────────────────────────────────────────────────────────────
-- 태블릿 번호 입력 인증
--
-- 처음 보는 번호면 가입시키고, 있으면 로그인시킨다(find-or-create).
-- 같은 호출에서 하루 1회 출석도 기록한다 — 태블릿에 번호를 찍는 행위가 곧 체크인이다.
-- ─────────────────────────────────────────────────────────────

create or replace function public.sign_in_with_phone(
    p_apt_id       uuid,
    p_phone_number text,
    p_profile_data jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_phone      text;
    v_user       public.users;
    v_is_new     boolean := false;
    v_attended   boolean := false;
    v_today      date := (now() at time zone 'Asia/Seoul')::date;
begin
    v_phone := public.normalize_phone_number(p_phone_number);

    -- 국내 휴대폰 번호(010/011/016/017/018/019) 10~11자리
    if v_phone !~ '^01[016789][0-9]{7,8}$' then
        raise exception 'INVALID_PHONE_NUMBER' using errcode = '22023';
    end if;

    if p_apt_id is null or not exists (
        select 1 from public.apartments a where a.id = p_apt_id
    ) then
        raise exception 'APARTMENT_NOT_FOUND' using errcode = 'P0002';
    end if;

    select * into v_user
    from public.users u
    where u.phone_number = v_phone;

    if not found then
        insert into public.users (apt_id, phone_number, profile_data)
        values (
            p_apt_id,
            v_phone,
            case
                when jsonb_typeof(coalesce(p_profile_data, '{}'::jsonb)) = 'object'
                    then coalesce(p_profile_data, '{}'::jsonb)
                else '{}'::jsonb
            end
        )
        returning * into v_user;

        v_is_new := true;

    elsif v_user.apt_id is distinct from p_apt_id then
        -- 다른 단지에 등록된 번호. 단지 이전은 관리자가 처리한다.
        raise exception 'PHONE_REGISTERED_TO_OTHER_APARTMENT' using errcode = 'P0003';
    end if;

    -- 하루 1회만 출석 인정
    if not exists (
        select 1
        from public.attendance_logs l
        where l.user_id = v_user.id
          and (l.attended_at at time zone 'Asia/Seoul')::date = v_today
    ) then
        insert into public.attendance_logs (user_id) values (v_user.id);
        v_attended := true;
    end if;

    return jsonb_build_object(
        'user', to_jsonb(v_user),
        'is_new_user', v_is_new,
        'attendance_logged', v_attended
    );
end;
$$;

comment on function public.sign_in_with_phone(uuid, text, jsonb) is
    '태블릿 번호 입력 인증. 신규 번호는 가입, 기존 번호는 로그인. 하루 1회 출석 기록 포함.';

revoke all on function public.sign_in_with_phone(uuid, text, jsonb) from public;
grant execute on function public.sign_in_with_phone(uuid, text, jsonb) to anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 온보딩: 신규 유저의 가변 프로필(성별/연령대/운동목적) 저장
-- profile_data 를 통째로 덮어쓰지 않고 병합한다.
-- ─────────────────────────────────────────────────────────────

create or replace function public.update_profile_data(
    p_user_id uuid,
    p_patch   jsonb
)
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

revoke all on function public.update_profile_data(uuid, jsonb) from public;
grant execute on function public.update_profile_data(uuid, jsonb) to anon, authenticated;

-- ═══════════════════════════════════════════════════════════
-- 20260812000003_routine_templates.sql
-- ═══════════════════════════════════════════════════════════

-- 루틴 템플릿: 프로필의 모든 경우의 수를 미리 조합해 둔다.
--
-- 런타임에 AI를 호출하지 않는다. 시니어 대상이라 매번 다른 결과가 나오면 안전 검수가
-- 불가능하고, 태블릿 앞에서 응답을 기다리는 시간도 그대로 줄이 된다.
--
-- 커버리지: 성별 2 × 연령대 4 × 운동목적 조합 15 × 아픈곳 조합 64 = 7,680 가지.
-- 저장은 그중 앞의 셋만 조합해 120개 템플릿으로 두고, 아픈 곳은 조합이 아니라
-- 후처리 규칙(pain_area_rules)으로 적용한다. 커버리지는 같지만 사람이 검수할 수 있는
-- 분량이 된다 — 트레이너가 120개는 볼 수 있어도 7,680개는 못 본다.
--
-- ⚠️ 여기 담긴 무게·세트·횟수는 의료 조언이 아니다. 실서비스 전에 트레이너 또는
--    물리치료사 검수를 반드시 거쳐야 한다. 특히 pain_area_rules 는 안전 장치다.

-- ─────────────────────────────────────────────────────────────
-- 기구별 기준 무게
-- 같은 "가벼운 무게"라도 레그 프레스와 크런치의 kg 이 다르므로 기구가 기준을 갖는다.
-- ─────────────────────────────────────────────────────────────

alter table public.equipments
    add column if not exists base_weight_kg integer,
    add column if not exists weight_step_kg integer not null default 5;

comment on column public.equipments.base_weight_kg is
    '표준 성인 남성 시작 무게(kg). null 이면 무게 지정 없이 맨몸으로 안내한다.';
comment on column public.equipments.weight_step_kg is
    '이 기구에서 조절 가능한 최소 단위(kg). 계산된 무게를 이 단위로 내림한다.';

-- 루틴은 순서가 있다 (큰 근육 → 코어). 기구 이름순으로 보여주면 그 의도가 사라진다.
alter table public.daily_routines
    add column if not exists sort_order integer not null default 100;

comment on column public.daily_routines.sort_order is
    '루틴 내 운동 순서. 작을수록 먼저 한다.';


-- ─────────────────────────────────────────────────────────────
-- 조합의 재료가 되는 규칙 테이블 (트레이너가 여기만 고치면 전체가 다시 만들어진다)
-- ─────────────────────────────────────────────────────────────

-- 운동 목적별 기본 처방
create table if not exists public.goal_blocks (
    goal          varchar(20) not null,
    target_muscle varchar(50) not null,
    sets          integer not null,
    reps          integer not null,
    -- 기구 base_weight_kg 대비 비율
    weight_ratio  numeric(4, 2) not null,
    sort_order    integer not null,
    primary key (goal, target_muscle)
);

-- 연령대 보정
create table if not exists public.age_modifiers (
    age_group         integer primary key,
    weight_multiplier numeric(4, 2) not null,
    -- 세트 수 증감 (70대 이상은 한 세트 줄인다)
    set_delta         integer not null default 0
);

-- 성별 보정 (시작 무게 기준선)
create table if not exists public.gender_modifiers (
    gender            varchar(20) primary key,
    weight_multiplier numeric(4, 2) not null
);

-- 아픈 곳 규칙. exclude 는 해당 부위 운동을 빼고, derate 는 무게만 낮춘다.
create table if not exists public.pain_area_rules (
    pain_area         varchar(30) not null,
    target_muscle     varchar(50) not null,
    action            varchar(10) not null check (action in ('exclude', 'derate')),
    weight_multiplier numeric(4, 2) not null default 1.0,
    primary key (pain_area, target_muscle)
);


-- ─────────────────────────────────────────────────────────────
-- 조합 결과 (rebuild_routine_templates() 가 채운다)
-- ─────────────────────────────────────────────────────────────

create table if not exists public.routine_templates (
    id         uuid primary key default uuid_generate_v4(),
    gender     varchar(20) not null,
    age_group  integer not null,
    -- 운동 목적을 사전순으로 정렬해 '+' 로 이은 키. 예: 'diet+health'
    goals_key  varchar(100) not null,
    created_at timestamptz default now(),
    unique (gender, age_group, goals_key)
);

create table if not exists public.routine_template_items (
    id            uuid primary key default uuid_generate_v4(),
    template_id   uuid not null references public.routine_templates(id) on delete cascade,
    target_muscle varchar(50) not null,
    sets          integer not null,
    reps          integer not null,
    weight_ratio  numeric(4, 2) not null,
    sort_order    integer not null,
    unique (template_id, target_muscle)
);

create index if not exists routine_template_items_template_idx
    on public.routine_template_items (template_id, sort_order);


-- ─────────────────────────────────────────────────────────────
-- 규칙 데이터
-- ─────────────────────────────────────────────────────────────

insert into public.goal_blocks (goal, target_muscle, sets, reps, weight_ratio, sort_order) values
    -- 근력 키우기: 중간 무게, 적은 횟수
    ('muscle', '하체', 3, 10, 1.00, 1),
    ('muscle', '등',   3, 10, 1.00, 2),
    ('muscle', '가슴', 3, 10, 1.00, 3),
    ('muscle', '어깨', 3, 10, 0.90, 4),
    -- 체중 줄이기: 가벼운 무게, 많은 횟수
    ('diet',   '하체', 3, 15, 0.70, 1),
    ('diet',   '등',   3, 15, 0.70, 2),
    ('diet',   '가슴', 3, 15, 0.70, 3),
    ('diet',   '복부', 3, 15, 0.70, 5),
    -- 건강 유지: 부담 없는 전신
    ('health', '하체', 2, 12, 0.60, 1),
    ('health', '등',   2, 12, 0.60, 2),
    ('health', '복부', 2, 12, 0.60, 5),
    -- 통증 관리: 코어 위주로 아주 가볍게
    ('rehab',  '등',   2, 12, 0.40, 2),
    ('rehab',  '복부', 2, 12, 0.40, 5)
on conflict (goal, target_muscle) do nothing;

insert into public.age_modifiers (age_group, weight_multiplier, set_delta) values
    -- 10대는 아직 크는 중이라 20~30대보다 낮게 잡는다. 힘이 모자라서가 아니라
    -- 성장판을 생각해 가볍게 여러 번 하는 쪽이 안전하기 때문이다.
    (10, 0.75, 0),
    (20, 1.15, 0),
    (30, 1.10, 0),
    (40, 1.00, 0),
    (50, 0.90, 0),
    (60, 0.80, 0),
    (70, 0.65, -1)
on conflict (age_group) do nothing;

insert into public.gender_modifiers (gender, weight_multiplier) values
    ('male', 1.00),
    ('female', 0.70)
on conflict (gender) do nothing;

-- 아픈 곳 규칙. 자동 처방이라 애매하면 빼는 쪽으로 잡았다.
insert into public.pain_area_rules (pain_area, target_muscle, action, weight_multiplier) values
    ('knee',       '하체', 'exclude', 1.00),
    ('ankle',      '하체', 'exclude', 1.00),
    ('lower_back', '하체', 'exclude', 1.00),
    ('lower_back', '등',   'derate',  0.60),
    ('shoulder',   '어깨', 'exclude', 1.00),
    ('shoulder',   '가슴', 'derate',  0.60),
    ('neck',       '어깨', 'derate',  0.50),
    ('neck',       '등',   'derate',  0.70),
    ('wrist',      '가슴', 'derate',  0.60),
    ('wrist',      '등',   'derate',  0.60)
on conflict (pain_area, target_muscle) do nothing;


-- ─────────────────────────────────────────────────────────────
-- 조합 생성
-- ─────────────────────────────────────────────────────────────

create or replace function public.rebuild_routine_templates()
returns integer
language plpgsql
as $$
declare
    v_count integer;
begin
    -- 트레이너가 개별 템플릿을 손봤더라도 규칙을 고쳐 다시 돌리면 덮어쓴다.
    delete from public.routine_templates;

    -- 운동 목적의 공집합을 뺀 모든 부분집합 (2^4 - 1 = 15가지)
    with goal_list as (
        select goal, (row_number() over (order by goal))::integer as bit
        from (select distinct goal from public.goal_blocks) g
    ),
    subsets as (
        select
            mask,
            array_agg(goal order by goal) as goals
        from generate_series(1, (1 << (select count(*)::integer from goal_list)) - 1) as mask
        join goal_list on (mask::integer >> (bit - 1)) & 1 = 1
        group by mask
    ),
    combos as (
        select
            gm.gender,
            am.age_group,
            array_to_string(s.goals, '+') as goals_key,
            s.goals
        from subsets s
        cross join public.gender_modifiers gm
        cross join public.age_modifiers am
    ),
    inserted as (
        insert into public.routine_templates (gender, age_group, goals_key)
        select gender, age_group, goals_key from combos
        returning id, gender, age_group, goals_key
    )
    insert into public.routine_template_items
        (template_id, target_muscle, sets, reps, weight_ratio, sort_order)
    select
        t.id,
        b.target_muscle,
        -- 목적을 여러 개 고르면 보수적인 쪽을 따른다: 세트는 적게, 횟수는 많게(=가볍게).
        -- 다만 1세트짜리 처방은 운동 효과가 없으니 2세트를 하한으로 둔다.
        greatest(2, min(b.sets) + max(am.set_delta)),
        max(b.reps),
        round(min(b.weight_ratio) * max(am.weight_multiplier) * max(gm.weight_multiplier), 2),
        min(b.sort_order)
    from inserted t
    join combos c
      on c.gender = t.gender and c.age_group = t.age_group and c.goals_key = t.goals_key
    join public.goal_blocks b on b.goal = any (c.goals)
    join public.age_modifiers am on am.age_group = t.age_group
    join public.gender_modifiers gm on gm.gender = t.gender
    group by t.id, b.target_muscle;

    select count(*) into v_count from public.routine_templates;
    return v_count;
end;
$$;

comment on function public.rebuild_routine_templates() is
    'goal_blocks / age_modifiers / gender_modifiers 를 조합해 모든 템플릿을 다시 만든다.';

select public.rebuild_routine_templates();


-- ─────────────────────────────────────────────────────────────
-- RLS: 전부 참조 데이터지만 클라이언트가 직접 읽을 일이 없다. deny-by-default.
-- ─────────────────────────────────────────────────────────────

alter table public.goal_blocks            enable row level security;
alter table public.age_modifiers          enable row level security;
alter table public.gender_modifiers       enable row level security;
alter table public.pain_area_rules        enable row level security;
alter table public.routine_templates      enable row level security;
alter table public.routine_template_items enable row level security;

-- ═══════════════════════════════════════════════════════════
-- 20260812000004_generate_daily_routine.sql
-- ═══════════════════════════════════════════════════════════

-- 오늘의 루틴 생성 / 조회 RPC
--
-- 미리 만들어 둔 템플릿에서 골라 아픈 곳 규칙을 적용하고, 그 단지에 실제로 있는
-- 기구로 치환한다. 여기서 AI 를 호출하지 않으므로 응답은 밀리초 단위다.

create or replace function public.generate_daily_routine(
    p_user_id uuid,
    p_date    date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user        public.users;
    v_gender      text;
    v_age_group   integer;
    v_goals_key   text;
    v_pain_areas  text[];
    v_template_id uuid;
    v_created     integer := 0;
    v_excluded    integer := 0;
    v_unmapped    integer := 0;
begin
    select * into v_user from public.users u where u.id = p_user_id;
    if not found then
        raise exception 'USER_NOT_FOUND' using errcode = 'P0002';
    end if;

    -- 프로필이 비어 있으면 가장 보수적인(=가벼운) 쪽으로 떨어뜨린다.
    -- 설문을 덜 마친 사람에게 과한 무게를 주는 것보다 낫다.
    v_gender := coalesce(v_user.profile_data->>'gender', 'female');
    v_age_group := coalesce((v_user.profile_data->>'age_group')::integer, 70);

    v_goals_key := coalesce(nullif(array_to_string(
        array(
            select jsonb_array_elements_text(v_user.profile_data->'goals') order by 1
        ), '+'), ''), 'health');

    v_pain_areas := case
        when jsonb_typeof(v_user.profile_data->'pain_areas') = 'array'
            then array(select jsonb_array_elements_text(v_user.profile_data->'pain_areas'))
        else '{}'::text[]
    end;

    select t.id into v_template_id
    from public.routine_templates t
    where t.gender = v_gender and t.age_group = v_age_group and t.goals_key = v_goals_key;

    -- 알 수 없는 조합이면 같은 성별·연령대의 '건강 유지'로 떨어뜨린다.
    if not found then
        select t.id into v_template_id
        from public.routine_templates t
        where t.gender = v_gender and t.age_group = v_age_group and t.goals_key = 'health';
    end if;

    if v_template_id is null then
        raise exception 'ROUTINE_TEMPLATE_NOT_FOUND' using errcode = 'P0002';
    end if;

    -- 아픈 곳 때문에 통째로 빠진 운동 수
    select count(*) into v_excluded
    from public.routine_template_items i
    where i.template_id = v_template_id
      and exists (
          select 1 from public.pain_area_rules r
          where r.action = 'exclude'
            and r.target_muscle = i.target_muscle
            and r.pain_area = any (v_pain_areas)
      );

    -- 남았지만 이 단지에 해당 기구가 없어서 못 넣은 운동 수
    select count(*) into v_unmapped
    from public.routine_template_items i
    where i.template_id = v_template_id
      and not exists (
          select 1 from public.pain_area_rules r
          where r.action = 'exclude'
            and r.target_muscle = i.target_muscle
            and r.pain_area = any (v_pain_areas)
      )
      and not exists (
          select 1 from public.equipments e
          where e.apt_id = v_user.apt_id and e.target_muscle = i.target_muscle
      );

    with candidate as (
        select
            i.target_muscle,
            i.sets,
            i.reps,
            i.weight_ratio,
            i.sort_order,
            -- derate 규칙이 여러 개 걸리면 가장 낮은 배율을 쓴다.
            coalesce((
                select min(r.weight_multiplier)
                from public.pain_area_rules r
                where r.action = 'derate'
                  and r.target_muscle = i.target_muscle
                  and r.pain_area = any (v_pain_areas)
            ), 1.0) as derate
        from public.routine_template_items i
        where i.template_id = v_template_id
          and not exists (
              select 1 from public.pain_area_rules r
              where r.action = 'exclude'
                and r.target_muscle = i.target_muscle
                and r.pain_area = any (v_pain_areas)
          )
    ),
    matched as (
        select c.*, e.id as equip_id, e.base_weight_kg, e.weight_step_kg
        from candidate c
        join lateral (
            select e.*
            from public.equipments e
            where e.apt_id = v_user.apt_id and e.target_muscle = c.target_muscle
            order by e.name
            limit 1
        ) e on true
    ),
    saved as (
        insert into public.daily_routines
            (user_id, equip_id, routine_date, target_weight, target_sets, target_reps, sort_order)
        select
            p_user_id,
            m.equip_id,
            p_date,
            case
                when m.base_weight_kg is null then null
                -- 기구 조절 단위로 내림한다. 반올림하면 계산된 무게보다 무거워질 수 있는데,
                -- 시니어에게는 조금 가벼운 쪽이 틀리는 방향으로 안전하다.
                else greatest(
                    m.weight_step_kg,
                    (floor(m.base_weight_kg * m.weight_ratio * m.derate / m.weight_step_kg)
                        * m.weight_step_kg)::integer
                )
            end,
            m.sets,
            m.reps,
            m.sort_order
        from matched m
        order by m.sort_order
        on conflict (user_id, equip_id, routine_date) do nothing
        returning 1
    )
    select count(*) into v_created from saved;

    return jsonb_build_object(
        'routine_date', p_date,
        'template', jsonb_build_object(
            'gender', v_gender, 'age_group', v_age_group, 'goals_key', v_goals_key
        ),
        'created', v_created,
        'excluded_by_pain', v_excluded,
        'missing_equipment', v_unmapped,
        -- 사람이 봐야 하는 경우: 아픈 곳 때문에 운동이 하나도 안 남았거나,
        -- 아픈 곳을 3군데 이상 고른 분. 규칙 기반 자동 처방으로 감당할 범위를 넘는다.
        'needs_trainer_review',
            (v_created = 0 and v_excluded > 0) or coalesce(array_length(v_pain_areas, 1), 0) >= 3,
        'routines', public.get_daily_routine(p_user_id, p_date)
    );
end;
$$;

comment on function public.generate_daily_routine(uuid, date) is
    '미리 조합해 둔 템플릿 + 아픈 곳 규칙 + 단지 보유 기구로 하루 루틴을 만든다. AI 호출 없음.';


create or replace function public.get_daily_routine(
    p_user_id uuid,
    p_date    date default current_date
)
returns jsonb
language sql
security definer
set search_path = public
as $$
    select coalesce(jsonb_agg(row order by sort_order, name), '[]'::jsonb)
    from (
        select d.sort_order, e.name, jsonb_build_object(
            'routine_id', d.id,
            'equip_id', e.id,
            'name', e.name,
            'target_muscle', e.target_muscle,
            'video_url', e.video_url,
            'qr_code_val', e.qr_code_val,
            'target_weight', d.target_weight,
            'target_sets', d.target_sets,
            'target_reps', d.target_reps,
            'is_completed', d.is_completed
        ) as row
        from public.daily_routines d
        join public.equipments e on e.id = d.equip_id
        where d.user_id = p_user_id and d.routine_date = p_date
    ) rows;
$$;

comment on function public.get_daily_routine(uuid, date) is
    '해당 날짜의 루틴을 기구 정보와 함께 돌려준다.';


revoke all on function public.generate_daily_routine(uuid, date) from public;
revoke all on function public.get_daily_routine(uuid, date) from public;
grant execute on function public.generate_daily_routine(uuid, date) to anon, authenticated;
grant execute on function public.get_daily_routine(uuid, date) to anon, authenticated;

-- ═══════════════════════════════════════════════════════════
-- 20260812000006_link_auth_identity.sql
-- ═══════════════════════════════════════════════════════════

-- Kakao/Google OAuth 로그인을 위한 Supabase Auth 연결
--
-- 배경: 지금까지 public.users 는 전화번호가 곧 계정이었다(auth.users 미사용,
-- RPC 는 전부 anon 키로 호출됨). 개인 폰 앱에 카카오/구글 로그인을 붙이면서,
-- 그 신원(auth.users)과 기존 프로필 테이블(public.users)을 연결할 다리가
-- 필요하다.
--
-- 카카오/구글로 먼저 가입하면 아직 전화번호가 없는 상태로 시작한다(QR 페어링
-- 전까지). 그래서 phone_number 를 필수에서 선택으로 낮춘다. unique 제약은
-- 그대로 둬도 된다 — Postgres 의 UNIQUE 는 NULL 여러 개를 서로 다른 값으로
-- 취급해 충돌하지 않는다.

alter table public.users
    add column if not exists auth_user_id uuid unique references auth.users(id) on delete set null;

create index if not exists users_auth_user_id_idx on public.users (auth_user_id);

alter table public.users
    alter column phone_number drop not null;

comment on column public.users.auth_user_id is
    'Supabase Auth(카카오/구글/익명) 신원과의 연결. 키오스크로만 생긴 계정은 아직 null.';
comment on column public.users.phone_number is
    '카카오/구글로 먼저 가입하면 QR 페어링 전까지 null. 키오스크로 먼저 생기면 처음부터 채워진다.';

-- ═══════════════════════════════════════════════════════════
-- 20260812000007_gym_memberships.sql
-- ═══════════════════════════════════════════════════════════

-- 이사(헬스장 변경) 대응: 유저 1명이 여러 헬스장을 오갈 수 있게 한다.
--
-- 지금까지 users.apt_id 는 "이 사람이 다니는 헬스장" 하나만 가리켰다. 이사를
-- 가면 새 헬스장에서 체크인해도 이 컬럼 하나로는 어디가 "진짜 소속"인지,
-- 예전 헬스장은 몇 번 갔었는지 알 길이 없었다.
--
-- users.apt_id 는 지우지 않고 "주 소속 캐시"로 남긴다 — generate_daily_routine
-- 등 기존 함수들이 그대로 동작하고, 마이그레이션 반경이 작아진다. 진짜 이력은
-- 이 테이블이 갖고, users.apt_id 는 confirm_gym_membership RPC(다음 마이그레이션
-- 들에서 추가)가 명시적으로 갱신한다.

create table if not exists public.user_gym_memberships (
    id                   uuid primary key default uuid_generate_v4(),
    user_id              uuid not null references public.users(id) on delete cascade,
    apt_id               uuid not null references public.apartments(id) on delete cascade,
    is_primary           boolean not null default false,
    visit_count          integer not null default 0,
    first_checked_in_at  timestamptz not null default now(),
    last_checked_in_at   timestamptz not null default now(),
    created_at           timestamptz default now(),
    unique (user_id, apt_id)
);

-- 한 유저의 주 소속은 항상 하나뿐이어야 한다.
create unique index if not exists user_gym_memberships_one_primary_idx
    on public.user_gym_memberships (user_id) where is_primary;

create index if not exists user_gym_memberships_apt_id_idx
    on public.user_gym_memberships (apt_id);

comment on table public.user_gym_memberships is
    '유저-헬스장 방문 이력. is_primary 인 행이 지금의 "주 소속"이고 users.apt_id 에 캐시된다.';

alter table public.user_gym_memberships enable row level security;
-- 다른 테이블과 같은 원칙: anon/authenticated 정책 없음, RPC로만 접근한다.

-- 출석 기록에도 "그날 어느 헬스장이었는지"를 남긴다. 주 소속이 아닌 헬스장에서도
-- 체크인할 수 있으므로(이사 직후 방문 등), users.apt_id 하나로는 그날의 기구
-- 목록을 정확히 못 고른다.
alter table public.attendance_logs
    add column if not exists apt_id uuid references public.apartments(id);

create index if not exists attendance_logs_apt_id_idx on public.attendance_logs (apt_id);

-- ─────────────────────────────────────────────────────────────
-- 기존 데이터 백필
-- ─────────────────────────────────────────────────────────────

-- 지금까지 생긴 유저는 전부 users.apt_id 가 곧 주 소속이었다. 그 값 그대로
-- 첫 멤버십 행을 만들고, 지금까지의 출석 횟수/최초·최근 출석일을 채워 넣는다.
insert into public.user_gym_memberships
    (user_id, apt_id, is_primary, visit_count, first_checked_in_at, last_checked_in_at)
select
    u.id,
    u.apt_id,
    true,
    (select count(*) from public.attendance_logs l where l.user_id = u.id),
    coalesce((select min(l.attended_at) from public.attendance_logs l where l.user_id = u.id), u.created_at),
    coalesce((select max(l.attended_at) from public.attendance_logs l where l.user_id = u.id), u.created_at)
from public.users u
where u.apt_id is not null
on conflict (user_id, apt_id) do nothing;

-- 기존 출석 기록에도 유저의 소속 apt_id 를 채워 넣는다. 지금까지는 유저당
-- 헬스장이 하나뿐이었으니 소급 적용해도 틀릴 수가 없다.
update public.attendance_logs l
set apt_id = u.apt_id
from public.users u
where u.id = l.user_id
  and l.apt_id is null;

-- ═══════════════════════════════════════════════════════════
-- 20260812000008_device_pairings.sql
-- ═══════════════════════════════════════════════════════════

-- QR 페어링: 키오스크에서 체크인한 번호를 폰 앱의 로그인 세션과 연결한다.
--
-- 카카오/구글 로그인은 전화번호를 안 준다(카카오는 사업자등록+심사 전엔 아예
-- 못 받는다). 그래서 키오스크가 번호로 만든 "그림자 계정"과, 폰 앱에서 로그인한
-- 진짜 사람을 이어줄 다리가 필요하다. 그 다리가 이 표다 — 키오스크가 임시 코드를
-- 발급하고, 폰 앱이 그 코드를 스캔해서 완료(complete_pairing, 다음 마이그레이션
-- 들에서 추가)하면 소모된다.

create table if not exists public.device_pairings (
    id                        uuid primary key default uuid_generate_v4(),
    pairing_code              text not null unique,
    candidate_user_id         uuid not null references public.users(id) on delete cascade,
    apt_id                    uuid not null references public.apartments(id) on delete cascade,
    expires_at                timestamptz not null,
    consumed_at               timestamptz,
    consumed_by_auth_user_id  uuid references auth.users(id),
    created_at                timestamptz default now()
);

create index if not exists device_pairings_code_idx on public.device_pairings (pairing_code);
create index if not exists device_pairings_expires_idx on public.device_pairings (expires_at);

comment on table public.device_pairings is
    '키오스크 체크인 후 발급되는 1회성 페어링 코드. 3분 내 폰 앱이 스캔해 완료하지 않으면 만료된다.';

alter table public.device_pairings enable row level security;
-- 다른 테이블과 같은 원칙: anon/authenticated 정책 없음, RPC로만 접근한다.

-- ═══════════════════════════════════════════════════════════
-- 20260812000009_kiosk_pin.sql
-- ═══════════════════════════════════════════════════════════

-- 기기를 "키오스크"로 설정할 때 아무나 못 누르게 막는 PIN.
--
-- 이 앱은 하나의 코드베이스가 태블릿(키오스크)과 개인 폰 양쪽에 깔린다. 최초
-- 실행 시 "이 기기는 무엇인가요?" 를 묻는데, 키오스크를 고르는 순간 그 태블릿은
-- 전용 체크인 화면으로 고정된다. 개인 폰이 실수로(혹은 장난으로) 키오스크
-- 모드가 돼버리면 안 되므로, 단지 관리자가 정한 PIN을 확인한다.
--
-- PIN 을 정하는 RPC/화면은 지금은 만들지 않는다 — 단지 개설 시 관리자가
-- SQL Editor 에서 한 번 넣는 드문 작업이라 UI를 만들 정도는 아니다.
-- 예: update apartments set kiosk_pin_hash = crypt('1234', gen_salt('bf')) where id = '...';

create extension if not exists pgcrypto;

alter table public.apartments
    add column if not exists kiosk_pin_hash text;

comment on column public.apartments.kiosk_pin_hash is
    'crypt() 로 해시된 키오스크 설정 PIN. 관리자가 태블릿 최초 설정 시에만 입력한다.';

create or replace function public.verify_kiosk_pin(p_apt_id uuid, p_pin text)
returns boolean
language plpgsql
security definer
set search_path = public
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
    '태블릿을 키오스크 모드로 설정할 때 PIN을 확인한다. PIN 미설정 단지는 항상 통과.';

revoke all on function public.verify_kiosk_pin(uuid, text) from public;
grant execute on function public.verify_kiosk_pin(uuid, text) to anon, authenticated;

-- ═══════════════════════════════════════════════════════════
-- 20260812000010_kiosk_checkin_rpc.sql
-- ═══════════════════════════════════════════════════════════

-- 키오스크 전용 체크인 RPC. sign_in_with_phone 을 대체한다.
--
-- 예전 sign_in_with_phone 은 "번호 입력 = 그 사람으로 로그인"이었고, 그 결과를
-- 태블릿 화면에 그대로 띄웠다(개인 홈 화면). 이제 태블릿은 출입 체크인만 하고
-- 개인 데이터는 절대 보여주지 않는다 — 그래서 이 함수는 이름·전화번호·포인트
-- 같은 걸 하나도 돌려주지 않는다. 돌려주는 건 "몇 번째 방문인지" 숫자와,
-- 폰 앱과 아직 연결이 안 됐으면 QR 페어링 코드뿐이다.
--
-- 예전과 또 다른 점: 번호가 "다른 단지에 등록돼 있으면 거부"하지 않는다. 이사
-- 대응을 위해 한 사람이 여러 단지를 다닐 수 있게 됐기 때문이다. 대신 이미 다른
-- 단지가 주 소속인 사람이 새 단지에서 처음 체크인하면 prompt_gym_switch 를
-- true 로 돌려줘서, 태블릿이 "이 헬스장으로 바꾸시겠어요?"를 물어볼 수 있게 한다.

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
            'prompt_gym_switch', v_is_new_membership and v_has_existing_membership
        );
    end if;

    return jsonb_build_object(
        'user_id', v_user.id,
        'needs_pairing', false,
        'visit_count', v_membership.visit_count,
        'prompt_gym_switch', v_is_new_membership and v_has_existing_membership
    );
end;
$$;

comment on function public.kiosk_check_in(uuid, text) is
    '태블릿 출입 체크인. 개인정보(이름/포인트/루틴)는 절대 돌려주지 않는다 — user_id, 방문횟수, 페어링 필요 여부뿐.';

revoke all on function public.kiosk_check_in(uuid, text) from public;
grant execute on function public.kiosk_check_in(uuid, text) to anon, authenticated;

-- ═══════════════════════════════════════════════════════════
-- 20260812000011_gym_membership_rpcs.sql
-- ═══════════════════════════════════════════════════════════

-- 이사(헬스장 변경) 대응 RPC 2종.
--
-- confirm_gym_membership 은 키오스크(체크인 직후 "이 헬스장으로 바꿀까요?" 프롬프트)
-- 와 개인 폰 앱(프로필 탭의 소속 전환) 양쪽에서 호출된다. 그래서 anon 도 호출할 수
-- 있게 열어 두되, authenticated 로 호출됐을 때는 자기 것만 바꿀 수 있게 막는다 —
-- 로그인한 사람이 남의 user_id 를 넣어서 남의 소속을 바꿔버리면 안 되기 때문이다.
-- anon(키오스크) 호출은 auth.uid() 자체가 없으니 이 검사를 건너뛴다 —
-- kiosk_check_in 과 같은 신뢰 모델이다.

create or replace function public.confirm_gym_membership(
    p_user_id     uuid,
    p_apt_id      uuid,
    p_make_primary boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_owner_auth_id uuid;
begin
    select auth_user_id into v_owner_auth_id from public.users where id = p_user_id;

    if not found then
        raise exception 'USER_NOT_FOUND' using errcode = 'P0002';
    end if;

    if auth.uid() is not null and v_owner_auth_id is distinct from auth.uid() then
        raise exception 'FORBIDDEN' using errcode = '42501';
    end if;

    if not exists (
        select 1 from public.user_gym_memberships where user_id = p_user_id and apt_id = p_apt_id
    ) then
        raise exception 'MEMBERSHIP_NOT_FOUND' using errcode = 'P0002';
    end if;

    if p_make_primary then
        -- 부분 유니크 인덱스(user_id 당 is_primary=true 1개)를 지키려면
        -- 기존 primary 를 먼저 내리고 새 걸 올려야 한다.
        update public.user_gym_memberships set is_primary = false
        where user_id = p_user_id and is_primary and apt_id <> p_apt_id;

        update public.user_gym_memberships set is_primary = true
        where user_id = p_user_id and apt_id = p_apt_id;

        update public.users set apt_id = p_apt_id where id = p_user_id;
    end if;

    return jsonb_build_object('user_id', p_user_id, 'apt_id', p_apt_id, 'is_primary', p_make_primary);
end;
$$;

comment on function public.confirm_gym_membership(uuid, uuid, boolean) is
    '이 헬스장을 주 소속으로 바꿀지 결정한다. p_make_primary=false 면 "1회성 방문"으로 그냥 둔다(멤버십은 이미 kiosk_check_in 이 만들어 둔 상태).';

revoke all on function public.confirm_gym_membership(uuid, uuid, boolean) from public;
grant execute on function public.confirm_gym_membership(uuid, uuid, boolean) to anon, authenticated;


-- 프로필 탭에서 "내 헬스장 목록" 보여줄 때 쓴다. 개인 앱 전용이라 authenticated 만
-- 받고, p_user_id 가 본인 것인지 auth.uid() 로 반드시 확인한다(anon 은 아예 거부).

create or replace function public.list_my_gym_memberships(p_user_id uuid)
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
        jsonb_agg(
            jsonb_build_object(
                'apt_id', m.apt_id,
                'apt_name', a.name,
                'is_primary', m.is_primary,
                'visit_count', m.visit_count,
                'first_checked_in_at', m.first_checked_in_at,
                'last_checked_in_at', m.last_checked_in_at
            )
            order by m.is_primary desc, m.last_checked_in_at desc
        ),
        '[]'::jsonb
    )
    from public.user_gym_memberships m
    join public.apartments a on a.id = m.apt_id
    where m.user_id = p_user_id;
end;
$$;

comment on function public.list_my_gym_memberships(uuid) is
    '내가 다닌 헬스장 목록(주 소속 우선, 최근 방문순). 개인 앱 전용, 본인 것만 조회 가능.';

revoke all on function public.list_my_gym_memberships(uuid) from public;
grant execute on function public.list_my_gym_memberships(uuid) to authenticated;

-- ═══════════════════════════════════════════════════════════
-- 20260812000012_pairing_rpcs.sql
-- ═══════════════════════════════════════════════════════════

-- QR 페어링 완료 처리 + 카카오/구글 최초 로그인 시 프로필 생성.

-- 페어링이 "병합"으로 끝나면(카카오로 먼저 가입한 계정이 이미 있어서, 키오스크가
-- 번호로 만든 그림자 계정을 흡수하는 경우) 그림자 계정(users 행)이 지워진다.
-- candidate_user_id 를 on delete cascade 로 두면 이 페어링 기록 자체가 같이
-- 지워져서, 그 순간 키오스크가 상태를 조회하면 "없음(not_found)"으로 보여
-- 방금 성공한 페어링을 실패로 착각하게 된다. 상태 조회는 PII 를 안 돌려주므로
-- candidate_user_id 가 나중에 null 이 돼도 문제없다.
alter table public.device_pairings
    alter column candidate_user_id drop not null;

alter table public.device_pairings
    drop constraint device_pairings_candidate_user_id_fkey;

alter table public.device_pairings
    add constraint device_pairings_candidate_user_id_fkey
    foreign key (candidate_user_id) references public.users(id) on delete set null;


-- ─────────────────────────────────────────────────────────────
-- 키오스크가 폴링하는 상태 조회. PII 없이 상태 문자열만.
-- ─────────────────────────────────────────────────────────────

create or replace function public.get_pairing_status(p_pairing_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_pairing public.device_pairings;
begin
    select * into v_pairing from public.device_pairings where pairing_code = p_pairing_code;

    if not found then
        return jsonb_build_object('status', 'not_found');
    elsif v_pairing.consumed_at is not null then
        return jsonb_build_object('status', 'consumed');
    elsif v_pairing.expires_at < now() then
        return jsonb_build_object('status', 'expired');
    else
        return jsonb_build_object('status', 'pending');
    end if;
end;
$$;

comment on function public.get_pairing_status(text) is
    '키오스크가 2초 간격으로 폴링. PII 없이 상태(pending/consumed/expired/not_found)만 돌려준다.';

revoke all on function public.get_pairing_status(text) from public;
grant execute on function public.get_pairing_status(text) to anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 폰 앱이 QR 을 스캔한 뒤(또는 카메라 대신 코드를 직접 입력한 뒤) 호출.
-- 지금 로그인된 auth.uid() 를 이 코드가 가리키는 계정에 연결한다.
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
    select * into v_existing from public.users where auth_user_id = auth.uid();

    if v_existing is null then
        update public.users set auth_user_id = auth.uid() where id = v_candidate.id
        returning * into v_final_user;

    elsif v_existing.id = v_candidate.id then
        -- 이미 페어링된 코드를 다시 스캔한 경우. no-op.
        v_final_user := v_existing;

    else
        -- 병합: 카카오/구글로 먼저 만든 계정(v_existing)이 살아남고, 키오스크가
        -- 번호로 만든 그림자 계정(v_candidate)은 흡수된다.
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
                -- existing 의 주 소속을 침범하면 안 되니 옮겨 붙일 때는 무조건 false 로 둔다.
                update public.user_gym_memberships
                set user_id = v_existing.id, is_primary = false
                where id = v_membership.id;
            end if;
        end loop;

        -- existing 이 원래 멤버십이 하나도 없었다면(예: 카카오 가입 직후 첫 페어링),
        -- 위에서 전부 is_primary=false 로 옮겨져 주 소속이 없는 상태가 된다.
        -- candidate 가 원래 갖고 있던 주 소속을 물려준다.
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

        -- daily_routines 는 (user_id, equip_id, routine_date) 유니크라, 옮기기 전에
        -- existing 이 이미 같은 조합을 갖고 있으면 candidate 쪽을 버린다(진짜 기록 보존).
        delete from public.daily_routines d
        where d.user_id = v_candidate.id
          and exists (
              select 1 from public.daily_routines d2
              where d2.user_id = v_existing.id
                and d2.equip_id = d.equip_id
                and d2.routine_date = d.routine_date
          );
        update public.daily_routines set user_id = v_existing.id where user_id = v_candidate.id;

        -- 그림자 계정을 지운다. candidate 의 phone_number 는 로컬 변수에 이미
        -- 담아 뒀으니, 행이 사라진 뒤에 옮겨야 unique 제약이 잠깐이라도 안 깨진다.
        delete from public.users where id = v_candidate.id;

        if v_existing.phone_number is null then
            update public.users set phone_number = v_candidate_phone where id = v_existing.id;
        end if;

        select * into v_final_user from public.users where id = v_existing.id;
    end if;

    update public.device_pairings
    set consumed_at = now(), consumed_by_auth_user_id = auth.uid()
    where id = v_pairing.id;

    return jsonb_build_object('user', to_jsonb(v_final_user));
end;
$$;

comment on function public.complete_pairing(text) is
    'QR/코드 페어링을 완료한다. 이미 카카오·구글 계정이 있으면 그림자 계정(번호로만 있던 계정)을 흡수 병합한다.';

revoke all on function public.complete_pairing(text) from public;
grant execute on function public.complete_pairing(text) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 카카오/구글로 처음 로그인했을 때 public.users 행을 만든다(아직 전화번호 없음).
-- 이미 있으면(재로그인) 그대로 돌려준다.
-- ─────────────────────────────────────────────────────────────

create or replace function public.bootstrap_oauth_profile()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user public.users;
begin
    if auth.uid() is null then
        raise exception 'AUTH_REQUIRED' using errcode = '42501';
    end if;

    select * into v_user from public.users where auth_user_id = auth.uid();

    if not found then
        insert into public.users (auth_user_id) values (auth.uid()) returning * into v_user;
    end if;

    return jsonb_build_object('user', to_jsonb(v_user));
end;
$$;

comment on function public.bootstrap_oauth_profile() is
    '카카오/구글 로그인 직후 호출. 처음이면 전화번호 없는 프로필을 만들고, 있으면 그대로 돌려준다.';

revoke all on function public.bootstrap_oauth_profile() from public;
grant execute on function public.bootstrap_oauth_profile() to authenticated;

-- ═══════════════════════════════════════════════════════════
-- 20260812000013_workout_completion.sql
-- ═══════════════════════════════════════════════════════════

-- 운동 완료 기록을 실제로 저장한다.
--
-- 지금까지 daily_routines.is_completed 는 컬럼만 있고 채워주는 곳이 없었다.
-- 폰 앱의 세트 진행 화면(WorkoutSession)이 "몇 칸에 꽂았는지" 를 화면에만
-- 보여주고 서버에 저장하지 않는 갭이 있었는데, 여기서 메운다.

alter table public.daily_routines
    add column if not exists actual_weight_kg numeric,
    add column if not exists actual_reps integer,
    add column if not exists completed_at timestamptz,
    add column if not exists points_awarded integer not null default 0;

comment on column public.daily_routines.actual_weight_kg is
    '실제로 꽂은 무게(kg 환산). target_weight 는 처방값, 이건 실제 수행값.';
comment on column public.daily_routines.actual_reps is '실제로 한 횟수.';


create or replace function public.complete_routine(
    p_routine_id       uuid,
    p_actual_weight_kg numeric default null,
    p_actual_reps      integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_routine       public.daily_routines;
    v_owner_auth_id uuid;
    -- 완료 1건당 지급 포인트. 지금은 난이도 무관 고정값이고, 나중에 세트·무게
    -- 기준 차등 지급을 붙일 수 있는 자리로 남겨 둔다.
    v_points        constant integer := 10;
begin
    if auth.uid() is null then
        raise exception 'AUTH_REQUIRED' using errcode = '42501';
    end if;

    select * into v_routine from public.daily_routines where id = p_routine_id;

    if not found then
        raise exception 'ROUTINE_NOT_FOUND' using errcode = 'P0002';
    end if;

    select auth_user_id into v_owner_auth_id from public.users where id = v_routine.user_id;

    if v_owner_auth_id is distinct from auth.uid() then
        raise exception 'FORBIDDEN' using errcode = '42501';
    end if;

    if v_routine.is_completed then
        -- 이미 완료 처리된 걸 다시 눌러도 포인트를 또 주지 않는다.
        return jsonb_build_object('routine', to_jsonb(v_routine), 'points_awarded', 0);
    end if;

    update public.daily_routines
    set is_completed = true,
        actual_weight_kg = p_actual_weight_kg,
        actual_reps = p_actual_reps,
        completed_at = now(),
        points_awarded = v_points
    where id = p_routine_id
    returning * into v_routine;

    update public.users set total_points = total_points + v_points where id = v_routine.user_id;

    return jsonb_build_object('routine', to_jsonb(v_routine), 'points_awarded', v_points);
end;
$$;

comment on function public.complete_routine(uuid, numeric, integer) is
    '운동 완료 처리 + 포인트 지급. 개인 앱 전용, 본인 루틴만 완료할 수 있다.';

revoke all on function public.complete_routine(uuid, numeric, integer) from public;
grant execute on function public.complete_routine(uuid, numeric, integer) to authenticated;

-- ═══════════════════════════════════════════════════════════
-- 20260812000014_generate_daily_routine_apt_param.sql
-- ═══════════════════════════════════════════════════════════

-- generate_daily_routine 에 단지 파라미터를 추가한다.
--
-- 지금까지는 무조건 v_user.apt_id(주 소속)의 기구로만 루틴을 짰다. 이사 대응이
-- 들어오면서 한 사람이 오늘은 A, 다음 주엔 이사 간 B 에서 운동할 수 있게 됐는데,
-- 주 소속 하나만 보면 오늘 실제로 있는 헬스장과 다른 곳 기구로 루틴이 짜일 수
-- 있다. p_apt_id 를 안 주면 예전처럼 주 소속을 쓰므로(coalesce), 기존 호출부는
-- 코드 변경 없이 그대로 동작한다.
--
-- Postgres 는 매개변수 개수가 다르면 별개 함수로 취급하므로, 예전 2-인자 버전을
-- 먼저 지우고 3-인자로 다시 만든다 — 안 지우면 두 버전이 동시에 남아 헷갈린다.

drop function if exists public.generate_daily_routine(uuid, date);

create or replace function public.generate_daily_routine(
    p_user_id uuid,
    p_date    date default current_date,
    p_apt_id  uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user          public.users;
    v_target_apt_id uuid;
    v_gender        text;
    v_age_group     integer;
    v_goals_key     text;
    v_pain_areas    text[];
    v_template_id   uuid;
    v_created       integer := 0;
    v_excluded      integer := 0;
    v_unmapped      integer := 0;
begin
    select * into v_user from public.users u where u.id = p_user_id;
    if not found then
        raise exception 'USER_NOT_FOUND' using errcode = 'P0002';
    end if;

    v_target_apt_id := coalesce(p_apt_id, v_user.apt_id);

    -- 프로필이 비어 있으면 가장 보수적인(=가벼운) 쪽으로 떨어뜨린다.
    -- 설문을 덜 마친 사람에게 과한 무게를 주는 것보다 낫다.
    v_gender := coalesce(v_user.profile_data->>'gender', 'female');
    v_age_group := coalesce((v_user.profile_data->>'age_group')::integer, 70);

    v_goals_key := coalesce(nullif(array_to_string(
        array(
            select jsonb_array_elements_text(v_user.profile_data->'goals') order by 1
        ), '+'), ''), 'health');

    v_pain_areas := case
        when jsonb_typeof(v_user.profile_data->'pain_areas') = 'array'
            then array(select jsonb_array_elements_text(v_user.profile_data->'pain_areas'))
        else '{}'::text[]
    end;

    select t.id into v_template_id
    from public.routine_templates t
    where t.gender = v_gender and t.age_group = v_age_group and t.goals_key = v_goals_key;

    -- 알 수 없는 조합이면 같은 성별·연령대의 '건강 유지'로 떨어뜨린다.
    if not found then
        select t.id into v_template_id
        from public.routine_templates t
        where t.gender = v_gender and t.age_group = v_age_group and t.goals_key = 'health';
    end if;

    if v_template_id is null then
        raise exception 'ROUTINE_TEMPLATE_NOT_FOUND' using errcode = 'P0002';
    end if;

    -- 아픈 곳 때문에 통째로 빠진 운동 수
    select count(*) into v_excluded
    from public.routine_template_items i
    where i.template_id = v_template_id
      and exists (
          select 1 from public.pain_area_rules r
          where r.action = 'exclude'
            and r.target_muscle = i.target_muscle
            and r.pain_area = any (v_pain_areas)
      );

    -- 남았지만 이 단지에 해당 기구가 없어서 못 넣은 운동 수
    select count(*) into v_unmapped
    from public.routine_template_items i
    where i.template_id = v_template_id
      and not exists (
          select 1 from public.pain_area_rules r
          where r.action = 'exclude'
            and r.target_muscle = i.target_muscle
            and r.pain_area = any (v_pain_areas)
      )
      and not exists (
          select 1 from public.equipments e
          where e.apt_id = v_target_apt_id and e.target_muscle = i.target_muscle
      );

    with candidate as (
        select
            i.target_muscle,
            i.sets,
            i.reps,
            i.weight_ratio,
            i.sort_order,
            -- derate 규칙이 여러 개 걸리면 가장 낮은 배율을 쓴다.
            coalesce((
                select min(r.weight_multiplier)
                from public.pain_area_rules r
                where r.action = 'derate'
                  and r.target_muscle = i.target_muscle
                  and r.pain_area = any (v_pain_areas)
            ), 1.0) as derate
        from public.routine_template_items i
        where i.template_id = v_template_id
          and not exists (
              select 1 from public.pain_area_rules r
              where r.action = 'exclude'
                and r.target_muscle = i.target_muscle
                and r.pain_area = any (v_pain_areas)
          )
    ),
    matched as (
        select c.*, e.id as equip_id, e.base_weight_kg, e.weight_step_kg
        from candidate c
        join lateral (
            select e.*
            from public.equipments e
            where e.apt_id = v_target_apt_id and e.target_muscle = c.target_muscle
            order by e.name
            limit 1
        ) e on true
    ),
    saved as (
        insert into public.daily_routines
            (user_id, equip_id, routine_date, target_weight, target_sets, target_reps, sort_order)
        select
            p_user_id,
            m.equip_id,
            p_date,
            case
                when m.base_weight_kg is null then null
                -- 기구 조절 단위로 내림한다. 반올림하면 계산된 무게보다 무거워질 수 있는데,
                -- 시니어에게는 조금 가벼운 쪽이 틀리는 방향으로 안전하다.
                else greatest(
                    m.weight_step_kg,
                    (floor(m.base_weight_kg * m.weight_ratio * m.derate / m.weight_step_kg)
                        * m.weight_step_kg)::integer
                )
            end,
            m.sets,
            m.reps,
            m.sort_order
        from matched m
        order by m.sort_order
        on conflict (user_id, equip_id, routine_date) do nothing
        returning 1
    )
    select count(*) into v_created from saved;

    return jsonb_build_object(
        'routine_date', p_date,
        'template', jsonb_build_object(
            'gender', v_gender, 'age_group', v_age_group, 'goals_key', v_goals_key
        ),
        'created', v_created,
        'excluded_by_pain', v_excluded,
        'missing_equipment', v_unmapped,
        -- 사람이 봐야 하는 경우: 아픈 곳 때문에 운동이 하나도 안 남았거나,
        -- 아픈 곳을 3군데 이상 고른 분. 규칙 기반 자동 처방으로 감당할 범위를 넘는다.
        'needs_trainer_review',
            (v_created = 0 and v_excluded > 0) or coalesce(array_length(v_pain_areas, 1), 0) >= 3,
        'routines', public.get_daily_routine(p_user_id, p_date)
    );
end;
$$;

comment on function public.generate_daily_routine(uuid, date, uuid) is
    '미리 조합해 둔 템플릿 + 아픈 곳 규칙 + 단지 보유 기구로 하루 루틴을 만든다. p_apt_id 를 안 주면 주 소속을 쓴다.';

revoke all on function public.generate_daily_routine(uuid, date, uuid) from public;
grant execute on function public.generate_daily_routine(uuid, date, uuid) to anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 오늘 실제로 체크인한 헬스장을 알아낸다. 개인 앱이 generate_daily_routine 을
-- 부르기 전에 먼저 물어봐서, "오늘 있는 헬스장" 기구로 루틴을 짜게 한다.
-- 오늘 체크인 기록이 없으면(직접 앱만 켠 경우) 주 소속으로 대체한다.
-- ─────────────────────────────────────────────────────────────

create or replace function public.get_todays_checkin(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_owner_auth_id uuid;
    v_apt_id        uuid;
    v_today         date := (now() at time zone 'Asia/Seoul')::date;
begin
    if auth.uid() is null then
        raise exception 'AUTH_REQUIRED' using errcode = '42501';
    end if;

    select auth_user_id into v_owner_auth_id from public.users where id = p_user_id;
    if not found or v_owner_auth_id is distinct from auth.uid() then
        raise exception 'FORBIDDEN' using errcode = '42501';
    end if;

    select l.apt_id into v_apt_id
    from public.attendance_logs l
    where l.user_id = p_user_id
      and (l.attended_at at time zone 'Asia/Seoul')::date = v_today
    order by l.attended_at desc
    limit 1;

    if v_apt_id is null then
        select apt_id into v_apt_id from public.users where id = p_user_id;
    end if;

    return jsonb_build_object('apt_id', v_apt_id);
end;
$$;

comment on function public.get_todays_checkin(uuid) is
    '오늘 체크인한 헬스장(없으면 주 소속)을 돌려준다. 개인 앱 전용, 본인 것만.';

revoke all on function public.get_todays_checkin(uuid) from public;
grant execute on function public.get_todays_checkin(uuid) to authenticated;

-- ═══════════════════════════════════════════════════════════
-- 20260812000015_attendance_and_analysis_rpcs.sql
-- ═══════════════════════════════════════════════════════════

-- 달력 / 분석 탭용 RPC 3종. 전부 개인 앱 전용(authenticated), 본인 것만 조회 가능.

create or replace function public.get_attendance_days(p_user_id uuid, p_month date)
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
        jsonb_agg(distinct day order by day),
        '[]'::jsonb
    )
    from (
        select (attended_at at time zone 'Asia/Seoul')::date as day
        from public.attendance_logs
        where user_id = p_user_id
          and date_trunc('month', (attended_at at time zone 'Asia/Seoul')::date) = date_trunc('month', p_month)
    ) days;
end;
$$;

comment on function public.get_attendance_days(uuid, date) is
    '해당 월에 출석한 날짜 목록(어느 헬스장이든). 달력 탭에서 점 찍는 용도.';

revoke all on function public.get_attendance_days(uuid, date) from public;
grant execute on function public.get_attendance_days(uuid, date) to authenticated;


-- 분석 탭 원시 집계. 칼로리 같은 가공값은 여기서 계산하지 않는다 — 공식이 데모
-- 피드백으로 자주 바뀔 것이므로 클라이언트(analysis/calorie.ts)에서 계산한다.

create or replace function public.get_workout_summary(p_user_id uuid, p_from date, p_to date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_owner_auth_id  uuid;
    v_completed_count integer;
    v_total_sets      integer;
    v_by_muscle       jsonb;
begin
    if auth.uid() is null then
        raise exception 'AUTH_REQUIRED' using errcode = '42501';
    end if;

    select auth_user_id into v_owner_auth_id from public.users where id = p_user_id;
    if not found or v_owner_auth_id is distinct from auth.uid() then
        raise exception 'FORBIDDEN' using errcode = '42501';
    end if;

    select count(*), coalesce(sum(d.target_sets), 0)
    into v_completed_count, v_total_sets
    from public.daily_routines d
    where d.user_id = p_user_id and d.is_completed
      and d.routine_date between p_from and p_to;

    select coalesce(
        jsonb_agg(
            jsonb_build_object(
                'target_muscle', t.target_muscle,
                'completed_count', t.completed_count,
                'total_sets', t.total_sets
            )
            order by t.total_sets desc
        ),
        '[]'::jsonb
    )
    into v_by_muscle
    from (
        select e.target_muscle, count(*) as completed_count, coalesce(sum(d.target_sets), 0) as total_sets
        from public.daily_routines d
        join public.equipments e on e.id = d.equip_id
        where d.user_id = p_user_id and d.is_completed
          and d.routine_date between p_from and p_to
        group by e.target_muscle
    ) t;

    return jsonb_build_object(
        'completed_count', v_completed_count,
        'total_sets', v_total_sets,
        'by_muscle', v_by_muscle
    );
end;
$$;

comment on function public.get_workout_summary(uuid, date, date) is
    '기간 내 완료 운동 원시 집계(완료 개수, 총 세트, 부위별). 칼로리 등 가공은 클라이언트가 한다.';

revoke all on function public.get_workout_summary(uuid, date, date) from public;
grant execute on function public.get_workout_summary(uuid, date, date) to authenticated;


-- 운동 탭 상단 "DAY_N" 배지용. 어느 헬스장이든 상관없이 평생 출석한 날 수를 센다.

create or replace function public.get_visit_stats(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_owner_auth_id      uuid;
    v_total_days         integer;
    v_first_attended_at  timestamptz;
begin
    if auth.uid() is null then
        raise exception 'AUTH_REQUIRED' using errcode = '42501';
    end if;

    select auth_user_id into v_owner_auth_id from public.users where id = p_user_id;
    if not found or v_owner_auth_id is distinct from auth.uid() then
        raise exception 'FORBIDDEN' using errcode = '42501';
    end if;

    select count(distinct (attended_at at time zone 'Asia/Seoul')::date), min(attended_at)
    into v_total_days, v_first_attended_at
    from public.attendance_logs
    where user_id = p_user_id;

    return jsonb_build_object(
        'total_days', coalesce(v_total_days, 0),
        'first_attended_at', v_first_attended_at
    );
end;
$$;

comment on function public.get_visit_stats(uuid) is
    '평생 출석일 수(DAY_N 배지용)와 첫 출석일. 헬스장 구분 없이 센다.';

revoke all on function public.get_visit_stats(uuid) from public;
grant execute on function public.get_visit_stats(uuid) to authenticated;

-- ═══════════════════════════════════════════════════════════
-- 20260812000016_ranking_rpc.sql
-- ═══════════════════════════════════════════════════════════

-- 랭킹 탭. 같은 아파트 단지 내에서만 비교한다(요구사항 확정: 전체 통합 랭킹 아님).
-- 전화번호 등 PII 는 절대 안 돌려주고, 닉네임(없으면 회원+짧은 접미사)과 포인트만.

create or replace function public.get_apartment_leaderboard(p_apt_id uuid, p_limit integer default 50)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_me uuid;
begin
    if auth.uid() is null then
        raise exception 'AUTH_REQUIRED' using errcode = '42501';
    end if;

    select id into v_me from public.users where auth_user_id = auth.uid();

    return coalesce(
        jsonb_agg(
            jsonb_build_object(
                'rank', lb.rnk,
                'nickname', coalesce(lb.profile_data->>'nickname', '회원' || right(lb.id::text, 4)),
                'total_points', lb.total_points,
                'is_me', lb.id = v_me
            )
            order by lb.rnk
        ),
        '[]'::jsonb
    )
    from (
        select
            u.id, u.profile_data, u.total_points,
            row_number() over (order by u.total_points desc, u.created_at asc) as rnk
        from public.users u
        join public.user_gym_memberships m on m.user_id = u.id and m.apt_id = p_apt_id
    ) lb
    -- 상위 p_limit 명 + 그 밖이어도 내 순위는 항상 포함(고정 행으로 보여주기 위해)
    where lb.rnk <= p_limit or lb.id = v_me;
end;
$$;

comment on function public.get_apartment_leaderboard(uuid, integer) is
    '같은 단지 포인트 랭킹. 닉네임/포인트만 노출, 전화번호 등 PII 없음. 개인 앱 전용.';

revoke all on function public.get_apartment_leaderboard(uuid, integer) from public;
grant execute on function public.get_apartment_leaderboard(uuid, integer) to authenticated;

-- ═══════════════════════════════════════════════════════════
-- 20260812000017_drop_sign_in_with_phone.sql
-- ═══════════════════════════════════════════════════════════

-- sign_in_with_phone 정리.
--
-- kiosk_check_in(20260812000010) 이 완전히 대체했다. 클라이언트 쪽 실제 호출부
-- (.rpc('sign_in_with_phone')) 가 0건임을 확인한 뒤에 지운다.
--
-- 이 함수는 "전화번호만 알면 로그인된다"는, README 에 명시돼 있던 알려진 보안
-- 부채였다. kiosk_check_in 은 이름·전화번호·포인트 같은 개인정보를 전혀 돌려
-- 주지 않으므로, 이 함수를 지우는 순간 그 부채도 함께 없어진다.

drop function if exists public.sign_in_with_phone(uuid, text, jsonb);

-- ═══════════════════════════════════════════════════════════
-- 20260812000018_ranking_by_attendance.sql
-- ═══════════════════════════════════════════════════════════

-- 랭킹 기준을 포인트에서 출석 횟수로 바꾼다.
--
-- 포인트는 완료 버튼을 누르기만 하면 쌓인다 — 실제로 그 무게를 들었는지,
-- 자세가 맞았는지 검증할 방법이 없다. 반면 출석은 키오스크 체크인이 있어야만
-- 기록되므로(kiosk_check_in), 최소한 "그 헬스장에 실제로 왔다"는 사실은
-- 조작하기 어렵다. 랭킹처럼 다른 사람과 비교하는 기능은 검증 가능한 지표를
-- 써야 공정하다.
--
-- 이 단지에서 출석한 날 수(distinct day)로 순위를 매긴다. 포인트는 응답에
-- 계속 넣어 두되(운동 탭 등 다른 곳에서 여전히 쓰이므로) 정렬 기준에서는 뺀다.

create or replace function public.get_apartment_leaderboard(p_apt_id uuid, p_limit integer default 50)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_me uuid;
begin
    if auth.uid() is null then
        raise exception 'AUTH_REQUIRED' using errcode = '42501';
    end if;

    select id into v_me from public.users where auth_user_id = auth.uid();

    return coalesce(
        jsonb_agg(
            jsonb_build_object(
                'rank', lb.rnk,
                'nickname', coalesce(lb.profile_data->>'nickname', '회원' || right(lb.id::text, 4)),
                'attendance_count', lb.attendance_count,
                'total_points', lb.total_points,
                'is_me', lb.id = v_me
            )
            order by lb.rnk
        ),
        '[]'::jsonb
    )
    from (
        select
            u.id,
            u.profile_data,
            u.total_points,
            count(distinct (l.attended_at at time zone 'Asia/Seoul')::date) as attendance_count,
            row_number() over (
                order by count(distinct (l.attended_at at time zone 'Asia/Seoul')::date) desc,
                         u.created_at asc
            ) as rnk
        from public.users u
        join public.user_gym_memberships m on m.user_id = u.id and m.apt_id = p_apt_id
        left join public.attendance_logs l on l.user_id = u.id and l.apt_id = p_apt_id
        group by u.id, u.profile_data, u.total_points, u.created_at
    ) lb
    -- 상위 p_limit 명 + 그 밖이어도 내 순위는 항상 포함(고정 행으로 보여주기 위해)
    where lb.rnk <= p_limit or lb.id = v_me;
end;
$$;

comment on function public.get_apartment_leaderboard(uuid, integer) is
    '같은 단지 출석 랭킹(포인트 아님 — 자기신고라 검증 불가). 닉네임/출석횟수/포인트만 노출, PII 없음.';

revoke all on function public.get_apartment_leaderboard(uuid, integer) from public;
grant execute on function public.get_apartment_leaderboard(uuid, integer) to authenticated;

-- ═══════════════════════════════════════════════════════════
-- 20260812000019_equipment_description.sql
-- ═══════════════════════════════════════════════════════════

-- 기구 이름만으로는 시니어에게 무슨 운동인지 안 와닿는다("체스트 프레스"가
-- 뭔지 모르는 분이 많다). 트레이너/관리자가 쉬운 말로 채울 수 있는 설명 칸을
-- 추가한다. 채워지면 화면에서 이름 아래에 그대로 보여준다.
--
-- 자동 생성하지 않는다 — 기구 이름만 보고 동작을 지어내면 틀린 자세를
-- 안내하게 된다(실제 이 앱의 하는 방법 안내 원칙과 같다: 확실한 것만 말한다).

alter table public.equipments
    add column if not exists description text;

comment on column public.equipments.description is
    '시니어가 이해하기 쉬운 한 줄 설명. 예: "앉아서 다리를 앞으로 미는 동작으로 허벅지를 강화합니다." 비어 있으면 화면에서 부위명으로 대체.';

create or replace function public.get_daily_routine(
    p_user_id uuid,
    p_date    date default current_date
)
returns jsonb
language sql
security definer
set search_path = public
as $$
    select coalesce(jsonb_agg(row order by sort_order, name), '[]'::jsonb)
    from (
        select d.sort_order, e.name, jsonb_build_object(
            'routine_id', d.id,
            'equip_id', e.id,
            'name', e.name,
            'description', e.description,
            'target_muscle', e.target_muscle,
            'video_url', e.video_url,
            'qr_code_val', e.qr_code_val,
            'target_weight', d.target_weight,
            'target_sets', d.target_sets,
            'target_reps', d.target_reps,
            'is_completed', d.is_completed
        ) as row
        from public.daily_routines d
        join public.equipments e on e.id = d.equip_id
        where d.user_id = p_user_id and d.routine_date = p_date
    ) rows;
$$;

comment on function public.get_daily_routine(uuid, date) is
    '해당 날짜의 루틴을 기구 정보(쉬운 설명 포함)와 함께 돌려준다.';

revoke all on function public.get_daily_routine(uuid, date) from public;
grant execute on function public.get_daily_routine(uuid, date) to anon, authenticated;


-- 시범단지 기구 5대에 예시 설명을 채운다.
update public.equipments set description = '의자에 앉아 손잡이를 앞으로 밀어내는 동작입니다. 가슴 근육을 키웁니다.'
    where qr_code_val = 'FIT-DEMO-CHEST-01';
update public.equipments set description = '위에서 손잡이를 아래로 당기는 동작입니다. 등 근육을 키워 굽은 등을 펴는 데 도움됩니다.'
    where qr_code_val = 'FIT-DEMO-LAT-01';
update public.equipments set description = '의자에 앉아 발판을 다리로 밀어내는 동작입니다. 허벅지와 엉덩이 근육을 키웁니다.'
    where qr_code_val = 'FIT-DEMO-LEG-01';
update public.equipments set description = '의자에 앉아 손잡이를 머리 위로 밀어올리는 동작입니다. 어깨 근육을 키웁니다.'
    where qr_code_val = 'FIT-DEMO-SHLD-01';
update public.equipments set description = '등받이에 기대 앉아 상체를 앞으로 숙이는 동작입니다. 뱃살 관리와 허리 힘에 도움됩니다.'
    where qr_code_val = 'FIT-DEMO-ABD-01';

-- ═══════════════════════════════════════════════════════════
-- seed.sql — 시범단지 + 기구 5대 (테스트용)
-- ═══════════════════════════════════════════════════════════

-- 로컬/개발용 시드 데이터.
-- apt_id 는 태블릿 앱의 EXPO_PUBLIC_FITROUTINE_APT_ID 와 맞춘다.

insert into public.apartments (id, name, address)
values (
    '11111111-1111-4111-8111-111111111111',
    '핏루틴 시범단지',
    '서울특별시 강남구 테헤란로 1'
)
on conflict (id) do nothing;

-- base_weight_kg 는 "표준 성인 남성 시작 무게" 기준이다. 여기에 연령대·성별·목적·
-- 아픈 곳 배율이 곱해져 개인별 무게가 나오므로, 단지마다 기구 사양에 맞춰 조정한다.
-- description 은 기구 이름만으로는 이해하기 어려운 시니어를 위한 쉬운 설명이다.
insert into public.equipments
    (apt_id, qr_code_val, name, description, target_muscle, video_url, base_weight_kg, weight_step_kg)
values
    ('11111111-1111-4111-8111-111111111111', 'FIT-DEMO-CHEST-01', '체스트 프레스', '의자에 앉아 손잡이를 앞으로 밀어내는 동작입니다. 가슴 근육을 키웁니다.', '가슴', 'https://example.com/videos/chest-press.mp4', 20, 5),
    ('11111111-1111-4111-8111-111111111111', 'FIT-DEMO-LAT-01',   '랫 풀다운',     '위에서 손잡이를 아래로 당기는 동작입니다. 등 근육을 키워 굽은 등을 펴는 데 도움됩니다.', '등', 'https://example.com/videos/lat-pulldown.mp4', 25, 5),
    ('11111111-1111-4111-8111-111111111111', 'FIT-DEMO-LEG-01',   '레그 프레스',   '의자에 앉아 발판을 다리로 밀어내는 동작입니다. 허벅지와 엉덩이 근육을 키웁니다.', '하체', 'https://example.com/videos/leg-press.mp4', 40, 10),
    ('11111111-1111-4111-8111-111111111111', 'FIT-DEMO-SHLD-01',  '숄더 프레스',   '의자에 앉아 손잡이를 머리 위로 밀어올리는 동작입니다. 어깨 근육을 키웁니다.', '어깨', 'https://example.com/videos/shoulder-press.mp4', 15, 5),
    ('11111111-1111-4111-8111-111111111111', 'FIT-DEMO-ABD-01',   '복부 크런치',   '등받이에 기대 앉아 상체를 앞으로 숙이는 동작입니다. 뱃살 관리와 허리 힘에 도움됩니다.', '복부', 'https://example.com/videos/ab-crunch.mp4', 10, 5)
on conflict (qr_code_val) do nothing;
