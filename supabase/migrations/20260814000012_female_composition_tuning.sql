-- 여성 루틴 구성 재조정 (2026-08-14 운영 판단)
--
-- 여성 회원이 꺼리는 부위는 줄이고, 선호가 뚜렷한 하체·팔 비중을 더 올린다.
--
--   가슴 — 근력 목적에서도 짧은 코스에서 뺀다(긴 코스에만 남김). 이미
--          감량·건강 목적은 긴 코스 전용이었는데 근력만 짧은 코스에 있었다.
--   팔   — 근력 목적은 짧은 코스로 올리고 세트를 보강한다. 가슴이 빠진
--          자리를 팔이 채우는 셈이라 짧은 코스 운동 개수는 그대로다.
--          감량·건강 목적에도 긴 코스 보강으로 새로 넣는다.
--   하체 — 긴 코스에 4번째 슬롯을 더한다. 데모 단지 기준 하체 기구가
--          19종이라 슬롯 4개가 전부 다른 기구로 채워진다.
--
-- 재활(rehab)은 손대지 않는다 — 아픈 곳이 있어 온 분에게 부위 몰아주기는
-- 목적과 어긋난다(000005 의 판단 유지).
--
-- ⚠️ 비중·세트·비율은 운영 판단이자 트레이너 검수 대상이다.

-- 1) 가슴: 근력 목적도 긴 코스로 내린다
update public.goal_blocks
   set course_level = 2
 where gender = 'female' and goal = 'muscle' and target_muscle = '가슴' and slot = 1;

-- 2) 팔: 근력 목적은 짧은 코스 핵심으로 올리고 3세트로 보강
update public.goal_blocks
   set course_level = 1, sets = 3
 where gender = 'female' and goal = 'muscle' and target_muscle = '팔' and slot = 1;

-- 3) 팔을 감량·건강에도, 하체 4번째 슬롯을 긴 코스에 추가
--    (하체 슬롯은 뒤로 갈수록 가볍고 횟수가 많다 — 000005 의 원칙 유지)
insert into public.goal_blocks
    (gender, goal, target_muscle, slot, sets, reps, weight_ratio, sort_order, course_level)
values
    ('female', 'diet',   '팔',   1, 2, 15, 0.45, 50, 2),
    ('female', 'health', '팔',   1, 2, 12, 0.40, 50, 2),

    ('female', 'muscle', '하체', 4, 2, 15, 0.60,  4, 2),
    ('female', 'diet',   '하체', 4, 3, 18, 0.45,  4, 2),
    ('female', 'health', '하체', 4, 2, 15, 0.45,  4, 2)
on conflict (gender, goal, target_muscle, slot) do update
set sets         = excluded.sets,
    reps         = excluded.reps,
    weight_ratio = excluded.weight_ratio,
    sort_order   = excluded.sort_order,
    course_level = excluded.course_level;

-- 템플릿 재생성. 오늘 이미 생성된 daily_routines 는 그대로 두고(운동 중인
-- 사람의 루틴을 바꾸지 않는다), 내일 생성분부터 새 구성이 적용된다.
select public.rebuild_routine_templates();
