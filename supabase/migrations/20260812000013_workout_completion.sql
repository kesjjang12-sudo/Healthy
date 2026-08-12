-- 운동 완료 기록을 실제로 저장한다.
--
-- 지금까지 daily_routines.is_completed 는 컬럼만 있고 채워주는 곳이 없었다.
-- 폰 앱의 세트 진행 화면(WorkoutSession)이 "몇 칸에 꽂았는지" 를 화면에만
-- 보여주고 서버에 저장하지 않는 갭이 있었는데, 여기서 메운다.

alter table public.daily_routines
    add column if not exists actual_weight_kg numeric,
    add column if not exists actual_reps integer,
    add column if not exists completed_at timestamptz,
    add column if not exists points_awarded integer not null default 0;

comment on column public.daily_routines.actual_weight_kg is
    '실제로 꽂은 무게(kg 환산). target_weight 는 처방값, 이건 실제 수행값.';
comment on column public.daily_routines.actual_reps is '실제로 한 횟수.';


create or replace function public.complete_routine(
    p_routine_id       uuid,
    p_actual_weight_kg numeric default null,
    p_actual_reps      integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_routine       public.daily_routines;
    v_owner_auth_id uuid;
    -- 완료 1건당 지급 포인트. 지금은 난이도 무관 고정값이고, 나중에 세트·무게
    -- 기준 차등 지급을 붙일 수 있는 자리로 남겨 둔다.
    v_points        constant integer := 10;
begin
    if auth.uid() is null then
        raise exception 'AUTH_REQUIRED' using errcode = '42501';
    end if;

    select * into v_routine from public.daily_routines where id = p_routine_id;

    if not found then
        raise exception 'ROUTINE_NOT_FOUND' using errcode = 'P0002';
    end if;

    select auth_user_id into v_owner_auth_id from public.users where id = v_routine.user_id;

    if v_owner_auth_id is distinct from auth.uid() then
        raise exception 'FORBIDDEN' using errcode = '42501';
    end if;

    if v_routine.is_completed then
        -- 이미 완료 처리된 걸 다시 눌러도 포인트를 또 주지 않는다.
        return jsonb_build_object('routine', to_jsonb(v_routine), 'points_awarded', 0);
    end if;

    update public.daily_routines
    set is_completed = true,
        actual_weight_kg = p_actual_weight_kg,
        actual_reps = p_actual_reps,
        completed_at = now(),
        points_awarded = v_points
    where id = p_routine_id
    returning * into v_routine;

    update public.users set total_points = total_points + v_points where id = v_routine.user_id;

    return jsonb_build_object('routine', to_jsonb(v_routine), 'points_awarded', v_points);
end;
$$;

comment on function public.complete_routine(uuid, numeric, integer) is
    '운동 완료 처리 + 포인트 지급. 개인 앱 전용, 본인 루틴만 완료할 수 있다.';

revoke all on function public.complete_routine(uuid, numeric, integer) from public;
grant execute on function public.complete_routine(uuid, numeric, integer) to authenticated;
