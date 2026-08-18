import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/app-text';

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

type Props = {
  icon: IconName;
  tint?: IconTintName;
  label: string;
  /** 라벨이 줄인 말일 때 원래 뜻을 보이스오버에 알려 준다. */
  accessibilityLabel?: string;
  onPress: () => void;
};

/**
 * 운동 탭 아래쪽의 바로가기 타일: [색 타일 아이콘] 위에 짧은 라벨.
 *
 * 원래는 ListRow(제목 + 설명 + 화살표) 4줄이었는데, 그 높이가 화면의
 * 주인공인 "오늘의 운동" 목록보다 커져서 타일로 줄였다. 설명 문구는 뺐다 —
 * 눌러 보면 바로 아는 기능들이고, 궁금증은 목록 아래 안내 한 줄이 받는다.
 *
 * 폭은 부모가 flex 로 나눠 준다(한 줄에 나란히). 높이는 시니어 터치 기준
 * (TouchTarget.min)을 지킨다 — 타일이 작아 보여도 눌리는 영역은 크다.
 */
export function ShortcutTile({ icon, tint = 'blue', label, accessibilityLabel, onPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}>
      <View style={[styles.iconTile, { backgroundColor: IconTint[tint] }]}>
        <Icon name={icon} size={26} color="#FFFFFF" strokeWidth={2} />
      </View>
      <Text style={styles.label} maxFontSizeMultiplier={1.2} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    minHeight: TouchTarget.min,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
  },
  tilePressed: {
    backgroundColor: Colors.surfacePressed,
  },
  iconTile: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
  },
  label: {
    fontSize: FontSize.body,
    fontWeight: '600',
    letterSpacing: LetterSpacing.body,
    color: Colors.text,
  },
});
