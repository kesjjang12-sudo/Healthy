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
-- description 은 기구 이름만으로는 이해하기 어려운 시니어를 위한 쉬운 설명이다.
insert into public.equipments
    (apt_id, qr_code_val, name, description, target_muscle, video_url, base_weight_kg, weight_step_kg)
values
    ('11111111-1111-4111-8111-111111111111', 'FIT-DEMO-CHEST-01', '체스트 프레스', '의자에 앉아 손잡이를 앞으로 밀어내는 동작입니다. 가슴 근육을 키웁니다.', '가슴', 'https://example.com/videos/chest-press.mp4', 20, 5),
    ('11111111-1111-4111-8111-111111111111', 'FIT-DEMO-LAT-01',   '랫 풀다운',     '위에서 손잡이를 아래로 당기는 동작입니다. 등 근육을 키워 굽은 등을 펴는 데 도움됩니다.', '등', 'https://example.com/videos/lat-pulldown.mp4', 25, 5),
    ('11111111-1111-4111-8111-111111111111', 'FIT-DEMO-LEG-01',   '레그 프레스',   '의자에 앉아 발판을 다리로 밀어내는 동작입니다. 허벅지와 엉덩이 근육을 키웁니다.', '하체', 'https://example.com/videos/leg-press.mp4', 40, 10),
    ('11111111-1111-4111-8111-111111111111', 'FIT-DEMO-SHLD-01',  '숄더 프레스',   '의자에 앉아 손잡이를 머리 위로 밀어올리는 동작입니다. 어깨 근육을 키웁니다.', '어깨', 'https://example.com/videos/shoulder-press.mp4', 15, 5),
    ('11111111-1111-4111-8111-111111111111', 'FIT-DEMO-ABD-01',   '복부 크런치',   '등받이에 기대 앉아 상체를 앞으로 숙이는 동작입니다. 뱃살 관리와 허리 힘에 도움됩니다.', '복부', 'https://example.com/videos/ab-crunch.mp4', 10, 5),
    -- 유산소: base_weight_kg 이 없다 — 핀을 꽂는 기구가 아니라 시간으로 처방한다.
    ('11111111-1111-4111-8111-111111111111', 'FIT-DEMO-CARDIO-01', '트레드밀',    '벨트 위에서 걷거나 가볍게 뛰는 운동입니다. 심장과 폐를 튼튼하게 합니다.', '유산소', 'https://example.com/videos/treadmill.mp4', null, 1)
on conflict (qr_code_val) do nothing;
