-- 성별로 루틴 구성을 다르게 짠다. 여성은 하체 비중을 약 65% 로 둔다.
--
-- 지금까지 성별은 무게 배율(gender_modifiers)에만 영향을 줬다. 즉 남녀가
-- "같은 운동을 다른 무게로" 했다. 운영 판단은 그게 아니다 — 여성은 하체
-- 위주로 구성해야 효과와 재미가 붙고, 맨몸 운동 비중도 높아야 한다.
--
-- 구조상 두 가지가 막고 있었다.
--
-- (1) goal_blocks 는 (목적, 부위) 가 기본키라 성별을 구분할 칸이 없었다.
-- (2) routine_template_items 가 (템플릿, 부위) 로 유일해서 한 부위를 두 번
--     넣을 수 없었다. 하체 비중을 올리려면 하체 운동이 여러 개 들어가야 하는데
--     구조가 하나만 허용했다.
--
-- 그래서 goal_blocks 에 gender 와 slot 을 넣는다. slot 은 "같은 부위의 몇 번째
-- 운동인가"다. 여성 하체 3슬롯 / 남성 하체 1슬롯이 이번 변경의 핵심이다.
--
-- 맨몸 운동은 따로 넣지 않아도 늘어난다. 하체 슬롯이 3개면 이 단지의 하체
-- 기구 3종(레그 프레스·스미스 스쿼트·의자 스쿼트)이 전부 배정되는데, 그중
-- 의자 스쿼트가 맨몸이다. 슬롯을 늘리는 것이 곧 맨몸 운동을 넣는 것이 된다.
--
-- ⚠️ 65% 라는 비율과 아래 세트·횟수는 운영 판단이자 트레이너 검수 대상이다.
--    성별은 어디까지나 기본값이고, 본인이 고른 운동목적이 그 위에서 조정한다.


-- ─────────────────────────────────────────────────────────────
-- 한 부위를 여러 번 넣을 수 있게 한다
-- ─────────────────────────────────────────────────────────────

alter table public.routine_template_items
    add column if not exists slot integer not null default 1;

comment on column public.routine_template_items.slot is
    '같은 부위 안에서 몇 번째 운동인가. 하체 비중을 올리려면 하체가 여러 번 들어가야 해서 필요하다.';

-- (템플릿, 부위) 유일 제약을 (템플릿, 부위, 슬롯) 으로 바꾼다.
alter table public.routine_template_items
    drop constraint if exists routine_template_items_template_id_target_muscle_key;
alter table public.routine_template_items
    drop constraint if exists routine_template_items_template_muscle_slot_key;
alter table public.routine_template_items
    add constraint routine_template_items_template_muscle_slot_key
    unique (template_id, target_muscle, slot);


-- ─────────────────────────────────────────────────────────────
-- goal_blocks 를 성별·슬롯까지 갖도록 다시 만든다
--
-- 참조 데이터라 지우고 다시 만들어도 잃을 것이 없다. 다른 테이블이 외래키로
-- 물고 있지도 않다 — rebuild_routine_templates() 가 만들 때 한 번 읽을 뿐이다.
-- ─────────────────────────────────────────────────────────────

drop table if exists public.goal_blocks cascade;

create table public.goal_blocks (
    gender        varchar(20) not null,
    goal          varchar(20) not null,
    target_muscle varchar(50) not null,
    slot          integer not null default 1,
    sets          integer not null,
    reps          integer not null,
    weight_ratio  numeric(4, 2) not null,
    sort_order    integer not null,
    primary key (gender, goal, target_muscle, slot)
);

comment on table public.goal_blocks is
    '성별·목적별 기본 처방. slot 은 같은 부위의 몇 번째 운동인지. 여성은 하체를 여러 슬롯 두어 비중을 높인다.';

alter table public.goal_blocks enable row level security;

