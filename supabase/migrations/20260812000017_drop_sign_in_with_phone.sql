-- sign_in_with_phone 정리.
--
-- kiosk_check_in(20260812000010) 이 완전히 대체했다. 클라이언트 쪽 실제 호출부
-- (.rpc('sign_in_with_phone')) 가 0건임을 확인한 뒤에 지운다.
--
-- 이 함수는 "전화번호만 알면 로그인된다"는, README 에 명시돼 있던 알려진 보안
-- 부채였다. kiosk_check_in 은 이름·전화번호·포인트 같은 개인정보를 전혀 돌려
-- 주지 않으므로, 이 함수를 지우는 순간 그 부채도 함께 없어진다.

drop function if exists public.sign_in_with_phone(uuid, text, jsonb);
