-- QR 페어링: 키오스크에서 체크인한 번호를 폰 앱의 로그인 세션과 연결한다.
--
-- 카카오/구글 로그인은 전화번호를 안 준다(카카오는 사업자등록+심사 전엔 아예
-- 못 받는다). 그래서 키오스크가 번호로 만든 "그림자 계정"과, 폰 앱에서 로그인한
-- 진짜 사람을 이어줄 다리가 필요하다. 그 다리가 이 표다 — 키오스크가 임시 코드를
-- 발급하고, 폰 앱이 그 코드를 스캔해서 완료(complete_pairing, 다음 마이그레이션
-- 들에서 추가)하면 소모된다.

create table if not exists public.device_pairings (
    id                        uuid primary key default uuid_generate_v4(),
    pairing_code              text not null unique,
    candidate_user_id         uuid not null references public.users(id) on delete cascade,
    apt_id                    uuid not null references public.apartments(id) on delete cascade,
    expires_at                timestamptz not null,
    consumed_at               timestamptz,
    consumed_by_auth_user_id  uuid references auth.users(id),
    created_at                timestamptz default now()
);

create index if not exists device_pairings_code_idx on public.device_pairings (pairing_code);
create index if not exists device_pairings_expires_idx on public.device_pairings (expires_at);

comment on table public.device_pairings is
    '키오스크 체크인 후 발급되는 1회성 페어링 코드. 3분 내 폰 앱이 스캔해 완료하지 않으면 만료된다.';

alter table public.device_pairings enable row level security;
-- 다른 테이블과 같은 원칙: anon/authenticated 정책 없음, RPC로만 접근한다.
-- (만료된 행을 지우는 정리 작업은 지금은 두지 않는다 — 표가 작아 문제 없고,
-- 나중에 필요해지면 pg_cron 잡으로 추가하면 된다.)
