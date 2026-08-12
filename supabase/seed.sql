-- 로컬/개발용 시드 데이터.
-- apt_id 는 태블릿 앱의 EXPO_PUBLIC_FITROUTINE_APT_ID 와 맞춘다.

insert into public.apartments (id, name, address)
values (
    '11111111-1111-4111-8111-111111111111',
    '핏루틴 시범단지',
    '서울특별시 강남구 테헤란로 1'
)
on conflict (id) do nothing;

-- base_weight_kg 는 "표준 성인 남성 시작 무게" 기준이다. 여기에 연령대·성별·목적·
-- 아픈 곳 배율이 곱해져 개인별 무게가 나오므로, 단지마다 기구 사양에 맞춰 조정한다.
insert into public.equipments
    (apt_id, qr_code_val, name, target_muscle, video_url, base_weight_kg, weight_step_kg)
values
    ('11111111-1111-4111-8111-111111111111', 'FIT-DEMO-CHEST-01', '체스트 프레스', '가슴',   'https://example.com/videos/chest-press.mp4',    20,  5),
    ('11111111-1111-4111-8111-111111111111', 'FIT-DEMO-LAT-01',   '랫 풀다운',     '등',     'https://example.com/videos/lat-pulldown.mp4',   25,  5),
    ('11111111-1111-4111-8111-111111111111', 'FIT-DEMO-LEG-01',   '레그 프레스',   '하체',   'https://example.com/videos/leg-press.mp4',      40, 10),
    ('11111111-1111-4111-8111-111111111111', 'FIT-DEMO-SHLD-01',  '숄더 프레스',   '어깨',   'https://example.com/videos/shoulder-press.mp4', 15,  5),
    ('11111111-1111-4111-8111-111111111111', 'FIT-DEMO-ABD-01',   '복부 크런치',   '복부',   'https://example.com/videos/ab-crunch.mp4',      10,  5)
on conflict (qr_code_val) do nothing;
