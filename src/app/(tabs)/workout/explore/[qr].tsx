import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/primary-button';
import { Colors, FontSize, LetterSpacing, Radius, Spacing } from '@/constants/theme';
import { EquipmentError, getEquipmentByQr } from '@/features/equipment/api';
import { FIRST_TIME_RULE, HOW_TO_STEPS, WEIGHT_RULE } from '@/features/routine/guidance';
import type { EquipmentLookup } from '@/lib/database.types';

/**
 * 오늘 루틴에는 없지만 QR로 찍어본 기구를 보여주는 탐색 전용 화면.
 *
 * workout/[id] 와 다르게 세트 진행·쉬는 시간·기록 저장이 없다 — 처방된
 * 목표 무게/세트/횟수가 없어서 진행시킬 값 자체가 없다(daily_routines 에
 * 이 기구의 행이 없다). "궁금해서 보는" 용도로 설명과 하는 방법, 영상만
 * 보여주고, 실제로 해보고 싶으면 트레이너에게 처방을 요청하도록 안내한다.
 *
 * 완료 기록/포인트를 여기서 주지 않는 것도 의도적이다 — 처방 없이 아무
 * 기구나 "완료" 처리할 수 있게 하면 포인트가 더 쉽게 조작 가능해진다
 * (랭킹을 출석 기준으로 바꾼 것과 같은 이유).
 */
