import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { PrimaryButton } from '@/components/primary-button';
import { TextField } from '@/components/text-field';
import { WeightChart } from '@/components/weight-chart';
import { Colors, FontSize, LetterSpacing, Radius, Spacing } from '@/constants/theme';
import {
  BodyError,
  getBodyStatus,
  logBodyWeight,
  parseWeightInput,
  sanitizeWeightText,
} from '@/features/body/api';
import { formatMonthDay } from '@/features/body/weight-trend';
import type { BodyStatus } from '@/lib/database.types';

/**
 * 분석 탭의 "내 몸" 섹션. 몸무게를 기록하고 변화를 본다.
 *
 * 변화는 솔직하게 보여준다. 늘었으면 늘었다고 그대로 적는다 — 다만 빨간색으로
 * 혼내지는 않는다. 몸무게는 원래 오르내리는 것이고, 여기서 부끄러움을 느끼면
 * 다음부터 기록을 안 하게 된다. 기록을 끊는 것이 가장 나쁜 결과다.
 */
export function BodySection() {
  const [status, setStatus] = useState<BodyStatus | null>(null);
  const [weightText, setWeightText] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getBodyStatus()
      .then((result) => {
        if (!cancelled) setStatus(result);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const save = useCallback(async () => {
    const weight = parseWeightInput(weightText);
    if (weight === null) return;

    setIsSaving(true);
    setMessage(null);

    try {
      const next = await logBodyWeight(weight);
      setStatus(next);
      setWeightText('');
      setIsError(false);
      setMessage('기록했어요.');
    } catch (error) {
      setIsError(true);
      setMessage(error instanceof BodyError ? error.message : '잠시 후 다시 시도해 주세요.');
    } finally {
      setIsSaving(false);
    }
  }, [weightText]);

  if (!status) return null;

  const delta =
    status.current_weight_kg !== null && status.first_weight_kg !== null
      ? Math.round((status.current_weight_kg - status.first_weight_kg) * 10) / 10
      : null;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle} maxFontSizeMultiplier={1.2}>
        내 몸
      </Text>

      <View style={styles.currentRow}>
        <View style={styles.currentItem}>
          <Text style={styles.currentLabel} maxFontSizeMultiplier={1.3}>
            키
          </Text>
          <Text style={styles.currentValue} maxFontSizeMultiplier={1.2}>
            {status.height_cm !== null ? `${status.height_cm}cm` : '-'}
          </Text>
        </View>
        <View style={styles.currentItem}>
          <Text style={styles.currentLabel} maxFontSizeMultiplier={1.3}>
            몸무게
          </Text>
          <Text style={styles.currentValue} maxFontSizeMultiplier={1.2}>
            {status.current_weight_kg !== null ? `${status.current_weight_kg}kg` : '-'}
          </Text>
        </View>
        <View style={styles.currentItem}>
          <Text style={styles.currentLabel} maxFontSizeMultiplier={1.3}>
            처음보다
          </Text>
          <Text
            style={[styles.currentValue, delta !== null && delta < 0 && styles.deltaGood]}
            maxFontSizeMultiplier={1.2}>
            {delta === null ? '-' : delta === 0 ? '그대로' : `${delta > 0 ? '+' : ''}${delta}kg`}
          </Text>
        </View>
      </View>

      <View style={styles.inputRow}>
        <View style={styles.inputGrow}>
          <TextField
            label="오늘 몸무게 (kg)"
            value={weightText}
            onChangeText={(text) => setWeightText(sanitizeWeightText(text))}
            placeholder={
              status.current_weight_kg !== null ? String(status.current_weight_kg) : '62.5'
            }
            keyboardType="decimal-pad"
          />
        </View>
        <PrimaryButton
          label="기록하기"
          size="compact"
          style={styles.inputButton}
          disabled={parseWeightInput(weightText) === null || isSaving}
          loading={isSaving}
          onPress={() => void save()}
        />
      </View>

      {message ? (
        <Text
          style={[styles.message, isError && styles.messageError]}
          maxFontSizeMultiplier={1.3}
          accessibilityLiveRegion="polite">
          {message}
        </Text>
      ) : null}

      <WeightChart logs={status.logs} />

      {status.logs.length > 0 ? (
        <View style={styles.logs}>
          {status.logs.slice(0, 8).map((log, index) => {
            const prev = status.logs[index + 1];
            const diff = prev ? Math.round((log.weight_kg - prev.weight_kg) * 10) / 10 : null;
            return (
              <View key={log.log_date} style={styles.logRow}>
                <Text style={styles.logDate} maxFontSizeMultiplier={1.3}>
                  {formatMonthDay(log.log_date)}
                </Text>
                <Text style={styles.logWeight} maxFontSizeMultiplier={1.2}>
                  {log.weight_kg}kg
                </Text>
                <Text
                  style={[styles.logDiff, diff !== null && diff < 0 && styles.deltaGood]}
                  maxFontSizeMultiplier={1.3}>
                  {diff === null || diff === 0 ? '' : `${diff > 0 ? '+' : ''}${diff}`}
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}

      <Text style={styles.footNote} maxFontSizeMultiplier={1.3}>
        몸무게는 하루에도 1~2kg 오르내려요. 매일 아침 같은 조건에서 재는 것이 가장
        정확해요. 하루하루 숫자보다 몇 주 흐름을 보세요.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.md,
  },
  sectionTitle: {
    fontSize: FontSize.body,
    fontWeight: '700',
    letterSpacing: LetterSpacing.subtitle,
    color: Colors.text,
  },
  currentRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  currentItem: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.lg,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
  },
  currentLabel: {
    fontSize: FontSize.caption,
    fontWeight: '500',
    letterSpacing: LetterSpacing.body,
    color: Colors.textSecondary,
  },
  currentValue: {
    fontSize: FontSize.subtitle,
    fontWeight: '700',
    letterSpacing: LetterSpacing.subtitle,
    color: Colors.text,
    fontVariant: ['tabular-nums'],
  },
  deltaGood: {
    color: Colors.success,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.sm,
  },
  inputGrow: {
    flex: 1,
  },
  inputButton: {
    minWidth: 104,
  },
  message: {
    fontSize: FontSize.caption,
    fontWeight: '600',
    letterSpacing: LetterSpacing.body,
    color: Colors.success,
  },
  messageError: {
    color: Colors.danger,
  },
  logs: {
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  logRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  logDate: {
    flex: 1,
    fontSize: FontSize.caption,
    fontWeight: '500',
    letterSpacing: LetterSpacing.body,
    color: Colors.textSecondary,
  },
  logWeight: {
    fontSize: FontSize.body,
    fontWeight: '700',
    letterSpacing: LetterSpacing.body,
    color: Colors.text,
    fontVariant: ['tabular-nums'],
  },
  logDiff: {
    width: 48,
    textAlign: 'right',
    fontSize: FontSize.caption,
    fontWeight: '600',
    color: Colors.textTertiary,
    fontVariant: ['tabular-nums'],
  },
  footNote: {
    fontSize: FontSize.caption,
    fontWeight: '500',
    lineHeight: FontSize.caption * 1.55,
    letterSpacing: LetterSpacing.body,
    color: Colors.textTertiary,
  },
});
