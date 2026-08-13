import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CheckMark } from '@/components/check-mark';
import { Colors, FontSize, LetterSpacing, Radius, Spacing, TouchTarget } from '@/constants/theme';

type Props = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  /** 무엇에 동의하는지. 항목을 적지 않은 동의는 받은 것으로 치기 어렵다. */
  detail?: string;
};

/**
 * 필수 동의 체크박스.
 *
 * 상자만 두지 않고 무엇을 어디에 쓰는지 바로 아래 적는다 — "동의합니다" 한 줄만
 * 있고 내용이 다른 화면에 있으면 읽지 않고 누르게 되고, 그건 동의를 받은 것으로
 * 보기 어렵다. 글씨가 작은 화면을 어르신이 읽어야 하는 상황이라 더 그렇다.
 *
 * 상자만이 아니라 줄 전체가 눌린다. 작은 사각형만 누르게 하면 손이 큰 분에게
 * 불필요하게 어렵다.
 */
export function ConsentCheckbox({ checked, onChange, label, detail }: Props) {
  return (
    <Pressable
      onPress={() => onChange(!checked)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={detail ? `${label}. ${detail}` : label}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      <View style={[styles.box, checked && styles.boxChecked]}>
        {checked ? <CheckMark size={20} thickness={2.5} /> : null}
      </View>

      <View style={styles.texts}>
        <Text style={styles.label} maxFontSizeMultiplier={1.3}>
          {label}
        </Text>
        {detail ? (
          <Text style={styles.detail} maxFontSizeMultiplier={1.3}>
            {detail}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
    minHeight: TouchTarget.min * 0.6,
  },
  rowPressed: {
    backgroundColor: Colors.surfacePressed,
  },
  box: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.sm,
    backgroundColor: Colors.surface,
    // 체크 안 된 상태를 면만으로 두면 배경과 구분이 잘 안 된다. 여기서는 선을 쓴다.
    borderWidth: 2,
    borderColor: Colors.textDisabled,
  },
  boxChecked: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  texts: {
    flex: 1,
    gap: 2,
  },
  label: {
    fontSize: FontSize.body,
    fontWeight: '600',
    letterSpacing: LetterSpacing.body,
    color: Colors.text,
  },
  detail: {
    fontSize: FontSize.caption,
    fontWeight: '500',
    lineHeight: FontSize.caption * 1.5,
    letterSpacing: LetterSpacing.body,
    color: Colors.textSecondary,
  },
});
