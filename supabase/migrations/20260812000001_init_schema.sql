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
