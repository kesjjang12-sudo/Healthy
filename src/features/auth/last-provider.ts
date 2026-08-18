import AsyncStorage from '@react-native-async-storage/async-storage';

import type { SocialProvider } from '@/components/social-button';

/**
 * 지난번에 어느 수단으로 들어왔는지 기억한다.
 *
 * 로그인 수단이 셋이 되면 "나 저번에 뭘로 했더라"가 실제 문제가 된다. 잘못
 * 고르면 로그인이 아니라 **새 계정이 하나 더 생기고**, 그때까지 쌓은 출석과
 * 호칭이 통째로 안 보이게 된다. 4060 회원에게는 이게 "앱이 내 기록을 잃어
 * 버렸다"로 읽힌다. 그래서 앱이 대신 기억해 두고 그 버튼에 표를 달아 준다.
 *
 * 이 값은 편의를 위한 힌트일 뿐 인증에 쓰지 않는다. 지워지거나 틀려도
 * 로그인 자체에는 아무 영향이 없다.
 */
const STORAGE_KEY = 'fitroutine.last-login-provider.v1';

function isProvider(value: unknown): value is SocialProvider {
  return value === 'kakao' || value === 'google' || value === 'phone';
}

export async function loadLastProvider(): Promise<SocialProvider | null> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    return isProvider(stored) ? stored : null;
  } catch {
    return null;
  }
}

/**
 * 누른 시점에 기록한다. 로그인 성공을 기다리지 않는 이유: 카카오·구글은
 * 브라우저로 나갔다 돌아오는 흐름이라 성공 시점을 이 화면에서 못 볼 때가
 * 있다. 실패해도 "방금 그걸 눌렀다"는 힌트는 여전히 맞다.
 */
export function rememberProvider(provider: SocialProvider): void {
  void AsyncStorage.setItem(STORAGE_KEY, provider).catch(() => {});
}
