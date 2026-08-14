import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ExercisePhoto } from '@/components/exercise-photo';
import { PrimaryButton } from '@/components/primary-button';
import { Colors, FontSize, LetterSpacing, Radius, Spacing, TouchTarget } from '@/constants/theme';
import { useAuthSession } from '@/features/auth/auth-session';
import {
  EquipmentError,
  listEquipmentGuide,
  type EquipmentGuideSection,
  type GuideEquipment,
} from '@/features/equipment/api';

/**
 * 기구 사용법 모아보기. 오늘 루틴과 무관하게 헬스장의 모든 기구를
 * 유산소 → 가슴 → 등 → 어깨 → 하체 → 복부 순 부위 섹션으로 늘어놓는다.
 *
 * QR 을 찍어야만 설명을 볼 수 있으면 "저 기구 뭐지?" 하고 궁금할 때마다
 * 기구 앞까지 가야 한다 — 집에서 미리 훑어보고 올 수 있게 목록으로 뺐다.
 * 누르면 QR 찍었을 때와 같은 탐색 화면(explore/[qr])이 열린다.
 */
export default function EquipmentGuideScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuthSession();

  const [sections, setSections] = useState<EquipmentGuideSection[] | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    listEquipmentGuide(user?.apt_id ?? null)
      .then((data) => {
        if (!cancelled) setSections(data);
      })
      .catch((error) => {
        if (cancelled) return;
        setErrorMessage(
          error instanceof EquipmentError ? error.message : '잠시 후 다시 시도해 주세요.',
        );
      });

    return () => {
      cancelled = true;
    };
  }, [user?.apt_id, attempt]);

  const retry = useCallback(() => {
    setSections(null);
    setErrorMessage(null);
    setAttempt((n) => n + 1);
  }, []);

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/workout');
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.xl }]}>
        <View style={styles.headings}>
          <Text style={styles.title} maxFontSizeMultiplier={1.2}>
            기구 사용법
          </Text>
          <Text style={styles.helper} maxFontSizeMultiplier={1.3}>
            부위별로 모아 놨어요. 파란 칸은 기구 없이 하는 운동입니다. 운동을 누르면 하는
            방법과 영상이 나옵니다.
          </Text>
        </View>

        {errorMessage ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText} maxFontSizeMultiplier={1.3} accessibilityLiveRegion="polite">
              {errorMessage}
            </Text>
            <PrimaryButton label="다시 시도" variant="secondary" onPress={retry} />
          </View>
        ) : sections === null ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        ) : (
          sections.map((section) => (
            <View key={section.muscle} style={styles.section}>
              <Text style={styles.sectionTitle} maxFontSizeMultiplier={1.2}>
                {section.muscle}
              </Text>
              <View style={styles.list}>
                {section.items.map((item) => (
                  <GuideRow
                    key={item.id}
                    item={item}
                    onPress={() =>
                      // QR 이 없는 운동(이 헬스장에 기구가 없는 맨몸 운동)도
                      // 열려야 해서 카탈로그 id 로 보낸다. 경로에 들어가는
                      // 값은 자리를 채울 뿐이고, 실제 조회는 catalog 로 한다.
                      router.push({
                        pathname: '/workout/explore/[qr]',
                        params: {
                          qr: item.qr_code_val ?? item.id,
                          catalog: item.id,
                          from: 'guide',
                        },
                      })
                    }
                  />
                ))}
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.lg }]}>
        <PrimaryButton label="운동 목록으로" onPress={goBack} />
      </View>
    </View>
  );
}

function GuideRow({ item, onPress }: { item: GuideEquipment; onPress: () => void }) {
  const title = item.name_ko ?? item.name;
  // 맨몸 운동은 기구가 차 있어도, 집에서도 되는 "지금 당장 할 수 있는"
  // 운동이라 파란 면 + 큰 카드로 따로 보이게 한다.
  const isBodyweight = item.station_kind === '맨몸';
  // "머신 · 체스트 프레스" — 기구 종류와 기구에 붙은 실제 이름이 헬스장에서
  // 그 기구를 찾는 단서가 된다. 우리말 이름과 같으면 종류만 남긴다.
  const hint = isBodyweight
    ? '기구 없이 어디서나'
    : [item.station_kind, item.name_ko && item.name !== item.name_ko ? item.name : null]
        .filter(Boolean)
        .join(' · ');

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}${hint ? `, ${hint}` : ''}. 하는 방법 보기`}
      style={({ pressed }) => [
        styles.row,
        isBodyweight && styles.rowBodyweight,
        pressed && (isBodyweight ? styles.rowBodyweightPressed : styles.rowPressed),
      ]}>
      <ExercisePhoto uri={item.image_url} name={title} size="thumb" />
      <View style={styles.texts}>
        <Text
          style={[styles.name, isBodyweight && styles.nameBodyweight]}
          maxFontSizeMultiplier={1.3}>
          {title}
        </Text>
        {hint ? (
          <Text
            style={[styles.hint, isBodyweight && styles.hintBodyweight]}
            maxFontSizeMultiplier={1.3}>
            {hint}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    flexGrow: 1,
    gap: Spacing.xl,
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xl,
    maxWidth: 900,
    width: '100%',
    alignSelf: 'center',
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
  section: {
    gap: Spacing.md,
  },
  sectionTitle: {
    fontSize: FontSize.body,
    fontWeight: '700',
    letterSpacing: LetterSpacing.subtitle,
    color: Colors.primary,
  },
  list: {
    gap: Spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
    minHeight: TouchTarget.min,
  },
  rowPressed: {
    backgroundColor: Colors.surfacePressed,
  },
  // 맨몸 카드는 한 눈금 크게: 여백을 늘리고 파란 면으로 깐다.
  rowBodyweight: {
    backgroundColor: Colors.primaryFaint,
    paddingVertical: Spacing.xl,
    minHeight: TouchTarget.min + Spacing.lg,
  },
  rowBodyweightPressed: {
    backgroundColor: '#D5E9FF',
  },
  texts: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontSize: FontSize.subtitle,
    fontWeight: '700',
    letterSpacing: LetterSpacing.subtitle,
    color: Colors.text,
  },
  nameBodyweight: {
    fontSize: FontSize.subtitle + 4,
  },
  hint: {
    fontSize: FontSize.caption,
    fontWeight: '500',
    letterSpacing: LetterSpacing.body,
    color: Colors.textSecondary,
  },
  hintBodyweight: {
    color: Colors.primary,
    fontWeight: '600',
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xxxl,
  },
  errorBox: {
    gap: Spacing.lg,
    padding: Spacing.xl,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
  },
  errorText: {
    fontSize: FontSize.body,
    fontWeight: '600',
    letterSpacing: LetterSpacing.body,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  footer: {
    gap: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    backgroundColor: Colors.background,
    maxWidth: 900,
    width: '100%',
    alignSelf: 'center',
  },
});
