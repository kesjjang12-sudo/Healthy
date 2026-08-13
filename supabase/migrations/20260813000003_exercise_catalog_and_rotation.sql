-- 사람마다·날마다 다른 루틴이 나오게 한다. 그리고 왜 하는 운동인지 말해 준다.
--
-- 보고된 증상: "사람마다 루틴이 똑같다".
--
-- 실제로 재보면 프로필 8명이 서로 다른 운동조합을 7가지밖에 못 만들었다.
-- 템플릿은 이미 210개나 있는데도 그렇다. 원인은 템플릿 수가 아니라 아래 두 가지다.
--
-- (1) 근육당 기구가 1대씩뿐이다. 그래서 "무슨 운동을 하느냐"는 운동목적(4가지)과
--     아픈 곳 제외로만 갈리고, 나머지는 전부 같은 6대 기구로 수렴한다. 템플릿
--     행을 아무리 늘려도 이 천장은 안 올라간다 — 늘어나는 건 무게·세트 숫자뿐이다.
-- (2) 기구를 고를 때 order by e.name limit 1 이라, 같은 근육에 기구가 여러 대
--     있어도 항상 첫 번째 하나만 쓴다. 다양성이 있어도 버려진다.
--
-- 그리고 이건 지루함의 문제가 아니라 운영의 문제다. 모두가 같은 루틴을 같은
-- 순서로 받으면 같은 시간에 같은 기구 앞에 줄을 선다. 그래서 회전을 무작위가
-- 아니라 "사람마다 다른 기구로 갈라지게" 만든다.
--
-- 이 마이그레이션이 하는 일:
--   - 운동에 한글 직역 이름과 종류(머신/스미스머신/케이블/맨몸)를 붙인다.
--   - "이 운동을 왜 해야 하는지" 칸을 만든다. 어르신은 "여긴 굳이 안 해도 되는데"
--     하고 건너뛰고, 여성은 "가슴 운동하면 가슴 살 빠진다" 같은 잘못된 정보로
--     피한다. 그 오해를 화면에서 바로잡기 위한 칸이다.
--   - 기구 선택을 (사람 + 날짜 + 부위) 해시로 갈라, 같은 부위라도 사람마다
--     다른 기구가 배정되게 한다.
--
-- ⚠️ why_it_matters 문구도 무게·세트와 마찬가지로 트레이너/물리치료사 검수
--    대상이다. 특정 질환의 치료 효과를 주장하지 않도록 썼다.


alter table public.equipments
    add column if not exists name_ko         varchar(100),
    add column if not exists station_kind    varchar(20),
    add column if not exists why_it_matters  text;

comment on column public.equipments.name_ko is
    '운동 이름의 한글 직역. 예: 체스트 프레스 → "가슴 밀기". 외래어 이름만으로는 시니어에게 안 와닿는다.';
comment on column public.equipments.station_kind is
    '머신 / 스미스머신 / 케이블 / 맨몸 / 유산소. 맨몸은 자리를 차지하지 않아 혼잡할 때 대안이 된다.';
comment on column public.equipments.why_it_matters is
    '이 운동을 왜 해야 하는지. 건너뛰기 쉬운 부위와 흔한 오해를 짚어 준다. 트레이너 검수 대상.';


-- ─────────────────────────────────────────────────────────────
-- 화면으로 새 칸을 내보낸다.
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
        select d.sort_order, e.name, jsonb_build_object(
            'routine_id', d.id,
            'equip_id', e.id,
            'name', e.name,
            'name_ko', e.name_ko,
            'station_kind', e.station_kind,
            'description', e.description,
            'why_it_matters', e.why_it_matters,
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
    ) s;
$$;

revoke all on function public.get_daily_routine(uuid, date) from public;
grant execute on function public.get_daily_routine(uuid, date) to authenticated;


create or replace function public.get_equipment_by_qr(p_qr_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_equip public.equipments;
begin
    select * into v_equip from public.equipments e where e.qr_code_val = p_qr_code;

    if not found then
        raise exception 'EQUIPMENT_NOT_FOUND' using errcode = 'P0002';
    end if;

    return jsonb_build_object(
        'id', v_equip.id,
        'name', v_equip.name,
        'name_ko', v_equip.name_ko,
        'station_kind', v_equip.station_kind,
        'description', v_equip.description,
        'why_it_matters', v_equip.why_it_matters,
        'target_muscle', v_equip.target_muscle,
        'video_url', v_equip.video_url,
        'qr_code_val', v_equip.qr_code_val,
        'base_weight_kg', v_equip.base_weight_kg,
        'weight_step_kg', v_equip.weight_step_kg
    );
end;
$$;

revoke all on function public.get_equipment_by_qr(text) from public;
grant execute on function public.get_equipment_by_qr(text) to anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 기구 배정을 사람마다 갈라 놓는다 (동선 분산)
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
    matched as (
        select c.*, e.id as equip_id, e.base_weight_kg, e.weight_step_kg
        from candidate c
        join lateral (
            select e.*
            from public.equipments e
            where e.apt_id = v_target_apt_id and e.target_muscle = c.target_muscle
            -- 같은 부위에 기구가 여러 대면 사람·날짜별로 다른 것을 고른다.
            --
            -- 예전엔 order by e.name limit 1 이었다. 그러면 기구를 아무리 늘려도
            -- 전원이 늘 같은 한 대를 배정받아, 같은 시간대에 그 앞에만 줄이 선다.
            --
            -- 해시라 무작위처럼 흩어지되 (사람, 날짜, 기구)가 같으면 결과도 같다.
            -- 그래야 같은 날 다시 생성해도 루틴이 바뀌지 않는다(재실행 안전).
            order by hashtext(e.id::text || p_user_id::text || p_date::text) & 2147483647
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
                -- 기구 조절 단위로 내림한다. 시니어에게는 조금 가벼운 쪽이 안전하다.
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
        'needs_trainer_review',
            (v_created = 0 and v_excluded > 0) or coalesce(array_length(v_pain_areas, 1), 0) >= 3,
        'routines', public.get_daily_routine(p_user_id, p_date)
    );
end;
$$;

comment on function public.generate_daily_routine(uuid, date, uuid) is
    '템플릿 + 아픈 곳 규칙 + 단지 보유 기구로 하루 루틴을 만든다. 같은 부위에 기구가 여러 대면 사람·날짜별로 갈라 배정해 동선이 겹치지 않게 한다.';

revoke all on function public.generate_daily_routine(uuid, date, uuid) from public;
grant execute on function public.generate_daily_routine(uuid, date, uuid) to anon, authenticated;
