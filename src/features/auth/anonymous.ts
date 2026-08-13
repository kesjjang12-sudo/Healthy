import { joinGym } from '@/features/gym-membership/api';
import type { User } from '@/lib/database.types';
import { LEGACY_APT_ID } from '@/lib/env';
import { supabase } from '@/lib/supabase';

/**
 * "아직 아무것도 아닌 계정"인지.
 *
 * bootstrap_oauth_profile 은 세션만 있으면 users 행을 만든다 — 익명 세션도
 * 예외가 아니다. 그래서 페어링을 중간에 그만두거나 정리(signOut)가 네트워크
 * 문제로 실패하면, 로그인한 적 없는 사람에게 빈 프로필이 남는다. 그 행이
 * 남아 있으면 로그인 화면은 "로그인된 사람"으로 보고 설문으로 넘겨버린다.
 *
 * 전화번호가 붙었으면(페어링 완료) 또는 설문을 마쳤으면 실체가 있는 계정이다.
 * 카카오/구글 계정은 둘 다 없어도 실체가 있으므로, 이 판정은 반드시 익명
 * 세션인지와 함께 봐야 한다 — 이 함수만으로 지우면 갓 가입한 카카오 회원이
 * 날아간다.
 */
export function isEmptyProfile(user: User | null): boolean {
  if (!user) return true;
  return !user.phone_number && !user.profile_data?.onboarded_at;
}

/**
 * ensureSessionForPairing 이 이번 호출에서 세션을 새로 만들었는지.
 * 페어링이 실패했을 때 되돌릴 대상을 가리는 데 쓴다 — 원래 로그인돼 있던
 * 사람(카카오 등)을 실패했다고 로그아웃시키면 안 되기 때문이다.
 */
export type PairingSessionStart = { createdSession: boolean };

/**
 * QR/코드 페어링 직전에 호출한다.
 *
 * 카카오·구글 없이 "전화번호로 로그인"을 고른 사람도 페어링 RPC(complete_pairing)
 * 가 auth.uid() 로 신원을 확인할 수 있어야 한다. signInAnonymously 로 진짜 GoTrue
 * 세션을 만들어 그 역할을 하게 한다 — 이 세션이 그대로 계정이 될 수도 있고
 * (전화번호만으로 계속 쓰는 사람), 나중에 카카오/구글을 연결해 격상시킬 수도 있다.
 *
 * 이미 세션이 있으면(카카오로 로그인한 상태에서 페어링만 추가로 하는 경우)
 * 새로 만들지 않고 그대로 둔다 — 그래야 complete_pairing 이 "이미 있는 계정에
 * 그림자 계정을 합친다"는 올바른 경로를 탄다.
 *
 * ⚠️ 화면에 들어오자마자 부르지 말 것. 실제로 페어링을 시도하는 순간에만
 * 부르고, 실패하면 discardSessionIfCreated 로 되돌려야 한다.
 */
export async function ensureSessionForPairing(): Promise<PairingSessionStart> {
  const { data } = await supabase.auth.getSession();
  if (data.session) return { createdSession: false };

  const { error } = await supabase.auth.signInAnonymously();
  if (error) {
    throw new Error('연결을 시작하지 못했습니다. 다시 시도해 주세요.');
  }
  return { createdSession: true };
}

/**
 * 페어링이 끝내 실패했을 때 이 시도에서 만든 임시 세션만 정리한다.
 *
 * 이게 없으면 QR 인증에 실패하거나 도중에 뒤로 나가도 세션이 남아서,
 * 로그인도 안 한 사람이 "로그인된 상태"가 된다 — 로그인 화면이 그걸 보고
 * 곧장 온보딩(설문)으로 넘겨버리는 문제가 실제로 있었다.
 */
export async function discardSessionIfCreated(
  start: PairingSessionStart | null,
): Promise<void> {
  if (!start?.createdSession) return;
  await supabase.auth.signOut();
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
  await ensureSessionForPairing();

  // 세션만 만들면 users.apt_id 가 null 이라 루틴이 0개로 나온다 — 루틴은
  // "이 단지에 있는 기구"로 짜이는데 소속이 없으면 기구가 하나도 안 잡힌다.
  // 테스트 계정은 태블릿에 갈 일이 없으니 여기서 바로 소속을 붙여 준다.
  //
  // 프로필은 bootstrap_oauth_profile 이 만든다. auth-session 이 세션 변화를
  // 감지해 그걸 부르는데, join_gym 은 users 행이 이미 있어야 하므로
  // (USER_NOT_FOUND) 순서를 여기서 확실히 해 둔다.
  await supabase.rpc('bootstrap_oauth_profile');

  // 소속 붙이기가 실패해도 로그인 자체는 살린다.
  //
  // join_gym 은 서버에 마이그레이션이 올라가야 존재하는 함수다. 아직 안 올린
  // 상태에서 이걸 그냥 await 하면 함수가 없다는 오류가 그대로 올라와,
  // "테스트 로그인에 실패했습니다"가 뜨고 로그인 자체를 못 하게 된다 —
  // 소속이 없으면 루틴이 비는 것뿐인데 그것 때문에 문을 막을 이유가 없다.
  // 루틴이 비면 운동 탭이 이유를 설명해 준다.
  // 시범단지 id 는 이제 필수 env 가 아니다(태블릿이 등록 코드로 단지를 정한다).
  // 값이 비어 있으면 소속 없이 두고, 운동 탭이 이유를 설명하게 한다.
  if (LEGACY_APT_ID) await joinGym(LEGACY_APT_ID).catch(() => {});
}
