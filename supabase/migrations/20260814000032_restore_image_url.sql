-- 루틴·QR 조회 응답에 운동 사진(image_url)을 되돌린다.
--
-- 무슨 일이 있었나. 두 갈래 작업이 같은 함수를 각자 고쳤다.
--   · 20260813000010_expose_image_url  — 응답에 image_url 을 넣었다(사진 기능).
--   · 20260814000029_how_to_steps      — 응답에 how_to_steps/form_caution 을
--                                        넣으면서 함수를 통째로 다시 썼는데,
--                                        그 시점의 원본에 image_url 이 없었다.
--
-- 나중에 적용된 29번이 10번을 덮어써서 image_url 이 조용히 사라졌다. 컬럼도
-- 데이터도 멀쩡하고(75개 전부 채워져 있다) 앱 코드도 사진을 그리고 있는데,
-- 서버가 그 값을 안 실어 보내니 화면에서만 사진이 빠진 상태였다. 오류가 안 나서
-- 더 늦게 발견됐다 — 없는 키를 읽으면 undefined 라 그냥 "사진 없음"으로 흐른다.
--
-- 그래서 이 파일은 새 기능이 아니라 복구다. 29번 정의를 그대로 두고 image_url
-- 한 줄만 되돌린다. 다음에 이 함수를 또 고칠 사람은 두 갈래가 이미 합쳐진
-- 이 정의를 출발점으로 삼을 것.

create or replace function public.get_daily_routine(
    p_user_id uuid,
    p_date date default current_date
)
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
            'how_to_steps', cat.how_to_steps,
            'form_caution', cat.form_caution,
            'target_muscle', cat.target_muscle,
            'video_url', cat.video_url,
            -- 되돌린 줄. 글만으로는 어느 기구인지부터 막힌다.
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
        'how_to_steps', cat.how_to_steps,
        'form_caution', cat.form_caution,
        'target_muscle', cat.target_muscle,
        'video_url', cat.video_url,
        -- 되돌린 줄.
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
