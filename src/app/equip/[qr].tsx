import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, FontSize, LetterSpacing, Spacing } from '@/constants/theme';
import { useAuthSession } from '@/features/auth/auth-session';
import { resolveEquipmentQr } from '@/features/equipment/resolve';
import { loadDailyRoutine } from '@/features/routine/api';

/**
 * 시스템 카메라 앱으로 기구 QR 을 찍었을 때 열리는 딥링크 수신 화면
 * (fitroutine://equip/<code>). 앱 안의 스캐너(workout/scan.tsx)를 거치지
 * 않고 바로 코드를 받으므로, 여기서 오늘 루틴과 일치하는지 판단해서
 * 처방 화면/탐색 화면 중 하나로 곧장 보낸다.
 *
 * 로그인이 안 되어 있으면 개인화(오늘 루틴 대조)를 할 수 없다 — 로그인
 * 화면으로 보낸다. 로그인 뒤 원래 찍은 QR 로 자동으로 돌아오는 기능은
 * 아직 없다(로그인 뒤 딥링크 이어가기는 이번 범위 밖 — 하단 참고).
 */
export default function EquipmentDeepLinkScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, isRestoring } = useAuthSession();
  const { qr } = useLocalSearchParams<{ qr: string }>();
  const hasStarted = useRef(false);

  useEffect(() => {
    if (isRestoring || !qr || hasStarted.current) return;

    if (!user) {
      router.replace('/login');
      return;
    }
    if (!user.profile_data?.onboarded_at) {
      router.replace('/onboarding');
      return;
    }

    hasStarted.current = true;

    void (async () => {
      try {
        const dailyRoutine = await loadDailyRoutine(user.id);
        const resolution = resolveEquipmentQr(qr, dailyRoutine);
        if (resolution.kind === 'prescribed') {
          router.replace(`/workout/${resolution.routineId}`);
        } else {
          router.replace(`/workout/explore/${encodeURIComponent(qr)}`);
        }
      } catch {
        // 루틴 대조에 실패해도 탐색 화면 자체는 별도로 다시 조회하니 못 열 이유가
        // 없다 — 처방 일치 여부만 못 가렸을 뿐이라 탐색 화면으로 보낸다.
        router.replace(`/workout/explore/${encodeURIComponent(qr)}`);
      }
    })();
  }, [isRestoring, qr, router, user]);

  return (
    <View style={[styles.centered, { paddingTop: insets.top }]}>
      <ActivityIndicator size="large" color={Colors.primary} />
      <Text style={styles.helper} maxFontSizeMultiplier={1.3}>
        기구 정보를 불러오는 중입니다
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.background,
    paddingHorizontal: Spacing.xl,
  },
  helper: {
    fontSize: FontSize.body,
    fontWeight: '500',
    letterSpacing: LetterSpacing.body,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
});
