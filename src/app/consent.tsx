import { Redirect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/app-text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CheckMark } from '@/components/check-mark';
import { PrimaryButton } from '@/components/primary-button';
import { Colors, FontSize, LetterSpacing, Radius, Spacing, TouchTarget } from '@/constants/theme';
import { useAuthSession } from '@/features/auth/auth-session';
import { ConsentError, needsConsent, recordConsents } from '@/features/legal/api';
import {
  CONSENT_ITEMS,
  hasAllRequired,
  type ConsentItem,
  type ConsentKey,
} from '@/features/legal/consent-items';
import type { User } from '@/lib/database.types';

/**
 * 동의 화면. 로그인 다음, 설문 앞에 온다.
 *
 * 설문보다 먼저인 이유: 설문 4번에서 받는 "아프거나 불편한 곳"이 건강에 관한
 * 정보라, 동의를 받기 전에 물어보면 안 된다.
 *
 * 화면 설계에서 지킨 것:
 *
 *   - **전체 동의 버튼을 맨 위에 두지 않는다.** 위에 두면 대부분 그것만 누르고
 *     내려가서, 선택 항목까지 한 번에 동의하게 된다. 항목을 다 보여준 뒤 맨
 *     아래에 두고, 필수만 켜는 것과 구분되게 이름을 붙였다.
 *   - **선택 항목은 거부해도 되는 걸 눈에 보이게 한다.** 거부하면 무엇이
 *     달라지는지(declineNote)를 항목 안에 같이 적는다.
 *   - **건강에 관한 정보는 따로 떼어 그린다.** 법이 별도 동의를 요구하는 이유가
 *     "다른 항목에 묻어가지 않게" 하려는 것이라, 시각적으로도 묻어가면 안 된다.
 */
export default function ConsentScreen() {
  const { user, isRestoring } = useAuthSession();

  if (isRestoring) return null;
  if (!user) return <Redirect href="/login" />;
  if (!needsConsent(user)) {
    return <Redirect href={user.profile_data?.onboarded_at ? '/workout' : '/onboarding'} />;
  }

  return <ConsentFlow user={user} />;
}

