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
-- 20260812000020_equipment_qr_lookup.sql
-- ═══════════════════════════════════════════════════════════

-- 기구 앞 QR 을 찍으면 오늘 루틴에 없는 기구라도 설명/영상을 볼 수 있어야
-- 한다("궁금한 운동을 QR로 찍어도 오늘 루틴엔 없어도 할 수가 있어야겠네").
--
-- 지금까지는 get_daily_routine 으로 "오늘 처방된 기구"만 조회할 수 있었다.
-- 이 RPC 는 qr_code_val 하나로 기구 자체를 바로 찾는다 — 처방 여부와 무관.
--
-- 기구 정보(이름/설명/부위/영상)는 개인정보가 아니라서 로그인 없이도 봐도
-- 안전하다고 판단해 anon 에도 연다 — 나중에 키오스크 옆 안내판이나 웹
-- 미리보기 같은 비로그인 경로가 생겨도 바로 쓸 수 있게.
create or replace function public.get_equipment_by_qr(
    p_qr_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_equip public.equipments;
begin
    select * into v_equip from public.equipments where qr_code_val = p_qr_code;

    if not found then
        raise exception 'EQUIPMENT_NOT_FOUND' using errcode = 'P0002';
    end if;

    return jsonb_build_object(
        'id', v_equip.id,
        'name', v_equip.name,
        'description', v_equip.description,
        'target_muscle', v_equip.target_muscle,
        'video_url', v_equip.video_url,
        'qr_code_val', v_equip.qr_code_val,
        'base_weight_kg', v_equip.base_weight_kg,
        'weight_step_kg', v_equip.weight_step_kg
    );
end;
$$;

comment on function public.get_equipment_by_qr(text) is
    'QR 코드 값으로 기구를 바로 찾는다. 오늘 처방 루틴에 있는지와 무관하게
    누구나 설명/영상을 볼 수 있다. 처방 정보(목표 무게·세트·완료 기록)는
    포함하지 않는다 — 그건 get_daily_routine 이 처방된 기구에 한해서만 준다.';

revoke all on function public.get_equipment_by_qr(text) from public;
grant execute on function public.get_equipment_by_qr(text) to anon, authenticated;


-- ═══════════════════════════════════════════════════════════
-- 20260812000021_cardio_routine.sql
-- ═══════════════════════════════════════════════════════════

-- 운동 루틴에 유산소를 넣는다. 특히 40대 이상은 근력만으로는 부족하고
-- 심혈관 건강 관리가 중요해서 반드시 포함해야 한다("운동 루틴에는 꼭
-- 유산소도 넣어줘야 돼 특히 40대 이상부터는").
--
-- 근력 운동은 "세트 × 횟수 × 무게"로 처방하지만 유산소는 그 틀이 안 맞는다
-- (트레드밀에 몇 회 반복이라는 개념이 없다). 그래서 처방 단위를 하나 더
-- 만든다: 분(duration_minutes). 근력 항목은 reps/weight_ratio 를 쓰고
-- 계속 not null 로 남겨 두고 싶지만, 유산소 항목은 그 둘이 의미가 없으므로
-- nullable 로 바꾼다.

alter table public.routine_template_items
    alter column reps drop not null,
    alter column weight_ratio drop not null,
    add column if not exists duration_minutes integer;

comment on column public.routine_template_items.duration_minutes is
    '유산소 항목의 처방 시간(분). 근력 항목은 null 이고 대신 reps/weight_ratio 를 쓴다.';

alter table public.daily_routines
    add column if not exists target_duration_minutes integer;

comment on column public.daily_routines.target_duration_minutes is
    '유산소 처방 시간(분). 근력 운동이면 null.';


-- ─────────────────────────────────────────────────────────────
-- 템플릿 조합에 유산소 항목을 추가한다.
--
-- goal_blocks 조합(근력 목적별)과 달리 유산소는 "무슨 목적을 골랐든" 나이만
-- 40대 이상이면 넣는다 — 그래서 goal_blocks 크로스 조인이 아니라 별도로
-- age_group 만 보고 추가한다. 나이가 많을수록 무리하지 않게 시간을 줄인다.
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

    -- 유산소: 40대 이상 모든 템플릿에 목적과 무관하게 추가한다. 순서는
    -- sort_order 999 로 맨 뒤에 둔다 — 심박을 올리는 운동은 근력을 어느 정도
    -- 마치고 마지막에 하는 편이 안전하다(시작부터 무리하면 어지럼 위험).
    insert into public.routine_template_items
        (template_id, target_muscle, sets, reps, weight_ratio, sort_order, duration_minutes)
    select
        t.id,
        '유산소',
        1,
        null,
        null,
        999,
        case
            when t.age_group >= 70 then 10
            when t.age_group >= 60 then 12
            else 15
        end
    from public.routine_templates t
    where t.age_group >= 40
    on conflict (template_id, target_muscle) do nothing;

    select count(*) into v_count from public.routine_templates;
    return v_count;
end;
$$;

comment on function public.rebuild_routine_templates() is
    'goal_blocks / age_modifiers / gender_modifiers 를 조합해 모든 템플릿을 다시 만든다. 40대 이상은 유산소 항목을 추가한다.';

select public.rebuild_routine_templates();


-- ─────────────────────────────────────────────────────────────
-- generate_daily_routine / get_daily_routine 에 duration_minutes 전달
-- ─────────────────────────────────────────────────────────────

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
            i.duration_minutes,
            -- derate 규칙이 여러 개 걸리면 가장 낮은 배율을 쓴다.
            -- 유산소 항목(weight_ratio null)은 무게 배율이 의미가 없으니 그대로 null 로 둔다.
            case
                when i.weight_ratio is null then null
                else coalesce((
                    select min(r.weight_multiplier)
                    from public.pain_area_rules r
                    where r.action = 'derate'
                      and r.target_muscle = i.target_muscle
                      and r.pain_area = any (v_pain_areas)
                ), 1.0)
            end as derate
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
            (user_id, equip_id, routine_date, target_weight, target_sets, target_reps,
             target_duration_minutes, sort_order)
        select
            p_user_id,
            m.equip_id,
            p_date,
            case
                when m.base_weight_kg is null or m.weight_ratio is null then null
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
            m.duration_minutes,
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
    '미리 조합해 둔 템플릿 + 아픈 곳 규칙 + 단지 보유 기구로 하루 루틴을 만든다. p_apt_id 를 안 주면 주 소속을 쓴다. 40대 이상은 유산소가 포함된다.';

revoke all on function public.generate_daily_routine(uuid, date, uuid) from public;
grant execute on function public.generate_daily_routine(uuid, date, uuid) to anon, authenticated;


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
            'target_duration_minutes', d.target_duration_minutes,
            'is_completed', d.is_completed
        ) as row
        from public.daily_routines d
        join public.equipments e on e.id = d.equip_id
        where d.user_id = p_user_id and d.routine_date = p_date
    ) rows;
$$;

comment on function public.get_daily_routine(uuid, date) is
    '해당 날짜의 루틴을 기구 정보(쉬운 설명·유산소 시간 포함)와 함께 돌려준다.';

revoke all on function public.get_daily_routine(uuid, date) from public;
grant execute on function public.get_daily_routine(uuid, date) to anon, authenticated;


-- ═══════════════════════════════════════════════════════════
-- 20260812000022_repair_after_reinstall.sql
-- ═══════════════════════════════════════════════════════════

-- 폰 앱을 지웠다 깔면 계정에 영영 못 돌아가는 문제를 고친다.
--
-- 증상(실제 보고): "전화번호로 QR 등록한 사람이 데이터 삭제하고 다시 들어가면
-- QR 또 찍으라고 함 / 관리자 태블릿엔 2번째 방문이시네요 뜨고 / 연동이 안 됨".
--
-- 원인은 두 가지가 겹친 것이다.
--
-- (1) 익명 세션은 자격 증명이 없다. 전화번호 로그인 사용자의 신원은
--     signInAnonymously 로 만든 GoTrue 계정 하나뿐이고, 그 리프레시 토큰은
--     폰 저장소에만 있다. 앱 데이터를 지우면 그 계정으로 다시 로그인할
--     방법이 세상에 없다 — 비밀번호도 이메일도 없으니까.
-- (2) 그런데 users.auth_user_id 에는 그 죽은 계정이 그대로 남아 있고,
--     kiosk_check_in 은 auth_user_id 가 있으면 페어링 코드를 안 준다.
--     그래서 폰은 "QR 찍으세요"라고 하는데 태블릿은 QR 을 안 띄운다.
--     결과적으로 사용자는 자기 계정에 영구히 잠긴다.
--
-- 데이터 자체는 서버에 멀쩡히 있다(그래서 "2번째 방문"이 뜬다). 잃는 건
-- 데이터가 아니라 "이 폰이 그 계정"이라는 연결뿐이다. 그러니 연결을 다시
-- 맺을 길만 열어주면 된다.
--
-- 보안 관점: 페어링 코드를 항상 발급해도 위협 수준은 그대로다. 이미 최초
-- 연결에서 "헬스장에 물리적으로 와서 + 번호를 알고 + 3분 안에 스캔"을 신뢰
-- 근거로 삼고 있고, 재연결도 똑같은 문턱을 넘어야 한다. 원격에서 번호만
-- 알아서는 아무것도 못 한다.


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

    -- 페어링 코드는 이제 "아직 연결 안 된 사람"뿐 아니라 항상 발급한다.
    --
    -- 예전에는 auth_user_id 가 비어 있을 때만 만들었다. 그러면 폰을 바꾸거나
    -- 앱을 지운 사람은 태블릿이 QR 을 안 띄워서 계정에 영영 못 돌아온다
    -- (익명 세션은 자격 증명이 없어 그 계정으로 다시 로그인할 방법이 없다).
    -- 코드를 만들어 두는 것 자체는 부작용이 없다 — 3분 뒤 만료되고, 실제로
    -- 스캔해야만 소비된다.
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
        -- 아직 한 번도 폰을 연결한 적 없는 사람. 태블릿이 QR 화면으로 바로 보낸다.
        -- 이미 연결된 사람에게는 체크인 완료 화면에서 "다시 연결" 선택지로만 보여준다.
        'needs_pairing', v_user.auth_user_id is null,
        'pairing_code', v_pairing_code,
        'visit_count', v_membership.visit_count,
        'prompt_gym_switch', v_is_new_membership and v_has_existing_membership
    );
end;
$$;

comment on function public.kiosk_check_in(uuid, text) is
    '태블릿 체크인. 개인정보는 안 돌려준다. 페어링 코드는 항상 발급해서, 폰을 바꾸거나 앱을 지운 사람도 다시 연결할 수 있게 한다.';

revoke all on function public.kiosk_check_in(uuid, text) from public;
grant execute on function public.kiosk_check_in(uuid, text) to anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 재연결 시 기록이 사라지던 문제도 같이 고친다.
--
-- 앱을 다시 깔면 폰은 새 익명 계정을 만들고, 앱이 켜지는 순간
-- bootstrap_oauth_profile 이 그 계정으로 "빈 users 행"을 하나 만든다.
-- 그 상태로 QR 을 찍으면 complete_pairing 이 병합 분기를 타는데, 병합은
-- "먼저 있던 쪽(v_existing)이 살아남는다"는 규칙이라 방금 만들어진 빈 행이
-- 살아남고 진짜 계정이 흡수돼 버린다. 출석·루틴은 옮겨지지만 포인트와
-- 설문 답변(profile_data)은 옮기는 코드가 없어서 그대로 증발한다.
--
-- 해결: 살아남을 행을 "먼저 있던 쪽"이 아니라 "실체가 있는 쪽"으로 고른다.
-- 방금 부팅하며 만들어진 껍데기 행이면 그걸 버리고 원래 계정에 새 auth 를
-- 붙인다. 진짜 카카오 계정이 그림자 계정을 흡수하는 원래 시나리오는
-- 그대로 두되, 거기서도 포인트·설문이 비어 있으면 물려받게 했다.
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
    v_existing_is_placeholder    boolean;
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

    if v_candidate is null then
        raise exception 'PAIRING_NOT_FOUND' using errcode = 'P0002';
    end if;

    select * into v_existing from public.users where auth_user_id = auth.uid();

    if v_existing is null then
        -- 이 폰에 아직 프로필이 없다. 후보 계정에 그대로 붙인다.
        -- 후보가 다른 auth 에 물려 있었다면(폰을 지웠다 다시 깐 경우) 그 죽은
        -- 연결을 새 것으로 갈아끼운다 — 어차피 그 익명 계정으로는 아무도 다시
        -- 로그인할 수 없다.
        update public.users set auth_user_id = auth.uid() where id = v_candidate.id
        returning * into v_final_user;

    elsif v_existing.id = v_candidate.id then
        -- 이미 페어링된 코드를 다시 스캔한 경우. no-op.
        v_final_user := v_existing;

    else
        -- 앱을 다시 깔면서 부팅 때 만들어진 껍데기인지 본다. 전화번호도 없고
        -- 설문도 안 했고 포인트도 없고 다닌 헬스장도 없으면 버려도 되는 행이다.
        v_existing_is_placeholder :=
            v_existing.phone_number is null
            and coalesce(v_existing.total_points, 0) = 0
            and (v_existing.profile_data->>'onboarded_at') is null
            and not exists (
                select 1 from public.user_gym_memberships where user_id = v_existing.id
            );

        if v_existing_is_placeholder then
            -- 껍데기를 지우고 진짜 계정에 이 폰을 연결한다. 포인트·설문·출석이
            -- 전부 원래 자리에 그대로 남으므로 옮길 것이 없다.
            delete from public.users where id = v_existing.id;

            update public.users set auth_user_id = auth.uid() where id = v_candidate.id
            returning * into v_final_user;
        else
            -- 원래의 병합 시나리오: 카카오/구글로 쓰던 진짜 계정(v_existing)이
            -- 키오스크가 번호로 만든 그림자 계정(v_candidate)을 흡수한다.
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
                    update public.user_gym_memberships
                    set user_id = v_existing.id, is_primary = false
                    where id = v_membership.id;
                end if;
            end loop;

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

            delete from public.daily_routines d
            where d.user_id = v_candidate.id
              and exists (
                  select 1 from public.daily_routines d2
                  where d2.user_id = v_existing.id
                    and d2.equip_id = d.equip_id
                    and d2.routine_date = d.routine_date
              );
            update public.daily_routines set user_id = v_existing.id where user_id = v_candidate.id;

            -- 포인트는 두 쪽을 합친다. 예전엔 아예 옮기지 않아서 그림자 계정에
            -- 쌓인 포인트가 병합될 때마다 사라졌다.
            update public.users
            set total_points = coalesce(total_points, 0) + coalesce(v_candidate.total_points, 0)
            where id = v_existing.id;

            -- 설문을 아직 안 한 계정이면 그림자 쪽 답변을 물려받는다.
            -- 이미 답한 계정의 답을 덮어쓰지는 않는다.
            if (v_existing.profile_data->>'onboarded_at') is null
               and (v_candidate.profile_data->>'onboarded_at') is not null
            then
                update public.users set profile_data = v_candidate.profile_data
                where id = v_existing.id;
            end if;

            delete from public.users where id = v_candidate.id;

            if v_existing.phone_number is null then
                update public.users set phone_number = v_candidate_phone where id = v_existing.id;
            end if;

            select * into v_final_user from public.users where id = v_existing.id;
        end if;
    end if;

    update public.device_pairings
    set consumed_at = now(), consumed_by_auth_user_id = auth.uid()
    where id = v_pairing.id;

    return jsonb_build_object('user', to_jsonb(v_final_user));
