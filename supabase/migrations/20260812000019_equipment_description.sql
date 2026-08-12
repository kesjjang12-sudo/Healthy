-- 기구 이름만으로는 시니어에게 무슨 운동인지 안 와닿는다("체스트 프레스"가
-- 뭔지 모르는 분이 많다). 트레이너/관리자가 쉬운 말로 채울 수 있는 설명 칸을
-- 추가한다. 채워지면 화면에서 이름 아래에 그대로 보여준다.
--
-- 자동 생성하지 않는다 — 기구 이름만 보고 동작을 지어내면 틀린 자세를
-- 안내하게 된다(실제 이 앱의 하는 방법 안내 원칙과 같다: 확실한 것만 말한다).

alter table public.equipments
    add column if not exists description text;

comment on column public.equipments.description is
    '시니어가 이해하기 쉬운 한 줄 설명. 예: "앉아서 다리를 앞으로 미는 동작으로 허벅지를 강화합니다." 비어 있으면 화면에서 부위명으로 대체.';

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
            'description', e.description,
            'target_muscle', e.target_muscle,
            'video_url', e.video_url,
            'qr_code_val', e.qr_code_val,
            'target_weight', d.target_weight,
            'target_sets', d.target_sets,
            'target_reps', d.target_reps,
            'is_completed', d.is_completed
        ) as row
        from public.daily_routines d
        join public.equipments e on e.id = d.equip_id
        where d.user_id = p_user_id and d.routine_date = p_date
    ) rows;
$$;

comment on function public.get_daily_routine(uuid, date) is
    '해당 날짜의 루틴을 기구 정보(쉬운 설명 포함)와 함께 돌려준다.';

revoke all on function public.get_daily_routine(uuid, date) from public;
grant execute on function public.get_daily_routine(uuid, date) to anon, authenticated;


-- 시범단지 기구 5대에 예시 설명을 채운다.
update public.equipments set description = '의자에 앉아 손잡이를 앞으로 밀어내는 동작입니다. 가슴 근육을 키웁니다.'
    where qr_code_val = 'FIT-DEMO-CHEST-01';
update public.equipments set description = '위에서 손잡이를 아래로 당기는 동작입니다. 등 근육을 키워 굽은 등을 펴는 데 도움됩니다.'
    where qr_code_val = 'FIT-DEMO-LAT-01';
update public.equipments set description = '의자에 앉아 발판을 다리로 밀어내는 동작입니다. 허벅지와 엉덩이 근육을 키웁니다.'
    where qr_code_val = 'FIT-DEMO-LEG-01';
update public.equipments set description = '의자에 앉아 손잡이를 머리 위로 밀어올리는 동작입니다. 어깨 근육을 키웁니다.'
    where qr_code_val = 'FIT-DEMO-SHLD-01';
update public.equipments set description = '등받이에 기대 앉아 상체를 앞으로 숙이는 동작입니다. 뱃살 관리와 허리 힘에 도움됩니다.'
    where qr_code_val = 'FIT-DEMO-ABD-01';