insert into public.goal_blocks (gender, goal, target_muscle, slot, sets, reps, weight_ratio, sort_order) values
    -- ── 남성: 부위를 고르게 ─────────────────────────────────
    ('male', 'muscle', '하체', 1, 3, 10, 1.00,  1),
    ('male', 'muscle', '등',   1, 3, 10, 1.00, 10),
    ('male', 'muscle', '가슴', 1, 3, 10, 1.00, 20),
    ('male', 'muscle', '어깨', 1, 3, 10, 0.90, 30),

    ('male', 'diet',   '하체', 1, 3, 15, 0.70,  1),
    ('male', 'diet',   '등',   1, 3, 15, 0.70, 10),
    ('male', 'diet',   '가슴', 1, 3, 15, 0.70, 20),
    ('male', 'diet',   '복부', 1, 3, 15, 0.70, 40),

    ('male', 'health', '하체', 1, 2, 12, 0.60,  1),
    ('male', 'health', '등',   1, 2, 12, 0.60, 10),
    ('male', 'health', '복부', 1, 2, 12, 0.60, 40),

    ('male', 'rehab',  '등',   1, 2, 12, 0.40, 10),
    ('male', 'rehab',  '복부', 1, 2, 12, 0.40, 40),

    -- ── 여성: 하체 3슬롯 ────────────────────────────────────
    -- 세트 수로 따진 하체 비중: 9 / (9+3+2) = 64%.
    -- 슬롯마다 무게 비율을 조금씩 낮추는 이유는, 같은 부위를 연달아 하면
    -- 뒤로 갈수록 힘이 빠지기 때문이다. 뒷 슬롯일수록 가볍고 횟수를 늘린다.
    ('female', 'muscle', '하체', 1, 3, 10, 1.00,  1),
    ('female', 'muscle', '하체', 2, 3, 12, 0.85,  2),
    ('female', 'muscle', '하체', 3, 3, 15, 0.70,  3),
    ('female', 'muscle', '등',   1, 3, 10, 0.90, 10),
    ('female', 'muscle', '가슴', 1, 2, 12, 0.80, 20),

    ('female', 'diet',   '하체', 1, 3, 15, 0.70,  1),
    ('female', 'diet',   '하체', 2, 3, 15, 0.60,  2),
    ('female', 'diet',   '하체', 3, 3, 18, 0.50,  3),
    ('female', 'diet',   '복부', 1, 3, 15, 0.70, 40),
    ('female', 'diet',   '등',   1, 2, 15, 0.65, 10),

    ('female', 'health', '하체', 1, 2, 12, 0.60,  1),
    ('female', 'health', '하체', 2, 2, 12, 0.55,  2),
    ('female', 'health', '하체', 3, 2, 15, 0.50,  3),
    ('female', 'health', '등',   1, 2, 12, 0.60, 10),
    ('female', 'health', '복부', 1, 2, 12, 0.60, 40),

    -- 통증 관리는 비중을 조정하지 않는다. 아파서 온 분에게 특정 부위를
    -- 몰아주는 건 목적과 어긋난다.
    ('female', 'rehab',  '하체', 1, 2, 12, 0.40,  1),
    ('female', 'rehab',  '등',   1, 2, 12, 0.40, 10),
    ('female', 'rehab',  '복부', 1, 2, 12, 0.40, 40);


-- ─────────────────────────────────────────────────────────────
-- 템플릿 재생성 (성별 + 슬롯 반영)
-- ─────────────────────────────────────────────────────────────

create or replace function public.rebuild_routine_templates()
returns integer
language plpgsql
as $$
declare
    v_count integer;
