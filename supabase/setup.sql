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
insert into public.equipments
    (apt_id, qr_code_val, name, target_muscle, video_url, base_weight_kg, weight_step_kg)
values
    ('11111111-1111-4111-8111-111111111111', 'FIT-DEMO-CHEST-01', '체스트 프레스', '가슴',   'https://example.com/videos/chest-press.mp4',    20,  5),
    ('11111111-1111-4111-8111-111111111111', 'FIT-DEMO-LAT-01',   '랫 풀다운',     '등',     'https://example.com/videos/lat-pulldown.mp4',   25,  5),
    ('11111111-1111-4111-8111-111111111111', 'FIT-DEMO-LEG-01',   '레그 프레스',   '하체',   'https://example.com/videos/leg-press.mp4',      40, 10),
    ('11111111-1111-4111-8111-111111111111', 'FIT-DEMO-SHLD-01',  '숄더 프레스',   '어깨',   'https://example.com/videos/shoulder-press.mp4', 15,  5),
    ('11111111-1111-4111-8111-111111111111', 'FIT-DEMO-ABD-01',   '복부 크런치',   '복부',   'https://example.com/videos/ab-crunch.mp4',      10,  5)
on conflict (qr_code_val) do nothing;
