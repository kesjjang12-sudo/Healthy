import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/app-text';
import { BackButton } from '@/components/back-button';
import { GrowthBadge } from '@/components/growth-badge';
import { Colors, FontSize, LetterSpacing, Radius, Spacing } from '@/constants/theme';
import { useAuthSession } from '@/features/auth/auth-session';
import { GROWTH_LEVELS, growthStatus } from '@/features/growth/levels';

/**
 * 받침에 맞는 주격 조사. "성실회원이 / 운동 고수가" — 하나로 고정하면
 * 호칭 절반이 어색해진다. 한글 음절은 (코드-0xAC00) % 28 이 0 이 아니면 받침이 있다.
 */
function subjectParticle(word: string): string {
  const last = word.charCodeAt(word.length - 1);
  if (last < 0xac00 || last > 0xd7a3) return '가';
  return (last - 0xac00) % 28 === 0 ? '가' : '이';
}

/**
 * 등급 안내 — 호칭 7단계 전체와 올라가는 법.
 *
 * 쇼핑앱 멤버십 등급 페이지의 문법(내 등급 카드 → 등급별 기준표)을 그대로
 * 쓴다. 위에는 내가 지금 어디인지와 다음까지 얼마 남았는지, 아래에는 7단계
 * 전체가 필요한 경험치와 함께 줄을 선다 — "천하장사는 3만 점"을 알아야
 * 그게 목표가 된다.
 */
