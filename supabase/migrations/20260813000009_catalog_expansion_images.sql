-- 운동 카탈로그 확충 + 시작 자세 사진
--
-- 1) 머신·케이블 운동 35종을 더한다. 헬스장에 실제로 있는 기구부터
--    채워야 루틴에 나온 기구를 찾을 수 있다.
-- 2) 모든 운동에 시작 자세 사진을 붙인다. 글로만 읽으면 "그 기구가 어느
--    것인지" 부터 막힌다.
--
-- 사진 출처: free-exercise-db (https://github.com/yuhonas/free-exercise-db).
-- Unlicense — 퍼블릭 도메인이라 상업적 사용과 재배포에 제약이 없다.
-- 직접 찍은 사진이 생기면 image_url 만 갈아 끼우면 된다.

alter table public.exercise_catalog
    add column if not exists image_url text;


-- 새 운동 35종
insert into public.exercise_catalog
    (name, name_ko, station_kind, target_muscle, description, why_it_matters,
     video_url, base_weight_kg, weight_step_kg, image_url)
values
    ('인클라인 체스트 프레스', '비스듬히 위로 밀기', '머신', '가슴',
     '등받이가 뒤로 눕혀진 의자에 앉아 손잡이를 비스듬히 위쪽으로 밀어내는 동작입니다.',
     '같은 가슴이라도 미는 각도가 위로 가면 윗가슴과 어깨 앞쪽을 더 씁니다. 선반에 물건을 올리는 각도와 같아서, 평평하게만 미는 것보다 일상 동작에 가깝습니다.',
     'https://example.com/videos/leverage_incline_chest_press.mp4', 15, 5,
     'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Leverage_Incline_Chest_Press/0.jpg'),

    ('디클라인 체스트 프레스', '비스듬히 아래로 밀기', '머신', '가슴',
     '등받이가 살짝 세워진 자세에서 손잡이를 비스듬히 아래로 밀어내는 동작입니다.',
     '가슴 아래쪽을 씁니다. 어깨에 실리는 부담이 가장 적은 각도라, 어깨가 불편해서 다른 가슴 운동이 힘드신 분께 대안이 됩니다.',
     'https://example.com/videos/leverage_decline_chest_press.mp4', 15, 5,
     'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Leverage_Decline_Chest_Press/0.jpg'),

    ('케이블 크로스오버', '케이블 모으기', '케이블', '가슴',
     '양쪽 케이블 손잡이를 잡고 가슴 앞으로 크게 모으는 동작입니다.',
     '팔을 끝까지 모을 수 있어 가슴이 가장 많이 조여지는 동작입니다. 무게를 아주 가볍게 맞출 수 있어 처음 하시는 분도 자세를 익히기 좋습니다.',
     'https://example.com/videos/cable_crossover.mp4', 5, 5,
     'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Cable_Crossover/0.jpg'),

    ('머신 벤치 프레스', '누워서 밀기', '머신', '가슴',
     '벤치에 누운 자세로 손잡이를 위로 밀어 올리는 머신입니다. 바벨과 달리 궤도가 고정돼 있습니다.',
     '가슴 운동 중 가장 힘이 많이 붙는 동작인데, 머신이라 혼자서도 안전합니다. 바벨이 부담스러우신 분이 같은 효과를 볼 수 있는 길입니다.',
     'https://example.com/videos/machine_bench_press.mp4', 20, 5,
     'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Machine_Bench_Press/0.jpg'),

    ('T바 로우', '엎드려 당기기', '머신', '등',
     '경사진 받침대에 엎드려 손잡이를 몸 쪽으로 당기는 동작입니다.',
     '가슴을 받침대에 대고 하기 때문에 허리가 굽을 일이 없습니다. 허리가 불편해서 굽혀 당기는 동작이 부담스러운 분께 가장 안전한 등 운동입니다.',
     'https://example.com/videos/lying_t-bar_row.mp4', 15, 5,
     'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Lying_T-Bar_Row/0.jpg'),

    ('하이 로우 머신', '앉아서 비스듬히 당기기', '머신', '등',
     '앉아서 위쪽에 있는 손잡이를 비스듬히 아래로 당기는 동작입니다.',
     '랫 풀다운과 시티드 로우의 중간 각도라 등을 넓게 씁니다. 가슴 받침이 있어 반동을 쓰기 어렵고, 그래서 자세가 무너지지 않습니다.',
     'https://example.com/videos/leverage_high_row.mp4', 20, 5,
     'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Leverage_High_Row/0.jpg'),

    ('아이소 로우', '한 팔씩 당기기', '머신', '등',
     '가슴을 받침대에 대고 한 팔씩 번갈아 당기는 머신입니다.',
     '좌우를 따로 쓰기 때문에 약한 쪽이 강한 쪽에 묻어가지 않습니다. 등은 좌우 차이가 큰 부위라 이런 운동이 하나쯤 필요합니다.',
     'https://example.com/videos/leverage_iso_row.mp4', 15, 5,
     'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Leverage_Iso_Row/0.jpg'),

    ('스트레이트암 풀다운', '팔 펴고 내리기', '케이블', '등',
     '위쪽 케이블 바를 잡고 팔을 편 채로 허벅지 앞까지 눌러 내리는 동작입니다.',
     '팔을 굽히지 않아 등 근육만 씁니다. 당기는 운동에서 팔이 먼저 지쳐 등을 제대로 못 쓰시는 분께 특히 좋습니다.',
     'https://example.com/videos/straight-arm_pulldown.mp4', 10, 5,
     'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Straight-Arm_Pulldown/0.jpg'),

    ('언더핸드 풀다운', '손바닥 위로 당기기', '케이블', '등',
     '손바닥이 얼굴을 보게 잡고 바를 가슴 쪽으로 당기는 동작입니다.',
     '일반 랫 풀다운보다 팔이 편하게 쓰이는 각도라 힘이 더 납니다. 어깨가 뻣뻣해서 넓게 잡기 힘든 분께 대안이 됩니다.',
     'https://example.com/videos/underhand_cable_pulldowns.mp4', 20, 5,
     'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Underhand_Cable_Pulldowns/0.jpg'),

    ('V바 풀다운', '좁게 잡고 당기기', '케이블', '등',
     'V자 손잡이를 좁게 잡고 가슴 쪽으로 당겨 내리는 동작입니다.',
     '좁게 잡으면 등 가운데가 더 조여집니다. 굽은 등을 펴는 데 직접 작용하는 부위라 오래 앉아 계신 분께 좋습니다.',
     'https://example.com/videos/v-bar_pulldown.mp4', 20, 5,
     'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/V-Bar_Pulldown/0.jpg'),

    ('슈러그 머신', '어깨 으쓱하기', '머신', '등',
     '손잡이를 잡고 어깨만 위로 으쓱 들어 올렸다 내리는 동작입니다.',
     '목과 어깨 사이 근육을 씁니다. 여기가 약하면 가방을 메거나 장을 들 때 목이 먼저 뻐근해집니다. 목이 아프신 분은 아주 가볍게만 하세요.',
     'https://example.com/videos/leverage_shrug.mp4', 20, 5,
     'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Leverage_Shrug/0.jpg'),

    ('리버스 펙덱', '뒤로 벌리기', '머신', '어깨',
     '펙덱 머신을 뒤로 돌려 앉아, 팔을 뒤쪽으로 벌리는 동작입니다.',
     '어깨 뒤쪽을 씁니다. 앞쪽만 발달하면 어깨가 더 말려서 자세가 나빠지는데, 이 동작이 그걸 되돌려 줍니다. 굽은 등에 가장 직접적인 운동입니다.',
     'https://example.com/videos/reverse_machine_flyes.mp4', 10, 5,
     'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Reverse_Machine_Flyes/0.jpg'),

    ('레버리지 숄더 프레스', '앉아서 위로 밀기', '머신', '어깨',
     '등받이에 기대 앉아 양쪽 손잡이를 머리 위로 밀어 올리는 머신입니다.',
     '등받이가 허리를 받쳐 줘서 서서 하는 것보다 훨씬 안전합니다. 높은 곳에 물건을 올리는 힘이라 나이가 들수록 더 필요합니다.',
     'https://example.com/videos/leverage_shoulder_press.mp4', 15, 5,
     'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Leverage_Shoulder_Press/0.jpg'),

    ('페이스 풀', '얼굴로 당기기', '케이블', '어깨',
     '얼굴 높이의 로프를 잡고 얼굴 쪽으로 당기며 팔꿈치를 벌리는 동작입니다.',
     '어깨 뒤쪽과 등 윗부분을 같이 씁니다. 어깨 통증 예방 운동으로 가장 많이 권해지는 동작이고, 가볍게 자주 하는 것이 좋습니다.',
     'https://example.com/videos/face_pull.mp4', 10, 5,
     'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Face_Pull/0.jpg'),

    ('케이블 리어델트 플라이', '케이블 뒤로 벌리기', '케이블', '어깨',
     '양쪽 케이블을 교차해 잡고 팔을 뒤쪽으로 크게 벌리는 동작입니다.',
     '리버스 펙덱과 같은 부위를 케이블로 합니다. 기구가 차 있을 때 대신 할 수 있고, 각도를 자유롭게 바꿀 수 있습니다.',
     'https://example.com/videos/cable_rear_delt_fly.mp4', 5, 5,
     'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Cable_Rear_Delt_Fly/0.jpg'),

    ('업라이트 케이블 로우', '몸 앞으로 끌어올리기', '케이블', '어깨',
     '아래쪽 케이블 바를 잡고 몸 앞으로 턱 밑까지 끌어올리는 동작입니다.',
     '어깨 옆과 위쪽을 같이 씁니다. 너무 높이 올리면 어깨가 걸릴 수 있어, 가슴 높이까지만 올리시는 편이 안전합니다.',
     'https://example.com/videos/upright_cable_row.mp4', 10, 5,
     'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Upright_Cable_Row/0.jpg'),

    ('핵 스쿼트', '기대서 앉았다 일어서기', '머신', '하체',
     '경사진 등받이에 어깨를 대고 기대선 채로 앉았다 일어서는 머신입니다.',
     '등이 받쳐진 채로 스쿼트를 하는 것과 같습니다. 허리 부담이 적으면서 허벅지에는 스쿼트만큼 실리기 때문에, 허리가 불편한 분의 하체 운동으로 좋습니다.',
     'https://example.com/videos/hack_squat.mp4', 20, 5,
     'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Hack_Squat/0.jpg'),

    ('라잉 레그 컬', '엎드려 무릎 굽히기', '머신', '하체',
     '기구에 엎드려 발목 패드를 걸고 무릎을 굽혀 발뒤꿈치를 엉덩이 쪽으로 당깁니다.',
     '허벅지 뒤쪽을 씁니다. 앞쪽만 강해지면 무릎이 앞뒤로 균형을 잃으므로, 무릎 펴기와 짝으로 해 주는 것이 좋습니다.',
     'https://example.com/videos/lying_leg_curls.mp4', 15, 5,
     'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Lying_Leg_Curls/0.jpg'),

    ('시티드 카프 레이즈', '앉아서 발뒤꿈치 들기', '머신', '하체',
     '앉아서 무릎 위에 패드를 올리고 발뒤꿈치를 들었다 내리는 동작입니다.',
     '종아리 깊은 쪽 근육을 씁니다. 서서 하는 것과는 쓰는 부위가 달라서 둘 다 하면 좋습니다. 앉아서 하니 균형 걱정이 없습니다.',
     'https://example.com/videos/seated_calf_raise.mp4', 15, 5,
     'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Seated_Calf_Raise/0.jpg'),

    ('카프 프레스', '레그 프레스로 발 밀기', '머신', '하체',
     '레그 프레스 발판에 발 앞부분만 대고 발목만 써서 밀어내는 동작입니다.',
     '따로 종아리 기구가 없어도 레그 프레스로 대신할 수 있습니다. 하체 운동을 마친 뒤 이어서 하면 자리를 옮길 필요도 없습니다.',
     'https://example.com/videos/calf_press_on_the_leg_press_machine.mp4', 30, 10,
     'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Calf_Press_On_The_Leg_Press_Machine/0.jpg'),

    ('힙 어덕션', '앉아서 다리 모으기', '머신', '하체',
     '의자에 앉아 무릎 안쪽 패드를 밀며 다리를 모으는 동작입니다.',
     '허벅지 안쪽을 씁니다. 다리를 벌리는 기구(힙 어브덕션)와 짝입니다. 안쪽이 약하면 무릎이 안으로 무너지기 쉬워 함께 해 주면 좋습니다.',
     'https://example.com/videos/thigh_adductor.mp4', 20, 5,
     'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Thigh_Adductor/0.jpg'),

    ('케이블 킥백', '다리 뒤로 차기', '케이블', '하체',
     '발목에 케이블을 걸고 한쪽 다리를 뒤로 밀어내는 동작입니다. 손잡이를 잡고 하세요.',
     '엉덩이 근육만 골라 씁니다. 계단을 오르고 일어설 때 몸을 밀어 올리는 힘이라, 여기가 약해지면 그 동작부터 힘들어집니다.',
     'https://example.com/videos/one-legged_cable_kickback.mp4', 5, 5,
     'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/One-Legged_Cable_Kickback/0.jpg'),

    ('내로우 레그 프레스', '발 모으고 밀기', '머신', '하체',
     '레그 프레스 발판에 두 발을 모아 놓고 미는 동작입니다.',
     '발 간격만 바꿔도 쓰는 부위가 달라집니다. 모으면 허벅지 바깥쪽이 더 쓰여서, 같은 기구로 다른 자극을 줄 수 있습니다.',
     'https://example.com/videos/narrow_stance_leg_press.mp4', 30, 10,
     'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Narrow_Stance_Leg_Press/0.jpg'),

    ('스미스 스플릿 스쿼트', '한 발 앞에 두고 앉기', '스미스머신', '하체',
     '스미스머신 바를 어깨에 얹고 한 발을 앞에 둔 채 아래로 앉았다 일어서는 동작입니다.',
     '한 다리씩 쓰면서도 바가 고정돼 있어 균형을 잃을 걱정이 적습니다. 양다리 힘 차이를 줄이는 데 좋고, 무릎이 불편하면 얕게만 하세요.',
     'https://example.com/videos/smith_single-leg_split_squat.mp4', 10, 5,
     'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Smith_Single-Leg_Split_Squat/0.jpg'),

    ('케이블 크런치', '무릎 꿇고 당겨 숙이기', '케이블', '복부',
     '위쪽 로프를 잡고 무릎 꿇은 자세에서 상체를 배 쪽으로 말아 내리는 동작입니다.',
     '맨몸 윗몸일으키기와 달리 무게를 조절할 수 있어, 처음에는 아주 가볍게 시작할 수 있습니다. 허리를 바닥에 비비지 않아 부담도 적습니다.',
     'https://example.com/videos/cable_crunch.mp4', 10, 5,
     'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Cable_Crunch/0.jpg'),

    ('팔로프 프레스', '비틀림 참고 밀기', '케이블', '복부',
     '옆쪽 케이블을 두 손으로 잡고 몸 앞으로 밀어낸 채 버티는 동작입니다. 몸이 돌아가지 않게 참는 것이 전부입니다.',
     '움직이지 않고 버티는 배 운동입니다. 허리를 굽혔다 펴지 않아 가장 안전하고, 실제로 물건을 한쪽으로 들 때 허리를 잡아 주는 힘을 기릅니다.',
     'https://example.com/videos/pallof_press.mp4', 10, 5,
     'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Pallof_Press/0.jpg'),

    ('케이블 리버스 크런치', '누워서 무릎 당기기', '케이블', '복부',
     '누운 자세에서 발목에 케이블을 걸고 무릎을 가슴 쪽으로 당기는 동작입니다.',
     '아랫배 쪽을 씁니다. 상체를 드는 동작이 목에 부담이 되는 분께 대안이 됩니다 — 목을 전혀 쓰지 않습니다.',
     'https://example.com/videos/cable_reverse_crunch.mp4', 5, 5,
     'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Cable_Reverse_Crunch/0.jpg'),

    ('머신 트라이셉스 익스텐션', '앉아서 팔 펴기', '머신', '팔',
     '의자에 앉아 손잡이를 아래로 밀어 팔을 펴는 머신입니다.',
     '팔 뒤쪽을 씁니다. 팔꿈치가 고정돼 있어 어깨를 안 쓰고 팔만 정확히 쓸 수 있습니다. 의자에서 몸을 밀어 올리는 힘이 여기서 나옵니다.',
     'https://example.com/videos/machine_triceps_extension.mp4', 15, 5,
     'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Machine_Triceps_Extension/0.jpg'),

    ('프리처 컬 머신', '팔 받치고 굽히기', '머신', '팔',
     '경사진 팔 받침에 팔을 얹고 손잡이를 얼굴 쪽으로 굽혀 올리는 동작입니다.',
     '팔이 완전히 고정돼 반동을 쓸 수 없습니다. 무게를 속이지 않고 팔 앞쪽만 정확히 쓰게 되는 동작입니다.',
     'https://example.com/videos/machine_preacher_curls.mp4', 10, 5,
     'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Machine_Preacher_Curls/0.jpg'),

    ('딥스 머신', '앉아서 아래로 밀기', '머신', '팔',
     '앉아서 손잡이를 아래로 눌러 몸을 밀어 올리듯 미는 머신입니다. 도움 무게를 설정할 수 있습니다.',
     '팔 뒤쪽과 가슴 아래를 같이 씁니다. 의자 팔걸이를 짚고 일어서는 동작 그대로라, 연습해 두면 실제로 일어서기가 쉬워집니다.',
     'https://example.com/videos/dip_machine.mp4', 15, 5,
     'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Dip_Machine/0.jpg'),

    ('로프 푸시다운', '로프 벌리며 내리기', '케이블', '팔',
     '위쪽 로프를 잡고 아래로 누르며 끝에서 양쪽으로 살짝 벌리는 동작입니다.',
     '바로 하는 것보다 손목이 편한 각도입니다. 손목이 불편하신 분은 바 대신 로프를 쓰시면 훨씬 수월합니다.',
     'https://example.com/videos/triceps_pushdown_-_rope_attachment.mp4', 10, 5,
     'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Triceps_Pushdown_-_Rope_Attachment/0.jpg'),

    ('케이블 해머 컬', '로프 잡고 굽히기', '케이블', '팔',
     '아래쪽 로프를 세워 잡고 팔꿈치를 붙인 채 굽혀 올리는 동작입니다.',
     '손등이 바깥을 보는 각도라 팔뚝까지 같이 씁니다. 병뚜껑을 열고 문고리를 돌리는 악력과 이어지는 근육입니다.',
     'https://example.com/videos/cable_hammer_curls_-_rope_attachment.mp4', 10, 5,
     'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Cable_Hammer_Curls_-_Rope_Attachment/0.jpg'),

    ('일립티컬', '공중걷기', '유산소', '유산소',
     '발판에 발을 얹고 손잡이를 밀고 당기며 걷듯이 움직이는 기구입니다.',
     '발이 발판에서 떨어지지 않아 무릎과 발목에 충격이 거의 없습니다. 트레드밀이 무릎에 부담되시는 분께 가장 먼저 권하는 유산소입니다.',
     'https://example.com/videos/elliptical_trainer.mp4', null, 1,
     'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Elliptical_Trainer/0.jpg'),

    ('스텝밀', '계단 오르기 기구', '유산소', '유산소',
     '실제 계단이 돌아가는 기구를 계속 올라가는 운동입니다. 손잡이를 잡고 하세요.',
     '유산소 중 하체 힘이 가장 많이 붙습니다. 다만 숨이 빨리 차기 때문에 처음에는 5분부터 시작하시고, 어지러우면 바로 멈추세요.',
     'https://example.com/videos/stairmaster.mp4', null, 1,
     'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Stairmaster/0.jpg'),

    ('등받이 자전거', '기대서 페달 밟기', '유산소', '유산소',
     '등받이가 있는 의자에 앉아 앞쪽 페달을 밟는 자전거입니다.',
     '허리를 완전히 기댄 채로 하기 때문에 일반 자전거보다 허리가 편합니다. 허리가 불편하시거나 균형이 걱정되는 분께 가장 안전한 유산소입니다.',
     'https://example.com/videos/recumbent_bike.mp4', null, 1,
     'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Recumbent_Bike/0.jpg')
on conflict do nothing;


-- 기존 운동에 사진 붙이기
update public.exercise_catalog c set image_url = v.url
from (values
    ('체스트 프레스', 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Leverage_Chest_Press/0.jpg'),
    ('펙덱 플라이', 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Butterfly/0.jpg'),
    ('스미스 벤치 프레스', 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Smith_Machine_Bench_Press/0.jpg'),
    ('무릎 푸시업', 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Push-Ups_With_Feet_Elevated/0.jpg'),
    ('벽 푸시업', 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Incline_Push-Up/0.jpg'),
    ('랫 풀다운', 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Wide-Grip_Lat_Pulldown/0.jpg'),
    ('시티드 로우', 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Seated_Cable_Rows/0.jpg'),
    ('케이블 로우', 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Elevated_Cable_Rows/0.jpg'),
    ('백 익스텐션', 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Hyperextensions_Back_Extensions/0.jpg'),
    ('덤벨 로우', 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/One-Arm_Dumbbell_Row/0.jpg'),
    ('슈퍼맨', 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Superman/0.jpg'),
    ('숄더 프레스', 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Machine_Shoulder_Military_Press/0.jpg'),
    ('케이블 래터럴 레이즈', 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Cable_Seated_Lateral_Raise/0.jpg'),
    ('덤벨 숄더 프레스', 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Seated_Dumbbell_Press/0.jpg'),
    ('덤벨 프론트 레이즈', 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Front_Dumbbell_Raise/0.jpg'),
    ('월 엔젤', 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Scapular_Pull-Up/0.jpg'),
    ('레그 프레스', 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Leg_Press/0.jpg'),
    ('레그 익스텐션', 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Leg_Extensions/0.jpg'),
    ('레그 컬', 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Seated_Leg_Curl/0.jpg'),
    ('힙 어브덕션', 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Thigh_Abductor/0.jpg'),
    ('스미스 스쿼트', 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Smith_Machine_Squat/0.jpg'),
    ('의자 스쿼트', 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Chair_Squat/0.jpg'),
    ('카프 레이즈', 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Standing_Calf_Raises/0.jpg'),
    ('힙 브릿지', 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Butt_Lift_Bridge/0.jpg'),
    ('스텝업', 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Step-up_with_Knee_Raise/0.jpg'),
    ('제자리 런지', 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Bodyweight_Walking_Lunge/0.jpg'),
    ('옆으로 다리 들기', 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Side_Leg_Raises/0.jpg'),
    ('복부 크런치', 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Ab_Crunch_Machine/0.jpg'),
    ('케이블 우드찹', 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Standing_Cable_Wood_Chop/0.jpg'),
    ('플랭크', 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Plank/0.jpg'),
    ('데드버그', 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Dead_Bug/0.jpg'),
    ('시티드 니 업', 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Seated_Flat_Bench_Leg_Pull-In/0.jpg'),
    ('암 컬 머신', 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Machine_Bicep_Curl/0.jpg'),
    ('케이블 푸시다운', 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Triceps_Pushdown_-_V-Bar_Attachment/0.jpg'),
    ('덤벨 컬', 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Dumbbell_Bicep_Curl/0.jpg'),
    ('트레드밀', 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Walking_Treadmill/0.jpg'),
    ('실내 자전거', 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Bicycling_Stationary/0.jpg'),
    ('로잉머신', 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Rowing_Stationary/0.jpg'),
    ('스텝박스', 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Stairmaster/0.jpg'),
    ('제자리 무릎 들기', 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Standing_Elevated_Quad_Stretch/0.jpg')
) as v(name, url)
where c.name = v.name and c.image_url is null;


-- 시범단지에 기구를 놓는다. 머신·케이블·스미스머신은 실제 기구가
-- 있어야 루틴에 잡힌다(맨몸은 기구 없이도 잡힌다).
insert into public.equipments (apt_id, qr_code_val, catalog_id, base_weight_kg, weight_step_kg)
select
    '11111111-1111-4111-8111-111111111111',
    'FIT-DEMO-' || upper(substring(replace(c.id::text, '-', ''), 1, 10)),
    c.id,
    c.base_weight_kg,
    c.weight_step_kg
from public.exercise_catalog c
where c.station_kind <> '맨몸'
  and not exists (
      select 1 from public.equipments e
      where e.apt_id = '11111111-1111-4111-8111-111111111111'
        and e.catalog_id = c.id
  );
