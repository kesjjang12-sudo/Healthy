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