export default function GrowthLevelsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuthSession();

  const xp = user?.total_points ?? 0;
  const status = growthStatus(xp);

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
        <BackButton onPress={() => (router.canGoBack() ? router.back() : router.replace('/profile'))} />
        <Text style={styles.headerTitle} maxFontSizeMultiplier={1.2}>
          등급 안내
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* 내 등급 카드 */}
        <View style={styles.myCard}>
          <View style={styles.myTop}>
            <GrowthBadge levelIndex={status.level.index} size={56} />
            <View style={styles.myTexts}>
              <Text style={styles.myLevel} maxFontSizeMultiplier={1.2}>
                {status.level.name}
              </Text>
              <Text style={styles.myXp} maxFontSizeMultiplier={1.2}>
                경험치 {xp.toLocaleString('ko-KR')}점
              </Text>
            </View>
          </View>

          {status.next ? (
            <>
              {/* 한 조각으로 만들어 넘긴다. 조각을 나누면 조각 끝 공백이
                  다듬어지면서 "쌓으면성실회원이" 처럼 붙는다. */}
              <Text style={styles.myNext} maxFontSizeMultiplier={1.3}>
                {`${status.remaining.toLocaleString('ko-KR')}점 더 쌓으면 ${status.next.name}${subjectParticle(status.next.name)} 돼요.`}
              </Text>
              <View style={styles.track}>
                <View
                  style={[styles.fill, { width: `${Math.max(status.progress * 100, 3)}%` }]}
                />
              </View>
              {/* 막대 양끝의 눈금. 지금 구간이 어디서 어디까지인지 숫자로 못 박는다. */}
              <View style={styles.scaleRow}>
                <Text style={styles.scaleLabel} maxFontSizeMultiplier={1.2}>
                  {status.level.minXp.toLocaleString('ko-KR')}점
                </Text>
                <Text style={styles.scaleLabel} maxFontSizeMultiplier={1.2}>
                  {status.next.minXp.toLocaleString('ko-KR')}점
                </Text>
              </View>
            </>
          ) : (
            <Text style={styles.myNext} maxFontSizeMultiplier={1.3}>
              가장 높은 호칭이에요. 대단하세요!
            </Text>
          )}
        </View>

        {/* 7단계 전체 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle} maxFontSizeMultiplier={1.2}>
            전체 등급
          </Text>
          <View style={styles.levels}>
            {GROWTH_LEVELS.map((level) => {
              const isMe = level.index === status.level.index;
              return (
                <View key={level.index} style={[styles.levelRow, isMe && styles.levelRowMe]}>
                  <GrowthBadge levelIndex={level.index} size={36} />
                  <Text
                    style={[styles.levelName, isMe && styles.levelNameMe]}
                    maxFontSizeMultiplier={1.3}>
                    {level.name}
                    {isMe ? ' (나)' : ''}
                  </Text>
                  <Text style={styles.levelXp} maxFontSizeMultiplier={1.2}>
                    {level.minXp === 0 ? '시작' : `${level.minXp.toLocaleString('ko-KR')}점`}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* 올라가는 법 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle} maxFontSizeMultiplier={1.2}>
            경험치 쌓는 법
          </Text>
          <View style={styles.earnBox}>
            <EarnRow label="헬스장 출석" points="+30점" />
            <EarnRow label="운동 1개 완료" points="+10점" />
            <EarnRow label="한 주 3번째 출석" points="+50점" />
          </View>
          <Text style={styles.footNote} sentenceBreak maxFontSizeMultiplier={1.3}>
            무거운 무게가 아니라 꾸준함이 올려 줘요. 주 3번씩 나오면 한 주에 190점씩 쌓여요.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

function EarnRow({ label, points }: { label: string; points: string }) {
  return (
    <View style={styles.earnRow}>
      <Text style={styles.earnLabel} maxFontSizeMultiplier={1.3}>
        {label}
      </Text>
      <Text style={styles.earnPoints} maxFontSizeMultiplier={1.2}>
        {points}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  headerTitle: {
    fontSize: FontSize.section,
    fontWeight: '700',
    letterSpacing: LetterSpacing.subtitle,
    color: Colors.text,
  },
  content: {
    flexGrow: 1,
    gap: Spacing.xxl,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xxl,
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
  },
  myCard: {
    gap: Spacing.md,
    padding: Spacing.xl,
    borderRadius: Radius.lg,
    backgroundColor: Colors.primaryFaint,
  },
  myTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
  },
  myTexts: {
    flex: 1,
    gap: 2,
  },
  myLevel: {
    fontSize: FontSize.title,
    fontWeight: '700',
    letterSpacing: LetterSpacing.title,
    color: Colors.text,
  },
  myXp: {
    fontSize: FontSize.caption,
    fontWeight: '600',
    letterSpacing: LetterSpacing.body,
    color: Colors.primaryPressed,
  },
  myNext: {
    fontSize: FontSize.body,
    fontWeight: '600',
    lineHeight: FontSize.body * 1.5,
    letterSpacing: LetterSpacing.body,
    color: Colors.text,
  },
  track: {
    height: 10,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(0, 102, 255, 0.16)',
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: Radius.full,
    backgroundColor: Colors.primary,
  },
  scaleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -Spacing.xs,
  },
  scaleLabel: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: LetterSpacing.body,
    color: Colors.primaryPressed,
    fontVariant: ['tabular-nums'],
  },
  section: {
    gap: Spacing.md,
  },
  sectionTitle: {
    fontSize: FontSize.caption,
    fontWeight: '700',
    letterSpacing: LetterSpacing.body,
    color: Colors.text,
  },
  levels: {
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xs,
  },
  levelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.grey[100],
  },
  levelRowMe: {
    borderBottomColor: 'transparent',
  },
  levelName: {
    flex: 1,
    fontSize: FontSize.body,
    fontWeight: '600',
    letterSpacing: LetterSpacing.body,
    color: Colors.text,
  },
  levelNameMe: {
    color: Colors.primary,
    fontWeight: '700',
  },
  levelXp: {
    fontSize: FontSize.body,
    fontWeight: '700',
    letterSpacing: LetterSpacing.body,
    color: Colors.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  earnBox: {
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xs,
  },
  earnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
  },
  earnLabel: {
    fontSize: FontSize.body,
    fontWeight: '600',
    letterSpacing: LetterSpacing.body,
    color: Colors.text,
  },
  earnPoints: {
    fontSize: FontSize.body,
    fontWeight: '700',
    color: Colors.primary,
    fontVariant: ['tabular-nums'],
  },
  footNote: {
    fontSize: FontSize.caption,
    fontWeight: '500',
    lineHeight: FontSize.caption * 1.7,
    letterSpacing: LetterSpacing.body,
    color: Colors.textTertiary,
  },
});
