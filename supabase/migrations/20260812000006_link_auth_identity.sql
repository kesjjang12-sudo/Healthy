-- Kakao/Google OAuth 로그인을 위한 Supabase Auth 연결
--
-- 배경: 지금까지 public.users 는 전화번호가 곧 계정이었다(auth.users 미사용,
-- RPC 는 전부 anon 키로 호출됨). 개인 폰 앱에 카카오/구글 로그인을 붙이면서,
-- 그 신원(auth.users)과 기존 프로필 테이블(public.users)을 연결할 다리가
-- 필요하다.
--
-- 카카오/구글로 먼저 가입하면 아직 전화번호가 없는 상태로 시작한다(QR 페어링
-- 전까지). 그래서 phone_number 를 필수에서 선택으로 낮춘다. unique 제약은
-- 그대로 둬도 된다 — Postgres 의 UNIQUE 는 NULL 여러 개를 서로 다른 값으로
-- 취급해 충돌하지 않는다.

alter table public.users
    add column if not exists auth_user_id uuid unique references auth.users(id) on delete set null;

create index if not exists users_auth_user_id_idx on public.users (auth_user_id);

alter table public.users
    alter column phone_number drop not null;

comment on column public.users.auth_user_id is
    'Supabase Auth(카카오/구글/익명) 신원과의 연결. 키오스크로만 생긴 계정은 아직 null.';
comment on column public.users.phone_number is
    '카카오/구글로 먼저 가입하면 QR 페어링 전까지 null. 키오스크로 먼저 생기면 처음부터 채워진다.';
