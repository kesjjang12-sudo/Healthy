-- 운동 코스: 30~40분 / 1시간
--
-- 지금은 목적 하나만 고른 사람에게 운동이 3~5개만 처방된다(남성 건강 = 하체·
-- 등·복부 3개 + 유산소). 헬스장까지 와서 20분 만에 끝나면 "이게 다야?" 가
-- 된다. 반대로 처음 오신 분께 여덟 가지를 던지면 그건 그것대로 질린다.
--
-- 그래서 같은 처방을 두 벌로 나눈다.
--   course_level 1 — 짧은 코스에도 들어가는 핵심. 부위 균형이 여기서 완성된다.
--   course_level 2 — 긴 코스에서만 더해지는 보강. 같은 부위의 다른 기구이거나
--                    짧은 코스에서 뺀 부위다.
-- 짧은 코스는 level 1 만, 긴 코스는 1+2 를 다 쓴다.
--
-- 코스는 사람이 고르고 profile_data.course 에 남는다. 안 고르면 'short' —
-- 처음 오신 분에게 여덟 가지를 먼저 보여주지 않는다.

alter table public.goal_blocks
    add column if not exists course_level smallint not null default 1;

alter table public.routine_template_items
    add column if not exists course_level smallint not null default 1;

-- ───────────────────────────────────────────────────────────────
-- 1. 긴 코스에서만 더해지는 보강 운동
-- ───────────────────────────────────────────────────────────────
--
-- 같은 부위를 또 넣을 때는 slot 을 다르게 준다. generate_daily_routine 이
-- slot 으로 기구를 고르기 때문에(rn = ((slot-1) % total) + 1), slot 이 같으면
-- 같은 기구가 두 번 걸린다.
--
-- 재활(rehab)은 적게 더한다 — 아픈 곳이 있어 온 사람에게 여덟 가지는
-- 코스 이름이 무엇이든 과하다.

insert into public.goal_blocks
    (gender, goal, target_muscle, slot, sets, reps, weight_ratio, sort_order, course_level)
values
    -- 남성 · 건강: 짧은 코스가 하체·등·복부 3개뿐이라 가슴이 통째로 빠져
    -- 있었다. 미는 힘이 없는 코스는 균형이 안 맞아 가슴을 짧은 쪽(1)으로
    -- 올린다 — 나머지는 긴 코스에서 더한다.
    ('male',   'health', '가슴', 1, 2, 12, 0.60, 20, 1),
    ('male',   'health', '하체', 2, 2, 12, 0.55,  4, 2),
    ('male',   'health', '등',   2, 2, 12, 0.55, 11, 2),
    ('male',   'health', '어깨', 1, 2, 12, 0.50, 30, 2),
    ('male',   'health', '복부', 2, 2, 12, 0.55, 41, 2),

    -- 남성 · 체중 감량: 세트가 많아 시간이 빨리 찬다
    ('male',   'diet',   '하체', 2, 3, 15, 0.60,  4, 2),
    ('male',   'diet',   '등',   2, 3, 15, 0.60, 11, 2),
    ('male',   'diet',   '어깨', 1, 3, 15, 0.55, 30, 2),
    ('male',   'diet',   '복부', 2, 3, 15, 0.60, 41, 2),

    -- 남성 · 근력: 팔은 여기서만 나온다(짧은 코스에 넣기엔 우선순위가 낮다)
    ('male',   'muscle', '하체', 2, 3, 12, 0.85,  4, 2),
    ('male',   'muscle', '등',   2, 3, 12, 0.85, 11, 2),
    ('male',   'muscle', '가슴', 2, 3, 12, 0.85, 21, 2),
    ('male',   'muscle', '팔',   1, 2, 12, 0.60, 50, 2),

    -- 남성 · 재활
    ('male',   'rehab',  '하체', 1, 2, 12, 0.40,  1, 2),
    ('male',   'rehab',  '복부', 2, 2, 12, 0.35, 41, 2),

    -- 여성 · 건강
    ('female', 'health', '등',   2, 2, 12, 0.55, 11, 2),
    ('female', 'health', '가슴', 1, 2, 12, 0.55, 20, 2),
    ('female', 'health', '어깨', 1, 2, 12, 0.45, 30, 2),

    -- 여성 · 체중 감량
    ('female', 'diet',   '가슴', 1, 2, 15, 0.60, 20, 2),
    ('female', 'diet',   '어깨', 1, 2, 15, 0.50, 30, 2),
    ('female', 'diet',   '복부', 2, 3, 15, 0.65, 41, 2),

    -- 여성 · 근력
    ('female', 'muscle', '어깨', 1, 3, 12, 0.70, 30, 2),
    ('female', 'muscle', '복부', 1, 3, 12, 0.65, 40, 2),
    ('female', 'muscle', '팔',   1, 2, 12, 0.55, 50, 2),

    -- 여성 · 재활
    ('female', 'rehab',  '하체', 2, 2, 12, 0.35,  2, 2),
    ('female', 'rehab',  '어깨', 1, 2, 12, 0.35, 30, 2)
