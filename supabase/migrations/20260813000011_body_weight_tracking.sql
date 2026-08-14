-- 키·몸무게를 받고, 몸무게 변화를 기록으로 관리한다.
--
-- 지금까지 profile_data.weight_kg 는 칸만 있고 채우는 화면이 없었다. 분석 탭의
-- 칼로리 계산이 이 값을 쓰는데 늘 비어 있어서 표준 체중 가정으로만 돌았다.
--
-- 몸무게는 프로필 값 하나로는 부족하다 — "살이 빠지고 있는가"는 시점별 기록이
-- 있어야 보이는 것이라 이력 테이블을 따로 둔다. 하루에 여러 번 재면 마지막
-- 값만 남긴다(unique(user_id, log_date) + upsert). 몸무게는 하루 안에서도
-- 1~2kg 오르내려서, 같은 날 여러 행을 남기면 그래프가 요동만 보여준다.
--
-- 주의: 기구 무게(user_equipment_levels, weight_suggestion)와는 완전히 다른
-- 것이다. 여기는 "몸"무게다. 이름에 body 를 붙여 구분한다.

create table if not exists public.body_weight_logs (
    id         uuid primary key default uuid_generate_v4(),
    user_id    uuid not null references public.users(id) on delete cascade,
    weight_kg  numeric(4, 1) not null check (weight_kg between 25 and 250),
    -- 날짜 기준은 한국 시간. now()::date 로 하면 UTC 자정(한국 아침 9시) 전후로
    -- 같은 날이 이틀로 갈라진다.
    log_date   date not null default (now() at time zone 'Asia/Seoul')::date,
    created_at timestamptz not null default now(),
    unique (user_id, log_date)
);

create index if not exists body_weight_logs_user_date_idx
    on public.body_weight_logs (user_id, log_date desc);

-- 저장소 원칙 그대로 deny-by-default. 접근은 아래 security definer RPC 로만.
alter table public.body_weight_logs enable row level security;


-- ─────────────────────────────────────────────────────────────
-- 조회: 분석 탭의 "내 몸" 섹션과 운동 탭의 업데이트 팝업이 같이 쓴다
-- ─────────────────────────────────────────────────────────────

create or replace function public.get_body_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    v_user    public.users;
    v_first   public.body_weight_logs;
    v_latest  public.body_weight_logs;
    v_logs    jsonb;
begin
    if auth.uid() is null then
        raise exception 'AUTH_REQUIRED' using errcode = '42501';
    end if;

    select * into v_user from public.users u where u.auth_user_id = auth.uid();
    if not found then
        raise exception 'USER_NOT_FOUND' using errcode = 'P0002';
    end if;

    select * into v_first from public.body_weight_logs l
    where l.user_id = v_user.id order by l.log_date asc limit 1;

    select * into v_latest from public.body_weight_logs l
    where l.user_id = v_user.id order by l.log_date desc limit 1;

    select coalesce(jsonb_agg(row_data order by ord desc), '[]'::jsonb) into v_logs
    from (
        select jsonb_build_object('log_date', l.log_date, 'weight_kg', l.weight_kg) as row_data,
               l.log_date as ord
        from public.body_weight_logs l
        where l.user_id = v_user.id
        order by l.log_date desc
        limit 30
    ) s;

    return jsonb_build_object(
        'height_cm', v_user.profile_data ->> 'height_cm',
        -- 기록이 아직 없으면 설문 때 적은 프로필 값으로 대신한다.
        'current_weight_kg', coalesce(v_latest.weight_kg,
                                      (v_user.profile_data ->> 'weight_kg')::numeric),
        'current_log_date', v_latest.log_date,
        'first_weight_kg', v_first.weight_kg,
        'first_log_date', v_first.log_date,
        -- null = 아직 한 번도 기록 안 함. 팝업 판단에 쓴다.
        'days_since_last_log', case
            when v_latest.log_date is null then null
            else (now() at time zone 'Asia/Seoul')::date - v_latest.log_date
        end,
        'logs', v_logs
    );
end;
$$;

comment on function public.get_body_status() is
    '내 키·몸무게 현황. 최근 30개 기록과 처음 기록 대비 변화, 마지막 기록 후 경과일을 준다.';

revoke all on function public.get_body_status() from public;
grant execute on function public.get_body_status() to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 기록: 오늘 몸무게를 남긴다 (같은 날 다시 재면 덮어쓴다)
-- ─────────────────────────────────────────────────────────────

create or replace function public.log_body_weight(
    p_weight_kg numeric,
    p_height_cm integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user public.users;
begin
    if auth.uid() is null then
        raise exception 'AUTH_REQUIRED' using errcode = '42501';
    end if;

    select * into v_user from public.users u where u.auth_user_id = auth.uid();
    if not found then
        raise exception 'USER_NOT_FOUND' using errcode = 'P0002';
    end if;

    -- 화면에서 온 값이라도 그대로 믿지 않는다. 7kg 나 700kg 이 저장되면
    -- 변화 그래프와 칼로리 계산이 통째로 이상해진다.
    if p_weight_kg is null or p_weight_kg < 25 or p_weight_kg > 250 then
        raise exception 'INVALID_WEIGHT' using errcode = '22023';
    end if;
    if p_height_cm is not null and (p_height_cm < 100 or p_height_cm > 220) then
        raise exception 'INVALID_HEIGHT' using errcode = '22023';
    end if;

    insert into public.body_weight_logs (user_id, weight_kg)
    values (v_user.id, round(p_weight_kg, 1))
    on conflict (user_id, log_date)
    do update set weight_kg = excluded.weight_kg, created_at = now();

    -- 프로필의 현재값도 같이 맞춘다. 칼로리 계산(estimateCalories)이 이 값을 읽는다.
    update public.users
    set profile_data = profile_data
        || jsonb_build_object('weight_kg', round(p_weight_kg, 1))
        || case
               when p_height_cm is null then '{}'::jsonb
               else jsonb_build_object('height_cm', p_height_cm)
           end
    where id = v_user.id;

    return public.get_body_status();
end;
$$;

comment on function public.log_body_weight(numeric, integer) is
    '오늘 몸무게(선택: 키)를 기록한다. 같은 날 다시 기록하면 덮어쓴다. 프로필의 현재값도 같이 갱신한다.';

revoke all on function public.log_body_weight(numeric, integer) from public;
grant execute on function public.log_body_weight(numeric, integer) to authenticated;
