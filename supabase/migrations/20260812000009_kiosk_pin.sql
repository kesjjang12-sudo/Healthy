-- 기기를 "키오스크"로 설정할 때 아무나 못 누르게 막는 PIN.
--
-- 이 앱은 하나의 코드베이스가 태블릿(키오스크)과 개인 폰 양쪽에 깔린다. 최초
-- 실행 시 "이 기기는 무엇인가요?" 를 묻는데, 키오스크를 고르는 순간 그 태블릿은
-- 전용 체크인 화면으로 고정된다. 개인 폰이 실수로(혹은 장난으로) 키오스크
-- 모드가 돼버리면 안 되므로, 단지 관리자가 정한 PIN을 확인한다.
--
-- PIN 을 정하는 RPC/화면은 지금은 만들지 않는다 — 단지 개설 시 관리자가
-- SQL Editor 에서 한 번 넣는 드문 작업이라 UI를 만들 정도는 아니다.
-- 예: update apartments set kiosk_pin_hash = crypt('1234', gen_salt('bf')) where id = '...';

create extension if not exists pgcrypto;

alter table public.apartments
    add column if not exists kiosk_pin_hash text;

comment on column public.apartments.kiosk_pin_hash is
    'crypt() 로 해시된 키오스크 설정 PIN. 관리자가 태블릿 최초 설정 시에만 입력한다.';

create or replace function public.verify_kiosk_pin(p_apt_id uuid, p_pin text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
    v_hash text;
begin
    select kiosk_pin_hash into v_hash from public.apartments where id = p_apt_id;

    if v_hash is null then
        -- PIN 을 아직 안 정한 단지는(시범 단계) 항상 통과시킨다.
        return true;
    end if;

    return v_hash = crypt(coalesce(p_pin, ''), v_hash);
end;
$$;

comment on function public.verify_kiosk_pin(uuid, text) is
    '태블릿을 키오스크 모드로 설정할 때 PIN을 확인한다. PIN 미설정 단지는 항상 통과.';

revoke all on function public.verify_kiosk_pin(uuid, text) from public;
grant execute on function public.verify_kiosk_pin(uuid, text) to anon, authenticated;
