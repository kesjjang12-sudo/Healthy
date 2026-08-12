-- 이사(헬스장 변경) 대응: 유저 1명이 여러 헬스장을 오갈 수 있게 한다.
--
-- 지금까지 users.apt_id 는 "이 사람이 다니는 헬스장" 하나만 가리켰다. 이사를
-- 가면 새 헬스장에서 체크인해도 이 컬럼 하나로는 어디가 "진짜 소속"인지,
-- 예전 헬스장은 몇 번 갔었는지 알 길이 없었다.
--
-- users.apt_id 는 지우지 않고 "주 소속 캐시"로 남긴다 — generate_daily_routine
-- 등 기존 함수들이 그대로 동작하고, 마이그레이션 반경이 작아진다. 진짜 이력은
-- 이 테이블이 갖고, users.apt_id 는 confirm_gym_membership RPC(다음 마이그레이션
-- 들에서 추가)가 명시적으로 갱신한다.

create table if not exists public.user_gym_memberships (
    id                   uuid primary key default uuid_generate_v4(),
    user_id              uuid not null references public.users(id) on delete cascade,
    apt_id               uuid not null references public.apartments(id) on delete cascade,
    is_primary           boolean not null default false,
    visit_count          integer not null default 0,
    first_checked_in_at  timestamptz not null default now(),
    last_checked_in_at   timestamptz not null default now(),
    created_at           timestamptz default now(),
    unique (user_id, apt_id)
);

-- 한 유저의 주 소속은 항상 하나뿐이어야 한다.
create unique index if not exists user_gym_memberships_one_primary_idx
    on public.user_gym_memberships (user_id) where is_primary;

create index if not exists user_gym_memberships_apt_id_idx
    on public.user_gym_memberships (apt_id);

comment on table public.user_gym_memberships is
    '유저-헬스장 방문 이력. is_primary 인 행이 지금의 "주 소속"이고 users.apt_id 에 캐시된다.';

alter table public.user_gym_memberships enable row level security;
-- 다른 테이블과 같은 원칙: anon/authenticated 정책 없음, RPC로만 접근한다.


-- 출석 기록에도 "그날 어느 헬스장이었는지"를 남긴다. 주 소속이 아닌 헬스장에서도
-- 체크인할 수 있으므로(이사 직후 방문 등), users.apt_id 하나로는 그날의 기구
-- 목록을 정확히 못 고른다.
alter table public.attendance_logs
    add column if not exists apt_id uuid references public.apartments(id);

create index if not exists attendance_logs_apt_id_idx on public.attendance_logs (apt_id);


-- ─────────────────────────────────────────────────────────────
-- 기존 데이터 백필
-- ─────────────────────────────────────────────────────────────

-- 지금까지 생긴 유저는 전부 users.apt_id 가 곧 주 소속이었다. 그 값 그대로
-- 첫 멤버십 행을 만들고, 지금까지의 출석 횟수/최초·최근 출석일을 채워 넣는다.
insert into public.user_gym_memberships
    (user_id, apt_id, is_primary, visit_count, first_checked_in_at, last_checked_in_at)
select
    u.id,
    u.apt_id,
    true,
    (select count(*) from public.attendance_logs l where l.user_id = u.id),
    coalesce((select min(l.attended_at) from public.attendance_logs l where l.user_id = u.id), u.created_at),
    coalesce((select max(l.attended_at) from public.attendance_logs l where l.user_id = u.id), u.created_at)
from public.users u
where u.apt_id is not null
on conflict (user_id, apt_id) do nothing;

-- 기존 출석 기록에도 유저의 소속 apt_id 를 채워 넣는다. 지금까지는 유저당
-- 헬스장이 하나뿐이었으니 소급 적용해도 틀릴 수가 없다.
update public.attendance_logs l
set apt_id = u.apt_id
from public.users u
where u.id = l.user_id
  and l.apt_id is null;
