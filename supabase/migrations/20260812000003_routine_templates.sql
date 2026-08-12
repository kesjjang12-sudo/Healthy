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
