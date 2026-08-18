-- 루틴 생성 개선 셋. 서버의 현재 정의(pg_get_functiondef, 2026-08-16 확인)에
-- 얹었다 — 통증 제외/감량, 기구 배정, on conflict, 진단 카운트는 그대로다.
--
-- 1) 유산소를 매일 보장한다.
--    템플릿 210개 중 90개에 유산소 항목이 아예 없어서, 그 템플릿에 걸린
--    회원은 러닝머신·자전거가 영영 안 나왔다. 심폐는 매일 채워야 하는
--    기본값이라 템플릿에 없으면 단지의 유산소 기구에서 하나를 골라 넣는다
--    (날짜 해시로 돌아가며 — 매일 같은 기구만 나오지 않게).
--
-- 2) 코스를 고정 시간제로 바꾼다. 짧게 = 30분, 충분히 = 60분.
--    예전엔 운동 목록에서 시간을 역산해 "약 33분/61분"이 그때그때 흔들렸다.
--    거꾸로 시간 예산을 먼저 정하고 거기 맞춰 운동 수를 자른다. 유산소
--    시간을 먼저 떼어 두고 남는 예산에 근력을 채운다.
--
-- 3) 어제 한 부위는 목록 뒤로 민다.
--    예산 때문에 잘릴 때 어제 한 부위부터 잘리므로, 매일 나오는 분은
--    자연히 부위가 돌아가며 나온다. 예산이 남으면 전부 들어간다(그날은
--    순환이 없어도 어차피 다 한다).

