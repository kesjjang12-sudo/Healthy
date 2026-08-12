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
