-- ═══════════════════════════════════════════════════════════════
-- 아직 서버에 적용 안 된 것들을 한 번에 올리는 파일.
--
-- Supabase 대시보드 → SQL Editor 에 통째로 붙여넣고 Run 하면 된다.
-- 순서가 중요해서 하나로 합쳐 뒀다 — 나눠 돌리면 뒤엣것이 앞엣것을 필요로 해
-- 실패한다.
--
-- 여러 번 돌려도 안전하다. 함수는 create or replace, 컬럼·테이블은
-- if not exists, 기구는 on conflict do update 라서 이미 올라간 상태에서
-- 다시 돌려도 같은 결과가 된다.
--
-- 들어 있는 것:
--   1. join_gym — 태블릿 안 거친 계정에도 루틴이 나오게 한다
--   2. 전화번호로 계정 찾기 — SMS 인증이 새 가입이 되지 않게 한다
--   3. 운동 카탈로그·기구 회전 — 사람마다 다른 기구를 배정한다
--   4. 무게 제안 — 지난 기록을 보고 "올려볼까요?" 하고 물어본다
--   5. 성별별 구성 — 여성은 하체 비중 약 65%, 맨몸 운동 다수
--   6. 기구 데이터 20종 — 위 로직이 고를 실제 운동 목록
-- ═══════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────
-- [1/6] 20260813000001_join_gym_without_kiosk.sql
-- ───────────────────────────────────────────────────────────────

-- 태블릿에 안 가고도 헬스장에 소속될 수 있게 한다.
--
-- 증상: 테스트 계정으로 로그인하면 운동 루틴이 하나도 안 뜬다.
--
-- 원인. generate_daily_routine 은 기구를 이렇게 고른다.
--
--     from public.equipments e where e.apt_id = v_target_apt_id
--
-- v_target_apt_id 는 coalesce(p_apt_id, v_user.apt_id) 인데, 지금 users.apt_id 를
-- 채워 주는 곳은 kiosk_check_in 하나뿐이다. bootstrap_oauth_profile 은
-- auth_user_id 만 넣고 만든다(insert into users (auth_user_id)). 그래서 태블릿을
-- 한 번도 안 거친 계정 — 익명 테스트 계정, 그리고 집에서 막 가입한 카카오/구글/
-- 전화번호 회원 — 은 apt_id 가 null 이라 기구가 0건으로 잡히고, 루틴도 0개가 된다.
-- 화면에는 "오늘의 운동 0가지"만 떠서 왜 비었는지 알 수가 없다.
--
-- confirm_gym_membership 으로는 못 고친다. 그 함수는 멤버십이 이미 있어야
-- 동작하고(MEMBERSHIP_NOT_FOUND), 멤버십을 만드는 것도 kiosk_check_in 뿐이라
-- 닭과 달걀이 된다.
--
-- 그래서 "지금 로그인한 사람을 이 단지에 넣는다"만 하는 함수를 하나 둔다.
--
-- 보안 관점: p_user_id 를 받지 않는다. 대상은 언제나 auth.uid() 에 연결된 본인
-- 이므로 남의 소속을 건드릴 방법이 없다. anon 에는 열지 않는다 — 로그인한
-- 사람만 자기 계정에 쓸 수 있다. 출석(attendance_logs)은 만들지 않는다.
-- 출석은 "실제로 왔다"는 기록이고 랭킹의 근거라, 집에서 누른 것으로 올라가면
-- 안 된다. 여기서 만드는 건 소속뿐이다.