function ConsentFlow({ user }: { user: User }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { setUser, signOut } = useAuthSession();

  const [checked, setChecked] = useState<Partial<Record<ConsentKey, boolean>>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const toggle = useCallback((key: ConsentKey) => {
    setChecked((current) => ({ ...current, [key]: !current[key] }));
  }, []);

  const agreeAll = useCallback(() => {
    setChecked(Object.fromEntries(CONSENT_ITEMS.map((item) => [item.key, true])));
  }, []);

  const submit = useCallback(async () => {
    setIsSaving(true);
    setErrorMessage(null);

    try {
      const updated = await recordConsents(user.id, {
        // 화면에 띄운 항목은 안 누른 것도 "거부"로 확정해 보낸다.
        ...Object.fromEntries(CONSENT_ITEMS.map((item) => [item.key, false])),
        ...checked,
      });
      setUser(updated);
      router.replace(updated.profile_data?.onboarded_at ? '/workout' : '/onboarding');
    } catch (error) {
      setErrorMessage(error instanceof ConsentError ? error.message : '잠시 후 다시 시도해 주세요.');
    } finally {
      setIsSaving(false);
    }
  }, [checked, router, setUser, user.id]);

  /** 동의하지 않고 나가는 길. 없으면 로그인만 하고 갇힌다. */
  const leave = useCallback(async () => {
    await signOut();
    router.replace('/login');
  }, [router, signOut]);

  const required = CONSENT_ITEMS.filter((item) => item.required);
  const optional = CONSENT_ITEMS.filter((item) => !item.required);
  const canSubmit = hasAllRequired(checked);

  if (isSaving) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.xl }]}>
        <View style={styles.headings}>
          <Text style={styles.title} maxFontSizeMultiplier={1.2}>
            시작하기 전에{'\n'}동의가 필요합니다
          </Text>
          <Text style={styles.helper} maxFontSizeMultiplier={1.3}>
            안전한 운동을 안내해 드리려면 몇 가지 정보가 필요합니다. 어떤 정보를 왜 받는지
            먼저 알려드립니다.
          </Text>
        </View>

        <View style={styles.group}>
          <Text style={styles.groupTitle} maxFontSizeMultiplier={1.2}>
            반드시 동의하셔야 하는 항목
          </Text>
          {required.map((item) => (
            <ConsentRow
              key={item.key}
              item={item}
              checked={checked[item.key] === true}
              onToggle={() => toggle(item.key)}
              onOpenDocument={item.document ? () => router.push(`/legal/${item.document}`) : undefined}
            />
          ))}
        </View>

        <View style={styles.group}>
          <Text style={styles.groupTitle} maxFontSizeMultiplier={1.2}>
            골라서 동의하실 수 있는 항목
          </Text>
          <Text style={styles.groupHelper} maxFontSizeMultiplier={1.3}>
            동의하지 않으셔도 서비스를 이용하실 수 있습니다.
          </Text>
          {optional.map((item) => (
            <ConsentRow
              key={item.key}
              item={item}
              checked={checked[item.key] === true}
              onToggle={() => toggle(item.key)}
              onOpenDocument={item.document ? () => router.push(`/legal/${item.document}`) : undefined}
            />
          ))}
        </View>

        {/* 전체 동의는 항목을 다 지나온 뒤 맨 아래에 둔다. */}
        <PrimaryButton label="위 항목에 모두 동의합니다" variant="secondary" onPress={agreeAll} />

        {errorMessage ? (
          <View style={styles.errorBox}>
            <Text
              style={styles.errorText}
              maxFontSizeMultiplier={1.3}
              accessibilityLiveRegion="polite">
              {errorMessage}
            </Text>
          </View>
        ) : null}

        <Text style={styles.footNote} maxFontSizeMultiplier={1.3}>
          동의하신 내용은 언제든지 프로필 화면에서 다시 보실 수 있고, 골라서 동의하신 항목은
          거두실 수 있습니다.
        </Text>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.lg }]}>
        <PrimaryButton label="동의하고 시작하기" disabled={!canSubmit} onPress={() => void submit()} />
        <PrimaryButton
          label="동의하지 않고 나가기"
          variant="quiet"
          size="compact"
          onPress={() => void leave()}
        />
      </View>
    </View>
  );
}

