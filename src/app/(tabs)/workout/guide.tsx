import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/app-text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ExercisePhoto } from '@/components/exercise-photo';
import { FilterDropdown, type FilterOption } from '@/components/filter-dropdown';
import { PrimaryButton } from '@/components/primary-button';
import { Colors, FontSize, LetterSpacing, Radius, Spacing, TouchTarget } from '@/constants/theme';
import { useAuthSession } from '@/features/auth/auth-session';
import {
  EquipmentError,
  listEquipmentGuide,
  type EquipmentGuideSection,
  type GuideEquipment,
} from '@/features/equipment/api';

const ALL_MUSCLES = '전체';

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

  const [muscle, setMuscle] = useState<string>(ALL_MUSCLES);

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

  /**
   * 우리 헬스장에 있는 것만 남긴다.
   *
   * 예전엔 "전체 운동"으로 바꿔 다른 데 있는 기구까지 볼 수 있었는데, 그러면
   * 여기 없는 기구를 보고 찾으러 다니게 된다. 목록에 있으면 있는 것이어야 한다.
   * 맨몸 운동은 기구가 필요 없어 어디서나 되므로 in_my_gym 이 항상 true 다
   * (equipment/api.ts) — 그래서 이 한 줄로 "우리 헬스장에서 할 수 있는 것"이
   * 그대로 남는다.
   */
  const scoped = useMemo(() => {
    if (!sections) return null;
    return sections
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => item.in_my_gym),
      }))
      .filter((section) => section.items.length > 0);
  }, [sections]);

  // 고른 부위가 목록에 없을 수 있다. 그때는 전체로 본다 — effect 로 상태를
  // 되돌리면 한 프레임 동안 빈 화면이 스치고, 왜 비었는지 알 수가 없다.
  const activeMuscle =
    scoped && scoped.some((section) => section.muscle === muscle) ? muscle : ALL_MUSCLES;

  const visible = useMemo(() => {
    if (!scoped) return null;
    if (activeMuscle === ALL_MUSCLES) return scoped;
    return scoped.filter((section) => section.muscle === activeMuscle);
  }, [scoped, activeMuscle]);

  const muscleOptions = useMemo<FilterOption<string>[]>(() => {
    const total = scoped?.reduce((sum, s) => sum + s.items.length, 0);
    return [
      { value: ALL_MUSCLES, label: ALL_MUSCLES, count: total },
      ...(scoped ?? []).map((section) => ({
        value: section.muscle,
        label: section.muscle,
        count: section.items.length,
      })),
    ];
  }, [scoped]);

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
            우리 헬스장에 있는 것만 모았어요. 운동을 누르면 하는 방법과 영상이 나와요.
            파란 칸은 기구 없이 하는 운동이라 집에서도 할 수 있어요.
          </Text>
        </View>

        <View style={styles.filters}>
          <FilterDropdown
            label="부위"
            value={activeMuscle}
            options={muscleOptions}
            onChange={setMuscle}
          />
        </View>

        {errorMessage ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText} maxFontSizeMultiplier={1.3} accessibilityLiveRegion="polite">
              {errorMessage}
            </Text>
            <PrimaryButton label="다시 시도" onPress={retry} />
          </View>
        ) : visible === null ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        ) : visible.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText} maxFontSizeMultiplier={1.3}>
              {muscle === ALL_MUSCLES
                ? '우리 헬스장에 등록된 기구가 아직 없어요. 입구 태블릿에 전화번호를 한 번 눌러 주시면 그때부터 목록이 채워져요.'
                : '이 부위에 맞는 기구가 우리 헬스장에 없어요. 부위를 "전체"로 바꿔 보세요.'}
            </Text>
          </View>
        ) : (
          visible.map((section) => (
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
        <PrimaryButton label="홈으로" onPress={goBack} />
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
        <View style={styles.nameRow}>
          <Text
            style={[styles.name, isBodyweight && styles.nameBodyweight]}
            maxFontSizeMultiplier={1.3}>
            {title}
          </Text>
          {/* 없는 쪽에 표를 단다. 대부분은 있는 기구라, 있는 쪽에 달면 배지가
              화면을 도배한다. "갔는데 없더라"를 막는 게 목적이다. */}
          {!item.in_my_gym ? (
            <Text style={styles.awayBadge} maxFontSizeMultiplier={1.2}>
              우리 헬스장 없음
            </Text>
          ) : null}
        </View>
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
    gap: Spacing.xxl,
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xl,
    maxWidth: 900,
    width: '100%',
    alignSelf: 'center',
  },
  headings: {
    gap: Spacing.sm,
  },
  filters: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  emptyBox: {
    padding: Spacing.xl,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
  },
  emptyText: {
    fontSize: FontSize.body,
    fontWeight: '500',
    lineHeight: FontSize.body * 1.5,
    letterSpacing: LetterSpacing.body,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  awayBadge: {
    fontSize: FontSize.caption,
    fontWeight: '600',
    letterSpacing: LetterSpacing.body,
    color: Colors.textTertiary,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.sm,
    backgroundColor: Colors.surfacePressed,
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
