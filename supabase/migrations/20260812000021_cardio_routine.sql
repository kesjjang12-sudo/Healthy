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
