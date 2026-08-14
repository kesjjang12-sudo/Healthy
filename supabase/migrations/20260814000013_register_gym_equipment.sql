-- 카탈로그의 운동을 각 단지 기구로 등록한다.
--
-- 왜 필요한가. 루틴 생성(generate_daily_routine)은 "이 단지에 그 기구가 있는가"를
-- equipments 로 판단한다. 카탈로그에만 있고 equipments 행이 없으면 그 운동은
-- 영영 처방되지 않고, 기구 사용법 목록에서도 "우리 헬스장 없음"으로 뜬다.
--
-- 지금은 실제 헬스장 기구 목록을 아직 확정하지 못한 단계라, 일단 카탈로그
-- 전체를 등록해 두고 나중에 실물에 맞춰 덜어낸다. 운영진이 "이건 나중에
-- 셋팅하고 앱은 DB 값을 읽기만 하면 된다"고 정한 방향이다.
--
-- ⚠️ 그래서 이 상태에서는 없는 기구가 루틴에 나올 수 있다. 실제 기구를
--    확정하면 아래 "덜어내기" 주석의 delete 를 쓰면 된다. 그 전까지는
--    회원이 헬스장에서 기구를 못 찾는 경우가 생긴다는 것을 알고 있어야 한다.
--
-- 맨몸 운동은 등록하지 않는다. 기구가 필요 없어서 equipments 행 없이도
-- 루틴에 잡히고, 화면에서도 항상 "할 수 있는 것"으로 센다.
--
-- 단지를 하나만 지정하지 않고 전부 도는 이유: 단지가 늘어날 때마다 이 파일을
-- 고치지 않아도 되게 하려고. 여러 번 돌려도 안전하다(이미 있는 조합은 건너뛴다).
--
-- ⚠️ 전제: exercise_catalog 가 있고 equipments 가 "단지별 보유 기록"으로 바뀐
--    상태여야 한다. 라이브 DB 는 그렇지만 이 브랜치의 마이그레이션 체인에는
--    그 파일이 없다(CLAUDE.md 의 "끊긴 체인" 항목 참고 — 미병합 브랜치
--    claude/toss-app-ui-ux-design-zikopg 의 20260812000026_exercise_catalog).
--    빈 DB 에 처음부터 돌리면 그 브랜치가 병합된 뒤에야 통과한다.


-- 무게 두 칸(base_weight_kg / weight_step_kg)은 일부러 비워 둔다.
-- equipments 쪽 무게는 "단지별 보정값"이고, 비어 있으면 도감 값을 쓴다
-- (조회 쪽이 전부 coalesce(e.base_weight_kg, cat.base_weight_kg) 로 읽는다).
-- 여기서 도감 값을 그대로 복사해 두면 나중에 도감 무게를 고쳐도 등록된 기구는
-- 옛 값을 계속 들고 있게 된다. 실제로 다른 사양의 기구가 들어왔을 때만 채운다.
insert into public.equipments (apt_id, qr_code_val, catalog_id)
select
    a.id,
    -- QR 값은 전역 유일해야 한다(unique). 단지와 운동 id 를 통째로 붙여 만든다.
    -- 앞자리만 잘라 쓰지 않는 이유: id 앞부분이 겹치는 순간 unique 위반으로
    -- 마이그레이션 전체가 죽는다. 실제로 그렇게 만들어 보니 죽었다.
    -- QR 은 눈으로 읽는 값이 아니라 찍는 값이라 길어도 상관없다.
    -- 기존 마이그레이션이 만든 'FIT-DEMO-...' 와는 모양이 달라 겹치지 않는다.
    'FIT-'
        || upper(replace(a.id::text, '-', ''))
        || '-'
        || upper(replace(c.id::text, '-', '')),
    c.id
from public.apartments a
cross join public.exercise_catalog c
where c.station_kind is distinct from '맨몸'
  and not exists (
      select 1 from public.equipments e
      where e.apt_id = a.id and e.catalog_id = c.id
  );


-- ─────────────────────────────────────────────────────────────
-- 확인용 — 등록 결과를 눈으로 보고 싶을 때 이 select 만 따로 돌린다.
--
--   select a.name as 단지,
--          count(*) filter (where e.id is not null) as 등록된기구,
--          count(*) filter (where c.station_kind = '맨몸') as 맨몸운동
--   from public.apartments a
--   cross join public.exercise_catalog c
--   left join public.equipments e on e.apt_id = a.id and e.catalog_id = c.id
--   group by a.name;
--
-- 덜어내기 — 실제로 없는 기구를 지울 때. 지워도 카탈로그(설명·사진)는 남고,
-- 화면에는 "우리 헬스장 없음"으로 표시된다.
--
--   delete from public.equipments e
--   using public.exercise_catalog c
--   where e.catalog_id = c.id
--     and e.apt_id = '<단지 id>'
--     and c.name in ('레그 익스텐션', '펙덱 플라이');
-- ─────────────────────────────────────────────────────────────
