-- 무게 제안 조회용 인덱스.
--
-- weight_suggestion() 은 (user_id, equip_id) 로 지난 완료 기록을 찾아
-- completed_at 역순으로 한두 건만 본다. 그런데 daily_routines 에는
-- (user_id, routine_date) 인덱스밖에 없어서 equip_id 로 좁히는 건 못 쓴다.
--
-- 이 함수는 운동 목록을 열 때마다 항목 수만큼 불린다(6개 운동이면 12번).
-- 지금은 행이 적어 티가 안 나지만, 한 사람이 1년만 다녀도 수백 행이 되고
-- 단지가 늘면 테이블 전체가 커진다 — 그때는 목록 화면이 통째로 느려진다.
create index if not exists daily_routines_user_equip_completed_idx
    on public.daily_routines (user_id, equip_id, completed_at desc)
    where is_completed;
