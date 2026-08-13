import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CheckMark } from '@/components/check-mark';
import { Colors, FontSize, LetterSpacing, Radius, Spacing, TouchTarget } from '@/constants/theme';
import type { RoutineItem } from '@/lib/database.types';

type Props = {
  item: RoutineItem;
  /** 화면에 보이는 순번 (1부터) */
  order: number;
  /** 누르면 하는 방법 화면으로 넘어간다. 없으면 그냥 읽기만 하는 줄이 된다. */
  onPress?: () => void;
};

/** 목표를 한 줄로 읽히게 만든다: "30kg · 3세트 · 10회", 유산소는 "15분" */
function formatTarget(item: RoutineItem): string {
  // 유산소는 세트/횟수 개념이 없다 — "1세트"라고 뜨면 오히려 헷갈린다.
  if (item.target_duration_minutes !== null) {
    // 끝난 운동은 처방이 아니라 실제로 움직인 시간을 보여준다. 달력에서
    // 지난 날을 볼 때 "15분 처방"이 아니라 "8분 했음"이 알고 싶은 값이다.
    // (이 기록이 생기기 전에 완료한 옛 기록은 실제값이 없어 처방값으로 남는다.
    //  DB 마이그레이션이 아직 안 된 서버라면 이 칸 자체가 안 내려오므로
    //  null 이 아니라 타입으로 확인한다 — "undefined분"이 뜨면 안 된다.)
    const actual = item.actual_duration_minutes;
    if (item.is_completed && typeof actual === 'number') return `${actual}분`;

    return `${item.target_duration_minutes}분`;
  }

  const parts: string[] = [];

  // 무게가 없는 기구(맨몸 운동)는 무게 칸을 아예 빼야 "0kg" 으로 오해하지 않는다.
  if (item.target_weight !== null) parts.push(`${item.target_weight}kg`);
  if (item.target_sets !== null) parts.push(`${item.target_sets}세트`);
  if (item.target_reps !== null) parts.push(`${item.target_reps}회`);

  return parts.join(' · ');
}

export function RoutineCard({ item, order, onPress }: Props) {
  const done = Boolean(item.is_completed);
  const label = `${order}번째 운동, ${item.name}, ${formatTarget(item)}${done ? ', 완료' : ''}`;

  const body = (
    <>
      <View style={[styles.badge, done && styles.badgeDone]}>
        {done ? (
          <CheckMark size={26} thickness={3} />
        ) : (
          <Text style={styles.badgeText} maxFontSizeMultiplier={1.2}>
            {order}
          </Text>
        )}
      </View>

      <View style={styles.texts}>
        <Text style={[styles.name, done && styles.nameDone]} maxFontSizeMultiplier={1.3}>
          {item.name}
        </Text>
        <Text style={styles.target} maxFontSizeMultiplier={1.3}>
          {formatTarget(item)}
          {item.target_muscle ? `  ·  ${item.target_muscle}` : ''}
        </Text>
      </View>
    </>
  );

  if (!onPress) {
    return (
      <View style={styles.row} accessibilityLabel={label}>
        {body}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}. 하는 방법 보기`}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
    // 88pt 는 서서 조작하는 태블릿에서 손가락이 빗나가지 않는 최소 높이다.
    minHeight: TouchTarget.min,
  },
  rowPressed: {
    backgroundColor: Colors.surfacePressed,
  },
  badge: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.full,
    backgroundColor: Colors.primary,
  },
  badgeDone: {
    backgroundColor: Colors.success,
  },
  badgeText: {
    fontSize: FontSize.subtitle,
    fontWeight: '700',
    letterSpacing: LetterSpacing.subtitle,
    color: Colors.textOnPrimary,
  },
  texts: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontSize: FontSize.subtitle,
    fontWeight: '700',
    letterSpacing: LetterSpacing.subtitle,
    color: Colors.text,
  },
  nameDone: {
    color: Colors.textSecondary,
  },
  target: {
    fontSize: FontSize.caption,
    fontWeight: '500',
    letterSpacing: LetterSpacing.body,
    color: Colors.textSecondary,
  },
});
