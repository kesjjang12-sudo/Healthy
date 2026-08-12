import { StyleSheet, Text, View } from 'react-native';

import { Colors, FontSize, Radius, Spacing } from '@/constants/theme';
import type { RoutineItem } from '@/lib/database.types';

type Props = {
  item: RoutineItem;
  /** 화면에 보이는 순번 (1부터) */
  order: number;
};

/** 목표를 한 줄로 읽히게 만든다: "30kg · 3세트 · 10회" */
function formatTarget(item: RoutineItem): string {
  const parts: string[] = [];

  // 무게가 없는 기구(맨몸 운동)는 무게 칸을 아예 빼야 "0kg" 으로 오해하지 않는다.
  if (item.target_weight !== null) parts.push(`${item.target_weight}kg`);
  if (item.target_sets !== null) parts.push(`${item.target_sets}세트`);
  if (item.target_reps !== null) parts.push(`${item.target_reps}회`);

  return parts.join(' · ');
}

export function RoutineCard({ item, order }: Props) {
  return (
    <View
      style={[styles.card, item.is_completed && styles.cardDone]}
      accessibilityLabel={`${order}번째 운동, ${item.name}, ${formatTarget(item)}`}>
      <View style={[styles.badge, item.is_completed && styles.badgeDone]}>
        <Text style={styles.badgeText} maxFontSizeMultiplier={1.2}>
          {item.is_completed ? '✓' : order}
        </Text>
      </View>

      <View style={styles.texts}>
        <Text style={styles.name} maxFontSizeMultiplier={1.3}>
          {item.name}
        </Text>
        <Text style={styles.target} maxFontSizeMultiplier={1.3}>
          {formatTarget(item)}
        </Text>
      </View>

      {item.target_muscle ? (
        <View style={styles.muscle}>
          <Text style={styles.muscleText} maxFontSizeMultiplier={1.2}>
            {item.target_muscle}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: 2,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  cardDone: {
    borderColor: Colors.success,
    backgroundColor: Colors.background,
  },
  badge: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.full,
    backgroundColor: Colors.primary,
  },
  badgeDone: {
    backgroundColor: Colors.success,
  },
  badgeText: {
    fontSize: FontSize.label,
    fontWeight: '800',
    color: Colors.textOnPrimary,
  },
  texts: {
    flex: 1,
    gap: Spacing.xs,
  },
  name: {
    fontSize: FontSize.label,
    fontWeight: '800',
    color: Colors.text,
  },
  target: {
    fontSize: FontSize.body,
    fontWeight: '700',
    color: Colors.primary,
  },
  muscle: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    backgroundColor: Colors.primaryFaint,
  },
  muscleText: {
    fontSize: FontSize.body,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
});