on conflict (gender, goal, target_muscle, slot) do update
set sets         = excluded.sets,
    reps         = excluded.reps,
    weight_ratio = excluded.weight_ratio,
    sort_order   = excluded.sort_order,
    course_level = excluded.course_level;

-- ───────────────────────────────────────────────────────────────
-- 2. 템플릿 재생성이 course_level 을 함께 옮기게 한다
-- ───────────────────────────────────────────────────────────────
--
-- 목적을 여러 개 고르면 같은 (부위, slot) 이 여러 goal 에서 올 수 있다.
-- 그때는 min() 을 쓴다 — 어느 한 목적에서라도 핵심이면 짧은 코스에 남긴다.

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
        (template_id, target_muscle, slot, sets, reps, weight_ratio, sort_order, course_level)
    select
        t.id,
        b.target_muscle,
        b.slot,
        -- 목적을 여러 개 고르면 보수적인 쪽을 따른다: 세트는 적게, 횟수는 많게(=가볍게).
        greatest(2, min(b.sets) + max(am.set_delta)),
        max(b.reps),
        round(min(b.weight_ratio) * max(am.weight_multiplier) * max(gm.weight_multiplier), 2),
        min(b.sort_order),
        min(b.course_level)
    from inserted t
    join combos c
      on c.gender = t.gender and c.age_group = t.age_group and c.goals_key = t.goals_key
    -- 성별이 맞는 처방만 쓴다.
    join public.goal_blocks b on b.goal = any (c.goals) and b.gender = t.gender
    join public.age_modifiers am on am.age_group = t.age_group
    join public.gender_modifiers gm on gm.gender = t.gender
    group by t.id, b.target_muscle, b.slot;

    -- 유산소: 40대 이상 모든 템플릿에 목적과 무관하게 추가한다. 맨 뒤(999)에
    -- 두는 이유는 심박을 올리는 운동을 근력 뒤에 하는 편이 안전해서다.
    -- 코스와 무관하게 항상 넣는다(course_level 1) — 긴 코스에서는
    -- generate_daily_routine 이 시간을 늘린다.
    insert into public.routine_template_items
        (template_id, target_muscle, slot, sets, reps, weight_ratio, sort_order, duration_minutes, course_level)
    select
        t.id, '유산소', 1, 1, null, null, 999,
        case
            when t.age_group >= 70 then 10
            when t.age_group >= 60 then 12
            else 15
        end,
        1
    from public.routine_templates t
    where t.age_group >= 40
    on conflict (template_id, target_muscle, slot) do nothing;

    select count(*) into v_count from public.routine_templates;
    return v_count;
end;
$$;

select public.rebuild_routine_templates();

-- ───────────────────────────────────────────────────────────────
-- 3. 코스를 반영해 루틴을 만든다
-- ───────────────────────────────────────────────────────────────

