-- 태블릿에서 체크인하면 폰 앱이 그 자리에서 반응하게 한다.
--
-- 지금까지 폰 앱은 운동 탭을 열 때만 서버에 물어봤다. 그래서 앱을 켜 둔 채로
-- 태블릿에 번호를 찍으면 화면에 아무 일도 일어나지 않았다. 체크인한 헬스장에
-- 따라 루틴이 달라지는데도(이사 대응) 그 갱신이 안 되는 문제도 같이 있었다.
--
-- Supabase Realtime 의 postgres_changes 로 attendance_logs 의 insert 를
-- 구독하게 한다. 카카오 로그인 여부와 무관하게 동작한다 — 익명 세션도
-- auth.uid() 를 갖기 때문이다.
--
-- ⚠️ 이 저장소는 "RLS deny-by-default + security definer RPC 로만 접근"이
-- 원칙이고 지금까지 select 정책을 하나도 두지 않았다. 여기서 딱 한 번
-- 예외를 둔다 — Realtime 의 postgres_changes 는 RPC 를 통하지 않고 테이블을
-- 직접 구독하는 구조라, select 정책 없이는 아무 이벤트도 전달되지 않는다.
-- 대신 범위를 "내 출석 기록"으로만 좁힌다. attendance_logs 에는 이름·전화번호
-- 같은 개인정보가 없고(user_id, apt_id, attended_at 뿐), 남의 행은 정책에서
-- 걸러진다. anon(키오스크)에는 열지 않는다.

alter table public.attendance_logs enable row level security;

-- 정책 식은 "질의하는 사람의 권한"으로 실행된다. 그래서 정책 안에서 곧바로
-- public.users 를 읽으면 permission denied 가 난다 — authenticated 역할에는
-- users select 권한이 없기 때문이다(deny-by-default 원칙 그대로다).
-- security definer 함수 하나를 거쳐서, 권한을 넓히지 않고 "지금 로그인한
-- 사람의 users.id" 만 알아낸다.
-- language sql 로 두면 생성 시점에 본문이 검증돼서, auth 스키마가 아직 없는
-- 환경(로컬 검증용 Postgres)에서 설치가 통째로 실패한다. 이 저장소의 다른
-- 함수들과 같이 plpgsql 로 둔다.
create or replace function public.current_app_user_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    v_id uuid;
begin
    select u.id into v_id from public.users u where u.auth_user_id = auth.uid();
    return v_id;
end;
$$;

comment on function public.current_app_user_id() is
    '지금 로그인한 auth.uid() 에 연결된 public.users.id. RLS 정책 안에서만 쓴다.';

revoke all on function public.current_app_user_id() from public;
grant execute on function public.current_app_user_id() to authenticated;

drop policy if exists "own attendance is readable" on public.attendance_logs;

create policy "own attendance is readable"
    on public.attendance_logs
    for select
    to authenticated
    using (user_id = public.current_app_user_id());

comment on policy "own attendance is readable" on public.attendance_logs is
    'Realtime 구독(postgres_changes)에만 쓰인다. 본인 출석 행만 읽힌다.';

-- RLS 정책은 테이블 권한 위에서 동작한다. select 권한 자체가 없으면 정책이
-- 있어도 아무것도 못 읽는다.
grant select on public.attendance_logs to authenticated;

-- Realtime 이 이 테이블의 변경을 내보내도록 발행 목록에 넣는다.
-- 이미 들어 있으면 duplicate_object 가 나므로 무시한다(여러 번 실행해도 안전).
do $$
begin
    alter publication supabase_realtime add table public.attendance_logs;
exception
    when duplicate_object then null;
    when undefined_object then
        -- 로컬 Postgres 처럼 supabase_realtime 발행이 없는 환경에서는 건너뛴다.
        null;
end;
$$;
