import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/app-text';

import { CheckMark } from '@/components/check-mark';
import { Colors, FontSize, LetterSpacing, Radius, Spacing, TouchTarget } from '@/constants/theme';
import { placeChip, placeText, primaryName, secondaryName } from '@/features/routine/labels';
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
  const title = primaryName(item);
  const equipName = secondaryName(item);
  const place = placeChip(item);
  const spoken = placeText(item);

  // 읽어 줄 때는 쉬운 이름과 기구 이름을 둘 다 부른다 — 기구 앞에 서서
  // 이름표와 맞춰봐야 하는 분에게는 기구 이름도 필요하다.
  const label = `${order}번째 운동, ${title}${equipName ? `, ${equipName}` : ''}, ${formatTarget(
    item,
  )}${spoken ? `, ${spoken}` : ''}${done ? ', 완료' : ''}`;

  const body = (
    <>
      <View style={[styles.badge, done && styles.badgeDone]}>
        {done ? (
          <CheckMark size={22} thickness={3} />
        ) : (
          <Text style={styles.badgeText} maxFontSizeMultiplier={1.2}>
            {order}
          </Text>
        )}
      </View>

      <View style={styles.texts}>
        {/* 무슨 동작인지가 가장 크다. 기구 이름은 그 아래 작게 —
            "레그 프레스"는 헬스장을 오래 다닌 사람의 말이라 처음 오신 분에게는
            아무것도 알려주지 못한다. */}
        <Text style={[styles.title, done && styles.titleDone]} maxFontSizeMultiplier={1.3}>
          {title}
        </Text>
        {equipName ? (
          <Text style={styles.equipName} maxFontSizeMultiplier={1.3}>
            {equipName}
            {item.target_muscle ? `  ·  ${item.target_muscle}` : ''}
          </Text>
        ) : item.target_muscle ? (
          <Text style={styles.equipName} maxFontSizeMultiplier={1.3}>
            {item.target_muscle}
          </Text>
        ) : null}
        <Text style={styles.target} maxFontSizeMultiplier={1.3}>
          {formatTarget(item)}
        </Text>
      </View>

      {/* 기구에 붙은 번호표와 같은 숫자를 오른쪽에 크게. 목록을 훑는 동안
          "몇 번으로 가면 되는지"가 눈에 먼저 들어와야 한다. */}
      {place ? (
        <View style={[styles.placeChip, done && styles.placeChipDone]}>
          <Text
            style={[styles.placeMain, done && styles.placeTextDone]}
            maxFontSizeMultiplier={1.2}>
            {place.main}
          </Text>
          {place.sub ? (
            <Text
              style={[styles.placeSub, done && styles.placeTextDone]}
              maxFontSizeMultiplier={1.2}>
              {place.sub}
            </Text>
          ) : null}
        </View>
      ) : null}
    </>
  );

  // accessible 을 켜야 위 label 한 줄로 읽힌다. 안 켜면 위치 칩이
  // "22번" / "구역" 두 조각으로 따로 읽혀 무슨 말인지 알 수 없다.
  if (!onPress) {
    return (
      <View style={styles.row} accessible accessibilityLabel={label}>
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
    // 피드백: 숫자가 주인공이 아닌데 52는 과했다. 36도 크다는 피드백이 또
    // 와서 한 단계 더 내렸다.
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.full,
    backgroundColor: Colors.primary,
  },
  badgeDone: {
    backgroundColor: Colors.success,
  },
  badgeText: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: LetterSpacing.subtitle,
    color: Colors.textOnPrimary,
  },
  texts: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: FontSize.headline,
    fontWeight: '700',
    lineHeight: FontSize.headline * 1.3,
    letterSpacing: LetterSpacing.subtitle,
    color: Colors.text,
  },
  titleDone: {
    color: Colors.textSecondary,
  },
  equipName: {
    fontSize: FontSize.caption,
    fontWeight: '500',
    letterSpacing: LetterSpacing.body,
    color: Colors.textTertiary,
  },
  target: {
    fontSize: FontSize.caption,
    fontWeight: '600',
    letterSpacing: LetterSpacing.body,
    color: Colors.textSecondary,
  },
  placeChip: {
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    // 숫자가 한 자리든 두 자리든 칩 너비가 같아야 목록의 오른쪽 끝이 흔들리지 않는다.
    minWidth: 62,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    backgroundColor: Colors.primaryFaint,
  },
  placeChipDone: {
    backgroundColor: Colors.surfacePressed,
  },
  placeMain: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: LetterSpacing.subtitle,
    color: Colors.primary,
  },
  placeSub: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: LetterSpacing.body,
    color: Colors.primary,
  },
  placeTextDone: {
    color: Colors.textTertiary,
  },
});
