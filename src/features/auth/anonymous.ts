import { supabase } from '@/lib/supabase';

/**
 * QR/코드 페어링 흐름 전에 호출한다.
 *
 * 카카오·구글 없이 "전화번호로 로그인"을 고른 사람도 페어링 RPC(complete_pairing)
 * 가 auth.uid() 로 신원을 확인할 수 있어야 한다. signInAnonymously 로 진짜 GoTrue
 * 세션을 만들어 그 역할을 하게 한다 — 이 세션이 그대로 계정이 될 수도 있고
 * (전화번호만으로 계속 쓰는 사람), 나중에 카카오/구글을 연결해 격상시킬 수도 있다.
 *
 * 이미 세션이 있으면(카카오로 로그인한 상태에서 페어링만 추가로 하는 경우)
 * 새로 만들지 않고 그대로 둔다 — 그래야 complete_pairing 이 "이미 있는 계정에
 * 그림자 계정을 합친다"는 올바른 경로를 탄다.
 */
export async function ensureSessionForPairing(): Promise<void> {
  const { data } = await supabase.auth.getSession();
  if (data.session) return;

  const { error } = await supabase.auth.signInAnonymously();
  if (error) {
    throw new Error('연결을 시작하지 못했습니다. 다시 시도해 주세요.');
  }
}

/**
 * 로그인 화면의 "테스트 계정으로 시작하기" 버튼용.
 *
 * 카카오/구글은 Supabase 대시보드에 OAuth 앱을 등록해야 뜨고(README 참고),
 * 전화번호 로그인은 옆에 페어링해 줄 키오스크가 있어야 한다 — 둘 다 없으면
 * 개인 앱을 테스트할 방법이 아예 없다. ensureSessionForPairing 과 구현은
 * 같다(익명 세션만 만든다) — bootstrap_oauth_profile 은 auth.uid() 만
 * 있으면 익명이든 카카오든 구분 없이 프로필을 만들어 주므로, 세션만
 * 생기면 auth-session.tsx 가 알아서 프로필을 불러와 온보딩으로 보낸다.
 *
 * ⚠️ 실제 출시 전에는 로그인 화면에서 이 버튼을 빼야 한다 — 지금은 다른
 * 로그인 수단이 다 막혀 있어 개발 중 테스트용으로 급하게 열어 둔 경로다.
 */
export async function signInAsTestUser(): Promise<void> {
  return ensureSessionForPairing();
}
