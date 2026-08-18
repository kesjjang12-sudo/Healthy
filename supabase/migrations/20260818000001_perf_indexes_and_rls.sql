-- 성능 점검에서 나온 두 가지를 고친다 (Supabase database linter, 2026-08-18).
--
-- 지금 고치는 이유: 데이터가 적을 때 인덱스를 만드는 게 훨씬 싸다. 운동 기록이
-- 수십만 건 쌓인 뒤에 만들면 만드는 동안 서비스가 느려진다. 지금은 DB 가
-- 15MB 라 눈 깜짝할 사이에 끝난다.


-- ── 1. 외래키에 인덱스를 붙인다 (lint 0001_unindexed_foreign_keys) ──────────
--
-- 외래키가 걸린 컬럼에 인덱스가 없으면 두 가지가 느려진다.
--   * 그 컬럼으로 조인·조회할 때 (예: "이 기구를 쓰는 루틴 전부")
--   * 부모 행을 지우거나 바꿀 때. Postgres 가 자식 테이블을 전부 훑어
--     참조가 남았는지 확인한다.
--
-- 기구를 하나 교체하는 것 같은 관리 작업이 회원 수에 비례해 느려지는 게
-- 이 때문이다.
--
-- 이름을 명시하고 if not exists 를 붙여 여러 번 돌려도 안전하게 둔다.

create index if not exists daily_routines_catalog_id_idx
    on public.daily_routines (catalog_id);

create index if not exists daily_routines_equip_id_idx
    on public.daily_routines (equip_id);

create index if not exists device_pairings_apt_id_idx
    on public.device_pairings (apt_id);

create index if not exists device_pairings_candidate_user_id_idx
    on public.device_pairings (candidate_user_id);

create index if not exists device_pairings_consumed_by_auth_user_id_idx
    on public.device_pairings (consumed_by_auth_user_id);

create index if not exists equipments_catalog_id_idx
    on public.equipments (catalog_id);

create index if not exists user_equipment_levels_equip_id_idx
    on public.user_equipment_levels (equip_id);


-- ── 2. RLS 정책이 행마다 auth.uid() 를 다시 부르지 않게 한다 ────────────────
--    (lint 0003_auth_rls_initplan)
--
-- `auth.uid()` 를 그냥 쓰면 Postgres 가 그것을 행마다 달라질 수 있는 값으로
-- 보고 **행 하나하나마다 다시 호출**한다. 1만 행을 훑으면 1만 번 부른다.
--
-- `(select auth.uid())` 로 감싸면 쿼리당 한 번만 계산하고 그 값을 재사용한다
-- (InitPlan). 검사하는 내용은 완전히 같고 결과도 같다 — 부르는 횟수만 준다.
--
-- ⚠️ 정책을 다시 쓰기 전에 서버의 현재 정의를 pg_policies 로 읽어서 그대로
--    옮겼다. 저장소의 옛 파일을 출발점으로 삼으면 그 사이 다른 세션이 넣은
--    조건이 조용히 날아간다(CLAUDE.md 의 image_url 사고와 같은 유형).
--
--    2026-08-18 서버의 정의:
--      cmd:        ALL
--      qual:       user_id IN (SELECT u.id FROM users u WHERE u.auth_user_id = auth.uid())
--      with_check: 같음
--    아래는 auth.uid() 를 (select auth.uid()) 로 감싼 것 외에는 동일하다.

drop policy if exists "own equipment levels" on public.user_equipment_levels;

create policy "own equipment levels"
    on public.user_equipment_levels
    for all
    using (
        user_id in (
            select u.id from public.users u
            where u.auth_user_id = (select auth.uid())
        )
    )
    with check (
        user_id in (
            select u.id from public.users u
            where u.auth_user_id = (select auth.uid())
        )
    );
