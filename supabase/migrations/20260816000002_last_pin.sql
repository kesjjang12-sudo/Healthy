-- 기구 상세에 "지난번엔 N칸" 을 띄우기 위한 값.
--
-- 운동을 마칠 때 "몇 칸에 꽂으셨어요?" 를 받아 두고는(actual_weight_kg 에 핀
-- 칸이 들어 있다) 그걸 되돌려 보여 주는 곳이 없었다. 4060 회원의 무게 관리는
-- 숫자 입력이 아니라 "앱이 내 핀을 기억해 준다"는 경험이라, 다음에 그 기구
-- 앞에 섰을 때 지난 칸을 보여 주는 것이 핵심이다.
--
-- 서버의 현재 정의(pg_get_functiondef, 2026-08-16 확인)에 last_pin 한 줄만
-- 얹었다. 다른 필드는 그대로다 — 이 함수는 20260814000029 가 통째로 다시
-- 쓰면서 image_url 을 빠뜨린 전과가 있는 함수라, 반드시 서버 정의에서
-- 출발해야 한다.

create or replace function public.get_daily_routine(p_user_id uuid, p_date date default current_date)
returns jsonb
language sql
security definer
set search_path to 'public'
as $function$
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
            'image_url', cat.image_url,
            'qr_code_val', e.qr_code_val,
            'location_label', e.location_label,
            'target_weight', d.target_weight,
            'target_sets', d.target_sets,
            'target_reps', d.target_reps,
            'target_duration_minutes', d.target_duration_minutes,
            'actual_duration_minutes', d.actual_duration_minutes,
            'is_completed', d.is_completed,
            -- 이 기구에서 가장 최근에 꽂았던 핀 칸. 유산소·맨몸이거나 처음이면 null.
            -- (actual_weight_kg 컬럼에는 kg 이 아니라 핀 칸이 들어 있다 —
            --  기록 화면이 "몇 번째 칸이었나요?"로 받는 값이다)
            'last_pin', (
                select p.actual_weight_kg
                from public.daily_routines p
                where p.user_id = p_user_id
                  and p.equip_id = d.equip_id
                  and p.id <> d.id
                  and p.is_completed
                  and p.actual_weight_kg is not null
                order by p.completed_at desc nulls last
                limit 1
            ),
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
$function$;
