-- 카탈로그 id 로 운동 하나 보기
--
-- 운동 백과사전(기구 사용법 모아보기)은 카탈로그를 기준으로 목록을 만든다.
-- 그런데 상세 화면을 여는 길은 get_equipment_by_qr 하나뿐이라, 이 헬스장에
-- 기구가 없는 운동 — 정확히 우리가 앞에 크게 세워 둔 맨몸 운동들 — 은 QR 이
-- 없어서 열 수가 없다. 카탈로그로도 열 수 있게 짝을 맞춘다.
--
-- 응답 모양은 get_equipment_by_qr 과 같게 둔다. 화면이 둘을 구분하지 않고
-- 같은 컴포넌트로 그리기 때문이다.

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
        -- 기구가 여러 단지에 있을 수 있다. 화면은 참고용으로만 쓴다.
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
