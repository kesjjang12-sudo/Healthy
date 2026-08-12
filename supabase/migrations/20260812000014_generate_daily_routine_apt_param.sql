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
