-- 지난번에 한 걸 보고 무게를 "올려볼까요?" 하고 물어본다.
--
-- 지금까지의 갭: complete_routine 이 actual_weight_kg / actual_reps 를 저장하고
-- 있는데 그걸 읽는 곳이 하나도 없었다. 처방 무게는 프로필(성별·나이·목적)에서만
-- 나오고 프로필은 안 변하니까, 3개월을 매일 나와도 첫날과 같은 무게가 나온다.
-- 트레이너의 핵심은 "관찰 → 조정" 인데 관찰만 하고 조정을 안 하고 있었다.
--
-- 중요한 설계 선택: 자동으로 올리지 않는다. 물어본다.
--
--   "지난번에 15kg 으로 12회 다 하셨네요. 오늘은 17.5kg 해보실까요?"
--                                            [해볼게요] [그대로 할게요]
--
-- 앱이 알아서 올리면 다쳤을 때 앱의 판단이 된다. 제안하고 본인이 고르면
-- 사람이 판단에 남는다. 어르신 대상에서는 이 차이가 크다. 그리고 무게가
-- 무거운지는 화면이 아니라 그 사람 몸만 안다.
--
-- 내리는 쪽도 똑같이 제안한다. 목표 횟수를 한참 못 채웠으면 무리하고 있는
-- 것이므로 "조금 내려보실까요?" 를 먼저 띄운다 — 못 따라가면 그만두게 되지
-- 무게를 스스로 낮추지는 않기 때문이다.
--
-- ⚠️ 아래 증가·감소 판단 기준(연속 2회, 목표의 70%)도 트레이너 검수 대상이다.


-- ─────────────────────────────────────────────────────────────
-- 사람마다 기구마다 "지금 쓰는 무게"
--
-- 트레이너가 회원의 기구별 무게를 기억하는 것과 같다. 이 값이 있으면
-- 템플릿 계산보다 우선한다 — 템플릿은 처음 시작점을 정할 뿐이고, 그 뒤로는
-- 실제로 해 온 기록이 기준이 되어야 한다.
-- ─────────────────────────────────────────────────────────────

create table if not exists public.user_equipment_levels (
    user_id    uuid not null references public.users(id) on delete cascade,
    equip_id   uuid not null references public.equipments(id) on delete cascade,
    weight_kg  integer not null,
    updated_at timestamptz not null default now(),
    primary key (user_id, equip_id)
);

comment on table public.user_equipment_levels is
    '사람별·기구별 현재 사용 무게. 본인이 "올려볼게요"를 눌렀을 때만 바뀐다. 있으면 템플릿 계산보다 우선한다.';


-- ─────────────────────────────────────────────────────────────
-- 제안 계산
-- ─────────────────────────────────────────────────────────────

create or replace function public.weight_suggestion(
    p_user_id  uuid,
    p_equip_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    v_step        integer;
    v_current     integer;
    v_recent      record;
    v_easy_count  integer;
begin
    select e.weight_step_kg into v_step
    from public.equipments e where e.id = p_equip_id;

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
    '이 사람이 이 기구에서 무게를 올려도 될지/내려야 할지. 제안만 하고 적용하지는 않는다 — 적용은 본인이 apply_weight_suggestion 을 눌렀을 때만.';

revoke all on function public.weight_suggestion(uuid, uuid) from public;
grant execute on function public.weight_suggestion(uuid, uuid) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 본인이 고른 무게를 적용한다
-- ─────────────────────────────────────────────────────────────

create or replace function public.apply_weight_suggestion(
    p_equip_id  uuid,
    p_weight_kg integer
)
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

    select e.weight_step_kg into v_step from public.equipments e where e.id = p_equip_id;
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
    '본인이 고른 무게를 이 기구의 기준으로 저장한다. 오늘 아직 안 한 처방도 같이 갱신한다.';

revoke all on function public.apply_weight_suggestion(uuid, integer) from public;
grant execute on function public.apply_weight_suggestion(uuid, integer) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 루틴에 제안을 실어 보낸다
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
            'is_completed', d.is_completed,
            -- 이미 한 운동에는 제안을 띄우지 않는다. 오늘 할 일이 아니라
            -- 다음에 할 얘기라서, 끝난 항목에 뜨면 되돌리라는 말로 읽힌다.
            'weight_suggestion', case
                when d.is_completed then null
                else public.weight_suggestion(p_user_id, e.id)
            end
        ) as row
        from public.daily_routines d
        join public.equipments e on e.id = d.equip_id
        where d.user_id = p_user_id and d.routine_date = p_date
    ) s;
$$;

revoke all on function public.get_daily_routine(uuid, date) from public;
grant execute on function public.get_daily_routine(uuid, date) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 처방할 때 저장된 무게를 우선한다
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
            -- 같은 부위에 기구가 여러 대면 사람·날짜별로 다른 것을 고른다(동선 분산).
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
            -- 본인이 "올려볼게요"로 정해 둔 무게가 있으면 그게 기준이다.
            -- 템플릿 계산은 처음 시작점을 정하는 용도일 뿐이고, 그 뒤로는
            -- 실제로 해 온 기록이 기준이 되어야 한다.
            coalesce(
                (select l.weight_kg from public.user_equipment_levels l
                  where l.user_id = p_user_id and l.equip_id = m.equip_id),
                case
                    when m.base_weight_kg is null or m.weight_ratio is null then null
                    -- 기구 조절 단위로 내림한다. 시니어에게는 조금 가벼운 쪽이 안전하다.
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
    '템플릿 + 아픈 곳 규칙 + 보유 기구로 하루 루틴을 만든다. 본인이 정해 둔 기구별 무게가 있으면 그것을 우선한다. 같은 부위에 기구가 여러 대면 사람·날짜별로 갈라 배정해 동선이 겹치지 않게 한다.';

revoke all on function public.generate_daily_routine(uuid, date, uuid) from public;
grant execute on function public.generate_daily_routine(uuid, date, uuid) to anon, authenticated;