export default function EquipmentExploreScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // from=guide 로 오면 QR 을 찍은 게 아니라 "기구 사용법 모아보기" 목록에서
  // 골라 들어온 것이다 — "오늘 루틴에 없는 운동" 경고 대신 QR 안내를 띄운다.
  const { qr, from } = useLocalSearchParams<{ qr: string; from?: string }>();
  const fromGuide = from === 'guide';

  const [equipment, setEquipment] = useState<EquipmentLookup | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!qr) return;
    let cancelled = false;

    setIsLoading(true);
    setErrorMessage(null);

    getEquipmentByQr(qr)
      .then((data) => {
        if (!cancelled) setEquipment(data);
      })
      .catch((error) => {
        if (cancelled) return;
        setErrorMessage(error instanceof EquipmentError ? error.message : '잠시 후 다시 시도해 주세요.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [qr]);

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/workout');
  };

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (errorMessage || !equipment) {
    return (
      <View style={styles.screen}>
        <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.xl }]}>
          <View style={styles.errorBox}>
            <Text style={styles.errorText} maxFontSizeMultiplier={1.3} accessibilityLiveRegion="polite">
              {errorMessage ?? '이 QR 은 등록된 기구가 아닙니다.'}
            </Text>
          </View>
        </ScrollView>
        <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.lg }]}>
          <PrimaryButton label="운동 목록으로" onPress={goBack} />
        </View>
      </View>
    );
  }

  const openVideo = () => {
    void Linking.openURL(equipment.video_url).catch(() => {});
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.xl }]}>
        <View style={styles.notice}>
          <Text style={styles.noticeText} maxFontSizeMultiplier={1.3}>
            {fromGuide
              ? '헬스장에서 이 기구 앞에 붙은 QR 을 찍어도 이 화면이 바로 열립니다.'
              : '오늘 루틴에는 없는 운동입니다. 궁금해서 보시는 거라면 자유롭게 살펴보세요.'}
          </Text>
        </View>

        <View style={styles.headings}>
          {equipment.target_muscle ? (
            <Text style={styles.eyebrow} maxFontSizeMultiplier={1.3}>
              {equipment.target_muscle} 운동
            </Text>
          ) : null}
          <Text style={styles.title} maxFontSizeMultiplier={1.2}>
            {equipment.name}
          </Text>
          {equipment.description ? (
            <Text style={styles.description} maxFontSizeMultiplier={1.3}>
              {equipment.description}
            </Text>
          ) : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle} maxFontSizeMultiplier={1.2}>
            하는 방법
          </Text>
          <View style={styles.steps}>
            {HOW_TO_STEPS.map((step, index) => (
              <View key={step} style={styles.step}>
                <View style={styles.stepBadge}>
                  <Text style={styles.stepNumber} maxFontSizeMultiplier={1.2}>
                    {index + 1}
                  </Text>
                </View>
                <Text style={styles.stepText} maxFontSizeMultiplier={1.3}>
                  {step}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle} maxFontSizeMultiplier={1.2}>
            무게 고르는 법
          </Text>
          <View style={styles.hintBox}>
            <Text style={styles.hintStrong} maxFontSizeMultiplier={1.3}>
              {equipment.base_weight_kg === null
                ? '기구에 무게가 없는 운동입니다. 몸으로만 천천히 하세요.'
                : `${equipment.base_weight_kg}kg 근처가 일반적인 시작 무게입니다.`}
            </Text>
            <Text style={styles.hintText} maxFontSizeMultiplier={1.3}>
              오늘 처방된 운동이 아니라 개인 맞춤 무게는 알려드릴 수 없어요. 직접 해보고 싶으시면
              트레이너에게 처방을 요청해 주세요.
            </Text>
            <Text style={styles.hintText} maxFontSizeMultiplier={1.3}>
              {WEIGHT_RULE}
            </Text>
            <Text style={styles.hintText} maxFontSizeMultiplier={1.3}>
              {FIRST_TIME_RULE}
            </Text>
          </View>
        </View>

        <Text style={styles.footNote} maxFontSizeMultiplier={1.3}>
          아프거나 어지러우면 바로 멈추고 관리사무소에 알려주세요.
        </Text>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.lg }]}>
        <PrimaryButton label="영상으로 보기" variant="secondary" onPress={openVideo} />
        <PrimaryButton
          label={fromGuide ? '기구 목록으로' : '운동 목록으로'}
          variant="quiet"
          size="compact"
          onPress={goBack}
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
    flexGrow: 1,
    gap: Spacing.xl,
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xl,
    maxWidth: 900,
    width: '100%',
    alignSelf: 'center',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
  },
  notice: {
    padding: Spacing.lg,
    borderRadius: Radius.md,
    backgroundColor: Colors.primaryFaint,
  },
  noticeText: {
    fontSize: FontSize.caption,
    fontWeight: '600',
    letterSpacing: LetterSpacing.body,
    lineHeight: FontSize.caption * 1.55,
    color: Colors.primary,
  },
  headings: {
    gap: Spacing.sm,
  },
  eyebrow: {
    fontSize: FontSize.caption,
    fontWeight: '600',
    letterSpacing: LetterSpacing.body,
    color: Colors.primary,
  },
  title: {
    fontSize: FontSize.title,
    fontWeight: '700',
    lineHeight: FontSize.title * 1.3,
    letterSpacing: LetterSpacing.title,
    color: Colors.text,
  },
  description: {
    fontSize: FontSize.body,
    fontWeight: '500',
    lineHeight: FontSize.body * 1.5,
    letterSpacing: LetterSpacing.body,
    color: Colors.textSecondary,
  },
  section: {
    gap: Spacing.md,
  },
  sectionTitle: {
    fontSize: FontSize.body,
    fontWeight: '700',
    letterSpacing: LetterSpacing.subtitle,
    color: Colors.text,
  },
  steps: {
    gap: Spacing.sm,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
  },
  stepBadge: {
    flexShrink: 0,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.full,
    backgroundColor: Colors.background,
  },
  stepNumber: {
    fontSize: FontSize.body,
    fontWeight: '700',
    letterSpacing: LetterSpacing.body,
    color: Colors.primary,
  },
  stepText: {
    flex: 1,
    fontSize: FontSize.body,
    fontWeight: '500',
    lineHeight: FontSize.body * 1.5,
    letterSpacing: LetterSpacing.body,
    color: Colors.text,
  },
  hintBox: {
    gap: Spacing.md,
    padding: Spacing.xl,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
  },
  hintStrong: {
    fontSize: FontSize.subtitle,
    fontWeight: '700',
    letterSpacing: LetterSpacing.subtitle,
    color: Colors.text,
  },
  hintText: {
    fontSize: FontSize.body,
    fontWeight: '500',
    lineHeight: FontSize.body * 1.5,
    letterSpacing: LetterSpacing.body,
    color: Colors.textSecondary,
  },
  footNote: {
    fontSize: FontSize.caption,
    fontWeight: '500',
    lineHeight: FontSize.caption * 1.55,
    letterSpacing: LetterSpacing.body,
    color: Colors.textTertiary,
    textAlign: 'center',
  },
  errorBox: {
    gap: Spacing.lg,
    padding: Spacing.xl,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
  },
  errorText: {
    fontSize: FontSize.body,
    fontWeight: '600',
    letterSpacing: LetterSpacing.body,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  footer: {
    gap: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    backgroundColor: Colors.background,
    maxWidth: 900,
    width: '100%',
    alignSelf: 'center',
  },
});
