-- 시작 자세 사진을 화면까지 내려보낸다.
--
-- 카탈로그에 image_url 을 넣어도 화면은 RPC 가 만들어 주는 jsonb 만 보므로,
-- 세 군데(오늘의 루틴 / QR 조회 / 카탈로그 조회)에 같은 키를 더해야 한다.

create or replace function public.get_daily_routine(p_user_id uuid, p_date date default current_date)
returns jsonb
language sql
security definer
set search_path = public
as $$
    select coalesce(jsonb_agg(row order by sort_order, name), '[]'::jsonb)
    from (
        select d.sort_order, cat.name, jsonb_build_object(
            'routine_id', d.id,
            'catalog_id', cat.id,
            'equip_id', e.id,
            'name', cat.name,
            'name_ko', cat.name_ko,
            'station_kind', cat.station_kind,
            'description', cat.description,
            'why_it_matters', cat.why_it_matters,
            'target_muscle', cat.target_muscle,
            'video_url', cat.video_url,
            'image_url', cat.image_url,
            'qr_code_val', e.qr_code_val,
            'location_label', e.location_label,
            'target_weight', d.target_weight,
            'target_sets', d.target_sets,
            'target_reps', d.target_reps,
            'target_duration_minutes', d.target_duration_minutes,
            'is_completed', d.is_completed,
            'weight_suggestion', case
                when d.is_completed then null
                else public.weight_suggestion(p_user_id, e.id)
            end
        ) as row
        from public.daily_routines d
        join public.exercise_catalog cat on cat.id = d.catalog_id
        left join public.equipments e on e.id = d.equip_id
        where d.user_id = p_user_id and d.routine_date = p_date
    ) s;
$$;

create or replace function public.get_exercise_by_catalog_id(p_catalog_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
    select jsonb_build_object(
        'id', cat.id,
        'name', cat.name,
        'name_ko', cat.name_ko,
        'station_kind', cat.station_kind,
        'description', cat.description,
        'why_it_matters', cat.why_it_matters,
        'target_muscle', cat.target_muscle,
        'video_url', cat.video_url,
        'image_url', cat.image_url,
        'qr_code_val', (
            select e.qr_code_val from public.equipments e
            where e.catalog_id = cat.id order by e.created_at limit 1
        ),
        'base_weight_kg', cat.base_weight_kg,
        'weight_step_kg', cat.weight_step_kg
    )
    from public.exercise_catalog cat
    where cat.id = p_catalog_id;
$$;

-- QR 조회도 같은 키를 준다. 다른 세션이 최근에 고친 함수라, 현재 정의를
-- 그대로 두고 image_url 한 줄만 더한다.
create or replace function public.get_equipment_by_qr(p_qr_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_result jsonb;
begin
    select jsonb_build_object(
        'id', e.id,
        'catalog_id', cat.id,
        'name', cat.name,
        'name_ko', cat.name_ko,
        'station_kind', cat.station_kind,
        'description', cat.description,
        'why_it_matters', cat.why_it_matters,
        'target_muscle', cat.target_muscle,
        'video_url', cat.video_url,
        'image_url', cat.image_url,
        'qr_code_val', e.qr_code_val,
        'location_label', e.location_label,
        'base_weight_kg', coalesce(e.base_weight_kg, cat.base_weight_kg),
        'weight_step_kg', coalesce(e.weight_step_kg, cat.weight_step_kg)
    )
    into v_result
    from public.equipments e
    join public.exercise_catalog cat on cat.id = e.catalog_id
    where e.qr_code_val = p_qr_code;

    if v_result is null then
        raise exception 'EQUIPMENT_NOT_FOUND' using errcode = 'P0002';
    end if;

    return v_result;
end;
$$;