end;
$$;

comment on function public.complete_pairing(text) is
    'QR/코드 페어링 완료. 앱 재설치로 생긴 빈 계정은 버리고 원래 계정에 다시 연결한다. 진짜 계정끼리 합칠 때는 포인트를 더하고 설문 답변도 물려받는다.';

revoke all on function public.complete_pairing(text) from public;
grant execute on function public.complete_pairing(text) to authenticated;


-- ═══════════════════════════════════════════════════════════
-- 20260812000023_realtime_checkin.sql
-- ═══════════════════════════════════════════════════════════

-- 태블릿에서 체크인하면 폰 앱이 그 자리에서 반응하게 한다.
--
-- 지금까지 폰 앱은 운동 탭을 열 때만 서버에 물어봤다. 그래서 앱을 켜 둔 채로
-- 태블릿에 번호를 찍으면 화면에 아무 일도 일어나지 않았다. 체크인한 헬스장에
-- 따라 루틴이 달라지는데도(이사 대응) 그 갱신이 안 되는 문제도 같이 있었다.
--
-- Supabase Realtime 의 postgres_changes 로 attendance_logs 의 insert 를
-- 구독하게 한다. 카카오 로그인 여부와 무관하게 동작한다 — 익명 세션도
-- auth.uid() 를 갖기 때문이다.
--
-- ⚠️ 이 저장소는 "RLS deny-by-default + security definer RPC 로만 접근"이
-- 원칙이고 지금까지 select 정책을 하나도 두지 않았다. 여기서 딱 한 번
-- 예외를 둔다 — Realtime 의 postgres_changes 는 RPC 를 통하지 않고 테이블을
-- 직접 구독하는 구조라, select 정책 없이는 아무 이벤트도 전달되지 않는다.
-- 대신 범위를 "내 출석 기록"으로만 좁힌다. attendance_logs 에는 이름·전화번호
-- 같은 개인정보가 없고(user_id, apt_id, attended_at 뿐), 남의 행은 정책에서
-- 걸러진다. anon(키오스크)에는 열지 않는다.

alter table public.attendance_logs enable row level security;

-- 정책 식은 "질의하는 사람의 권한"으로 실행된다. 그래서 정책 안에서 곧바로
-- public.users 를 읽으면 permission denied 가 난다 — authenticated 역할에는
-- users select 권한이 없기 때문이다(deny-by-default 원칙 그대로다).
-- security definer 함수 하나를 거쳐서, 권한을 넓히지 않고 "지금 로그인한
-- 사람의 users.id" 만 알아낸다.
-- language sql 로 두면 생성 시점에 본문이 검증돼서, auth 스키마가 아직 없는
-- 환경(로컬 검증용 Postgres)에서 설치가 통째로 실패한다. 이 저장소의 다른
-- 함수들과 같이 plpgsql 로 둔다.
create or replace function public.current_app_user_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    v_id uuid;
begin
    select u.id into v_id from public.users u where u.auth_user_id = auth.uid();
    return v_id;
end;
$$;

comment on function public.current_app_user_id() is
    '지금 로그인한 auth.uid() 에 연결된 public.users.id. RLS 정책 안에서만 쓴다.';

revoke all on function public.current_app_user_id() from public;
grant execute on function public.current_app_user_id() to authenticated;

drop policy if exists "own attendance is readable" on public.attendance_logs;

create policy "own attendance is readable"
    on public.attendance_logs
    for select
    to authenticated
    using (user_id = public.current_app_user_id());

comment on policy "own attendance is readable" on public.attendance_logs is
    'Realtime 구독(postgres_changes)에만 쓰인다. 본인 출석 행만 읽힌다.';

-- RLS 정책은 테이블 권한 위에서 동작한다. select 권한 자체가 없으면 정책이
-- 있어도 아무것도 못 읽는다.
grant select on public.attendance_logs to authenticated;

-- Realtime 이 이 테이블의 변경을 내보내도록 발행 목록에 넣는다.
-- 이미 들어 있으면 duplicate_object 가 나므로 무시한다(여러 번 실행해도 안전).
do $$
begin
    alter publication supabase_realtime add table public.attendance_logs;
exception
    when duplicate_object then null;
    when undefined_object then
        -- 로컬 Postgres 처럼 supabase_realtime 발행이 없는 환경에서는 건너뛴다.
        null;
end;
$$;


-- ═══════════════════════════════════════════════════════════
-- 20260812000024_kiosk_apartment_enrollment.sql
-- ═══════════════════════════════════════════════════════════

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


-- ═══════════════════════════════════════════════════════════
-- 20260812000025_leave_gym_on_switch.sql
-- ═══════════════════════════════════════════════════════════

-- 이사하면 옛 단지에서 빠진다. 단, 그동안의 운동 기록은 그대로 남는다.
--
-- 지금까지 "이 헬스장으로 옮기셨나요?"에 "네"를 눌러도 옛 멤버십이 그대로 남았다.
-- 랭킹은 user_gym_memberships 를 조인하므로, 이사 간 사람이 옛 단지 순위표에
-- 계속 보였다. 게다가 그 사람은 그 단지에서 쌓아 둔 출석일이 많아 상위권에
-- 박힌 채로 다시는 오지 않는다 — 남은 주민들에겐 영영 못 넘는 유령이 된다.
--
-- 그렇다고 행을 지우면 안 된다. 지우면 "그 헬스장을 몇 번 다녔는지"라는 본인
-- 기록까지 사라진다. 그래서 지우는 대신 left_at 을 찍는다. 랭킹에서는 빠지고,
-- 프로필의 "내 헬스장"에는 이전에 다니던 곳으로 남는다.
--
-- 운동 기록 쪽은 손댈 게 없다. 달력(get_attendance_days), 분석(get_workout_summary),
-- DAY_N 배지(get_visit_stats)는 전부 user_id 로만 조회하고 단지로 거르지 않는다.
-- attendance_logs 와 daily_routines 도 그대로 둔다 — 소속이 바뀌는 것과 그동안
-- 운동한 사실이 남는 것은 별개다.


alter table public.user_gym_memberships
    add column if not exists left_at timestamptz;

comment on column public.user_gym_memberships.left_at is
    '이 헬스장을 떠난 시각(이사 확인 시). null 이면 지금 다니는 곳. 랭킹은 null 인 행만 센다.';

-- "오늘만 방문했어요"를 누른 시각. 이걸 안 남기면 두 헬스장을 정말로 번갈아
-- 쓰는 사람에게 방문할 때마다 같은 팝업을 띄우게 된다.
alter table public.user_gym_memberships
    add column if not exists switch_declined_at timestamptz;

comment on column public.user_gym_memberships.switch_declined_at is
    '"오늘만 방문" 응답 시각. 30일간은 같은 헬스장에서 이사 여부를 다시 묻지 않는다.';

create index if not exists user_gym_memberships_active_apt_idx
    on public.user_gym_memberships (apt_id) where left_at is null;


-- ─────────────────────────────────────────────────────────────
-- 1. 랭킹: 지금 다니는 사람만
-- ─────────────────────────────────────────────────────────────

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
        -- left_at 이 찍힌 사람은 이 단지를 떠난 사람이다. 출석 기록(l)은 그대로
        -- 두므로 본인 달력·분석에는 계속 보이지만, 여기 순위표에는 안 나온다.
        join public.user_gym_memberships m
          on m.user_id = u.id and m.apt_id = p_apt_id and m.left_at is null
        left join public.attendance_logs l on l.user_id = u.id and l.apt_id = p_apt_id
        group by u.id, u.profile_data, u.total_points, u.created_at
    ) lb
    -- 상위 p_limit 명 + 그 밖이어도 내 순위는 항상 포함(고정 행으로 보여주기 위해)
    where lb.rnk <= p_limit or lb.id = v_me;
end;
$$;

comment on function public.get_apartment_leaderboard(uuid, integer) is
    '지금 이 단지를 다니는 사람들의 출석 랭킹(떠난 사람 제외). 닉네임/출석횟수/포인트만 노출, PII 없음.';

revoke all on function public.get_apartment_leaderboard(uuid, integer) from public;
grant execute on function public.get_apartment_leaderboard(uuid, integer) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 2. 소속 전환이 곧 "옛 헬스장 탈퇴"
-- ─────────────────────────────────────────────────────────────

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
    v_left_count    integer := 0;
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
        -- 이사했다는 뜻이므로 다니던 다른 헬스장은 전부 떠난 것으로 본다. 행을
        -- 지우지 않는 이유는 방문 횟수·첫 방문일이 본인 기록이기 때문이다.
        update public.user_gym_memberships
        set is_primary = false,
            left_at    = coalesce(left_at, now())
        where user_id = p_user_id and apt_id <> p_apt_id and left_at is null;

        get diagnostics v_left_count = row_count;

        -- 되돌아온 경우(떠났던 곳을 다시 주 소속으로)도 여기서 복구된다.
        update public.user_gym_memberships
        set is_primary         = true,
            left_at            = null,
            switch_declined_at = null
        where user_id = p_user_id and apt_id = p_apt_id;

        update public.users set apt_id = p_apt_id where id = p_user_id;
    else
        -- "오늘만 방문했어요". 멤버십은 그대로 두되, 30일간 다시 묻지 않는다.
        update public.user_gym_memberships
        set switch_declined_at = now()
        where user_id = p_user_id and apt_id = p_apt_id;
    end if;

    return jsonb_build_object(
        'user_id', p_user_id,
        'apt_id', p_apt_id,
        'is_primary', p_make_primary,
        -- 화면이 "이전 헬스장에서 빠졌습니다"를 정직하게 말할 수 있게 알려준다.
        'left_count', v_left_count
    );
end;
$$;

comment on function public.confirm_gym_membership(uuid, uuid, boolean) is
    '주 소속 전환. true 면 다니던 다른 헬스장을 떠난 것으로 처리한다(행은 남기고 left_at 만 찍는다 — 운동 기록과 방문 이력은 보존). false 면 "오늘만 방문"으로 보고 30일간 다시 묻지 않는다.';

revoke all on function public.confirm_gym_membership(uuid, uuid, boolean) from public;
grant execute on function public.confirm_gym_membership(uuid, uuid, boolean) to anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 3. 내 헬스장 목록에 "떠난 곳"을 구분해 준다
-- ─────────────────────────────────────────────────────────────

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
                'last_checked_in_at', m.last_checked_in_at,
                'left_at', m.left_at
            )
            -- 지금 다니는 곳(주 소속 먼저)을 위로, 떠난 곳을 아래로.
            order by m.left_at is not null, m.is_primary desc, m.last_checked_in_at desc
        ),
        '[]'::jsonb
    )
    from public.user_gym_memberships m
    join public.apartments a on a.id = m.apt_id
    where m.user_id = p_user_id;
end;
$$;

comment on function public.list_my_gym_memberships(uuid) is
    '내가 다닌 헬스장 목록. 떠난 곳(left_at)도 기록으로 남겨 함께 돌려준다.';

revoke all on function public.list_my_gym_memberships(uuid) from public;
grant execute on function public.list_my_gym_memberships(uuid) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 4. 팝업을 놓쳐도 다시 물어본다
-- ─────────────────────────────────────────────────────────────

-- 지금까지 이 팝업은 "그 단지에서의 첫 체크인"에만 떴다. 그래서 그때 자리를
-- 비웠거나 뒷사람에 밀려 그냥 넘어가면 다시는 묻지 않았고, 그 사람은 옛 단지
-- 랭킹에 영영 남았다. 옛 단지에서 빼는 유일한 경로가 이 팝업이므로, 한 번
-- 놓쳤다고 끝나면 안 된다.
--
-- 이제는 "주 소속이 아닌 헬스장에 온 날"마다 묻는다. 단, 같은 날 두 번 찍으면
-- 다시 묻지 않고, "오늘만 방문했어요"를 누른 뒤 30일간도 묻지 않는다.
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
    v_prompt_gym_switch         boolean;
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

    -- 떠났던 헬스장(left_at)에 다시 온 경우도 여기 걸린다. 자동으로 되돌리지
    -- 않고 물어보는 이유는, 옛 헬스장에 하루 들른 것만으로 그 단지 랭킹에
    -- 출석일 전부를 들고 복귀해 버리면 안 되기 때문이다.
    v_prompt_gym_switch :=
        not v_membership.is_primary
        and not v_already_attended_today
        and exists (
            select 1 from public.user_gym_memberships m
            where m.user_id = v_user.id and m.is_primary
        )
        and (
            v_membership.switch_declined_at is null
            or v_membership.switch_declined_at < now() - interval '30 days'
        );

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
            'prompt_gym_switch', v_prompt_gym_switch
        );
    end if;

    return jsonb_build_object(
        'user_id', v_user.id,
        'needs_pairing', false,
        'visit_count', v_membership.visit_count,
        'prompt_gym_switch', v_prompt_gym_switch
    );
