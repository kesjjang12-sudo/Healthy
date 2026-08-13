-- 로컬/개발용 시드 데이터.

insert into public.apartments (id, name, address)
values (
    '11111111-1111-4111-8111-111111111111',
    '핏루틴 시범단지',
    '서울특별시 강남구 테헤란로 1'
)
on conflict (id) do nothing;

-- 태블릿 최초 설정에 쓰는 값. 실제 단지는 등록 코드가 자동 생성되지만(랜덤 6자리),
-- 시범단지만은 매번 조회하지 않게 고정해 둔다. 운영 단지에 이 PIN 을 그대로
-- 쓰면 안 된다 — 코드는 공개돼도 되지만 PIN 은 관리사무소만 알아야 한다.
update public.apartments
set enroll_code    = 'TEST24',
    kiosk_pin_hash = crypt('1234', gen_salt('bf'))
where id = '11111111-1111-4111-8111-111111111111';

-- 시범단지의 보유 기구. 운동 이름·설명·영상은 운동 도감(exercise_catalog,
-- 마이그레이션 26에서 미리 등록)이 들고 있고, 여기서는 "어떤 운동의 기구가
-- 몇 번 구역에 있는지"만 잇는다. 맨몸운동은 기구가 없으니 여기 등록하지
-- 않는다 — 보유 기구가 없는 부위에 자동으로 대체 처방된다.
insert into public.equipments (apt_id, catalog_id, qr_code_val, location_label)
select '11111111-1111-4111-8111-111111111111', c.id, v.qr_code_val, v.location_label
from (values
    ('체스트 프레스', 'FIT-DEMO-CHEST-01',  '1번 구역'),
    ('랫 풀다운',     'FIT-DEMO-LAT-01',    '2번 구역'),
    ('레그 프레스',   'FIT-DEMO-LEG-01',    '3번 구역'),
    ('숄더 프레스',   'FIT-DEMO-SHLD-01',   '4번 구역'),
    ('복부 크런치',   'FIT-DEMO-ABD-01',    '5번 구역'),
    ('트레드밀',      'FIT-DEMO-CARDIO-01', '6번 구역')
) as v (name, qr_code_val, location_label)
join public.exercise_catalog c on c.name = v.name
on conflict (qr_code_val) do nothing;
