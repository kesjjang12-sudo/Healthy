import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/app-text';

import { Colors, FontSize, LetterSpacing, Radius, Spacing } from '@/constants/theme';

type Option<T extends string> = {
  value: T;
  label: string;
};

type Props<T extends string> = {
  options: readonly Option<T>[];
  value: T;
  onChange: (value: T) => void;
};

/**
 * FIT ROTEIN 시안의 세그먼트 컨트롤 — 회색 트랙 위에서 활성 칸만 흰 면으로
 * 떠 있다(랭킹 기간, 분석 기간 등). 파란 버튼 두 개를 나란히 두던 방식은
 * 두 개가 다 "눌러 달라"고 외쳐서, 지금 어느 쪽을 보고 있는지가 안 읽혔다.
 */
export function SegmentedControl<T extends string>({ options, value, onChange }: Props<T>) {
  return (
    <View style={styles.track}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            style={[styles.segment, selected && styles.segmentOn]}>
            <Text style={[styles.label, selected && styles.labelOn]} maxFontSizeMultiplier={1.2}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: 3,
    gap: 2,
  },
  segment: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.sm,
    paddingVertical: Spacing.sm,
  },
  segmentOn: {
    backgroundColor: Colors.background,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  label: {
    fontSize: FontSize.body,
    fontWeight: '500',
    letterSpacing: LetterSpacing.body,
    color: Colors.textSecondary,
  },
  labelOn: {
    color: Colors.text,
    fontWeight: '600',
  },
});