end;
$$;

comment on function public.kiosk_check_in(uuid, text) is
    '태블릿 출입 체크인. 개인정보(이름/포인트/루틴)는 절대 돌려주지 않는다 — user_id, 방문횟수, 페어링 필요 여부뿐. 주 소속이 아닌 헬스장에 온 날엔 이사 여부를 묻는다.';

revoke all on function public.kiosk_check_in(uuid, text) from public;
grant execute on function public.kiosk_check_in(uuid, text) to anon, authenticated;


-- ═══════════════════════════════════════════════════════════
-- 20260812000026_exercise_catalog.sql
-- ═══════════════════════════════════════════════════════════

-- 운동 도감(전체 공용)과 단지별 보유 기구를 분리한다.
--
-- 요구사항: "운동 기구들·맨몸운동들 셋팅은 미리 해놓고, 우리 아파트 헬스장에
-- 있는 것들은 보유중으로 올라와 있고 몇 번 구역에 있다는 표기가 되어야 한다."
--
-- 지금까지는 equipments 한 테이블이 "이 운동이 무엇인지"(이름·쉬운 이름·설명·
-- 영상·왜 중요한지)와 "우리 단지가 그걸 갖고 있는지"를 같이 들고 있었다. 그래서
--   (1) 단지가 1,000개면 같은 체스트 프레스 설명이 1,000번 복사되고,
--   (2) 새 단지를 열 때마다 운동 콘텐츠 전체를 다시 넣어야 했다.
--
-- 이제 둘로 나눈다:
--   exercise_catalog  운동 도감. 본사가 미리 등록하는 전체 공용 콘텐츠.
--                     머신·덤벨·맨몸·유산소 전부 여기 담긴다.
--   equipments        단지별 보유 기록. "우리 단지에 도감의 이 운동이
--                     location_label(몇 번 구역)에 있다"만 담당한다.
--
-- 루틴 생성은 단지가 보유한 것에서 고르되, 보유가 하나도 없는 부위는 도감의
-- 맨몸운동으로 대체한다 — 기구가 부족한 단지도 루틴이 비지 않는다.
--
-- 이 파일은 운영 DB 에 대시보드로 직접 들어간 변경(routine_template_items.slot,
-- user_equipment_levels, 무게 제안 RPC)도 같이 저장소로 끌어온다 — 그 기능들
-- 위에 도감을 얹어야 해서, 여기 없으면 새로 설치한 DB 에서 함수가 깨진다.

-- ─────────────────────────────────────────────────────────────
-- 0. 운영 DB 드리프트 동기화: slot, user_equipment_levels
-- ─────────────────────────────────────────────────────────────

-- 같은 부위에 여러 운동을 처방하기 위한 슬롯 번호. 운영 DB 에는 이미 있다.
alter table public.routine_template_items
    add column if not exists slot integer not null default 1;

-- 사람별·기구별 현재 사용 무게. "올려볼게요"를 눌렀을 때만 바뀐다.
create table if not exists public.user_equipment_levels (
    user_id    uuid not null references public.users(id) on delete cascade,
    equip_id   uuid not null references public.equipments(id) on delete cascade,
    weight_kg  integer not null,
    updated_at timestamptz not null default now(),
    primary key (user_id, equip_id)
);

comment on table public.user_equipment_levels is
    '사람별·기구별 현재 사용 무게. 본인이 "올려볼게요"를 눌렀을 때만 바뀐다. 있으면 템플릿 계산보다 우선한다.';

-- 운영 DB 에서 이 테이블만 RLS 없이 만들어져 anon 키로 아무나 읽고 쓸 수 있었다.
-- 켜되 본인 행만 다루는 정책을 같이 둔다 — 앱의 무게 제안 RPC 는 security definer
-- 라 정책과 무관하게 계속 동작한다.
alter table public.user_equipment_levels enable row level security;

drop policy if exists "own equipment levels" on public.user_equipment_levels;
create policy "own equipment levels"
    on public.user_equipment_levels for all
    using (user_id in (select u.id from public.users u where u.auth_user_id = auth.uid()))
    with check (user_id in (select u.id from public.users u where u.auth_user_id = auth.uid()));


-- ─────────────────────────────────────────────────────────────
-- 1. 운동 도감
-- ─────────────────────────────────────────────────────────────

create table if not exists public.exercise_catalog (
    id             uuid primary key default uuid_generate_v4(),
    name           varchar(100) unique not null,
    -- "위에서 당기기"처럼 기구 이름보다 먼저 와닿는 쉬운 말 이름
    name_ko        varchar(100),
    -- 머신 / 덤벨 / 맨몸 / 유산소. '맨몸'은 기구가 없어도 처방할 수 있다.
    station_kind   varchar(20) not null default '머신',
    target_muscle  varchar(50),
    description    text,
    -- 이 운동이 생활에서 왜 중요한지. 시니어 동기부여용 한 단락.
    why_it_matters text,
    video_url      text not null,
    -- 표준 성인 남성 시작 무게. 단지별 기구 사양이 다르면 equipments 쪽
    -- 같은 이름의 컬럼이 이 값을 덮어쓴다. null 이면 무게 없이 안내한다.
    base_weight_kg integer,
    weight_step_kg integer not null default 5,
    created_at     timestamptz default now()
);

alter table public.exercise_catalog enable row level security;

-- 운동 이름·설명·영상은 개인정보가 아니다. 기구 QR 조회(get_equipment_by_qr)를
-- anon 에 연 것과 같은 판단.
drop policy if exists "exercise catalog is readable" on public.exercise_catalog;
create policy "exercise catalog is readable"
    on public.exercise_catalog for select
    using (true);

-- 기존 equipments 에 있던 콘텐츠를 도감으로 끌어올린다. 이름이 같으면 같은
-- 운동으로 본다. name_ko 등 확장 컬럼은 운영 DB 에만 있어서(대시보드 직접
-- 적용) 있는지 확인하고 있을 때만 같이 옮긴다 — 새로 설치한 DB 에는 없다.
do $$
begin
    if exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'equipments' and column_name = 'name_ko'
    ) then
        execute $uplift$
            insert into public.exercise_catalog
                (name, name_ko, station_kind, target_muscle, description, why_it_matters,
                 video_url, base_weight_kg, weight_step_kg)
            select distinct on (e.name)
                e.name, e.name_ko, coalesce(e.station_kind, '머신'), e.target_muscle,
                e.description, e.why_it_matters, e.video_url,
                e.base_weight_kg, coalesce(e.weight_step_kg, 5)
            from public.equipments e
            order by e.name, e.created_at
            on conflict (name) do nothing
        $uplift$;
    else
        insert into public.exercise_catalog
            (name, station_kind, target_muscle, description, video_url, base_weight_kg, weight_step_kg)
        select distinct on (e.name)
            e.name,
            case when e.target_muscle = '유산소' then '유산소' else '머신' end,
            e.target_muscle, e.description, e.video_url, e.base_weight_kg,
            coalesce(e.weight_step_kg, 5)
        from public.equipments e
        order by e.name, e.created_at
        on conflict (name) do nothing;
    end if;
end $$;

-- 새로 설치한 DB(도감이 아직 비어 있음)를 위한 기본 콘텐츠. 운영 DB 에는 위
-- 끌어올리기가 이미 채웠으므로 손대지 않는다 — 이름만 겹치고 내용이 다른
-- 반쪽짜리 항목을 만들지 않기 위해 "비어 있을 때만" 넣는다.
-- ⚠️ video_url 은 자리표시자다 — 실서비스 전에 실제 시범 영상으로 교체할 것.
do $$
begin
    if not exists (select 1 from public.exercise_catalog) then
        insert into public.exercise_catalog
            (name, name_ko, station_kind, target_muscle, description, video_url, base_weight_kg, weight_step_kg)
        values
            ('체스트 프레스', '앞으로 밀기',       '머신', '가슴', '의자에 앉아 손잡이를 앞으로 밀어내는 동작입니다. 가슴 근육을 키웁니다.', 'https://example.com/videos/chest-press.mp4', 20, 5),
            ('랫 풀다운',     '위에서 당기기',     '머신', '등',   '위에서 손잡이를 아래로 당기는 동작입니다. 등 근육을 키워 굽은 등을 펴는 데 도움됩니다.', 'https://example.com/videos/lat-pulldown.mp4', 25, 5),
            ('레그 프레스',   '다리로 밀기',       '머신', '하체', '의자에 앉아 발판을 다리로 밀어내는 동작입니다. 허벅지와 엉덩이 근육을 키웁니다.', 'https://example.com/videos/leg-press.mp4', 40, 10),
            ('숄더 프레스',   '머리 위로 밀기',    '머신', '어깨', '의자에 앉아 손잡이를 머리 위로 밀어올리는 동작입니다. 어깨 근육을 키웁니다.', 'https://example.com/videos/shoulder-press.mp4', 15, 5),
            ('복부 크런치',   '앉아서 숙이기',     '머신', '복부', '등받이에 기대 앉아 상체를 앞으로 숙이는 동작입니다. 뱃살 관리와 허리 힘에 도움됩니다.', 'https://example.com/videos/ab-crunch.mp4', 10, 5),
            ('트레드밀',      '걷기 운동',         '유산소', '유산소', '벨트 위에서 걷거나 가볍게 뛰는 운동입니다. 심장과 폐를 튼튼하게 합니다.', 'https://example.com/videos/treadmill.mp4', null, 1),
            -- 맨몸운동: 기구가 없는 단지를 위한 대체 처방. 시니어가 안전하게
            -- 할 수 있는 동작으로만 골랐다(눕는 동작보다 의자·벽 짚는 동작 우선).
            ('의자 스쿼트',          '앉았다 일어서기',      '맨몸', '하체', '의자에 앉았다 일어서기를 천천히 반복하는 운동입니다. 허벅지와 엉덩이 힘을 기릅니다.', 'https://example.com/videos/chair-squat.mp4', null, 5),
            ('벽 팔굽혀펴기',        '벽 밀기',              '맨몸', '가슴', '벽에 손을 짚고 팔을 굽혔다 펴는 동작입니다. 가슴과 팔 힘을 기릅니다.', 'https://example.com/videos/wall-pushup.mp4', null, 5),
            ('엎드려 팔다리 들기',   '엎드려 들기',          '맨몸', '등',   '엎드린 채 팔과 다리를 천천히 들어 올리는 동작입니다. 등과 허리 근육을 튼튼하게 합니다.', 'https://example.com/videos/superman.mp4', null, 5),
            ('의자 옆으로 팔 올리기', '팔 옆으로 들기',      '맨몸', '어깨', '의자에 앉아 양팔을 옆으로 천천히 들어 올리는 동작입니다. 어깨 근육을 기릅니다.', 'https://example.com/videos/seated-lateral-raise.mp4', null, 5),
            ('누워서 다리 들기',     '다리 들기',            '맨몸', '복부', '바닥에 누워 두 다리를 천천히 들었다 내리는 동작입니다. 뱃심을 기릅니다.', 'https://example.com/videos/leg-raise.mp4', null, 5),
            ('제자리 걷기',          '제자리 걷기',          '맨몸', '유산소', '제자리에서 팔을 흔들며 걷는 운동입니다. 심장과 폐를 튼튼하게 합니다.', 'https://example.com/videos/march-in-place.mp4', null, 5)
        on conflict (name) do nothing;
    end if;
end $$;


-- ─────────────────────────────────────────────────────────────
-- 2. equipments 를 "단지별 보유 기록"으로 바꾼다
-- ─────────────────────────────────────────────────────────────

alter table public.equipments
    add column if not exists catalog_id uuid references public.exercise_catalog(id),
    -- "13번 구역" 같은 위치 라벨. 단지마다 부르는 방식이 달라 자유 문자열로 둔다.
    add column if not exists location_label varchar(50);

update public.equipments e
set catalog_id = c.id
from public.exercise_catalog c
where e.catalog_id is null and c.name = e.name;

alter table public.equipments alter column catalog_id set not null;

create index if not exists equipments_apt_catalog_idx
    on public.equipments (apt_id, catalog_id);

comment on column public.equipments.location_label is
    '헬스장 안 위치 표기. 예: "13번 구역". 없으면 화면에서 위치 줄을 생략한다.';

-- 무게 컬럼 둘은 단지별 보정값으로 남긴다(기구 사양이 단지마다 다르다).
-- null 이면 도감 기본값을 쓴다. 도감과 같은 값이면 보정이 아니므로 비운다.
alter table public.equipments alter column weight_step_kg drop not null,
                              alter column weight_step_kg drop default;

update public.equipments e
set base_weight_kg = null
from public.exercise_catalog c
where e.catalog_id = c.id and e.base_weight_kg is not distinct from c.base_weight_kg;

update public.equipments e
set weight_step_kg = null
from public.exercise_catalog c
where e.catalog_id = c.id and e.weight_step_kg is not distinct from c.weight_step_kg;

comment on column public.equipments.base_weight_kg is
    '단지별 기구 사양 보정값. null 이면 도감(exercise_catalog)의 기본값을 쓴다.';
comment on column public.equipments.weight_step_kg is
    '단지별 기구 사양 보정값(kg 단위). null 이면 도감의 기본값을 쓴다.';


-- ─────────────────────────────────────────────────────────────
-- 3. daily_routines 는 이제 도감을 가리킨다
--
-- 맨몸 대체 처방은 equipments 행이 없으므로 equip_id 만으로는 담을 수 없다.
-- "무슨 운동인지"는 catalog_id 가, "어느 기구로 하는지"는 equip_id 가 맡는다
-- (기구 없이 하면 null). 기구가 철거돼도 기록이 사라지면 안 되니 cascade 도 푼다.
-- ─────────────────────────────────────────────────────────────

alter table public.daily_routines
    add column if not exists catalog_id uuid references public.exercise_catalog(id);

update public.daily_routines d
set catalog_id = e.catalog_id
from public.equipments e
where d.catalog_id is null and e.id = d.equip_id;

