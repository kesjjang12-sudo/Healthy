import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import {
  Colors,
  FontSize,
  IconTint,
  type IconTintName,
  LetterSpacing,
  Radius,
  Spacing,
  TouchTarget,
} from '@/constants/theme';

type ValueTone = 'default' | 'secondary' | 'primary' | 'success' | 'danger';

type Props = {
  /** 왼쪽 색 타일에 올라갈 아이콘. 없으면 타일 없이 글자부터 시작한다. */
  icon?: IconName;
  tint?: IconTintName;
  title: string;
  subtitle?: string;
  /** 오른쪽 끝에 붙는 보조 정보. 토스의 "계좌 · 대출 · 증권" 자리다. */
  value?: string;
  valueTone?: ValueTone;
  /** 오른쪽에 버튼 같은 걸 직접 꽂고 싶을 때. value 와 chevron 보다 우선한다. */
  right?: ReactNode;
  /** 누르면 다른 화면으로 간다는 표시. onPress 가 있을 때만 의미 있다. */
  chevron?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
};

const VALUE_COLOR: Record<ValueTone, string> = {
  default: Colors.text,
  secondary: Colors.textSecondary,
  primary: Colors.primary,
  success: Colors.success,
  danger: Colors.danger,
};

/**
 * 토스식 목록 행: [색 타일 아이콘] 제목 ······ 보조정보 [>]
 *
 * 토스 "전체" 화면의 행 구조를 그대로 가져왔다 — 칸을 나누는 선이나 카드 없이
 * 흰 바탕에 행만 쌓고, 누르면 행 전체가 옅은 회색으로 눌린다. 왼쪽 타일 색이
 * 항목의 얼굴이 되어 글자를 읽기 전에 어떤 항목인지 먼저 알아보게 한다.
 */
export function ListRow({
  icon,
  tint = 'blue',
  title,
  subtitle,
  value,
  valueTone = 'secondary',
  right,
  chevron = false,
  onPress,
  accessibilityLabel,
}: Props) {
  const body = (
    <>
      {icon ? (
        <View style={[styles.tile, { backgroundColor: IconTint[tint] }]}>
          <Icon name={icon} size={26} color="#FFFFFF" strokeWidth={2} />
        </View>
      ) : null}

      <View style={styles.texts}>
        <Text style={styles.title} maxFontSizeMultiplier={1.3} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} maxFontSizeMultiplier={1.3} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {right ?? (
        <>
          {value ? (
            <Text
              style={[
                // secondary 는 토스 "전체" 화면의 회색 보조설명, 나머지 톤은
                // 증권 화면의 오른쪽 값처럼 굵고 크게 강조한다.
                valueTone === 'secondary' ? styles.value : styles.valueEmphasis,
                { color: VALUE_COLOR[valueTone] },
              ]}
              maxFontSizeMultiplier={1.2}>
              {value}
            </Text>
          ) : null}
          {chevron && onPress ? (
            <Icon name="chevron-right" size={20} color={Colors.grey[300]} strokeWidth={2.2} />
          ) : null}
        </>
      )}
    </>
  );

  const label =
    accessibilityLabel ?? [title, subtitle, value].filter(Boolean).join(', ');

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
      accessibilityLabel={label}
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
    minHeight: TouchTarget.row,
    paddingVertical: Spacing.sm,
    // 화면 여백(xl) 안쪽에 놓이는 걸 전제로, 눌림 표시가 글자보다 넓게 퍼지도록
    // 좌우로 살짝 삐져나가게 한다 — 토스가 행을 누를 때와 같은 느낌.
    paddingHorizontal: Spacing.md,
    marginHorizontal: -Spacing.md,
    borderRadius: Radius.md,
  },
  rowPressed: {
    backgroundColor: Colors.surface,
  },
  tile: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
  },
  texts: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: FontSize.body,
    fontWeight: '600',
    letterSpacing: LetterSpacing.body,
    color: Colors.text,
  },
  subtitle: {
    fontSize: FontSize.caption,
    fontWeight: '500',
    letterSpacing: LetterSpacing.body,
    color: Colors.textSecondary,
  },
  value: {
    fontSize: FontSize.caption,
    fontWeight: '600',
    letterSpacing: LetterSpacing.body,
    fontVariant: ['tabular-nums'],
  },
  valueEmphasis: {
    fontSize: FontSize.body,
    fontWeight: '700',
    letterSpacing: LetterSpacing.body,
    fontVariant: ['tabular-nums'],
  },
});
