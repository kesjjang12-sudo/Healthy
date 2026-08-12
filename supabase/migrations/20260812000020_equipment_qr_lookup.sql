-- 기구 앞 QR 을 찍으면 오늘 루틴에 없는 기구라도 설명/영상을 볼 수 있어야
-- 한다("궁금한 운동을 QR로 찍어도 오늘 루틴엔 없어도 할 수가 있어야겠네").
--
-- 지금까지는 get_daily_routine 으로 "오늘 처방된 기구"만 조회할 수 있었다.
-- 이 RPC 는 qr_code_val 하나로 기구 자체를 바로 찾는다 — 처방 여부와 무관.
--
-- 기구 정보(이름/설명/부위/영상)는 개인정보가 아니라서 로그인 없이도 봐도
-- 안전하다고 판단해 anon 에도 연다 — 나중에 키오스크 옆 안내판이나 웹
-- 미리보기 같은 비로그인 경로가 생겨도 바로 쓸 수 있게.
create or replace function public.get_equipment_by_qr(
    p_qr_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_equip public.equipments;
begin
    select * into v_equip from public.equipments where qr_code_val = p_qr_code;

    if not found then
        raise exception 'EQUIPMENT_NOT_FOUND' using errcode = 'P0002';
    end if;

    return jsonb_build_object(
        'id', v_equip.id,
        'name', v_equip.name,
        'description', v_equip.description,
        'target_muscle', v_equip.target_muscle,
        'video_url', v_equip.video_url,
        'qr_code_val', v_equip.qr_code_val,
        'base_weight_kg', v_equip.base_weight_kg,
        'weight_step_kg', v_equip.weight_step_kg
    );
end;
$$;

comment on function public.get_equipment_by_qr(text) is
    'QR 코드 값으로 기구를 바로 찾는다. 오늘 처방 루틴에 있는지와 무관하게
    누구나 설명/영상을 볼 수 있다. 처방 정보(목표 무게·세트·완료 기록)는
    포함하지 않는다 — 그건 get_daily_routine 이 처방된 기구에 한해서만 준다.';

revoke all on function public.get_equipment_by_qr(text) from public;
grant execute on function public.get_equipment_by_qr(text) to anon, authenticated;
