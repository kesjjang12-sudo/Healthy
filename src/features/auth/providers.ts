import type { SocialProvider } from '@/components/social-button';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/lib/env';

/**
 * 서버에 실제로 켜져 있는 로그인 수단.
 *
 * 왜 물어봐야 하는가: Supabase JS 의 signInWithOAuth 는 인가 URL 을 **클라이언트에서
 * 조립해서** 돌려준다. 그래서 카카오·구글이 대시보드에서 꺼져 있어도 그 시점에는
 * 아무 오류가 안 나고, 브라우저가 열린 뒤에야 "Unsupported provider" 를 만난다.
 * 회원 입장에서는 버튼을 눌렀는데 낯선 영문 오류 화면이 뜨는 셈이다.
 *
 * 그래서 로그인 화면을 열 때 한 번 물어보고, 안 켜진 수단은 아예 안 보여준다.
 * 대시보드에서 카카오를 켜는 순간 앱 재배포 없이 버튼이 나타난다.
 *
 * 못 물어봤으면(네트워크 문제 등) 전부 보여준다 — 확인이 안 된다고 로그인 수단을
 * 숨기면 들어올 방법이 사라진다. 숨기는 것은 "꺼져 있다고 확인된" 경우뿐이다.
 */
export type AvailableProviders = Record<SocialProvider, boolean>;

const ALL_ON: AvailableProviders = { kakao: true, google: true, phone: true };

let cached: AvailableProviders | null = null;

export async function fetchAvailableProviders(): Promise<AvailableProviders> {
  if (cached) return cached;

  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: SUPABASE_ANON_KEY },
    });
    if (!response.ok) return ALL_ON;

    const body = (await response.json()) as { external?: Record<string, boolean> };
    const external = body.external;
    if (!external) return ALL_ON;

    cached = {
      kakao: external.kakao !== false,
      google: external.google !== false,
      // 문자 로그인은 external.phone 이 아니라 GoTrue 의 phone 설정을 따른다.
      // 값이 없으면 켜진 것으로 본다(우리 서버는 켜져 있다).
      phone: external.phone !== false,
    };
    return cached;
  } catch {
    return ALL_ON;
  }
}