create or replace function public.generate_daily_routine(
    p_user_id uuid,
    p_date date default current_date,
    p_apt_id uuid default null,
    p_course text default null
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
    v_course        text;
    v_max_level     smallint;
    v_cardio_bonus  integer;
    v_created       integer := 0;
    v_excluded      integer := 0;
    v_unmapped      integer := 0;
    v_minutes       integer := 0;
    v_options       jsonb;
begin
    select * into v_user from public.users u where u.id = p_user_id;
    if not found then
        raise exception 'USER_NOT_FOUND' using errcode = 'P0002';
    end if;

    v_target_apt_id := coalesce(p_apt_id, v_user.apt_id);

    -- 코스는 인자 > 저장된 선택 > 짧은 코스 순으로 정한다.
    v_course := lower(coalesce(nullif(p_course, ''), v_user.profile_data->>'course', 'short'));
    if v_course not in ('short', 'long') then
        v_course := 'short';
    end if;
    v_max_level := case when v_course = 'long' then 2 else 1 end;
    -- 긴 코스는 유산소도 10분 더 한다. 근력만 늘리면 심폐는 그대로다.
    v_cardio_bonus := case when v_course = 'long' then 10 else 0 end;

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
      and i.course_level <= v_max_level
      and exists (
          select 1 from public.pain_area_rules r
          where r.action = 'exclude'
            and r.target_muscle = i.target_muscle
            and r.pain_area = any (v_pain_areas)
      );

    select count(*) into v_unmapped
    from public.routine_template_items i
    where i.template_id = v_template_id
      and i.course_level <= v_max_level
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
            case
                when i.duration_minutes is null then null
                else i.duration_minutes + v_cardio_bonus
            end as duration_minutes,
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
          and i.course_level <= v_max_level
          and not exists (
              select 1 from public.pain_area_rules r
              where r.action = 'exclude'
                and r.target_muscle = i.target_muscle
                and r.pain_area = any (v_pain_areas)
          )
    ),
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
        on conflict (user_id, catalog_id, routine_date) do nothing
        returning 1
    )
    select count(*) into v_created from saved;

    -- 오늘 걸리는 시간. 한 세트는 동작 40초 + 쉬는 시간 60초이고 마지막 세트
    -- 뒤에는 쉬지 않는다. 기구를 찾고 무게를 맞추는 데 드는 시간(1.5분)을
    -- 운동마다 더한다 — 이게 빠지면 늘 실제보다 짧게 안내하게 된다.
    select coalesce(sum(
        case
            when d.target_duration_minutes is not null then d.target_duration_minutes
            else ceil((coalesce(d.target_sets, 1) * 100 - 60) / 60.0) + 1.5
        end
    ), 0)::integer into v_minutes
    from public.daily_routines d
    where d.user_id = p_user_id and d.routine_date = p_date;

    -- 코스 선택 버튼에 "약 30분 / 약 55분"을 미리 띄우려면 고르기 전에도 두
    -- 코스의 길이를 알아야 한다. 오늘 저장된 루틴이 아니라 템플릿에서 센다 —
    -- 아직 안 고른 코스는 저장된 것이 없기 때문이다.
    select jsonb_agg(jsonb_build_object('course', c.course, 'minutes', c.minutes) order by c.minutes)
    into v_options
    from (
        select
            lvl.course,
            coalesce(sum(
                case
                    when i.duration_minutes is not null
                        then i.duration_minutes + case when lvl.course = 'long' then 10 else 0 end
                    else ceil((coalesce(i.sets, 1) * 100 - 60) / 60.0) + 1.5
                end
            ), 0)::integer as minutes
        from (values ('short', 1::smallint), ('long', 2::smallint)) as lvl(course, max_level)
        join public.routine_template_items i
          on i.template_id = v_template_id
         and i.course_level <= lvl.max_level
        where not exists (
            select 1 from public.pain_area_rules r
            where r.action = 'exclude'
              and r.target_muscle = i.target_muscle
              and r.pain_area = any (v_pain_areas)
        )
        group by lvl.course
    ) c;

    return jsonb_build_object(
        'routine_date', p_date,
        'template', jsonb_build_object(
            'gender', v_gender, 'age_group', v_age_group, 'goals_key', v_goals_key
        ),
        'course', v_course,
        'estimated_minutes', v_minutes,
        'course_options', coalesce(v_options, '[]'::jsonb),
        'created', v_created,
        'excluded_by_pain', v_excluded,
        'missing_equipment', v_unmapped,
        'needs_trainer_review',
            (v_created = 0 and v_excluded > 0) or coalesce(array_length(v_pain_areas, 1), 0) >= 3,
        'routines', public.get_daily_routine(p_user_id, p_date)
    );
end;
$$;

-- ───────────────────────────────────────────────────────────────
-- 4. 코스 바꾸기
-- ───────────────────────────────────────────────────────────────
--
-- 코스를 바꾸면 오늘 것부터 바뀌어야 한다 — "내일부터 적용됩니다" 는
-- 헬스장에 이미 와 있는 사람에게 아무 쓸모가 없다.
--
-- 아직 안 한 운동만 지우고 다시 짠다. 이미 마친 운동은 기록이라 건드리지
-- 않는다(포인트도 이미 나갔다). 그래서 긴 코스 → 짧은 코스로 바꿔도 오늘
-- 이미 여덟 개를 다 했다면 목록은 그대로 여덟 개로 남는다. 맞는 동작이다.

create or replace function public.set_routine_course(p_course text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user   public.users;
    v_course text;
begin
    if auth.uid() is null then
        raise exception 'AUTH_REQUIRED' using errcode = '42501';
    end if;

    v_course := lower(coalesce(p_course, ''));
    if v_course not in ('short', 'long') then
        raise exception 'INVALID_COURSE' using errcode = '22023';
    end if;

    select * into v_user from public.users where auth_user_id = auth.uid();
    if not found then
        raise exception 'USER_NOT_FOUND' using errcode = 'P0002';
    end if;

    update public.users u
    set profile_data = u.profile_data || jsonb_build_object('course', v_course)
    where u.id = v_user.id
    returning * into v_user;

    delete from public.daily_routines d
    where d.user_id = v_user.id
      and d.routine_date = current_date
      and coalesce(d.is_completed, false) = false;

    return public.generate_daily_routine(v_user.id, current_date, null, v_course);
end;
$$;

-- p_course 를 더하면서 3인자 버전이 그대로 남아 오버로드가 됐다. PostgREST 는
-- 인자 이름으로만 함수를 고르기 때문에, 코스를 안 주고 부르면 "둘 중 어느
-- 것인지 고를 수 없다"(PGRST203)며 실패한다 — 앱이 오늘의 운동을 아예 못
-- 불러오는 상태가 된다. 옛 시그니처를 지운다.
drop function if exists public.generate_daily_routine(uuid, date, uuid);
