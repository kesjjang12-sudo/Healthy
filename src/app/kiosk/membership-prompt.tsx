import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/primary-button';
import { Colors, FontSize, LetterSpacing, Spacing } from '@/constants/theme';
import { useDeviceRole } from '@/features/device-role/context';
import { GymMembershipError, makeGymPrimary } from '@/features/gym-membership/api';

/**
 * 이미 폰 앱과 연결된 사람이 다른 단지가 주 소속인 채로 이 헬스장에 처음
 * 체크인했을 때 뜬다. 이사 대응의 핵심 화면 — "여기로 옮기셨나요?" 를
 * 체크인 직후 바로 물어봐야, 안 물어보고 넘어가면 다음엔 또 안 묻고
 * 지나가기 쉽다.
 *
 * 여기서도 confirm_gym_membership 을 anon 키로 그대로 호출한다 — 페어링
 * 여부와 무관하게 키오스크는 세션이 없으니, 이 RPC 는 auth.uid() 가 없을
 * 때 소유권 검사를 건너뛰도록 이미 설계돼 있다.
 */
export default function KioskMembershipPromptScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { role, isLoading: isRoleLoading } = useDeviceRole();
  const { userId, aptId } = useLocalSearchParams<{ userId: string; aptId: string }>();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const respond = useCallback(
    async (makePrimary: boolean) => {
      setIsSubmitting(true);
      setErrorMessage(null);

      try {
        if (makePrimary) await makeGymPrimary(userId, aptId);
        router.replace('/kiosk/checkin');
      } catch (error) {
        setErrorMessage(
          error instanceof GymMembershipError ? error.message : '잠시 후 다시 시도해 주세요.',
        );
        setIsSubmitting(false);
      }
    },
    [userId, aptId, router],
  );

  if (!isRoleLoading && role !== 'kiosk') {
    return <Redirect href="/device-setup" />;
  }
  if (!userId || !aptId) {
    return <Redirect href="/kiosk/checkin" />;
  }

  return (
    <View style={styles.screen}>
      <View style={[styles.content, { paddingTop: insets.top + Spacing.xxl }]}>
        <Text style={styles.title} maxFontSizeMultiplier={1.2}>
          이 헬스장으로{'\n'}옮기셨나요?
        </Text>
        <Text style={styles.helper} maxFontSizeMultiplier={1.3}>
          이사하셨다면 다음부터 여기가 기본으로 뜨게 바꿔드릴게요. 오늘만 오신 거면 그냥
          두세요 — 나중에 폰 앱에서도 바꿀 수 있습니다.
        </Text>

        {errorMessage ? (
          <Text
            style={styles.errorText}
            maxFontSizeMultiplier={1.3}
            accessibilityLiveRegion="polite">
            {errorMessage}
          </Text>
        ) : null}
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.lg }]}>
        <PrimaryButton
          label="네, 여기로 옮겼어요"
          onPress={() => void respond(true)}
          loading={isSubmitting}
        />
        <PrimaryButton
          label="오늘만 방문했어요"
          variant="secondary"
          onPress={() => void respond(false)}
          disabled={isSubmitting}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    gap: Spacing.lg,
    paddingHorizontal: Spacing.xl,
    maxWidth: 700,
    width: '100%',
    alignSelf: 'center',
  },
  title: {
    fontSize: FontSize.title,
    fontWeight: '700',
    lineHeight: FontSize.title * 1.3,
    letterSpacing: LetterSpacing.title,
    color: Colors.text,
  },
  helper: {
    fontSize: FontSize.body,
    fontWeight: '500',
    lineHeight: FontSize.body * 1.5,
    letterSpacing: LetterSpacing.body,
    color: Colors.textSecondary,
  },
  errorText: {
    fontSize: FontSize.caption,
    fontWeight: '600',
    letterSpacing: LetterSpacing.body,
    color: Colors.danger,
  },
  footer: {
    gap: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    backgroundColor: Colors.background,
    maxWidth: 700,
    width: '100%',
    alignSelf: 'center',
  },
});