alter table public.daily_routines alter column catalog_id set not null;

alter table public.daily_routines
    drop constraint if exists daily_routines_equip_id_fkey;
alter table public.daily_routines
    add constraint daily_routines_equip_id_fkey
        foreign key (equip_id) references public.equipments(id) on delete set null;

-- 하루에 같은 운동은 한 번만. 기존 (user, equip, date) 유니크를 대체한다.
drop index if exists daily_routines_user_equip_date_key;
create unique index if not exists daily_routines_user_catalog_date_key
    on public.daily_routines (user_id, catalog_id, routine_date);


-- ─────────────────────────────────────────────────────────────
-- 4. 루틴 생성: 보유한 것에서 고르고, 없는 부위만 맨몸으로 대체
--
-- 운영 DB 의 최신 로직(슬롯별로 다른 운동, 사람·날짜 해시 로테이션,
-- user_equipment_levels 무게 우선)을 그대로 유지하면서 도감을 얹었다.
-- ─────────────────────────────────────────────────────────────

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

    -- 남았지만 보유 기구도 맨몸 대체 운동도 없어서 못 넣은 운동 수
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
          select 1
          from public.exercise_catalog cat
          left join public.equipments e
            on e.catalog_id = cat.id and e.apt_id = v_target_apt_id
          where cat.target_muscle = i.target_muscle
            and (cat.station_kind = '맨몸' or e.id is not null)
      );

    with candidate as (
        select
            i.target_muscle,
            i.slot,
            i.sets,
            i.reps,
            i.weight_ratio,
            i.sort_order,
            i.duration_minutes,
            -- derate 규칙이 여러 개 걸리면 가장 낮은 배율을 쓴다.
            -- 유산소 항목(weight_ratio null)은 무게 배율이 의미가 없으니 그대로 null 로 둔다.
            case
                when i.weight_ratio is null then null
                else coalesce((
                    select min(r.weight_multiplier)
                    from public.pain_area_rules r
                    where r.action = 'derate'
                      and r.target_muscle = i.target_muscle
                      and r.pain_area = any (v_pain_areas)
                ), 1.0)
            end as derate
        from public.routine_template_items i
        where i.template_id = v_template_id
          and not exists (
              select 1 from public.pain_area_rules r
              where r.action = 'exclude'
                and r.target_muscle = i.target_muscle
                and r.pain_area = any (v_pain_areas)
          )
    ),
    -- 이 단지에서 고를 수 있는 선택지.
    -- 우선순위 0: 단지가 보유한 것(머신·덤벨·맨몸 구역 전부).
    -- 우선순위 1: 보유 행이 없는 도감의 맨몸운동 — 그 부위에 보유가 하나도
    --             없을 때만 대체로 쓴다(best 조인이 걸러 준다).
    options as (
        select
            e.id as equip_id,
            cat.id as catalog_id,
            cat.target_muscle,
            coalesce(e.base_weight_kg, cat.base_weight_kg) as base_weight_kg,
            coalesce(e.weight_step_kg, cat.weight_step_kg) as weight_step_kg,
            0 as priority,
            hashtext(e.id::text || p_user_id::text || p_date::text) & 2147483647 as h
        from public.equipments e
        join public.exercise_catalog cat on cat.id = e.catalog_id
        where e.apt_id = v_target_apt_id
        union all
        select
            null::uuid,
            cat.id,
            cat.target_muscle,
            cat.base_weight_kg,
            cat.weight_step_kg,
            1,
            hashtext(cat.id::text || p_user_id::text || p_date::text) & 2147483647
        from public.exercise_catalog cat
        where cat.station_kind = '맨몸'
          and not exists (
              select 1 from public.equipments e2
              where e2.apt_id = v_target_apt_id and e2.catalog_id = cat.id
          )
    ),
    best as (
        select target_muscle, min(priority) as priority
        from options
        group by target_muscle
    ),
    -- 부위별로 순서를 정해 둔다. 순서는 (사람+날짜+운동) 해시라 사람마다 다르게
    -- 흩어지고(동선 분산), 같은 사람·같은 날이면 늘 같다.
    ranked as (
        select
            o.*,
            row_number() over (partition by o.target_muscle order by o.h) as rn,
            count(*) over (partition by o.target_muscle) as total
        from options o
        join best b on b.target_muscle = o.target_muscle and o.priority = b.priority
    ),
    matched as (
        select c.*, r.equip_id, r.catalog_id, r.base_weight_kg, r.weight_step_kg
        from candidate c
        -- 슬롯 순서대로 다른 운동을 준다. 선택지 수보다 슬롯이 많으면 앞으로
        -- 돌아간다(나머지 연산) — 그 경우 중복이 생겨 뒤엣것이 빠지는데,
        -- 선택지가 부족한 단지에서는 그게 맞는 결과다.
        join ranked r
          on r.target_muscle = c.target_muscle
         and r.rn = ((c.slot - 1) % r.total) + 1
    ),
    saved as (
        insert into public.daily_routines
            (user_id, catalog_id, equip_id, routine_date, target_weight, target_sets,
             target_reps, target_duration_minutes, sort_order)
        select
            p_user_id,
            m.catalog_id,
            m.equip_id,
            p_date,
            -- 본인이 "올려볼게요"로 정한 무게가 있으면 그게 우선이다.
            coalesce(
                (select l.weight_kg from public.user_equipment_levels l
                  where l.user_id = p_user_id and l.equip_id = m.equip_id),
                case
                    when m.base_weight_kg is null or m.weight_ratio is null then null
                    -- 기구 조절 단위로 내림한다. 반올림하면 계산된 무게보다 무거워질
                    -- 수 있는데, 시니어에게는 가벼운 쪽이 틀리는 방향으로 안전하다.
                    else greatest(
                        m.weight_step_kg,
                        (floor(m.base_weight_kg * m.weight_ratio * m.derate / m.weight_step_kg)
                            * m.weight_step_kg)::integer
                    )
                end
            ),
            m.sets,
            m.reps,
            m.duration_minutes,
            m.sort_order
        from matched m
        order by m.sort_order
        on conflict (user_id, catalog_id, routine_date) do nothing
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
        'needs_trainer_review',
            (v_created = 0 and v_excluded > 0) or coalesce(array_length(v_pain_areas, 1), 0) >= 3,
        'routines', public.get_daily_routine(p_user_id, p_date)
    );
end;
$$;

comment on function public.generate_daily_routine(uuid, date, uuid) is
    '템플릿 + 아픈 곳 규칙 + 운동 도감으로 하루 루틴을 만든다. 단지 보유분에서 로테이션하고, 보유가 없는 부위만 맨몸운동으로 대체한다.';

revoke all on function public.generate_daily_routine(uuid, date, uuid) from public;
grant execute on function public.generate_daily_routine(uuid, date, uuid) to anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 5. 무게 제안 RPC (운영 DB 드리프트 동기화 + 도감 기본값 반영)
-- ─────────────────────────────────────────────────────────────

