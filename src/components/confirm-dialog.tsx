import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/app-text';

import { PrimaryButton } from '@/components/primary-button';
import { Colors, FontSize, LetterSpacing, Radius, Spacing } from '@/constants/theme';

type Props = {
  visible: boolean;
  title: string;
  /** 한 줄 덧붙임. 없으면 제목만 보인다. */
  message?: string;
  /** 진행하는 쪽 버튼 글자. 무엇을 하는지 적는다 — "확인"은 뭘 하는지 안 알려준다. */
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * 화면 한가운데 뜨는 확인 팝업.
 *
 * 로그아웃처럼 되돌리기 번거로운 동작 앞에 세운다. 눌러 놓고 "어? 나 눌렀나"
 * 하는 순간을 없애는 게 목적이라, 바깥을 눌러도 닫히게 두지 않고 두 버튼 중
 * 하나를 고르게 한다. 뒤로가기(안드로이드)는 취소로 친다.
 *
 * 버튼 색은 앱 규칙을 따른다 — 진행이 파랑, 취소가 회색.
 */
export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel = '아니요',
  onConfirm,
  onCancel,
}: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      {/* 배경을 눌러도 닫지 않는다. 다만 뒤 화면이 눌리는 것은 막아야 한다. */}
      <Pressable style={styles.backdrop} onPress={onCancel} accessibilityLabel={cancelLabel}>
        {/* 카드 안쪽 터치가 배경으로 새어 나가지 않게 한 겹 막는다. */}
        <Pressable style={styles.card} onPress={() => {}}>
          <View style={styles.texts}>
            <Text style={styles.title} maxFontSizeMultiplier={1.2}>
              {title}
            </Text>
            {message ? (
              <Text style={styles.message} maxFontSizeMultiplier={1.3}>
                {message}
              </Text>
            ) : null}
          </View>

          <View style={styles.buttons}>
            <PrimaryButton
              label={cancelLabel}
              variant="secondary"
              onPress={onCancel}
              style={styles.button}
            />
            <PrimaryButton label={confirmLabel} onPress={onConfirm} style={styles.button} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  card: {
    width: '100%',
    maxWidth: 420,
    gap: Spacing.xl,
    padding: Spacing.xl,
    borderRadius: Radius.xl,
    backgroundColor: Colors.background,
  },
  texts: {
    gap: Spacing.sm,
    alignItems: 'center',
  },
  title: {
    fontSize: FontSize.section,
    fontWeight: '700',
    letterSpacing: LetterSpacing.subtitle,
    color: Colors.text,
    textAlign: 'center',
  },
  message: {
    fontSize: FontSize.body,
    fontWeight: '500',
    lineHeight: FontSize.body * 1.5,
    letterSpacing: LetterSpacing.body,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  buttons: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  button: {
    // 반반으로 나눠도 글자가 잘리지 않게 기본 좌우 여백을 줄인다.
    flex: 1,
    paddingHorizontal: Spacing.sm,
  },
});
