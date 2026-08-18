import { Pressable, StyleSheet, View, Text as RNText } from 'react-native';

import { Text } from '@/components/app-text';
import { Colors, FontSize, LetterSpacing, Radius, Spacing } from '@/constants/theme';
import { FONT_SCALE_LABELS, FONT_SCALES } from '@/features/settings/font-scale';
import type { FontScale } from '@/lib/database.types';

const OPTIONS: readonly FontScale[] = ['small', 'medium', 'large'];

/**
 * 글자 크기 고르는 칸 셋. 가입 설문과 프로필에서 같은 것을 쓴다 —
 * 두 곳이 다르게 생기면 "설문에서 고른 그거"를 프로필에서 못 찾는다.
 *
 * 세 칸의 폭은 같게 두고 안의 '가' 만 크기가 다르다. 칸까지 크기대로 넓히면
 * 무엇을 비교하는 화면인지 흐려진다.
 */
export function FontScalePicker({
  value,
  onChange,
}: {
  value: FontScale;
  onChange: (next: FontScale) => void;
}) {
  return (
    <View style={styles.row} accessibilityRole="radiogroup">
      {OPTIONS.map((option) => {
        const selected = value === option;
        return (
          <Pressable
            key={option}
            onPress={() => onChange(option)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={`글자 크기 ${FONT_SCALE_LABELS[option]}`}
            style={({ pressed }) => [
              styles.choice,
              selected && styles.choiceSelected,
              pressed && styles.choicePressed,
            ]}>
            {/* 견본 '가'만 app-text 가 아니라 react-native 의 Text 로 그린다.
                app-text 를 쓰면 지금 고른 배율이 여기에도 곱해져서, '크게'를
                누른 순간 '작게' 칸의 견본까지 커진다 — 그러면 견본이 그 크기를
                더 이상 보여주지 못한다. 여기 숫자는 늘 절대값이어야 한다. */}
            <RNText
              style={[
                styles.sample,
                { fontSize: Math.round(FontSize.body * FONT_SCALES[option]) },
                selected && styles.textSelected,
              ]}
              allowFontScaling={false}>
              가
            </RNText>
            <Text
              style={[styles.label, selected && styles.textSelected]}
              maxFontSizeMultiplier={1.2}>
              {FONT_SCALE_LABELS[option]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  choice: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    minHeight: 96,
    paddingVertical: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    backgroundColor: Colors.surface,
  },
  choiceSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryFaint,
  },
  choicePressed: {
    backgroundColor: Colors.surfacePressed,
  },
  sample: {
    fontWeight: '700',
    letterSpacing: LetterSpacing.subtitle,
    color: Colors.text,
  },
  label: {
    fontSize: FontSize.caption,
    fontWeight: '600',
    letterSpacing: LetterSpacing.body,
    color: Colors.textSecondary,
  },
  textSelected: {
    color: Colors.primary,
  },
});