begin
    delete from public.routine_templates;

    with goal_list as (
        select goal, (row_number() over (order by goal))::integer as bit
        from (select distinct goal from public.goal_blocks) g
    ),
    subsets as (
        select mask, array_agg(goal order by goal) as goals
        from generate_series(1, (1 << (select count(*)::integer from goal_list)) - 1) as mask
        join goal_list on (mask::integer >> (bit - 1)) & 1 = 1
        group by mask
    ),
    combos as (
        select gm.gender, am.age_group, array_to_string(s.goals, '+') as goals_key, s.goals
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
        (template_id, target_muscle, slot, sets, reps, weight_ratio, sort_order)
    select
        t.id,
        b.target_muscle,
        b.slot,
        -- 목적을 여러 개 고르면 보수적인 쪽을 따른다: 세트는 적게, 횟수는 많게(=가볍게).
        greatest(2, min(b.sets) + max(am.set_delta)),
        max(b.reps),
        round(min(b.weight_ratio) * max(am.weight_multiplier) * max(gm.weight_multiplier), 2),
        min(b.sort_order)
    from inserted t
    join combos c
      on c.gender = t.gender and c.age_group = t.age_group and c.goals_key = t.goals_key
    -- 성별이 맞는 처방만 쓴다. 이게 이번 변경의 핵심이다.
    join public.goal_blocks b on b.goal = any (c.goals) and b.gender = t.gender
    join public.age_modifiers am on am.age_group = t.age_group
    join public.gender_modifiers gm on gm.gender = t.gender
    group by t.id, b.target_muscle, b.slot;

    -- 유산소: 40대 이상 모든 템플릿에 목적과 무관하게 추가한다. 맨 뒤(999)에
    -- 두는 이유는 심박을 올리는 운동을 근력 뒤에 하는 편이 안전해서다.
    insert into public.routine_template_items
        (template_id, target_muscle, slot, sets, reps, weight_ratio, sort_order, duration_minutes)
    select
        t.id, '유산소', 1, 1, null, null, 999,
        case
            when t.age_group >= 70 then 10
            when t.age_group >= 60 then 12
            else 15
        end
    from public.routine_templates t
    where t.age_group >= 40
    on conflict (template_id, target_muscle, slot) do nothing;

    select count(*) into v_count from public.routine_templates;
    return v_count;
end;
$$;

comment on function public.rebuild_routine_templates() is
    '성별·연령·목적을 조합해 템플릿을 다시 만든다. goal_blocks 가 성별별로 다르므로 남녀 구성이 달라진다. 40대 이상은 유산소를 추가한다.';

select public.rebuild_routine_templates();


-- ─────────────────────────────────────────────────────────────
-- 슬롯마다 다른 기구를 배정한다
--
-- 하체가 3슬롯인데 셋 다 같은 기구를 고르면 (user, equip, date) 충돌로
-- 두 개가 조용히 사라진다. 슬롯 순서대로 다른 기구를 주어야 한다.
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

    select count(*) into v_excluded
    from public.routine_template_items i
    where i.template_id = v_template_id
      and exists (
          select 1 from public.pain_area_rules r
          where r.action = 'exclude'
            and r.target_muscle = i.target_muscle
            and r.pain_area = any (v_pain_areas)
      );

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
            i.slot,
            i.sets,
            i.reps,
            i.weight_ratio,
            i.sort_order,
            i.duration_minutes,
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
    -- 부위별로 기구 순서를 정해 둔다. 순서는 (사람+날짜+기구) 해시라
    -- 사람마다 다르게 흩어지고(동선 분산), 같은 사람·같은 날이면 늘 같다.
    ranked as (
        select
            e.id,
            e.target_muscle,
            e.base_weight_kg,
            e.weight_step_kg,
            row_number() over (
                partition by e.target_muscle
                order by hashtext(e.id::text || p_user_id::text || p_date::text) & 2147483647
            ) as rn,
            count(*) over (partition by e.target_muscle) as total
        from public.equipments e
        where e.apt_id = v_target_apt_id
    ),
    matched as (
        select c.*, r.id as equip_id, r.base_weight_kg, r.weight_step_kg
        from candidate c
        -- 슬롯 순서대로 다른 기구를 준다. 기구 수보다 슬롯이 많으면 앞으로
        -- 돌아간다(나머지 연산) — 그 경우 중복이 생겨 뒤엣것이 빠지는데,
        -- 기구가 부족한 단지에서는 그게 맞는 결과다.
        join ranked r
          on r.target_muscle = c.target_muscle
         and r.rn = ((c.slot - 1) % r.total) + 1
    ),
    saved as (
        insert into public.daily_routines
            (user_id, equip_id, routine_date, target_weight, target_sets, target_reps,
             target_duration_minutes, sort_order)
        select
            p_user_id,
            m.equip_id,
            p_date,
            coalesce(
                (select l.weight_kg from public.user_equipment_levels l
                  where l.user_id = p_user_id and l.equip_id = m.equip_id),
                case
                    when m.base_weight_kg is null or m.weight_ratio is null then null
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
        'needs_trainer_review',
            (v_created = 0 and v_excluded > 0) or coalesce(array_length(v_pain_areas, 1), 0) >= 3,
        'routines', public.get_daily_routine(p_user_id, p_date)
    );
end;
$$;

comment on function public.generate_daily_routine(uuid, date, uuid) is
    '성별별 구성(여성은 하체 3슬롯) + 아픈 곳 규칙 + 보유 기구로 하루 루틴을 만든다. 같은 부위의 슬롯마다 다른 기구를 배정하고, 기구 순서는 사람·날짜별로 갈라 동선이 겹치지 않게 한다.';

revoke all on function public.generate_daily_routine(uuid, date, uuid) from public;
grant execute on function public.generate_daily_routine(uuid, date, uuid) to anon, authenticated;
