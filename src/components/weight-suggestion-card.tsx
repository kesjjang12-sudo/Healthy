import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/app-text';

import { PrimaryButton } from '@/components/primary-button';
import { Colors, FontSize, LetterSpacing, Radius, Spacing } from '@/constants/theme';
import { applyWeightSuggestion, RoutineError } from '@/features/routine/api';
import type { WeightSuggestion } from '@/lib/database.types';

type Props = {
  equipId: string;
  suggestion: WeightSuggestion;
  /** 핀 기구(머신·케이블)는 "칸", 덤벨·스미스머신은 kg 로 말한다. */
  unit: 'pin' | 'kg';
  /** 적용되면 처방값이 달라지므로 화면을 다시 불러와야 한다. */
  onApplied: () => void;
};

/**
 * "무게 올려볼까요?" 를 묻는 카드.
 *
 * 핵심은 묻는다는 것이다. 지난 기록을 보고 앱이 알아서 무게를 올리면, 다쳤을
 * 때 그건 앱의 판단이 된다. 제안하고 본인이 고르면 사람이 판단에 남는다.
 * 무게가 무거운지는 화면이 아니라 그 사람 몸만 안다.
 *
 * 내리는 제안도 같은 비중으로 보여준다. 못 따라가는 분은 무게를 스스로
 * 낮추지 않고 그냥 그만두기 때문에, 먼저 말을 걸어 줘야 한다.
 */
export function WeightSuggestionCard({ equipId, suggestion, unit, onApplied }: Props) {
  const [isApplying, setIsApplying] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isIncrease = suggestion.action === 'increase';

  const apply = useCallback(async () => {
    setIsApplying(true);
    setErrorMessage(null);

    try {
      await applyWeightSuggestion(equipId, suggestion.suggested_kg);
      onApplied();
    } catch (error) {
      setErrorMessage(
        error instanceof RoutineError ? error.message : '바꾸지 못했습니다. 다시 시도해 주세요.',
      );
      setIsApplying(false);
    }
  }, [equipId, suggestion.suggested_kg, onApplied]);

  if (dismissed) return null;

  return (
    <View style={[styles.card, isIncrease ? styles.cardIncrease : styles.cardDecrease]}>
      <Text style={styles.title} maxFontSizeMultiplier={1.2}>
        {isIncrease ? '무게를 올려볼까요?' : '무게를 조금 내려볼까요?'}
      </Text>

      <Text style={styles.reason} maxFontSizeMultiplier={1.3}>
        {suggestion.reason}
      </Text>

      {/* 핀 기구는 kg 숫자 대신 "한 칸" — 회원이 기구에서 보는 건 핀 칸이고,
          제안 폭도 늘 기구의 한 단(weight_step)이라 "한 칸"이 정확한 말이다.
          덤벨·스미스머신은 손에 드는 무게가 곧 kg 이라 숫자를 그대로 보여준다.
          "올리다/내리다"는 앱의 다른 안내(weightRule)와 같은 뜻 — 올리다 = 더 무겁게. */}
      <Text style={styles.change} maxFontSizeMultiplier={1.2}>
        {unit === 'kg'
          ? `${suggestion.current_kg}kg → ${suggestion.suggested_kg}kg`
          : isIncrease
            ? '지난번보다 딱 한 칸만 무겁게'
            : '지난번보다 한 칸 가볍게'}
      </Text>

      {/* 올리는 제안일수록 물러설 길을 분명히 적어 둔다. 어르신은 권한 것을
          거절하기 어려워하시는 경우가 많아서, "안 해도 된다"를 글로 봐야 한다. */}
      <Text style={styles.note} maxFontSizeMultiplier={1.3}>
        {isIncrease
          ? '해 보시다가 무거우면 바로 내려놓으세요. 그대로 하셔도 괜찮습니다.'
          : '무리하지 않는 것이 가장 빠른 길입니다.'}
      </Text>

      {errorMessage ? (
        <Text style={styles.error} maxFontSizeMultiplier={1.3} accessibilityLiveRegion="polite">
          {errorMessage}
        </Text>
      ) : null}

      <View style={styles.actions}>
        <PrimaryButton
          label={isIncrease ? '올려볼게요' : '내릴게요'}
          size="compact"
          loading={isApplying}
          onPress={() => void apply()}
        />
        <PrimaryButton
          label="그대로 할게요"
          variant="secondary"
          size="compact"
          disabled={isApplying}
          onPress={() => setDismissed(true)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: Spacing.sm,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: 2,
    backgroundColor: Colors.surface,
  },
  cardIncrease: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryFaint,
  },
  // 내리는 제안은 "잘못했다"가 아니라 "무리하지 말자"다. 빨강(danger)을 쓰면
  // 혼내는 것처럼 읽혀서, 눈에는 띄되 부드러운 회색 면으로 둔다.
  cardDecrease: {
    borderColor: Colors.textTertiary,
  },
  title: {
    fontSize: FontSize.subtitle,
    fontWeight: '700',
    letterSpacing: LetterSpacing.subtitle,
    color: Colors.text,
  },
  reason: {
    fontSize: FontSize.body,
    fontWeight: '500',
    lineHeight: FontSize.body * 1.5,
    letterSpacing: LetterSpacing.body,
    color: Colors.textSecondary,
  },
  change: {
    fontSize: FontSize.subtitle,
    fontWeight: '700',
    letterSpacing: LetterSpacing.subtitle,
    color: Colors.primary,
    fontVariant: ['tabular-nums'],
  },
  note: {
    fontSize: FontSize.caption,
    fontWeight: '500',
    lineHeight: FontSize.caption * 1.5,
    letterSpacing: LetterSpacing.body,
    color: Colors.textTertiary,
  },
  error: {
    fontSize: FontSize.caption,
    fontWeight: '600',
    letterSpacing: LetterSpacing.body,
    color: Colors.danger,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
});