create or replace function public.weight_suggestion(p_user_id uuid, p_equip_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path = public
as $$
declare
    v_step        integer;
    v_current     integer;
    v_recent      record;
    v_easy_count  integer;
begin
    select coalesce(e.weight_step_kg, cat.weight_step_kg) into v_step
    from public.equipments e
    join public.exercise_catalog cat on cat.id = e.catalog_id
    where e.id = p_equip_id;

    if v_step is null then
        return null;
    end if;

    -- 지금 이 사람의 무게. 저장된 게 없으면 가장 최근 처방값을 본다.
    select l.weight_kg into v_current
    from public.user_equipment_levels l
    where l.user_id = p_user_id and l.equip_id = p_equip_id;

    if v_current is null then
        select d.target_weight into v_current
        from public.daily_routines d
        where d.user_id = p_user_id and d.equip_id = p_equip_id and d.target_weight is not null
        order by d.routine_date desc
        limit 1;
    end if;

    -- 무게 개념이 없는 운동(맨몸·유산소)은 제안하지 않는다.
    if v_current is null then
        return null;
    end if;

    -- 가장 최근 완료 기록
    select d.actual_reps, d.target_reps, d.actual_weight_kg, d.target_weight
    into v_recent
    from public.daily_routines d
    where d.user_id = p_user_id
      and d.equip_id = p_equip_id
      and d.is_completed
      and d.actual_reps is not null
      and d.target_reps is not null
    order by d.completed_at desc nulls last
    limit 1;

    if not found then
        return null;   -- 아직 해 본 적이 없으면 조정할 근거가 없다.
    end if;

    -- 먼저 "무리하고 있는가"를 본다. 목표의 70% 도 못 채웠으면 무게가 버겁다.
    -- 올리는 제안보다 이걸 먼저 보는 이유는, 못 따라가는 사람은 무게를 스스로
    -- 낮추지 않고 그냥 그만두기 때문이다.
    if v_recent.actual_reps < ceil(v_recent.target_reps * 0.7) then
        return jsonb_build_object(
            'action', 'decrease',
            'current_kg', v_current,
            'suggested_kg', greatest(v_step, v_current - v_step),
            'reason', format('지난번에 목표 %s회 중 %s회를 하셨어요. 무게가 조금 버거우신 것 같습니다.',
                             v_recent.target_reps, v_recent.actual_reps)
        );
    end if;

    -- 올리는 쪽은 더 보수적으로 본다 — 연속 2회 목표를 다 채웠을 때만.
    -- 한 번 잘했다고 바로 올리면 컨디션 좋은 날 하나로 무게가 올라간다.
    select count(*) into v_easy_count
    from (
        select d.actual_reps, d.target_reps
        from public.daily_routines d
        where d.user_id = p_user_id
          and d.equip_id = p_equip_id
          and d.is_completed
          and d.actual_reps is not null
          and d.target_reps is not null
        order by d.completed_at desc nulls last
        limit 2
    ) s
    where s.actual_reps >= s.target_reps;

    if v_easy_count >= 2 then
        return jsonb_build_object(
            'action', 'increase',
            'current_kg', v_current,
            'suggested_kg', v_current + v_step,
            'reason', format('최근 두 번 모두 목표 %s회를 다 채우셨어요.', v_recent.target_reps)
        );
    end if;

    return null;
end;
$$;

comment on function public.weight_suggestion(uuid, uuid) is
    '최근 완료 기록을 근거로 무게 올리기/내리기를 제안한다. 근거가 없으면 null.';

revoke all on function public.weight_suggestion(uuid, uuid) from public;
grant execute on function public.weight_suggestion(uuid, uuid) to anon, authenticated;


create or replace function public.apply_weight_suggestion(p_equip_id uuid, p_weight_kg integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user_id uuid;
    v_step    integer;
begin
    if auth.uid() is null then
        raise exception 'AUTH_REQUIRED' using errcode = '42501';
    end if;

    select u.id into v_user_id from public.users u where u.auth_user_id = auth.uid();
    if not found then
        raise exception 'USER_NOT_FOUND' using errcode = 'P0002';
    end if;

    select coalesce(e.weight_step_kg, cat.weight_step_kg) into v_step
    from public.equipments e
    join public.exercise_catalog cat on cat.id = e.catalog_id
    where e.id = p_equip_id;
    if not found then
        raise exception 'EQUIPMENT_NOT_FOUND' using errcode = 'P0002';
    end if;

    -- 화면에서 온 값이라도 그대로 믿지 않는다. 0 이나 음수, 터무니없는 값이
    -- 들어오면 다음 처방이 통째로 이상해진다.
    if p_weight_kg is null or p_weight_kg < v_step or p_weight_kg > 500 then
        raise exception 'INVALID_WEIGHT' using errcode = '22023';
    end if;

    insert into public.user_equipment_levels (user_id, equip_id, weight_kg)
    values (v_user_id, p_equip_id, p_weight_kg)
    on conflict (user_id, equip_id)
    do update set weight_kg = excluded.weight_kg, updated_at = now();

    -- 오늘 이미 만들어진 처방도 같이 고친다. 안 그러면 "올릴게요"를 눌렀는데
    -- 오늘 화면에는 옛 무게가 그대로 떠서 눌린 게 맞나 싶어진다.
    -- 이미 완료한 기록은 건드리지 않는다 — 그건 실제로 한 일이다.
    update public.daily_routines
    set target_weight = p_weight_kg
    where user_id = v_user_id
      and equip_id = p_equip_id
      and routine_date = (now() at time zone 'Asia/Seoul')::date
      and not is_completed;

    return jsonb_build_object('equip_id', p_equip_id, 'weight_kg', p_weight_kg);
end;
$$;

comment on function public.apply_weight_suggestion(uuid, integer) is
    '무게 제안을 수락해 사람별·기구별 무게를 저장하고, 오늘의 미완료 처방에도 반영한다.';

revoke all on function public.apply_weight_suggestion(uuid, integer) from public;
grant execute on function public.apply_weight_suggestion(uuid, integer) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 6. 조회: 콘텐츠는 도감에서, 위치·QR 은 보유 기록에서
-- ─────────────────────────────────────────────────────────────

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
        select d.sort_order, cat.name, jsonb_build_object(
            'routine_id', d.id,
            'catalog_id', cat.id,
            -- 기구 없이 하는 처방이면 null — 화면은 이걸로 "맨몸"을 안다.
            'equip_id', e.id,
            'name', cat.name,
            'name_ko', cat.name_ko,
            'station_kind', cat.station_kind,
            'description', cat.description,
            'why_it_matters', cat.why_it_matters,
            'target_muscle', cat.target_muscle,
            'video_url', cat.video_url,
            'qr_code_val', e.qr_code_val,
            'location_label', e.location_label,
            'target_weight', d.target_weight,
            'target_sets', d.target_sets,
            'target_reps', d.target_reps,
            'target_duration_minutes', d.target_duration_minutes,
            'is_completed', d.is_completed,
            -- 이미 한 운동에는 제안을 띄우지 않는다. 오늘 할 일이 아니라
            -- 다음에 할 얘기라서, 끝난 항목에 뜨면 되돌리라는 말로 읽힌다.
            'weight_suggestion', case
                when d.is_completed then null
                else public.weight_suggestion(p_user_id, e.id)
            end
        ) as row
        from public.daily_routines d
        join public.exercise_catalog cat on cat.id = d.catalog_id
        left join public.equipments e on e.id = d.equip_id
        where d.user_id = p_user_id and d.routine_date = p_date
    ) s;
$$;

comment on function public.get_daily_routine(uuid, date) is
    '해당 날짜의 루틴을 도감 콘텐츠와 기구 위치(location_label), 무게 제안까지 합쳐 돌려준다.';

revoke all on function public.get_daily_routine(uuid, date) from public;
grant execute on function public.get_daily_routine(uuid, date) to anon, authenticated;


create or replace function public.get_equipment_by_qr(
    p_qr_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_result jsonb;
begin
    select jsonb_build_object(
        'id', e.id,
        'catalog_id', cat.id,
        'name', cat.name,
        'name_ko', cat.name_ko,
        'station_kind', cat.station_kind,
        'description', cat.description,
        'why_it_matters', cat.why_it_matters,
        'target_muscle', cat.target_muscle,
        'video_url', cat.video_url,
        'qr_code_val', e.qr_code_val,
        'location_label', e.location_label,
        'base_weight_kg', coalesce(e.base_weight_kg, cat.base_weight_kg),
        'weight_step_kg', coalesce(e.weight_step_kg, cat.weight_step_kg)
    )
    into v_result
    from public.equipments e
    join public.exercise_catalog cat on cat.id = e.catalog_id
    where e.qr_code_val = p_qr_code;

    if v_result is null then
        raise exception 'EQUIPMENT_NOT_FOUND' using errcode = 'P0002';
    end if;

    return v_result;
end;
$$;

comment on function public.get_equipment_by_qr(text) is
    'QR 코드 값으로 기구를 바로 찾는다. 도감 콘텐츠에 위치(location_label)를 합쳐 준다.
    처방 정보(목표 무게·세트·완료 기록)는 포함하지 않는다.';

revoke all on function public.get_equipment_by_qr(text) from public;
grant execute on function public.get_equipment_by_qr(text) to anon, authenticated;


-- 분석 탭 부위별 집계도 도감 기준으로 바꾼다 — 맨몸 대체 처방(equip_id null)도
-- 집계에 잡혀야 한다.
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
        select cat.target_muscle, count(*) as completed_count, coalesce(sum(d.target_sets), 0) as total_sets
        from public.daily_routines d
        join public.exercise_catalog cat on cat.id = d.catalog_id
        where d.user_id = p_user_id and d.is_completed
          and d.routine_date between p_from and p_to
        group by cat.target_muscle
    ) t;

    return jsonb_build_object(
        'completed_count', v_completed_count,
        'total_sets', v_total_sets,
        'by_muscle', v_by_muscle
    );
end;
$$;

comment on function public.get_workout_summary(uuid, date, date) is
    '기간 내 완료 운동 원시 집계(완료 개수, 총 세트, 부위별). 부위는 운동 도감 기준.';

revoke all on function public.get_workout_summary(uuid, date, date) from public;
grant execute on function public.get_workout_summary(uuid, date, date) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 7. 계정 병합의 루틴 중복 제거 기준도 catalog_id 로 바꾼다
--
-- equip_id 는 이제 맨몸 대체 처방에서 null 이라, equip_id 로 비교하면
-- null = null 이 거짓이 되어 중복이 살아남고, 이어지는 user_id 이관이
-- (user, catalog, date) 유니크에 걸려 병합이 통째로 실패한다.
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
    v_existing_is_placeholder    boolean;
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

    if v_candidate is null then
        raise exception 'PAIRING_NOT_FOUND' using errcode = 'P0002';
    end if;

    select * into v_existing from public.users where auth_user_id = auth.uid();

    if v_existing is null then
        -- 이 폰에 아직 프로필이 없다. 후보 계정에 그대로 붙인다.
        -- 후보가 다른 auth 에 물려 있었다면(폰을 지웠다 다시 깐 경우) 그 죽은
        -- 연결을 새 것으로 갈아끼운다 — 어차피 그 익명 계정으로는 아무도 다시
        -- 로그인할 수 없다.
        update public.users set auth_user_id = auth.uid() where id = v_candidate.id
        returning * into v_final_user;

    elsif v_existing.id = v_candidate.id then
        -- 이미 페어링된 코드를 다시 스캔한 경우. no-op.
        v_final_user := v_existing;

    else
        -- 앱을 다시 깔면서 부팅 때 만들어진 껍데기인지 본다. 전화번호도 없고
        -- 설문도 안 했고 포인트도 없고 다닌 헬스장도 없으면 버려도 되는 행이다.
        v_existing_is_placeholder :=
            v_existing.phone_number is null
            and coalesce(v_existing.total_points, 0) = 0
            and (v_existing.profile_data->>'onboarded_at') is null
            and not exists (
                select 1 from public.user_gym_memberships where user_id = v_existing.id
            );

        if v_existing_is_placeholder then
            -- 껍데기를 지우고 진짜 계정에 이 폰을 연결한다. 포인트·설문·출석이
            -- 전부 원래 자리에 그대로 남으므로 옮길 것이 없다.
            delete from public.users where id = v_existing.id;

            update public.users set auth_user_id = auth.uid() where id = v_candidate.id
            returning * into v_final_user;
        else
            -- 원래의 병합 시나리오: 카카오/구글로 쓰던 진짜 계정(v_existing)이
            -- 키오스크가 번호로 만든 그림자 계정(v_candidate)을 흡수한다.
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
                    update public.user_gym_memberships
                    set user_id = v_existing.id, is_primary = false
                    where id = v_membership.id;
                end if;
            end loop;

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

            delete from public.daily_routines d
            where d.user_id = v_candidate.id
              and exists (
                  select 1 from public.daily_routines d2
                  where d2.user_id = v_existing.id
                    and d2.catalog_id = d.catalog_id
                    and d2.routine_date = d.routine_date
              );
            update public.daily_routines set user_id = v_existing.id where user_id = v_candidate.id;

            -- 포인트는 두 쪽을 합친다. 예전엔 아예 옮기지 않아서 그림자 계정에
            -- 쌓인 포인트가 병합될 때마다 사라졌다.
            update public.users
            set total_points = coalesce(total_points, 0) + coalesce(v_candidate.total_points, 0)
            where id = v_existing.id;

            -- 설문을 아직 안 한 계정이면 그림자 쪽 답변을 물려받는다.
            -- 이미 답한 계정의 답을 덮어쓰지는 않는다.
            if (v_existing.profile_data->>'onboarded_at') is null
               and (v_candidate.profile_data->>'onboarded_at') is not null
            then
                update public.users set profile_data = v_candidate.profile_data
                where id = v_existing.id;
            end if;

            delete from public.users where id = v_candidate.id;

            if v_existing.phone_number is null then
                update public.users set phone_number = v_candidate_phone where id = v_existing.id;
            end if;

            select * into v_final_user from public.users where id = v_existing.id;
        end if;
    end if;

    update public.device_pairings
    set consumed_at = now(), consumed_by_auth_user_id = auth.uid()
    where id = v_pairing.id;

    return jsonb_build_object('user', to_jsonb(v_final_user));
end;
$$;

comment on function public.complete_pairing(text) is
    'QR/코드 페어링 완료. 루틴 중복 제거 기준이 catalog_id 다(맨몸 대체 처방은 equip_id 가 null 이라서).';

revoke all on function public.complete_pairing(text) from public;
grant execute on function public.complete_pairing(text) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 8. 콘텐츠 컬럼을 equipments 에서 걷어낸다
--
-- 위 함수들이 전부 도감을 읽게 된 뒤에 지워야 순서가 안전하다. 남는 컬럼:
-- id, apt_id, catalog_id, qr_code_val, location_label,
-- base_weight_kg·weight_step_kg(단지별 보정), created_at.
-- ─────────────────────────────────────────────────────────────

alter table public.equipments
    drop column if exists name,
    drop column if exists name_ko,
    drop column if exists station_kind,
    drop column if exists description,
    drop column if exists why_it_matters,
    drop column if exists target_muscle,
    drop column if exists video_url;

comment on table public.exercise_catalog is
    '운동 도감(전체 공용). 머신·덤벨·맨몸·유산소 운동의 이름·설명·영상·기본 무게를 미리 등록해 둔다.';
comment on table public.equipments is
    '단지별 보유 기구. "이 단지에 도감의 이 운동 기구가 몇 번 구역에 있다"만 담는다.';


-- ═══════════════════════════════════════════════════════════
-- 20260814000027_workout_trend.sql
-- ═══════════════════════════════════════════════════════════

-- 분석 탭에 "추이" 그래프를 붙이기 위한 시계열 집계.
--
-- 기존 get_workout_summary 는 기간 전체를 한 덩어리로 합쳐서 준다. 그래서
-- "이번 기간에 40세트 했다"는 알 수 있어도 "지난주보다 늘었는지, 요즘 뜸해
-- 졌는지"는 알 수 없다. 시니어에게 가장 큰 동기는 정확한 칼로리 숫자가 아니라
-- "내가 꾸준히 하고 있다"는 그림이라, 그 그림을 그릴 데이터를 따로 만든다.
--
-- 설계에서 중요한 것 두 가지:
--   1. 운동이 없는 날도 0 으로 채워서 돌려준다. 빠뜨리면 쉰 날이 그래프에서
--      사라져 실제보다 꾸준히 한 것처럼 보인다 — 기록을 부풀리는 셈이다.
--   2. 직전 같은 길이 구간의 합계도 같이 준다. "지난주보다 12세트 많아요"
--      한 문장이 막대 일곱 개보다 잘 읽힌다.

create or replace function public.get_workout_trend(
    p_user_id uuid,
    p_from    date,
    p_to      date,
    -- 'day' = 하루씩(최근 7일용), 'week' = 7일씩 묶어서(최근 4주용)
    p_bucket  text default 'day'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_owner_auth_id uuid;
    v_span          integer;
    v_prev_from     date;
    v_prev_to       date;
    v_points        jsonb;
    v_total_sets    integer;
    v_completed     integer;
    v_days          integer;
    v_prev_sets     integer;
    v_prev_days     integer;
begin
    if auth.uid() is null then
        raise exception 'AUTH_REQUIRED' using errcode = '42501';
    end if;

    -- 남의 기록은 못 본다. get_workout_summary 와 같은 기준.
    select auth_user_id into v_owner_auth_id from public.users where id = p_user_id;
    if not found or v_owner_auth_id is distinct from auth.uid() then
        raise exception 'FORBIDDEN' using errcode = '42501';
    end if;

    if p_bucket not in ('day', 'week') then
        raise exception 'INVALID_BUCKET' using errcode = '22023';
    end if;

    if p_to < p_from then
        raise exception 'INVALID_RANGE' using errcode = '22023';
    end if;

    v_span := (p_to - p_from) + 1;

    -- 주 단위는 딱 떨어질 때만 받는다. 30일을 7일씩 자르면 마지막 한 칸이
    -- 이틀짜리가 되는데, 그 칸만 막대가 낮게 나와 "요즘 덜 한다"로 잘못
    -- 읽힌다. 애매하게 잘라 보여주느니 부르는 쪽에서 28일로 맞추게 한다.
    if p_bucket = 'week' and v_span % 7 <> 0 then
        raise exception 'INVALID_RANGE' using errcode = '22023';
    end if;

    v_prev_to := p_from - 1;
    v_prev_from := v_prev_to - (v_span - 1);

    with buckets as (
        -- 오늘(p_to)에서 거꾸로 잘라 나간다. 달력의 주(월~일)에 맞추지 않는
        -- 이유는, 오늘이 수요일이면 이번 주 칸만 사흘짜리가 되어 위와 같은
        -- 착시가 생기기 때문이다. 항상 "오늘부터 7일씩"이라 칸 길이가 같다.
        select
            case when p_bucket = 'week' then p_to - (g * 7 + 6) else p_to - g end as bucket_start,
            case when p_bucket = 'week' then p_to - (g * 7)     else p_to - g end as bucket_end
        from generate_series(
            0,
            case when p_bucket = 'week' then (v_span / 7) - 1 else v_span - 1 end
        ) as g
    ),
    done as (
        select d.routine_date, d.target_sets
        from public.daily_routines d
        where d.user_id = p_user_id
          and d.is_completed
          and d.routine_date between p_from and p_to
    )
    select jsonb_agg(
        jsonb_build_object(
            'bucket_start', b.bucket_start,
            'bucket_end', b.bucket_end,
            'completed_count', count(x.routine_date),
            'total_sets', coalesce(sum(x.target_sets), 0),
            'workout_days', count(distinct x.routine_date)
        )
        order by b.bucket_start
    )
    into v_points
    from buckets b
    left join done x on x.routine_date between b.bucket_start and b.bucket_end
    group by b.bucket_start, b.bucket_end;

    select count(*), coalesce(sum(d.target_sets), 0), count(distinct d.routine_date)
    into v_completed, v_total_sets, v_days
    from public.daily_routines d
    where d.user_id = p_user_id and d.is_completed
      and d.routine_date between p_from and p_to;

    select coalesce(sum(d.target_sets), 0), count(distinct d.routine_date)
    into v_prev_sets, v_prev_days
    from public.daily_routines d
    where d.user_id = p_user_id and d.is_completed
      and d.routine_date between v_prev_from and v_prev_to;

    return jsonb_build_object(
        'bucket', p_bucket,
        'points', coalesce(v_points, '[]'::jsonb),
        'completed_count', v_completed,
        'total_sets', v_total_sets,
        'workout_days', v_days,
        'previous_total_sets', v_prev_sets,
        'previous_workout_days', v_prev_days
    );
end;
$$;

comment on function public.get_workout_trend(uuid, date, date, text) is
    '분석 탭 추이 그래프용 시계열. 운동이 없는 날도 0 으로 채워 주고, 직전 같은 길이 구간의 합계도 같이 준다.';

revoke all on function public.get_workout_trend(uuid, date, date, text) from public;
grant execute on function public.get_workout_trend(uuid, date, date, text) to authenticated;


-- ═══════════════════════════════════════════════════════════
-- 20260814000028_weight_suggestion_index.sql
-- ═══════════════════════════════════════════════════════════

-- 무게 제안 조회용 인덱스.
--
-- weight_suggestion() 은 (user_id, equip_id) 로 지난 완료 기록을 찾아
-- completed_at 역순으로 한두 건만 본다. 그런데 daily_routines 에는
-- (user_id, routine_date) 인덱스밖에 없어서 equip_id 로 좁히는 건 못 쓴다.
--
-- 이 함수는 운동 목록을 열 때마다 항목 수만큼 불린다(6개 운동이면 12번).
-- 지금은 행이 적어 티가 안 나지만, 한 사람이 1년만 다녀도 수백 행이 되고
-- 단지가 늘면 테이블 전체가 커진다 — 그때는 목록 화면이 통째로 느려진다.
create index if not exists daily_routines_user_equip_completed_idx
    on public.daily_routines (user_id, equip_id, completed_at desc)
    where is_completed;


-- ═══════════════════════════════════════════════════════════
-- 20260814000029_how_to_steps.sql
-- ═══════════════════════════════════════════════════════════

-- 운동별 "하는 방법"을 도감에 넣는다.
--
-- 지금까지는 앱이 근력운동 전체에 같은 5줄을 띄웠다:
--   "자리에 앉아 등과 허리를 등받이에 붙입니다 …"
-- 랫 풀다운은 미는 게 아니라 당기는 운동이고, 의자 스쿼트·데드버그·벽
-- 푸시업에는 기댈 등받이가 없다. 기구 앞에서 읽는 안내가 그 기구와 다른
-- 말을 하면 안 하느니만 못하다 — 틀린 자세를 알려주는 셈이라서다.
--
-- 출처: CDC/NIA 「Growing Stronger: Strength Training for Older Adults」
--       (미국 질병통제예방센터 발행, Tufts 대학 영양·운동생리·근감소증
--        연구실 개발). 미국 정부 저작물이라 인용에 제약이 없다.
--       https://stacks.cdc.gov/view/cdc/11447
--       국립노화연구소(NIA) 시니어 근력운동 지침도 같이 참고했다.
--       https://www.nia.nih.gov/health/exercise-and-physical-activity
--
-- 원문에서 그대로 가져온 핵심 규칙(앱이 모든 근력운동 뒤에 공통으로 붙인다):
--   · 올릴 때 둘~넷을 세고, 내릴 때 넷을 센다("raising the weight to a
--     count of two to four and then lowering it to a count of four")
--   · 숨을 참지 않는다("breathe regularly throughout — don't hold your breath")
--   · 관절을 끝까지 펴 잠그지 않는다("don't lock your elbows/knees")
--   · 반동을 쓰지 않는다("Don't let momentum do the work")
--   · 세트 사이 1분쯤 쉰다
-- 위 네 줄은 모든 운동에 같으므로 DB 에 75번 복사하지 않고 앱이 붙인다.
-- 여기에는 그 운동에서만 맞는 말만 담는다.

alter table public.exercise_catalog
    add column if not exists how_to_steps  text[],
    -- "이것만은 지키세요" 한두 줄. 그 운동에서 다치는 대표적인 경로를 막는다.
    add column if not exists form_caution  text;

comment on column public.exercise_catalog.how_to_steps is
    '이 운동에서만 맞는 동작 순서. 호흡·템포·휴식 같은 공통 규칙은 앱이 붙이므로 넣지 않는다.';
comment on column public.exercise_catalog.form_caution is
    '이것만은 지키세요. 그 운동에서 다치는 대표 경로를 막는 한두 줄.';

-- 이름으로 맞춰 넣는다. 도감에 없는 이름은 조용히 건너뛴다(단지마다 보유
-- 기구가 달라도 이 파일 하나로 채울 수 있게).
update public.exercise_catalog c
set how_to_steps = v.steps, form_caution = v.caution
from (values

-- ── 맨몸 ────────────────────────────────────────────────────────────
-- 벽 푸시업·의자 스쿼트·카프 레이즈·스텝업·옆으로 다리 들기·슈퍼맨은
-- Growing Stronger 에 같은 동작이 실려 있어 그 순서를 따랐다.
('벽 푸시업', array[
    '벽에서 팔 길이보다 조금 멀리 떨어져 벽을 마주 보고 섭니다.',
    '손바닥을 어깨 높이·어깨너비로 벽에 붙입니다.',
    '팔꿈치를 굽혀 상체를 벽 쪽으로 천천히 기울입니다.',
    '팔이 펴질 때까지 벽을 밀어 처음 자리로 돌아옵니다.'],
 '발은 바닥에 붙인 채 두고, 등을 둥글게 말거나 젖히지 마세요.'),

('무릎 푸시업', array[
    '매트에 무릎을 대고 엎드려, 손을 어깨너비보다 조금 넓게 짚습니다.',
    '머리부터 무릎까지 일직선이 되게 자세를 잡습니다.',
    '팔꿈치를 굽혀 가슴을 바닥 쪽으로 천천히 내립니다.',
    '바닥을 밀어 처음 자리로 올라옵니다.'],
 '허리가 처지거나 엉덩이가 솟지 않게 하세요. 힘들면 벽 푸시업부터 하세요.'),

('의자 스쿼트', array[
    '튼튼한 의자 앞에 발을 어깨너비로 벌리고 섭니다.',
    '엉덩이를 뒤로 빼며 의자에 닿을 듯 말 듯 천천히 앉습니다.',
    '발뒤꿈치로 바닥을 밀며 일어섭니다.'],
 '무릎이 발끝보다 앞으로 나가지 않게 하세요. 털썩 앉지 말고, 힘들면 손으로 의자를 짚고 하세요.'),

('제자리 런지', array[
    '한 발을 앞으로 크게 내딛고 서서, 필요하면 의자나 난간을 잡습니다.',
    '두 무릎을 굽혀 몸을 곧게 아래로 내립니다.',
    '앞발 뒤꿈치로 밀며 처음 자리로 올라옵니다.'],
 '앞 무릎이 발끝보다 앞으로 나가지 않게 하세요. 흔들리면 폭을 좁히거나 의자를 잡으세요.'),

('스텝업', array[
    '발판이나 계단 앞에 서서 난간이나 손잡이를 잡습니다.',
    '한 발을 발판 위에 온전히 올려놓습니다.',
    '올린 발의 뒤꿈치로 밀며 몸을 들어 올립니다.',
    '올린 발로 버티며 반대 발을 천천히 내립니다.'],
 '앞 무릎이 발목보다 앞으로 나가지 않게 하세요. 뒷다리로 차거나 반동을 쓰지 마세요.'),

('카프 레이즈', array[
    '발을 어깨너비로 벌리고 의자나 난간 옆에 섭니다.',
    '앞꿈치로 밀어 올려 발뒤꿈치를 최대한 듭니다.',
    '2~4초 멈췄다가 천천히 내립니다.'],
 '의자는 균형을 잡는 데만 쓰고 몸을 기대지 마세요.'),

('옆으로 다리 들기', array[
    '튼튼한 의자 뒤에 서서 등받이를 가볍게 잡습니다.',
    '다리를 곧게 편 채(무릎은 잠그지 않고) 옆으로 천천히 들어 올립니다.',
    '잠시 멈췄다가 천천히 내립니다.'],
 '조금만 벌려도 충분합니다. 상체가 반대쪽으로 기울지 않게 곧게 세우세요.'),

('힙 브릿지', array[
    '바닥에 누워 무릎을 세우고 발을 엉덩이 가까이 둡니다.',
    '엉덩이에 힘을 주며 몸통이 일직선이 될 때까지 들어 올립니다.',
    '잠시 멈췄다가 천천히 내립니다.'],
 '허리를 젖혀 올리지 말고 엉덩이 힘으로 드세요. 허리가 아프면 덜 올리세요.'),

('슈퍼맨', array[
    '매트에 엎드려 한쪽 팔을 머리 위로 곧게 뻗습니다.',
    '뻗은 팔과 반대쪽 다리를 같은 높이로 천천히 들어 올립니다.',
    '잠시 멈췄다가 천천히 내리고, 반대쪽도 같은 방법으로 합니다.'],
 '목을 젖히지 말고 시선은 바닥을 봅니다. 허리가 아프면 즉시 멈추세요.'),

('데드버그', array[
    '바닥에 누워 무릎을 세우고 허리를 바닥에 붙입니다.',
    '두 팔을 천장으로 뻗고 무릎을 직각으로 들어 올립니다.',
    '한쪽 팔과 반대쪽 다리를 천천히 뻗었다가 제자리로 돌아옵니다.'],
 '허리가 바닥에서 뜨면 덜 뻗으세요. 허리가 뜨는 그 지점이 오늘의 한계입니다.'),

('시티드 니 업', array[
    '의자 앞쪽에 앉아 양손으로 의자 옆을 가볍게 잡습니다.',
    '등을 곧게 편 채 상체를 살짝 뒤로 기울입니다.',
    '무릎을 배 쪽으로 천천히 당겼다가 내립니다.'],
 '등을 둥글게 말지 마세요. 목에 힘이 들어가면 상체를 덜 기울이세요.'),

('플랭크', array[
    '매트에 엎드려 팔꿈치를 어깨 바로 아래에 두고 바닥을 짚습니다.',
    '무릎이나 발끝을 대고 몸을 들어 머리부터 발까지 일직선을 만듭니다.',
    '그 자세로 숨을 고르게 쉬며 버팁니다.'],
 '허리가 처지면 바로 내려놓으세요. 버티는 동안 숨을 참지 마세요.'),

('월 엔젤', array[
    '벽에 등을 대고 서서 뒤통수·등·엉덩이를 벽에 붙입니다.',
    '팔꿈치를 굽혀 팔등을 벽에 붙입니다.',
    '팔을 벽에 붙인 채 천천히 위로 올렸다가 내립니다.'],
 '허리가 벽에서 크게 뜨지 않게 하세요. 팔이 벽에서 떨어지는 지점까지만 올리세요.'),

('제자리 무릎 들기', array[
    '발을 어깨너비로 벌리고 서서, 필요하면 의자를 잡습니다.',
    '한쪽 무릎을 배 높이까지 들었다가 내립니다.',
    '좌우를 번갈아 걷듯이 반복하며 팔도 자연스럽게 흔듭니다.'],
 '숨이 차면 속도를 늦추세요. 어지러우면 즉시 멈추고 앉으세요.'),

-- ── 덤벨 ────────────────────────────────────────────────────────────
('덤벨 컬', array[
    '서거나 앉아서 발을 어깨너비로 벌리고, 손바닥이 허벅지를 향하게 덤벨을 잡습니다.',
    '손바닥이 어깨를 향하도록 팔을 돌리며 들어 올립니다.',
    '천천히 처음 자리로 내립니다.'],
 '위팔과 팔꿈치를 옆구리에 붙인 채 고정하세요. 몸을 흔들어 반동을 쓰지 마세요.'),

('덤벨 숄더 프레스', array[
    '의자에 앉거나 서서 발을 어깨너비로 벌립니다.',
    '손바닥이 앞을 보게 덤벨을 어깨 높이로 듭니다.',
    '머리 위로 밀어 올립니다.',
    '팔꿈치를 옆구리 쪽으로 내리며 어깨 높이까지 천천히 돌아옵니다.'],
 '손목은 곧게 세우고 목과 어깨에 힘을 빼세요. 덤벨이 몸 앞뒤로 벗어나지 않게 하세요.'),

('덤벨 프론트 레이즈', array[
    '서서 덤벨을 허벅지 앞에 두고 손등이 앞을 보게 잡습니다.',
    '팔을 곧게 편 채 어깨 높이까지 앞으로 들어 올립니다.',
    '천천히 처음 자리로 내립니다.'],
 '어깨보다 높이 올리지 마세요. 몸을 흔들지 말고 팔로만 드세요.'),

('덤벨 로우', array[
    '벤치나 의자에 한 손과 한 무릎을 얹고, 등을 바닥과 나란히 폅니다.',
    '반대 손으로 덤벨을 잡고 팔을 곧게 늘어뜨립니다.',
    '팔꿈치를 옆구리에 스치듯 붙여 덤벨을 당겨 올립니다.',
    '천천히 처음 자리로 내립니다.'],
 '허리를 둥글게 말지 마세요. 몸통을 비틀어 반동으로 올리지 마세요.'),

-- ── 머신: 가슴 ──────────────────────────────────────────────────────
('체스트 프레스', array[
    '등과 허리를 등받이에 붙이고 앉아, 손잡이가 가슴 높이에 오게 자리를 맞춥니다.',
    '손잡이를 잡고 팔이 펴질 때까지 앞으로 밀어냅니다.',
    '천천히 처음 자리로 돌아옵니다.'],
 '어깨가 앞으로 말리지 않게 등을 등받이에 붙인 채 미세요.'),

('인클라인 체스트 프레스', array[
    '등받이에 등을 붙이고 앉아, 손잡이가 가슴 윗부분 높이에 오게 맞춥니다.',
    '손잡이를 비스듬히 위쪽으로 밀어냅니다.',
    '천천히 처음 자리로 돌아옵니다.'],
 '어깨를 으쓱 올리지 마세요. 어깨 앞쪽이 당기면 미는 범위를 줄이세요.'),

('디클라인 체스트 프레스', array[
    '등받이에 등을 붙이고 앉아, 손잡이가 가슴 아랫부분 높이에 오게 맞춥니다.',
    '손잡이를 비스듬히 아래쪽으로 밀어냅니다.',
    '천천히 처음 자리로 돌아옵니다.'],
 '허리를 등받이에서 띄우지 마세요.'),

('머신 벤치 프레스', array[
    '벤치에 누워 손잡이가 가슴 높이에 오게 자리를 맞춥니다.',
    '발을 바닥에 단단히 딛고 손잡이를 위로 밀어 올립니다.',
    '천천히 처음 자리로 내립니다.'],
 '허리를 과하게 젖히지 마세요. 어깨가 아프면 내리는 깊이를 줄이세요.'),

('펙덱 플라이', array[
    '등을 등받이에 붙이고 앉아 손잡이를 가슴 높이에서 잡습니다.',
    '팔꿈치를 살짝 굽힌 채 두 팔을 몸 앞으로 모읍니다.',
    '천천히 처음 자리로 벌립니다.'],
 '팔을 뒤로 크게 젖히지 마세요. 어깨 앞쪽이 당기면 거기서 멈추세요.'),

-- ── 머신: 등 ────────────────────────────────────────────────────────
('랫 풀다운', array[
    '자리에 앉아 허벅지 패드를 다리에 맞추고, 위쪽 손잡이를 어깨보다 넓게 잡습니다.',
    '가슴을 펴고 손잡이를 가슴 위쪽으로 당겨 내립니다.',
    '천천히 팔을 펴며 처음 자리로 돌아옵니다.'],
 '손잡이를 목 뒤로 당기지 마세요. 몸을 뒤로 크게 젖혀 반동을 쓰지 마세요.'),

('시티드 로우', array[
    '발을 발판에 대고 앉아 무릎을 살짝 굽힙니다.',
    '등을 곧게 편 채 손잡이를 배 쪽으로 당깁니다.',
    '천천히 팔을 펴며 처음 자리로 돌아옵니다.'],
 '허리를 둥글게 말거나 뒤로 크게 젖히지 마세요. 어깨뼈를 모은다는 느낌으로 당기세요.'),

('아이소 로우', array[
    '가슴 패드에 가슴을 대고 앉아 한쪽 손잡이를 잡습니다.',
    '팔꿈치를 옆구리로 붙이며 한 팔씩 당깁니다.',
    '천천히 팔을 펴며 돌아온 뒤, 반대쪽도 같은 방법으로 합니다.'],
 '가슴을 패드에서 떼지 마세요. 몸통을 비틀어 당기지 마세요.'),

('하이 로우 머신', array[
    '가슴 패드에 가슴을 대고 앉아 위쪽 손잡이를 잡습니다.',
    '손잡이를 비스듬히 아래·뒤로 당깁니다.',
    '천천히 팔을 펴며 처음 자리로 돌아옵니다.'],
 '어깨를 으쓱 올리지 말고 어깨뼈를 아래로 모으며 당기세요.'),

('T바 로우', array[
    '패드에 가슴을 대고 엎드려 손잡이를 잡습니다.',
    '등을 곧게 편 채 손잡이를 배 쪽으로 당깁니다.',
    '천천히 팔을 펴며 처음 자리로 돌아옵니다.'],
 '허리를 둥글게 말지 마세요. 허리가 아프면 이 기구는 건너뛰세요.'),

('백 익스텐션', array[
    '패드에 허벅지를 대고 엎드려 발을 발판에 고정합니다.',
    '등을 곧게 편 채 몸이 일직선이 될 때까지 천천히 올라옵니다.',
    '천천히 처음 자리로 내려갑니다.'],
 '일직선을 넘어 허리를 뒤로 젖히지 마세요. 허리 통증이 있으면 건너뛰고 관리사무소에 알리세요.'),

('슈러그 머신', array[
    '손잡이를 잡고 팔을 곧게 늘어뜨린 채 자세를 잡습니다.',
    '어깨를 귀 쪽으로 곧장 들어 올립니다.',
    '천천히 내립니다.'],
 '어깨를 돌리지 말고 위아래로만 움직이세요. 목에 힘을 주지 마세요.'),

-- ── 머신: 어깨 ──────────────────────────────────────────────────────
('숄더 프레스', array[
    '등을 등받이에 붙이고 앉아 손잡이가 어깨 높이에 오게 맞춥니다.',
    '손잡이를 머리 위로 밀어 올립니다.',
    '천천히 어깨 높이까지 내립니다.'],
 '허리를 뒤로 젖히지 말고 등을 등받이에 붙이세요. 목과 어깨에 힘을 빼세요.'),

('레버리지 숄더 프레스', array[
    '등을 등받이에 붙이고 앉아 손잡이가 어깨 높이에 오게 맞춥니다.',
    '손잡이를 머리 위로 밀어 올립니다.',
    '천천히 어깨 높이까지 내립니다.'],
 '허리를 뒤로 젖히지 마세요. 어깨가 아프면 내리는 깊이를 줄이세요.'),

('리버스 펙덱', array[
    '가슴 패드에 가슴을 대고 앉아 손잡이를 잡습니다.',
    '팔꿈치를 살짝 굽힌 채 두 팔을 뒤로 벌립니다.',
    '천천히 처음 자리로 모읍니다.'],
 '어깨를 으쓱 올리지 말고 어깨뼈를 모은다는 느낌으로 벌리세요.'),

-- ── 머신: 팔 ────────────────────────────────────────────────────────
('암 컬 머신', array[
    '패드에 위팔을 붙이고 앉아 손잡이를 잡습니다.',
    '팔꿈치를 굽혀 손잡이를 어깨 쪽으로 올립니다.',
    '천천히 팔을 펴며 내립니다.'],
 '위팔이 패드에서 떨어지지 않게 하세요.'),

('프리처 컬 머신', array[
    '경사 패드에 위팔을 붙이고 앉아 손잡이를 잡습니다.',
    '팔꿈치를 굽혀 손잡이를 어깨 쪽으로 올립니다.',
    '천천히 팔을 펴며 내립니다.'],
 '위팔이 패드에서 떨어지지 않게 하세요. 맨 아래에서 팔을 툭 떨어뜨리지 마세요.'),

('머신 트라이셉스 익스텐션', array[
    '등받이에 등을 붙이고 앉아 손잡이를 잡습니다.',
    '팔꿈치를 고정한 채 팔을 펴 손잡이를 밀어냅니다.',
    '천천히 처음 자리로 돌아옵니다.'],
 '팔꿈치가 옆으로 벌어지지 않게 고정하세요.'),

('딥스 머신', array[
    '등받이에 등을 붙이고 앉아 손잡이를 몸 옆에서 잡습니다.',
    '팔을 펴며 손잡이를 아래로 밀어냅니다.',
    '천천히 처음 자리로 돌아옵니다.'],
 '어깨를 으쓱 올리지 마세요. 어깨 앞쪽이 아프면 멈추세요.'),

-- ── 머신: 하체 ──────────────────────────────────────────────────────
('레그 프레스', array[
    '등과 허리를 등받이에 붙이고 앉아, 발을 발판에 어깨너비로 놓습니다.',
    '발뒤꿈치로 발판을 밀어 다리를 폅니다.',
    '무릎이 직각쯤 될 때까지 천천히 돌아옵니다.'],
 '무릎이 가슴에 닿을 만큼 깊이 내리지 마세요. 허리가 등받이에서 뜨면 거기까지가 범위입니다.'),

('내로우 레그 프레스', array[
    '등을 등받이에 붙이고 앉아, 발을 발판 가운데에 모아 놓습니다.',
    '발뒤꿈치로 발판을 밀어 다리를 폅니다.',
    '무릎이 직각쯤 될 때까지 천천히 돌아옵니다.'],
 '무릎이 안쪽으로 모이지 않게 발끝 방향과 맞추세요.'),

('핵 스쿼트', array[
    '어깨 패드에 어깨를 대고 등을 등판에 붙이고 섭니다.',
    '발을 어깨너비로 놓고 무릎을 굽혀 천천히 앉습니다.',
    '발뒤꿈치로 밀며 일어섭니다.'],
 '무릎이 발끝보다 앞으로 나가지 않게 하세요. 허리를 등판에서 떼지 마세요.'),

('레그 익스텐션', array[
    '등받이에 깊숙이 앉아 무릎이 의자 끝에 오게 맞추고, 발목 앞을 패드에 댑니다.',
    '발끝을 세우고 무릎이 펴질 때까지 천천히 들어 올립니다.',
    '잠시 멈췄다가 천천히 내립니다.'],
 '무릎 앞쪽이 아프면 즉시 멈추고 관리사무소에 알리세요. 반동으로 차 올리지 마세요.'),

('레그 컬', array[
    '패드에 엎드리거나 앉아 발목 뒤를 패드에 댑니다.',
    '발목을 세운 채 무릎을 굽혀 뒤꿈치를 엉덩이 쪽으로 당깁니다.',
    '천천히 처음 자리로 폅니다.'],
 '엉덩이가 들리지 않게 하세요. 반동으로 차 올리지 마세요.'),

('라잉 레그 컬', array[
    '패드에 엎드려 무릎이 패드 끝에 오게 맞추고, 발목 뒤를 패드에 댑니다.',
    '발목을 세운 채 무릎을 굽혀 뒤꿈치를 엉덩이 쪽으로 당깁니다.',
    '천천히 처음 자리로 폅니다.'],
 '엉덩이와 허리가 들리지 않게 하세요.'),

('시티드 카프 레이즈', array[
    '앉아서 앞꿈치를 발판에 올리고 무릎 위에 패드를 맞춥니다.',
    '앞꿈치로 밀어 올려 발뒤꿈치를 최대한 듭니다.',
    '2~4초 멈췄다가 천천히 내립니다.'],
 '반동으로 튕기지 말고 끝까지 천천히 움직이세요.'),

('카프 프레스', array[
    '레그 프레스에 앉아 앞꿈치만 발판 아래쪽에 걸칩니다.',
    '무릎을 편 채(잠그지 않고) 앞꿈치로 발판을 밀어냅니다.',
    '천천히 처음 자리로 돌아옵니다.'],
 '무릎을 굽혔다 펴지 말고 발목만 움직이세요.'),

('힙 어브덕션', array[
    '자리에 앉아 무릎 바깥쪽을 패드에 붙입니다.',
    '두 다리를 바깥으로 천천히 벌립니다.',
    '천천히 처음 자리로 모읍니다.'],
 '상체를 뒤로 젖히지 말고 등을 등받이에 붙이세요.'),

('힙 어덕션', array[
    '자리에 앉아 무릎 안쪽을 패드에 붙이고 다리를 벌린 상태로 시작합니다.',
    '두 다리를 안쪽으로 천천히 모읍니다.',
    '천천히 처음 자리로 벌립니다.'],
 '시작할 때 너무 넓게 벌리지 마세요. 사타구니가 당기면 범위를 줄이세요.'),

-- ── 머신: 복부 ──────────────────────────────────────────────────────
('복부 크런치', array[
    '등을 등받이에 붙이고 앉아 손잡이나 어깨 패드를 잡습니다.',
    '배에 힘을 주며 상체를 천천히 앞으로 숙입니다.',
    '천천히 처음 자리로 돌아옵니다.'],
 '팔 힘으로 당기지 말고 배 힘으로 숙이세요. 목을 앞으로 빼지 마세요.'),

-- ── 스미스머신 ──────────────────────────────────────────────────────
('스미스 벤치 프레스', array[
    '벤치에 누워 바가 가슴 한가운데 오도록 자리를 맞춥니다.',
    '바를 어깨너비보다 조금 넓게 잡고 안전걸이를 풉니다.',
    '바를 가슴 쪽으로 천천히 내렸다가 밀어 올립니다.'],
 '안전걸이를 반드시 가슴 아래 높이에 걸어 두세요. 혼자 할 때는 무게를 욕심내지 마세요.'),

('스미스 스쿼트', array[
    '바를 어깨 뒤 승모근 위에 얹고 발을 어깨너비로 벌립니다.',
    '안전걸이를 풀고 엉덩이를 뒤로 빼며 천천히 앉습니다.',
    '발뒤꿈치로 밀며 일어섭니다.'],
 '무릎이 발끝보다 앞으로 나가지 않게 하세요. 안전걸이를 앉는 높이 바로 아래에 걸어 두세요.'),

('스미스 스플릿 스쿼트', array[
    '바를 어깨 뒤에 얹고 한 발을 앞으로 크게 내딛습니다.',
    '두 무릎을 굽혀 몸을 곧게 아래로 내립니다.',
    '앞발 뒤꿈치로 밀며 올라옵니다.'],
 '앞 무릎이 발끝보다 앞으로 나가지 않게 하세요. 균형이 흔들리면 무게를 줄이세요.'),

-- ── 케이블 ──────────────────────────────────────────────────────────
('케이블 로우', array[
    '발을 발판에 대고 앉아 무릎을 살짝 굽힙니다.',
    '등을 곧게 편 채 손잡이를 배 쪽으로 당깁니다.',
    '천천히 팔을 펴며 처음 자리로 돌아옵니다.'],
 '허리를 둥글게 말거나 뒤로 크게 젖히지 마세요.'),

('V바 풀다운', array[
    '자리에 앉아 허벅지 패드를 맞추고 V자 손잡이를 좁게 잡습니다.',
    '가슴을 펴고 손잡이를 가슴 위쪽으로 당겨 내립니다.',
    '천천히 팔을 펴며 처음 자리로 돌아옵니다.'],
 '몸을 뒤로 크게 젖혀 반동을 쓰지 마세요.'),

('언더핸드 풀다운', array[
    '자리에 앉아 허벅지 패드를 맞추고, 손바닥이 위를 보게 어깨너비로 잡습니다.',
    '가슴을 펴고 손잡이를 가슴 쪽으로 당겨 내립니다.',
    '천천히 팔을 펴며 처음 자리로 돌아옵니다.'],
 '팔꿈치를 옆구리로 붙이며 당기세요. 손목이 꺾이지 않게 하세요.'),

('스트레이트암 풀다운', array[
    '기구를 마주 보고 서서 손잡이를 어깨너비로 잡습니다.',
    '팔을 편 채(팔꿈치는 살짝 굽히고) 손잡이를 허벅지 앞까지 눌러 내립니다.',
    '천천히 처음 자리로 돌아옵니다.'],
 '팔꿈치를 굽혔다 펴지 마세요. 허리를 둥글게 말지 마세요.'),

('케이블 크로스오버', array[
    '양쪽 케이블을 잡고 한 발을 앞으로 내딛어 섭니다.',
    '팔꿈치를 살짝 굽힌 채 두 팔을 몸 앞으로 모읍니다.',
    '천천히 처음 자리로 벌립니다.'],
 '팔을 뒤로 크게 젖히지 마세요. 어깨 앞쪽이 당기면 거기서 멈추세요.'),

('케이블 래터럴 레이즈', array[
    '케이블을 몸 반대편 손으로 잡고 옆으로 섭니다.',
    '팔을 곧게 편 채 어깨 높이까지 옆으로 들어 올립니다.',
    '천천히 처음 자리로 내립니다.'],
 '어깨보다 높이 올리지 마세요. 몸을 기울여 반동을 쓰지 마세요.'),

('케이블 리어델트 플라이', array[
    '케이블을 가슴 높이에서 팔을 교차해 잡고 섭니다.',
    '팔꿈치를 살짝 굽힌 채 두 팔을 뒤로 벌립니다.',
    '천천히 처음 자리로 모읍니다.'],
 '어깨를 으쓱 올리지 말고 어깨뼈를 모으며 벌리세요.'),

('페이스 풀', array[
    '로프를 얼굴 높이에 맞추고 양손으로 잡습니다.',
    '팔꿈치를 어깨 높이로 벌리며 로프를 얼굴 쪽으로 당깁니다.',
    '천천히 처음 자리로 돌아옵니다.'],
 '어깨를 으쓱 올리지 마세요. 목을 앞으로 빼지 마세요.'),

('업라이트 케이블 로우', array[
    '손잡이를 어깨너비보다 좁게 잡고 팔을 늘어뜨린 채 섭니다.',
    '팔꿈치를 위로 이끌며 손잡이를 가슴 높이까지 끌어올립니다.',
    '천천히 처음 자리로 내립니다.'],
 '가슴 높이보다 위로 올리지 마세요. 어깨가 결리면 이 운동은 건너뛰세요.'),

('케이블 푸시다운', array[
    '기구를 마주 보고 서서 손잡이를 가슴 높이에서 잡습니다.',
    '팔꿈치를 옆구리에 붙인 채 팔을 펴 손잡이를 아래로 밀어 내립니다.',
    '천천히 처음 자리로 돌아옵니다.'],
 '팔꿈치가 옆구리에서 떨어지지 않게 고정하세요. 상체를 숙여 체중으로 누르지 마세요.'),

('로프 푸시다운', array[
    '로프를 양손으로 잡고 기구를 마주 보고 섭니다.',
    '팔꿈치를 옆구리에 붙인 채 로프를 아래로 내리며 양옆으로 벌립니다.',
    '천천히 처음 자리로 돌아옵니다.'],
 '팔꿈치를 옆구리에 고정하세요. 어깨로 누르지 말고 팔로만 미세요.'),

('케이블 해머 컬', array[
    '로프를 양손으로 마주 잡고 팔을 늘어뜨린 채 섭니다.',
    '엄지가 위를 보는 상태를 유지하며 팔꿈치를 굽혀 올립니다.',
    '천천히 처음 자리로 내립니다.'],
 '위팔과 팔꿈치를 옆구리에 붙인 채 고정하세요.'),

('케이블 크런치', array[
    '기구 앞에 무릎을 꿇고 로프를 머리 옆에서 잡습니다.',
    '배에 힘을 주며 상체를 둥글게 말아 아래로 숙입니다.',
    '천천히 처음 자리로 돌아옵니다.'],
 '팔로 당기지 말고 배 힘으로 숙이세요. 엉덩이를 뒤로 빼지 마세요.'),

('케이블 리버스 크런치', array[
    '바닥에 누워 발목에 케이블을 걸고 손으로 바닥을 짚습니다.',
    '배에 힘을 주며 무릎을 가슴 쪽으로 당깁니다.',
    '천천히 처음 자리로 내립니다.'],
 '허리가 바닥에서 크게 뜨지 않게 하세요. 반동으로 차지 마세요.'),

('케이블 우드찹', array[
    '케이블을 몸 옆 높은 곳에 맞추고 양손으로 잡습니다.',
    '배에 힘을 주며 사선 아래로 당겨 내립니다.',
    '천천히 처음 자리로 돌아옵니다.'],
 '허리를 비틀지 말고 몸통 전체를 함께 돌리세요. 무릎은 살짝 굽힌 상태를 유지하세요.'),

('팔로프 프레스', array[
    '케이블을 가슴 높이에 맞추고 옆으로 서서 양손으로 잡습니다.',
    '몸이 돌아가지 않게 버티며 두 팔을 앞으로 곧게 밀어냅니다.',
    '천천히 가슴 쪽으로 돌아옵니다.'],
 '몸통이 케이블 쪽으로 돌아가면 무게를 줄이세요. 버티는 동안 숨을 참지 마세요.'),

('케이블 킥백', array[
    '발목에 케이블을 걸고 기구를 마주 보고 서서 손잡이를 잡습니다.',
    '무릎을 편 채 다리를 뒤로 천천히 밀어냅니다.',
    '천천히 처음 자리로 돌아옵니다.'],
 '허리를 젖혀 다리를 올리지 마세요. 엉덩이 힘으로만 미세요.'),

-- ── 유산소 ──────────────────────────────────────────────────────────
-- 유산소는 세트·반복이 아니라 "이어서 하는 시간"이라 공통 규칙도 다르다.
('트레드밀', array[
    '안전키를 옷에 집고 손잡이를 잡은 채 벨트에 올라섭니다.',
    '가장 느린 속도로 시작해 3분쯤 몸을 덥힙니다.',
    '옆 사람과 말은 되지만 노래는 못 부를 정도의 속도를 유지합니다.',
    '끝나기 2~3분 전부터 속도를 줄여 마무리합니다.'],
 '안전키를 반드시 옷에 집으세요. 손잡이에 몸을 기대지 말고 똑바로 서서 걸으세요.'),

('실내 자전거', array[
    '안장에 앉았을 때 페달이 가장 아래일 때 무릎이 살짝 굽는 높이로 맞춥니다.',
    '가장 가벼운 저항으로 시작해 3분쯤 몸을 덥힙니다.',
    '숨이 조금 차지만 말은 되는 정도로 계속 밟습니다.',
    '끝나기 2~3분 전부터 저항을 낮춰 마무리합니다.'],
 '무릎이 완전히 펴지거나 너무 굽으면 안장 높이를 다시 맞추세요.'),

('등받이 자전거', array[
    '등받이에 등을 붙이고 앉아, 페달이 가장 멀 때 무릎이 살짝 굽는 위치로 맞춥니다.',
    '가장 가벼운 저항으로 시작해 3분쯤 몸을 덥힙니다.',
    '숨이 조금 차지만 말은 되는 정도로 계속 밟습니다.',
    '끝나기 2~3분 전부터 저항을 낮춰 마무리합니다.'],
 '허리가 아프신 분께 가장 편한 유산소입니다. 등을 등받이에서 떼지 마세요.'),

('일립티컬', array[
    '손잡이를 잡고 발판에 두 발을 올립니다.',
    '가장 가벼운 저항으로 시작해 3분쯤 몸을 덥힙니다.',
    '걷듯이 자연스럽게 발을 굴리며 이어 갑니다.',
    '끝나기 2~3분 전부터 속도를 줄여 마무리합니다.'],
 '무릎에 충격이 적은 운동입니다. 상체를 숙이지 말고 곧게 세우세요.'),

('로잉머신', array[
    '발을 발판에 고정하고 손잡이를 잡습니다.',
    '다리로 먼저 밀고, 이어서 몸통을 젖히며 손잡이를 배 쪽으로 당깁니다.',
    '팔을 펴고 몸통을 세운 뒤 무릎을 굽혀 처음 자리로 돌아옵니다.',
    '끝나기 2~3분 전부터 속도를 줄여 마무리합니다.'],
 '허리를 둥글게 말지 마세요. 팔로 먼저 당기지 말고 다리부터 미세요.'),

('스텝밀', array[
    '손잡이를 잡고 가장 느린 속도로 시작합니다.',
    '계단을 오르듯 한 칸씩 발을 온전히 딛습니다.',
    '숨이 조금 차지만 말은 되는 정도의 속도를 유지합니다.',
    '끝나기 2~3분 전부터 속도를 줄여 마무리합니다.'],
 '손잡이에 몸을 기대지 마세요. 무릎이 아프면 즉시 멈추세요.'),

('스텝박스', array[
    '발판 앞에 서서 필요하면 난간을 잡습니다.',
    '한 발씩 발판에 올라섰다가 한 발씩 내려옵니다.',
    '올라가는 발을 번갈아 가며 일정한 속도로 이어 갑니다.',
    '끝나기 2~3분 전부터 속도를 줄여 마무리합니다.'],
 '발 전체를 발판에 딛으세요. 앞꿈치만 걸치면 미끄러집니다.')

) as v(name, steps, caution)
where c.name = v.name;


-- ─────────────────────────────────────────────────────────────
-- 조회 RPC 가 새 필드를 같이 내려주게 한다.
-- (본문은 마이그레이션 26 과 같고 how_to_steps·form_caution 두 줄만 늘었다)
-- ─────────────────────────────────────────────────────────────

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
        select d.sort_order, cat.name, jsonb_build_object(
            'routine_id', d.id,
            'catalog_id', cat.id,
            'equip_id', e.id,
            'name', cat.name,
            'name_ko', cat.name_ko,
            'station_kind', cat.station_kind,
            'description', cat.description,
            'why_it_matters', cat.why_it_matters,
            'how_to_steps', cat.how_to_steps,
            'form_caution', cat.form_caution,
            'target_muscle', cat.target_muscle,
            'video_url', cat.video_url,
            'qr_code_val', e.qr_code_val,
            'location_label', e.location_label,
            'target_weight', d.target_weight,
            'target_sets', d.target_sets,
            'target_reps', d.target_reps,
            'target_duration_minutes', d.target_duration_minutes,
            'is_completed', d.is_completed,
            'weight_suggestion', case
                when d.is_completed then null
                else public.weight_suggestion(p_user_id, e.id)
            end
        ) as row
        from public.daily_routines d
        join public.exercise_catalog cat on cat.id = d.catalog_id
        left join public.equipments e on e.id = d.equip_id
        where d.user_id = p_user_id and d.routine_date = p_date
    ) s;
$$;

revoke all on function public.get_daily_routine(uuid, date) from public;
grant execute on function public.get_daily_routine(uuid, date) to anon, authenticated;

create or replace function public.get_equipment_by_qr(p_qr_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_result jsonb;
begin
    select jsonb_build_object(
        'id', e.id,
        'catalog_id', cat.id,
        'name', cat.name,
        'name_ko', cat.name_ko,
        'station_kind', cat.station_kind,
        'description', cat.description,
        'why_it_matters', cat.why_it_matters,
        'how_to_steps', cat.how_to_steps,
        'form_caution', cat.form_caution,
        'target_muscle', cat.target_muscle,
        'video_url', cat.video_url,
        'qr_code_val', e.qr_code_val,
        'location_label', e.location_label,
        'base_weight_kg', coalesce(e.base_weight_kg, cat.base_weight_kg),
        'weight_step_kg', coalesce(e.weight_step_kg, cat.weight_step_kg)
    )
    into v_result
    from public.equipments e
    join public.exercise_catalog cat on cat.id = e.catalog_id
    where e.qr_code_val = p_qr_code;

    if v_result is null then
        raise exception 'EQUIPMENT_NOT_FOUND' using errcode = 'P0002';
    end if;

    return v_result;
end;
$$;

revoke all on function public.get_equipment_by_qr(text) from public;
grant execute on function public.get_equipment_by_qr(text) to anon, authenticated;


-- ═══════════════════════════════════════════════════════════
-- seed.sql — 시범단지 + 보유 기구 (테스트용)
-- ═══════════════════════════════════════════════════════════

-- 로컬/개발용 시드 데이터.

insert into public.apartments (id, name, address)
values (
    '11111111-1111-4111-8111-111111111111',
    '핏루틴 시범단지',
    '서울특별시 강남구 테헤란로 1'
)
on conflict (id) do nothing;

-- 태블릿 최초 설정에 쓰는 값. 실제 단지는 등록 코드가 자동 생성되지만(랜덤 6자리),
-- 시범단지만은 매번 조회하지 않게 고정해 둔다. 운영 단지에 이 PIN 을 그대로
-- 쓰면 안 된다 — 코드는 공개돼도 되지만 PIN 은 관리사무소만 알아야 한다.
update public.apartments
set enroll_code    = 'TEST24',
    kiosk_pin_hash = crypt('1234', gen_salt('bf'))
where id = '11111111-1111-4111-8111-111111111111';

-- 시범단지의 보유 기구. 운동 이름·설명·영상은 운동 도감(exercise_catalog,
-- 마이그레이션 26에서 미리 등록)이 들고 있고, 여기서는 "어떤 운동의 기구가
-- 몇 번 구역에 있는지"만 잇는다. 맨몸운동은 기구가 없으니 여기 등록하지
-- 않는다 — 보유 기구가 없는 부위에 자동으로 대체 처방된다.
--
-- location_label 규칙:
--   자리에 고정된 기구  "12번 구역"  — 기구에 붙인 번호표와 같은 숫자를 쓴다.
--                                    번호는 한 단지 안에서 겹치면 안 된다.
--   덤벨·맨몸          "덤벨 구역", "매트 구역"  — 특정 기구가 아니라 자리로 안내
-- 앱은 마지막 띄어쓰기에서 잘라 "12번"을 크게, "구역"을 작게 보여준다.
insert into public.equipments (apt_id, catalog_id, qr_code_val, location_label)
select '11111111-1111-4111-8111-111111111111', c.id, v.qr_code_val, v.location_label
from (values
    ('체스트 프레스', 'FIT-DEMO-CHEST-01',  '1번 구역'),
    ('랫 풀다운',     'FIT-DEMO-LAT-01',    '2번 구역'),
    ('레그 프레스',   'FIT-DEMO-LEG-01',    '3번 구역'),
    ('숄더 프레스',   'FIT-DEMO-SHLD-01',   '4번 구역'),
    ('복부 크런치',   'FIT-DEMO-ABD-01',    '5번 구역'),
    ('트레드밀',      'FIT-DEMO-CARDIO-01', '6번 구역')
) as v (name, qr_code_val, location_label)
join public.exercise_catalog c on c.name = v.name
on conflict (qr_code_val) do nothing;
