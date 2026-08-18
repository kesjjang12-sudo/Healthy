-- 국토 종주 둘레길: 지금까지 유산소를 총 몇 분 했는지.
--
-- 유산소 화면이 "214km 중 163km 지점"처럼 누적 여정을 보여주려면 지난
-- 세션들의 유산소 시간 합이 필요하다. daily_routines 는 RLS 정책 없이
-- SECURITY DEFINER RPC 로만 열려 있으므로(클라이언트 직접 select 불가)
-- 합계도 RPC 로 낸다. 새 함수라 기존 정의를 덮어쓸 일은 없다.

create or replace function public.get_journey_minutes()
returns integer
language sql
stable
security definer
set search_path to 'public'
as $function$
    select coalesce(sum(d.actual_duration_minutes), 0)::integer
    from public.daily_routines d
    join public.users u on u.id = d.user_id
    where u.auth_user_id = auth.uid()
      and d.is_completed
      and d.actual_duration_minutes is not null;
$function$;

comment on function public.get_journey_minutes() is
    '로그인한 회원이 지금까지 완료한 유산소의 총 시간(분). 국토 종주 둘레길의 누적 거리 계산에 쓴다.';

revoke all on function public.get_journey_minutes() from public;
grant execute on function public.get_journey_minutes() to authenticated;
