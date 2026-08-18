import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';

import { Text } from '@/components/app-text';
import { Colors, FontSize, LetterSpacing, Spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

/**
 * 카카오·구글 로그인이 끝나고 돌아오는 자리.
 *
 * 네이티브에서는 이 화면이 뜨지 않는다 — WebBrowser.openAuthSessionAsync 가
 * 돌아오는 주소를 가로채서 oauth.ts 가 직접 코드를 교환하기 때문이다.
 * 그런데 **웹(PWA)에서는** 로그인 창이 이 주소로 실제 이동하고, 여기에 화면이
 * 없으면 404 를 만난다. 그 자리가 비어 있었다.
 *
 * 두 경우를 갈라서 처리한다.
 * - 팝업으로 열린 경우(window.opener 있음): 아무것도 안 한다. 코드 교환은
 *   창을 띄운 쪽이 한다. 여기서도 교환하면 같은 인가 코드를 두 번 쓰게 되고,
 *   둘 중 하나는 반드시 실패한다.
 * - 주 창에서 여기로 온 경우: 교환할 사람이 없으므로 직접 한다.
 */
export default function AuthCallbackScreen() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    const finish = async () => {
      try {
        if (Platform.OS !== 'web') {
          router.replace('/');
          return;
        }

        // 팝업이면 띄운 쪽이 처리한다. 우리는 가만히 있는다.
        if (typeof window !== 'undefined' && window.opener) return;

        const code = new URL(window.location.href).searchParams.get('code');
        if (code) await supabase.auth.exchangeCodeForSession(code);
      } catch {
        // 실패해도 로그인 화면으로 돌려보내면 다시 시도할 수 있다.
      } finally {
        // /login 이 아니라 첫 화면(/)으로 보낸다. login 은 기기 역할이 '개인'일
        // 때만 존재하는 AuthSessionProvider 를 쓰는데, 저장소를 비운 브라우저처럼
        // 역할이 아직 없는 상태로 여기 닿으면 그대로 빈 화면이 된다.
        // '/' 는 역할부터 판단해 갈 곳을 정해 주는 자리다.
        if (!cancelled) router.replace('/');
      }
    };

    void finish();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <View style={styles.screen}>
      <ActivityIndicator size="large" color={Colors.primary} />
      <Text style={styles.text} maxFontSizeMultiplier={1.3}>
        로그인 중입니다
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.lg,
    backgroundColor: Colors.background,
  },
  text: {
    fontSize: FontSize.subtitle,
    fontWeight: '600',
    letterSpacing: LetterSpacing.subtitle,
    color: Colors.textSecondary,
  },
});