create or replace function public.join_gym(p_apt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user                    public.users;
    v_has_existing_membership boolean;
begin
    if auth.uid() is null then
        raise exception 'AUTH_REQUIRED' using errcode = '42501';
    end if;

    if p_apt_id is null or not exists (
        select 1 from public.apartments a where a.id = p_apt_id
    ) then
        raise exception 'APARTMENT_NOT_FOUND' using errcode = 'P0002';
    end if;

    select * into v_user from public.users u where u.auth_user_id = auth.uid();

    if not found then
        raise exception 'USER_NOT_FOUND' using errcode = 'P0002';
    end if;

    -- 불변식: 멤버십이 하나라도 있으면 그중 정확히 하나가 is_primary 다.
    -- kiosk_check_in 과 같은 규칙을 쓴다 — 첫 멤버십만 primary 로 만든다.
    v_has_existing_membership := exists (
        select 1 from public.user_gym_memberships m where m.user_id = v_user.id
    );

    -- visit_count 는 0 으로 시작한다. kiosk_check_in 은 1 로 시작하지만 그건
    -- "지금 왔다"는 뜻이고, 여기는 아직 온 적이 없다.
    insert into public.user_gym_memberships (user_id, apt_id, is_primary, visit_count)
    values (v_user.id, p_apt_id, not v_has_existing_membership, 0)
    on conflict (user_id, apt_id) do nothing;

    -- 주 소속이 아직 없으면 이 단지로 잡아 준다. 이미 있으면 건드리지 않는다 —
    -- 소속을 바꾸는 건 confirm_gym_membership 의 일이다.
    if not v_has_existing_membership then
        update public.users set apt_id = p_apt_id where id = v_user.id;
        v_user.apt_id := p_apt_id;
    end if;

    return jsonb_build_object(
        'user_id', v_user.id,
        'apt_id', v_user.apt_id,
        'is_primary', not v_has_existing_membership
    );
end;
$$;

comment on function public.join_gym(uuid) is
    '지금 로그인한 사람을 이 단지 헬스장에 소속시킨다. 태블릿을 못 거친 계정(테스트/카카오/구글)이 루틴을 받을 수 있게 하는 용도. 출석은 만들지 않는다.';

revoke all on function public.join_gym(uuid) from public;
grant execute on function public.join_gym(uuid) to authenticated;

-- ───────────────────────────────────────────────────────────────
-- [2/6] 20260813000002_claim_account_by_verified_phone.sql
-- ───────────────────────────────────────────────────────────────

-- SMS 인증으로 로그인했을 때 원래 쓰던 계정을 찾아 준다.
--
-- 이게 없으면 문자 인증 로그인은 "로그인"이 아니라 매번 새 가입이 된다.
--
-- bootstrap_oauth_profile 은 users 를 auth_user_id 로만 찾는다. 그런데 문자
-- 인증은 GoTrue 계정을 새로 만들므로 auth.uid() 가 예전과 다르다. 그래서
-- 번호가 같아도 못 찾고 빈 프로필을 하나 더 만든다 — 사용자 입장에서는
-- 인증까지 다 했는데 기록이 전부 사라진 것으로 보인다. QR 페어링으로
-- 만들어 둔 계정(전화번호가 들어 있는 그 계정)이 그대로 고아가 된다.
--
-- 그래서 "JWT 에 검증된 전화번호가 있으면 그 번호의 계정을 내 것으로 잇는다"를
-- 넣는다.
--
-- 보안 관점: 여기서 믿는 건 클라이언트가 보낸 값이 아니라 GoTrue 가 발급한
-- JWT 의 phone 클레임이다. 그 값은 실제로 그 번호로 간 문자를 받아 인증을
-- 통과해야만 채워진다. 예전에 지운 sign_in_with_phone("번호만 알면 로그인")과
-- 다른 지점이 정확히 여기다 — 번호를 아는 것으로는 부족하고, 그 번호를 지금
-- 들고 있어야 한다.


-- E.164(+821012345678) → 저장 포맷(01012345678).
-- normalize_phone_number 는 숫자만 남기므로 +82 가 82 로 남는다. 국가번호를
-- 0 으로 되돌리는 건 이 함수가 맡는다.
create or replace function public.local_phone_from_e164(p_phone text)
returns text
language sql
immutable
as $$
    select case
        when s.digits like '82%' then '0' || substring(s.digits from 3)
        else s.digits
    end
    from (select public.normalize_phone_number(p_phone) as digits) s;
$$;

comment on function public.local_phone_from_e164(text) is
    'GoTrue 의 E.164 전화번호를 이 저장소의 저장 포맷(01012345678)으로 바꾼다.';

revoke all on function public.local_phone_from_e164(text) from public;


create or replace function public.bootstrap_oauth_profile()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user  public.users;
    v_phone text;
begin
    if auth.uid() is null then
        raise exception 'AUTH_REQUIRED' using errcode = '42501';
    end if;

    select * into v_user from public.users where auth_user_id = auth.uid();

    if found then
        return jsonb_build_object('user', to_jsonb(v_user));
    end if;

    -- 이 auth 신원으로는 처음이다. 문자 인증으로 들어온 거라면 번호로 기존
    -- 계정을 찾아본다. 카카오/구글/익명은 phone 클레임이 없어 그냥 건너뛴다.
    v_phone := public.local_phone_from_e164(nullif(auth.jwt() ->> 'phone', ''));

    if v_phone is not null and v_phone <> '' then
        select * into v_user from public.users u where u.phone_number = v_phone;

        if found then
            -- 예전 auth 연결(앱을 지워 못 쓰게 된 익명 계정 등)을 새 것으로
            -- 갈아끼운다. complete_pairing 이 재연결에서 하는 것과 같은 처리다.
            update public.users set auth_user_id = auth.uid() where id = v_user.id
            returning * into v_user;

            return jsonb_build_object('user', to_jsonb(v_user));
        end if;
    end if;

    -- 정말 처음 보는 사람이다. 번호를 아는 경우(문자 인증) 같이 넣어 둔다 —
    -- 나중에 태블릿에서 같은 번호로 체크인해도 계정이 갈라지지 않는다.
    insert into public.users (auth_user_id, phone_number)
    values (auth.uid(), nullif(v_phone, ''))
    returning * into v_user;

    return jsonb_build_object('user', to_jsonb(v_user));
end;
$$;

comment on function public.bootstrap_oauth_profile() is
    '로그인 직후 호출. auth_user_id 로 찾고, 없으면 JWT 의 검증된 전화번호로 기존 계정을 찾아 잇는다. 그래도 없으면 새로 만든다.';

revoke all on function public.bootstrap_oauth_profile() from public;
grant execute on function public.bootstrap_oauth_profile() to authenticated;

-- ───────────────────────────────────────────────────────────────
-- [3/6] 20260813000003_exercise_catalog_and_rotation.sql
-- ───────────────────────────────────────────────────────────────

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

-- ───────────────────────────────────────────────────────────────
-- [4/6] 20260813000004_weight_progression.sql
-- ───────────────────────────────────────────────────────────────

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

-- ───────────────────────────────────────────────────────────────
-- [5/6] 20260813000005_gender_specific_composition.sql
-- ───────────────────────────────────────────────────────────────

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

-- ───────────────────────────────────────────────────────────────
-- [6/6] 기구 데이터 20종
-- ───────────────────────────────────────────────────────────────

-- 데모 단지 운동 카탈로그 (16종).
--
-- 근육당 여러 개를 두는 것이 핵심이다. 1대씩만 있으면 generate_daily_routine 이
-- 고를 게 없어서 전원이 같은 기구를 배정받고, 같은 시간에 같은 기구 앞에 줄이 선다.
-- 부위마다 2~3개를 두면 사람마다 다른 기구로 갈라진다.
--
-- 맨몸 운동을 섞은 이유도 같다. 기구를 늘리려면 돈이 들지만 맨몸 운동은 자리만
-- 있으면 되고, 혼잡할 때 대기 없이 할 수 있는 대안이 된다.
--
-- why_it_matters 를 채우는 기준:
--   - 어르신이 "여긴 굳이 안 해도 되는데" 하고 건너뛰는 부위(등·어깨)는 왜
--     필요한지 일상 동작으로 말한다.
--   - 흔한 오해는 정면으로 바로잡는다. 특히 "가슴 운동하면 가슴 살이 빠진다",
--     "윗몸일으키기 하면 뱃살이 빠진다" 는 둘 다 부위별 감량이 안 된다는
--     같은 오해다.
--   - 특정 질환의 예방·치료 효과는 주장하지 않는다. 검수 전이고, 이 앱은
--     의료기기가 아니다.
--
-- ⚠️ 무게(base_weight_kg)와 문구 모두 트레이너/물리치료사 검수 대상이다.

insert into public.equipments
    (apt_id, qr_code_val, name, name_ko, station_kind, description, why_it_matters,
     target_muscle, video_url, base_weight_kg, weight_step_kg)
values
    -- ── 가슴 ─────────────────────────────────────────────────
    ('11111111-1111-4111-8111-111111111111', 'FIT-DEMO-CHEST-01', '체스트 프레스', '가슴 밀기', '머신',
     '의자에 앉아 손잡이를 앞으로 밀어내는 동작입니다.',
     '"가슴 운동을 하면 가슴 살이 빠진다"는 말은 사실이 아닙니다. 우리 몸은 특정 부위만 골라서 살을 빼지 못합니다. 가슴 운동은 그 아래 근육을 키우는 것이라 오히려 받쳐 주는 힘이 생깁니다. 무거운 문을 밀거나 이불을 드는 일상 동작도 한결 수월해집니다.',
     '가슴', 'https://example.com/videos/chest-press.mp4', 20, 5),

    ('11111111-1111-4111-8111-111111111111', 'FIT-DEMO-CHEST-02', '스미스 벤치 프레스', '누워서 바 밀기', '스미스머신',
     '벤치에 누워 고정된 바를 위로 밀어 올리는 동작입니다. 바가 레일에 고정돼 있어 혼자서도 안전합니다.',
     '가슴 운동 중에서도 힘이 가장 많이 붙는 동작입니다. 스미스머신은 바가 정해진 길을 따라 움직여서, 프리웨이트가 부담스러운 분도 자세가 무너질 걱정 없이 할 수 있습니다.',
     '가슴', 'https://example.com/videos/smith-bench.mp4', 20, 5),

    ('11111111-1111-4111-8111-111111111111', 'FIT-DEMO-CHEST-03', '벽 푸시업', '벽 밀기', '맨몸',
     '벽에서 한 걸음 떨어져 서서 손으로 벽을 짚고 팔을 굽혔다 펴는 동작입니다.',
     '바닥 푸시업이 힘든 분을 위한 가슴 운동입니다. 기구가 비어 있지 않을 때 대기 없이 할 수 있고, 집에서도 그대로 하실 수 있습니다. 벽에서 멀리 설수록 힘들어집니다.',
     '가슴', 'https://example.com/videos/wall-pushup.mp4', null, 1),

    -- ── 등 ───────────────────────────────────────────────────
    ('11111111-1111-4111-8111-111111111111', 'FIT-DEMO-LAT-01', '랫 풀다운', '위에서 당기기', '머신',
     '위에 있는 손잡이를 가슴 쪽으로 당겨 내리는 동작입니다.',
     '등은 거울에 안 보여서 가장 많이 건너뛰는 부위입니다. 그런데 나이가 들며 어깨가 앞으로 말리고 등이 굽는 것을 잡아 주는 게 바로 이 근육입니다. 자세가 펴지면 숨쉬기도 편해집니다.',
     '등', 'https://example.com/videos/lat-pulldown.mp4', 25, 5),

    ('11111111-1111-4111-8111-111111111111', 'FIT-DEMO-LAT-02', '시티드 로우', '앉아서 당기기', '머신',
     '의자에 앉아 손잡이를 배 쪽으로 당기는 동작입니다.',
     '랫 풀다운이 등의 넓이를 만든다면 이 동작은 등 가운데를 조여 줍니다. 오래 앉아 계신 분일수록 이쪽이 약해져 있어서, 굽은 등을 펴는 데 특히 도움이 됩니다.',
     '등', 'https://example.com/videos/seated-row.mp4', 25, 5),

    ('11111111-1111-4111-8111-111111111111', 'FIT-DEMO-LAT-03', '케이블 로우', '케이블 당기기', '케이블',
     '케이블 손잡이를 잡고 몸쪽으로 당기는 동작입니다. 손잡이 높이를 바꿔 여러 각도로 할 수 있습니다.',
     '케이블은 동작 내내 힘이 일정하게 걸려서 근육이 쉬는 구간이 없습니다. 무게를 아주 가볍게도 맞출 수 있어 처음 시작하시는 분께 부담이 적습니다.',
     '등', 'https://example.com/videos/cable-row.mp4', 20, 5),

    -- ── 하체 ─────────────────────────────────────────────────
    ('11111111-1111-4111-8111-111111111111', 'FIT-DEMO-LEG-01', '레그 프레스', '다리로 밀기', '머신',
     '의자에 앉아 발판을 다리로 밀어내는 동작입니다.',
     '하체에는 몸에서 가장 큰 근육이 모여 있습니다. 여기가 약해지면 계단 오르기와 의자에서 일어서기가 먼저 힘들어집니다. 어르신 건강에서 가장 중요한 부위이고, 살을 빼려는 분에게도 가장 효율이 좋습니다.',
     '하체', 'https://example.com/videos/leg-press.mp4', 40, 10),

    ('11111111-1111-4111-8111-111111111111', 'FIT-DEMO-LEG-02', '스미스 스쿼트', '바 메고 앉았다 일어서기', '스미스머신',
     '어깨에 바를 얹고 천천히 앉았다 일어서는 동작입니다. 바가 레일에 고정돼 있어 균형을 잃을 걱정이 적습니다.',
     '"앉았다 일어서기"는 하루에도 수십 번 하는 동작입니다. 이걸 연습해 두는 것이 곧 생활 능력입니다. 무릎이 아프신 분은 깊이 앉지 말고 얕게만 하셔도 충분합니다.',
     '하체', 'https://example.com/videos/smith-squat.mp4', 20, 5),

    ('11111111-1111-4111-8111-111111111111', 'FIT-DEMO-LEG-03', '의자 스쿼트', '의자에 앉았다 일어서기', '맨몸',
     '의자 앞에 서서 엉덩이가 의자에 닿을 듯 말 듯 앉았다가 일어서는 동작입니다. 힘들면 잠깐 앉으셔도 됩니다.',
     '기구 없이 하는 가장 안전한 하체 운동입니다. 뒤에 의자가 있어 넘어질 걱정이 없고, 집에서도 그대로 하실 수 있습니다. 다리 힘은 안 쓰면 가장 빨리 빠지는 근육이라 매일 조금씩이 좋습니다.',
     '하체', 'https://example.com/videos/chair-squat.mp4', null, 1),

    -- ── 어깨 ─────────────────────────────────────────────────
    ('11111111-1111-4111-8111-111111111111', 'FIT-DEMO-SHLD-01', '숄더 프레스', '머리 위로 밀기', '머신',
     '의자에 앉아 손잡이를 머리 위로 밀어 올리는 동작입니다.',
     '"무거운 걸 들 일이 없으니 어깨는 됐다"고 넘기기 쉽습니다. 그런데 높은 선반에 물건을 올리고, 옷을 입고 벗고, 머리를 감는 동작이 전부 어깨 힘입니다. 어깨가 굳으면 이런 일상부터 불편해집니다.',
     '어깨', 'https://example.com/videos/shoulder-press.mp4', 15, 5),

    ('11111111-1111-4111-8111-111111111111', 'FIT-DEMO-SHLD-02', '케이블 래터럴 레이즈', '팔 옆으로 들기', '케이블',
     '케이블 손잡이를 잡고 팔을 옆으로 들어 올리는 동작입니다.',
     '어깨를 넓어 보이게 하는 동작이라 젊은 분들이 좋아하지만, 어깨 관절을 여러 방향으로 고루 쓰게 해 준다는 점에서 나이와 상관없이 좋습니다. 아주 가벼운 무게로 하셔야 합니다.',
     '어깨', 'https://example.com/videos/cable-lateral.mp4', 5, 5),

    -- ── 복부 ─────────────────────────────────────────────────
    ('11111111-1111-4111-8111-111111111111', 'FIT-DEMO-ABD-01', '복부 크런치', '상체 숙이기', '머신',
     '등받이에 기대 앉아 상체를 앞으로 숙이는 동작입니다.',
     '복부 운동이 뱃살을 직접 빼 주지는 않습니다 — 살은 특정 부위만 골라서 빠지지 않기 때문입니다. 대신 몸통을 잡아 주는 근육이라, 허리를 받쳐 주고 자세를 세우는 데 큰 역할을 합니다. 뱃살은 유산소와 식사로 빠집니다.',
     '복부', 'https://example.com/videos/ab-crunch.mp4', 10, 5),

    ('11111111-1111-4111-8111-111111111111', 'FIT-DEMO-ABD-02', '케이블 우드찹', '사선으로 당기기', '케이블',
     '케이블을 잡고 몸을 비틀며 사선으로 당기는 동작입니다.',
     '몸통을 비트는 힘을 기릅니다. 뒤를 돌아보거나 무거운 짐을 옆으로 옮기는 동작이 이 근육을 씁니다. 허리가 아프신 분은 이 동작을 건너뛰고 알려 주세요.',
     '복부', 'https://example.com/videos/cable-woodchop.mp4', 10, 5),

    ('11111111-1111-4111-8111-111111111111', 'FIT-DEMO-ABD-03', '플랭크', '엎드려 버티기', '맨몸',
     '팔꿈치와 발끝으로 몸을 일자로 만들어 버티는 동작입니다. 처음에는 20초면 충분합니다.',
     '허리를 굽혔다 펴지 않고 버티기만 하는 운동이라, 허리에 부담이 적으면서 몸통을 단단하게 합니다. 윗몸일으키기가 허리에 부담스러운 분께 더 알맞습니다.',
     '복부', 'https://example.com/videos/plank.mp4', null, 1),


    -- ── 맨몸 운동 보강 ───────────────────────────────────────
    -- 하체 슬롯이 3개인 여성 루틴에서 맨몸 비중을 올리려면 하체 맨몸 선택지가
    -- 여러 개 있어야 한다. 기구 1대에 맨몸 1개뿐이면 늘 같은 하나만 걸린다.
    -- 기구를 늘리는 데는 돈이 들지만 맨몸은 자리만 있으면 되고, 혼잡할 때
    -- 대기 없이 할 수 있는 대안이기도 하다.
    ('11111111-1111-4111-8111-111111111111', 'FIT-DEMO-LEG-04', '힙 브릿지', '누워서 엉덩이 들기', '맨몸',
     '바닥에 누워 무릎을 세우고 엉덩이를 천천히 들어 올렸다 내리는 동작입니다.',
     '오래 앉아 계시면 엉덩이 근육이 가장 먼저 약해지고, 그 부담이 허리로 넘어갑니다. 누워서 하기 때문에 무릎과 허리에 실리는 부담이 적어, 다른 하체 운동이 버거우신 분도 하실 수 있습니다.',
     '하체', 'https://example.com/videos/hip-bridge.mp4', null, 1),

    ('11111111-1111-4111-8111-111111111111', 'FIT-DEMO-LEG-05', '카프 레이즈', '발뒤꿈치 들기', '맨몸',
     '서서 발뒤꿈치를 천천히 들었다 내리는 동작입니다. 벽이나 손잡이를 잡고 하셔도 됩니다.',
     '종아리는 걸을 때마다 다리의 피를 위로 밀어 올리는 펌프 역할을 합니다. 여기가 약해지면 다리가 잘 붓고 오래 서 있기 힘들어집니다. 균형을 잡는 데도 쓰여서 넘어짐 예방에 도움이 됩니다.',
     '하체', 'https://example.com/videos/calf-raise.mp4', null, 1),

    ('11111111-1111-4111-8111-111111111111', 'FIT-DEMO-LAT-04', '슈퍼맨', '엎드려 팔다리 들기', '맨몸',
     '바닥에 엎드려 팔과 다리를 동시에 살짝 들어 올렸다 내리는 동작입니다. 높이 들지 않으셔도 됩니다.',
     '등 뒤쪽을 기구 없이 쓸 수 있는 몇 안 되는 동작입니다. 굽은 등을 펴 주는 근육을 직접 쓰기 때문에, 기구 앞에 줄이 길 때 등 운동 대신으로도 좋습니다.',
     '등', 'https://example.com/videos/superman.mp4', null, 1),

    ('11111111-1111-4111-8111-111111111111', 'FIT-DEMO-SHLD-03', '월 엔젤', '벽에 붙어 팔 올리기', '맨몸',
     '벽에 등을 붙이고 선 뒤 팔을 벽에 댄 채 위아래로 천천히 움직이는 동작입니다.',
     '어깨가 앞으로 말린 자세를 펴 주는 동작입니다. 무게를 들지 않아 부담이 거의 없고, 어깨가 뻣뻣해서 숄더 프레스가 버거우신 분이 먼저 하시기 좋습니다.',
     '어깨', 'https://example.com/videos/wall-angel.mp4', null, 1),

    -- ── 유산소 (무게가 아니라 시간으로 처방한다) ─────────────
    ('11111111-1111-4111-8111-111111111111', 'FIT-DEMO-CARDIO-01', '트레드밀', '걷기·달리기', '유산소',
     '벨트 위에서 걷거나 가볍게 뛰는 운동입니다. 손잡이를 잡고 하셔도 됩니다.',
     '근력 운동만으로는 심장과 폐가 좋아지지 않습니다. 40대가 넘으면 근력만큼 유산소가 중요해집니다. 숨이 약간 차되 옆 사람과 대화는 되는 정도가 알맞습니다.',
     '유산소', 'https://example.com/videos/treadmill.mp4', null, 1),

    ('11111111-1111-4111-8111-111111111111', 'FIT-DEMO-CARDIO-02', '실내 자전거', '페달 밟기', '유산소',
     '앉아서 페달을 밟는 운동입니다.',
     '체중이 무릎에 실리지 않아서, 무릎이 아프시거나 걷기가 부담스러운 분께 알맞은 유산소입니다. 앉아서 하기 때문에 넘어질 위험도 없습니다.',
     '유산소', 'https://example.com/videos/stationary-bike.mp4', null, 1)

on conflict (qr_code_val) do update set
    name           = excluded.name,
    name_ko        = excluded.name_ko,
    station_kind   = excluded.station_kind,
    description    = excluded.description,
    why_it_matters = excluded.why_it_matters,
    target_muscle  = excluded.target_muscle,
    base_weight_kg = excluded.base_weight_kg,
    weight_step_kg = excluded.weight_step_kg;