create or replace function public.generate_daily_routine(
    p_user_id uuid,
    p_date date default current_date,
    p_apt_id uuid default null::uuid,
    p_course text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
    v_user            public.users;
    v_target_apt_id   uuid;
    v_gender          text;
    v_age_group       integer;
    v_goals_key       text;
    v_pain_areas      text[];
    v_template_id     uuid;
    v_course          text;
    v_max_level       smallint;
    v_cardio_bonus    integer;
    v_budget          numeric;
    v_cardio_reserve  numeric;
    v_strength_budget numeric;
    v_yesterday       text[];
    v_has_gym_cardio  boolean;
    v_created         integer := 0;
    v_cardio_added    integer := 0;
    v_excluded        integer := 0;
    v_unmapped        integer := 0;
    v_minutes         integer := 0;
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
    -- 고정 시간 예산. 코스 버튼에 적히는 그 숫자다.
    v_budget := case when v_course = 'long' then 60 else 30 end;

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

    -- 어제 한 부위(유산소 제외). 오늘 예산에서 잘라야 할 때 이 부위부터 자른다.
    v_yesterday := array(
        select distinct cat.target_muscle
        from public.daily_routines d
        join public.exercise_catalog cat on cat.id = d.catalog_id
        where d.user_id = p_user_id
          and d.routine_date = p_date - 1
          and cat.target_muscle is not null
          and cat.target_muscle <> '유산소'
    );

    -- 유산소 몫을 먼저 떼어 둔다: 템플릿에 유산소가 있으면 그 시간, 없으면
    -- (단지에 유산소 기구가 있을 때) 15분 + 코스 보너스.
    select exists (
        select 1 from public.equipments e
        join public.exercise_catalog cat on cat.id = e.catalog_id
        where e.apt_id = v_target_apt_id and cat.station_kind = '유산소'
    ) into v_has_gym_cardio;

    select coalesce(max(i.duration_minutes + v_cardio_bonus), 0) into v_cardio_reserve
    from public.routine_template_items i
    where i.template_id = v_template_id
      and i.course_level <= v_max_level
      and i.duration_minutes is not null
      and not exists (
          select 1 from public.pain_area_rules r
          where r.action = 'exclude'
            and r.target_muscle = i.target_muscle
            and r.pain_area = any (v_pain_areas)
      );

    if v_cardio_reserve = 0 and v_has_gym_cardio then
        v_cardio_reserve := 15 + v_cardio_bonus;
    end if;

    v_strength_budget := v_budget - v_cardio_reserve;

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
        select c.*, r.equip_id, r.catalog_id, r.base_weight_kg, r.weight_step_kg,
            -- 한 운동이 차지하는 시간. 한 세트 = 동작 40초 + 쉬는 시간 60초,
            -- 마지막 세트 뒤에는 쉬지 않고, 기구를 찾고 무게를 맞추는 1.5분을 더한다.
            case
                when c.duration_minutes is not null then c.duration_minutes::numeric
                else ceil((coalesce(c.sets, 1) * 100 - 60) / 60.0) + 1.5
            end as est_minutes,
            (c.target_muscle = any (v_yesterday)) as did_yesterday
        from candidate c
        join ranked r
          on r.target_muscle = c.target_muscle
         and r.rn = ((c.slot - 1) % r.total) + 1
    ),
    budgeted as (
        select m.*,
            -- 근력만 누적한다(유산소는 몫을 이미 떼어 두었다). 어제 안 한
            -- 부위가 먼저 쌓이므로, 예산이 모자라면 어제 한 부위부터 잘린다.
            sum(case when m.duration_minutes is null then m.est_minutes else 0 end)
                over (order by m.did_yesterday, m.sort_order
                      rows between unbounded preceding and current row) as strength_cum
        from matched m
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
        from budgeted m
        where m.duration_minutes is not null      -- 유산소는 항상 들어간다
           or m.strength_cum <= v_strength_budget -- 근력은 예산 안에서만
        order by m.sort_order
        on conflict (user_id, catalog_id, routine_date) do nothing
        returning 1
    )
    select count(*) into v_created from saved;

    -- 유산소 보장: 템플릿에 유산소가 없어 오늘 루틴에 유산소가 하나도 없으면,
    -- 단지의 유산소 기구에서 하나를 골라 마지막에 넣는다. 날짜 해시로 골라
    -- 매일 같은 기구만 나오지 않는다. 이미 오늘 유산소를 마친 경우(코스를
    -- 바꿔 다시 생성)는 is_completed 행이 남아 있어 여기 걸리지 않는다.
    if v_has_gym_cardio and not exists (
        select 1
        from public.daily_routines d
        join public.exercise_catalog cat on cat.id = d.catalog_id
        where d.user_id = p_user_id
          and d.routine_date = p_date
          and cat.station_kind = '유산소'
    ) then
        insert into public.daily_routines
            (user_id, catalog_id, equip_id, routine_date, target_duration_minutes, sort_order)
        select
            p_user_id, e.catalog_id, e.id, p_date,
            15 + v_cardio_bonus,
            coalesce((select max(d2.sort_order) from public.daily_routines d2
                      where d2.user_id = p_user_id and d2.routine_date = p_date), 0) + 1
        from public.equipments e
        join public.exercise_catalog cat on cat.id = e.catalog_id
        where e.apt_id = v_target_apt_id and cat.station_kind = '유산소'
        order by hashtext(e.id::text || p_user_id::text || p_date::text) & 2147483647
        limit 1
        on conflict (user_id, catalog_id, routine_date) do nothing;

        get diagnostics v_cardio_added = row_count;
        v_created := v_created + v_cardio_added;
    end if;

    -- 오늘 걸리는 시간(실제 목록 기준). 예산과 거의 같지만 조금 남을 수 있다.
    select coalesce(sum(
        case
            when d.target_duration_minutes is not null then d.target_duration_minutes
            else ceil((coalesce(d.target_sets, 1) * 100 - 60) / 60.0) + 1.5
        end
    ), 0)::integer into v_minutes
    from public.daily_routines d
    where d.user_id = p_user_id and d.routine_date = p_date;

    return jsonb_build_object(
        'routine_date', p_date,
        'template', jsonb_build_object(
            'gender', v_gender, 'age_group', v_age_group, 'goals_key', v_goals_key
        ),
        'course', v_course,
        'estimated_minutes', v_minutes,
        -- 고정 시간제: 코스 버튼에는 늘 같은 숫자가 적힌다. 실제 목록에서
        -- 역산하던 예전 방식은 이 숫자가 그때그때 흔들렸다.
        'course_options', jsonb_build_array(
            jsonb_build_object('course', 'short', 'minutes', 30),
            jsonb_build_object('course', 'long', 'minutes', 60)
        ),
        'created', v_created,
        'excluded_by_pain', v_excluded,
        'missing_equipment', v_unmapped,
        'needs_trainer_review',
            (v_created = 0 and v_excluded > 0) or coalesce(array_length(v_pain_areas, 1), 0) >= 3,
        'routines', public.get_daily_routine(p_user_id, p_date)
    );
end;
$function$;
