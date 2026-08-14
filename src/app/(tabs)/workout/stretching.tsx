import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/app-text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/primary-button';
import { Colors, FontSize, LetterSpacing, Radius, Spacing } from '@/constants/theme';
import {
  COOL_DOWN_STRETCHES,
  STRETCHING_SAFETY_RULE,
  STRETCHING_TIMING_RULE,
  WARM_UP_STRETCHES,
  type Stretch,
} from '@/features/content/stretching';

/**
 * 스트레칭 안내 화면. 오늘 루틴과 달리 매일 바뀌지 않는 고정 참고 자료라
 * 운동 탭에서 언제든 펼쳐 볼 수 있게 별도 화면으로 뺐다.
 */
export default function StretchingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.xl }]}>
        <View style={styles.headings}>
          <Text style={styles.title} maxFontSizeMultiplier={1.2}>
            스트레칭
          </Text>
          <Text style={styles.helper} maxFontSizeMultiplier={1.3}>
            {STRETCHING_TIMING_RULE}
          </Text>
        </View>

        <StretchSection title="운동 전 (몸 풀기)" items={WARM_UP_STRETCHES} />
        <StretchSection title="운동 후 (마무리)" items={COOL_DOWN_STRETCHES} />

        <View style={styles.notice}>
          <Text style={styles.noticeText} maxFontSizeMultiplier={1.3}>
            {STRETCHING_SAFETY_RULE}
          </Text>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.lg }]}>
        <PrimaryButton label="운동 목록으로" onPress={() => router.back()} />
      </View>
    </View>
  );
}

function StretchSection({ title, items }: { title: string; items: readonly Stretch[] }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle} maxFontSizeMultiplier={1.2}>
        {title}
      </Text>
      <View style={styles.cards}>
        {items.map((stretch) => (
          <View key={stretch.name} style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardName} maxFontSizeMultiplier={1.3}>
                {stretch.name}
              </Text>
              {stretch.hold ? (
                <Text style={styles.cardHold} maxFontSizeMultiplier={1.3}>
                  {stretch.hold}
                </Text>
              ) : null}
            </View>
            <View style={styles.steps}>
              {stretch.steps.map((step, index) => (
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
        ))}
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
    gap: Spacing.xxl,
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xl,
    maxWidth: 900,
    width: '100%',
    alignSelf: 'center',
  },
  headings: {
    gap: Spacing.sm,
  },
  title: {
    fontSize: FontSize.title,
    fontWeight: '700',
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
  section: {
    gap: Spacing.md,
  },
  sectionTitle: {
    fontSize: FontSize.body,
    fontWeight: '700',
    letterSpacing: LetterSpacing.subtitle,
    color: Colors.text,
  },
  cards: {
    gap: Spacing.md,
  },
  card: {
    gap: Spacing.md,
    padding: Spacing.xl,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  cardName: {
    flex: 1,
    fontSize: FontSize.subtitle,
    fontWeight: '700',
    letterSpacing: LetterSpacing.subtitle,
    color: Colors.text,
  },
  cardHold: {
    fontSize: FontSize.caption,
    fontWeight: '700',
    letterSpacing: LetterSpacing.body,
    color: Colors.primary,
  },
  steps: {
    gap: Spacing.sm,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  stepBadge: {
    flexShrink: 0,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.full,
    backgroundColor: Colors.background,
  },
  stepNumber: {
    fontSize: FontSize.caption,
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
  notice: {
    padding: Spacing.lg,
    borderRadius: Radius.md,
    backgroundColor: Colors.dangerFaint,
  },
  noticeText: {
    fontSize: FontSize.caption,
    fontWeight: '600',
    letterSpacing: LetterSpacing.body,
    lineHeight: FontSize.caption * 1.55,
    color: Colors.danger,
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