function ConsentRow({
  item,
  checked,
  onToggle,
  onOpenDocument,
}: {
  item: ConsentItem;
  checked: boolean;
  onToggle: () => void;
  onOpenDocument?: () => void;
}) {
  return (
    <View style={[styles.row, item.sensitive && styles.rowSensitive]}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        accessibilityLabel={`${item.required ? '필수' : '선택'}, ${item.label}`}
        style={({ pressed }) => [styles.rowMain, pressed && styles.rowPressed]}>
        <View style={[styles.box, checked && styles.boxChecked]}>
          {checked ? <CheckMark size={22} thickness={3} /> : null}
        </View>

        <View style={styles.rowTexts}>
          <Text style={styles.rowLabel} maxFontSizeMultiplier={1.3}>
            <Text style={item.required ? styles.tagRequired : styles.tagOptional}>
              [{item.required ? '필수' : '선택'}]
            </Text>{' '}
            {item.label}
          </Text>

          {item.sensitive ? (
            <Text style={styles.sensitiveTag} maxFontSizeMultiplier={1.3}>
              건강에 관한 정보라 따로 여쭙습니다
            </Text>
          ) : null}

          <Text style={styles.rowDetail} maxFontSizeMultiplier={1.3}>
            {item.detail}
          </Text>

          {item.declineNote ? (
            <Text style={styles.declineNote} maxFontSizeMultiplier={1.3}>
              {item.declineNote}
            </Text>
          ) : null}
        </View>
      </Pressable>

      {onOpenDocument ? (
        <PrimaryButton
          label="전문 보기"
          accessibilityLabel={`${item.label} 전문 보기`}
          variant="quiet"
          size="compact"
          style={styles.documentButton}
          onPress={onOpenDocument}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    flexGrow: 1,
    gap: Spacing.xxl,
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xl,
    maxWidth: 700,
    width: '100%',
    alignSelf: 'center',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
  },
  headings: {
    gap: Spacing.sm,
  },
  title: {
    fontSize: FontSize.title,
    fontWeight: '700',
    lineHeight: FontSize.title * 1.3,
    letterSpacing: LetterSpacing.title,
    color: Colors.text,
  },
  helper: {
    fontSize: FontSize.body,
    fontWeight: '500',
    lineHeight: FontSize.body * 1.5,
    letterSpacing: LetterSpacing.body,
    color: Colors.textSecondary,
  },
  group: {
    gap: Spacing.sm,
  },
  groupTitle: {
    fontSize: FontSize.body,
    fontWeight: '700',
    letterSpacing: LetterSpacing.subtitle,
    color: Colors.text,
  },
  groupHelper: {
    fontSize: FontSize.caption,
    fontWeight: '500',
    letterSpacing: LetterSpacing.body,
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
  },
  row: {
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
  },
  // 민감정보 항목은 면 색을 달리해 다른 동의에 묻어가지 않게 한다.
  rowSensitive: {
    backgroundColor: Colors.primaryFaint,
  },
  rowMain: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
    minHeight: TouchTarget.min,
  },
  rowPressed: {
    backgroundColor: Colors.surfacePressed,
  },
  box: {
    width: 36,
    height: 36,
    marginTop: 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.sm,
    backgroundColor: Colors.background,
  },
  boxChecked: {
    backgroundColor: Colors.primary,
  },
  rowTexts: {
    flex: 1,
    gap: Spacing.xs,
  },
  rowLabel: {
    fontSize: FontSize.body,
    fontWeight: '700',
    lineHeight: FontSize.body * 1.4,
    letterSpacing: LetterSpacing.body,
    color: Colors.text,
  },
  tagRequired: {
    color: Colors.primary,
  },
  tagOptional: {
    color: Colors.textSecondary,
  },
  sensitiveTag: {
    fontSize: FontSize.caption,
    fontWeight: '700',
    letterSpacing: LetterSpacing.body,
    color: Colors.primary,
  },
  rowDetail: {
    fontSize: FontSize.caption,
    fontWeight: '500',
    lineHeight: FontSize.caption * 1.6,
    letterSpacing: LetterSpacing.body,
    color: Colors.textSecondary,
  },
  declineNote: {
    fontSize: FontSize.caption,
    fontWeight: '600',
    lineHeight: FontSize.caption * 1.6,
    letterSpacing: LetterSpacing.body,
    color: Colors.text,
  },
  documentButton: {
    alignSelf: 'flex-start',
    marginLeft: Spacing.lg + 36,
    marginBottom: Spacing.sm,
  },
  errorBox: {
    padding: Spacing.lg,
    borderRadius: Radius.md,
    backgroundColor: Colors.dangerFaint,
  },
  errorText: {
    fontSize: FontSize.body,
    fontWeight: '600',
    letterSpacing: LetterSpacing.body,
    color: Colors.danger,
    textAlign: 'center',
  },
  footNote: {
    fontSize: FontSize.caption,
    fontWeight: '500',
    lineHeight: FontSize.caption * 1.55,
    letterSpacing: LetterSpacing.body,
    color: Colors.textTertiary,
  },
  footer: {
    gap: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    backgroundColor: Colors.background,
    maxWidth: 700,
    width: '100%',
    alignSelf: 'center',
  },
});
