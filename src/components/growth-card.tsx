import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/app-text';
import { GrowthBadge } from '@/components/growth-badge';
import { Colors, FontSize, LetterSpacing, Radius, Spacing } from '@/constants/theme';
import { growthStatus } from '@/features/growth/levels';

/**
 * 운동 홈의 성장 카드.
 *
 * "내 포인트 1,240점"은 쌓이기만 하고 어디로도 안 가는 숫자였다. 같은 값을
 * 명예 호칭(새내기 → 천하장사)으로 읽어 주면 "다음 호칭까지 220점"이라는
 * 목표가 생긴다 — 무게가 아니라 꾸준함(출석·완료·주 3회)으로만 오르는
 * 호칭이라, 앱이 평가하는 것이 무엇인지도 이 카드가 말해 준다.
 */
export function GrowthCard({ xp }: { xp: number }) {
  const status = growthStatus(xp);

  return (
    <View
      style={styles.card}
      accessibilityLabel={
        status.next
          ? `내 호칭 ${status.level.name}. 경험치 ${xp}점. 다음 호칭 ${status.next.name}까지 ${status.remaining}점 남았어요.`
          : `내 호칭 ${status.level.name}. 경험치 ${xp}점. 가장 높은 호칭이에요.`
      }>
      <View style={styles.top}>
        <GrowthBadge levelIndex={status.level.index} size={44} />
        <View style={styles.titles}>
          <Text style={styles.levelName} maxFontSizeMultiplier={1.2}>
            {status.level.name}
          </Text>
          <Text style={styles.xp} maxFontSizeMultiplier={1.2}>
            경험치 {xp.toLocaleString('ko-KR')}점
          </Text>
        </View>
        {status.next ? (
          <View style={styles.nextColumn}>
            <Text style={styles.nextValue} maxFontSizeMultiplier={1.2}>
              {status.remaining.toLocaleString('ko-KR')}점
            </Text>
            <Text style={styles.nextLabel} maxFontSizeMultiplier={1.2}>
              {status.next.name}까지
            </Text>
          </View>
        ) : (
          <Text style={styles.maxLabel} maxFontSizeMultiplier={1.2}>
            최고 호칭!
          </Text>
        )}
      </View>

      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.max(3, status.progress * 100)}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: Spacing.md,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  titles: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  levelName: {
    fontSize: FontSize.subtitle,
    fontWeight: '700',
    letterSpacing: LetterSpacing.subtitle,
    color: Colors.text,
  },
  xp: {
    fontSize: FontSize.caption,
    fontWeight: '500',
    letterSpacing: LetterSpacing.body,
    color: Colors.textSecondary,
  },
  nextColumn: {
    alignItems: 'flex-end',
    gap: 1,
  },
  nextValue: {
    fontSize: FontSize.body,
    fontWeight: '700',
    color: Colors.primary,
  },
  nextLabel: {
    fontSize: FontSize.caption,
    fontWeight: '500',
    letterSpacing: LetterSpacing.body,
    color: Colors.textSecondary,
  },
  maxLabel: {
    fontSize: FontSize.body,
    fontWeight: '700',
    color: Colors.primary,
  },
  track: {
    height: 8,
    borderRadius: Radius.full,
    backgroundColor: Colors.divider,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: Radius.full,
    backgroundColor: Colors.primary,
  },
});
