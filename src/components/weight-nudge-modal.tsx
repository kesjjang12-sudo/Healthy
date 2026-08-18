import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';

import { PrimaryButton } from '@/components/primary-button';
import { TextField } from '@/components/text-field';
import { Colors, FontSize, LetterSpacing, Radius, Spacing } from '@/constants/theme';
import {
  BodyError,
  getBodyStatus,
  logBodyWeight,
  parseWeightInput,
  sanitizeWeightText,
} from '@/features/body/api';

/** 이 날짜 지나도록 기록이 없으면 말을 건다. */
const STALE_DAYS = 7;

/** 하루에 한 번만. 닫았는데 탭을 오갈 때마다 다시 뜨면 잔소리가 된다. */
const SHOWN_DATE_KEY = 'fitroutine.weight-nudge-shown-date';

function todayKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}

/**
 * 몸무게 업데이트를 오래 안 했을 때 운동 탭에서 한 번 물어보는 팝업.
 *
 * 목적은 잔소리가 아니라 다시 불붙이기다 — 기록이 끊긴 사람은 대개 앱도 곧
 * 끊는다. 그래서 팝업 안에서 바로 입력까지 끝나게 한다. "분석 탭에 가서
 * 입력하세요"는 한 단계가 더 있어서 대부분 안 간다.
 *
 * 절제 장치 둘: 마지막 기록 후 7일이 지나야 뜨고, 하루에 한 번만 뜬다.
 */
export function WeightNudgeModal() {
  const [visible, setVisible] = useState(false);
  const [weightText, setWeightText] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const shownDate = await AsyncStorage.getItem(SHOWN_DATE_KEY);
        if (shownDate === todayKey()) return;

        const status = await getBodyStatus();
        if (cancelled) return;

        // 한 번도 기록한 적 없는 계정(옛 가입자)도, 오래 안 잰 계정도 대상이다.
        const stale =
          status.days_since_last_log === null || status.days_since_last_log >= STALE_DAYS;
        // 다만 몸무게 개념이 아예 없는 상태(설문도 안 함)에는 묻지 않는다.
        const hasAnyBodyData =
          status.current_weight_kg !== null || status.days_since_last_log !== null;

        if (stale && hasAnyBodyData) {
          await AsyncStorage.setItem(SHOWN_DATE_KEY, todayKey());
          if (!cancelled) setVisible(true);
        }
      } catch {
        // 확인에 실패하면 그냥 안 띄운다. 팝업은 없어서 문제되는 기능이 아니다.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const close = useCallback(() => setVisible(false), []);

  const save = useCallback(async () => {
    const weight = parseWeightInput(weightText);
    if (weight === null) return;

    setIsSaving(true);
    setErrorMessage(null);

    try {
      await logBodyWeight(weight);
      setIsDone(true);
    } catch (error) {
      setErrorMessage(error instanceof BodyError ? error.message : '잠시 후 다시 시도해 주세요.');
    } finally {
      setIsSaving(false);
    }
  }, [weightText]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          {isDone ? (
            <>
              <Text style={styles.title} maxFontSizeMultiplier={1.2}>
                기록했어요!
              </Text>
              <Text style={styles.body} maxFontSizeMultiplier={1.3}>
                변화는 분석 탭에서 언제든 볼 수 있어요. 오늘 운동도 화이팅이에요.
              </Text>
              <PrimaryButton label="운동하러 가기" onPress={close} />
            </>
          ) : (
            <>
              <Text style={styles.title} maxFontSizeMultiplier={1.2}>
                운동 열심히 하고 계시죠?
              </Text>
              <Text style={styles.body} maxFontSizeMultiplier={1.3}>
                현재 몸무게를 업데이트해 볼까요? 변화를 눈으로 확인하면 운동 의지가 다시
                불타올라요.
              </Text>

              <TextField
                label="현재 몸무게 (kg)"
                value={weightText}
                onChangeText={(text) => setWeightText(sanitizeWeightText(text))}
                placeholder="62.5"
                keyboardType="decimal-pad"
              />

              {errorMessage ? (
                <Text
                  style={styles.errorText}
                  maxFontSizeMultiplier={1.3}
                  accessibilityLiveRegion="polite">
                  {errorMessage}
                </Text>
              ) : null}

              <PrimaryButton
                label="기록하기"
                disabled={parseWeightInput(weightText) === null || isSaving}
                loading={isSaving}
                onPress={() => void save()}
              />
              <PrimaryButton
                label="다음에 할게요"
                variant="quiet"
                size="compact"
                disabled={isSaving}
                onPress={close}
              />
            </>
          )}
        </View>
      </View>
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
    gap: Spacing.lg,
    padding: Spacing.xl,
    borderRadius: Radius.xl,
    backgroundColor: Colors.background,
  },
  title: {
    fontSize: FontSize.subtitle,
    fontWeight: '700',
    letterSpacing: LetterSpacing.subtitle,
    color: Colors.text,
  },
  body: {
    fontSize: FontSize.body,
    fontWeight: '500',
    lineHeight: FontSize.body * 1.5,
    letterSpacing: LetterSpacing.body,
    color: Colors.textSecondary,
  },
  errorText: {
    fontSize: FontSize.caption,
    fontWeight: '600',
    letterSpacing: LetterSpacing.body,
    color: Colors.danger,
  },
});
