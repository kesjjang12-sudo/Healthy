import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/app-text';
import { FontScalePicker } from '@/components/font-scale-picker';
import { GrowthBadge } from '@/components/growth-badge';
import { Icon } from '@/components/icon';
import { ListRow } from '@/components/list-row';
import { PrimaryButton } from '@/components/primary-button';
import { Colors, FontSize, LetterSpacing, Radius, Spacing } from '@/constants/theme';
import { useAuthSession } from '@/features/auth/auth-session';
import { growthStatus } from '@/features/growth/levels';
import {
  GymMembershipError,
  listMyGymMemberships,
  makeGymPrimary,
} from '@/features/gym-membership/api';
import { getHealthConnectionStatus } from '@/features/health/provider';
import { updateProfileData } from '@/features/onboarding/api';
import { useFontScale } from '@/features/settings/font-scale';
import { copyToClipboard } from '@/lib/clipboard';
import type { FontScale, GymMembershipSummary } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';

const PROVIDER_LABELS: Record<string, string> = {
  kakao: '카카오',
  google: '구글',
};

/**
 * 프로필 탭.
 *
 * 시안(3d)대로 "보는 화면"이다 — 맨 위에 내가 누구인지, 그 아래로 포인트·
 * 헬스장·계정이 카드로 쌓인다. 고치는 일은 전부 한 겹 안쪽(profile/edit)에
 * 있다. 예전엔 이 화면이 입력 폼이라, 로그아웃을 누르러 들어온 사람도
 * 닉네임 입력칸부터 지나가야 했다.
 */
export default function ProfileTab() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, signOut, setUser } = useAuthSession();
  const { scale: fontScale, setScale: setFontScale } = useFontScale();

  const [codeCopied, setCodeCopied] = useState(false);
  const copyResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [providerLabel, setProviderLabel] = useState<string | null>(null);
  const [memberships, setMemberships] = useState<GymMembershipSummary[] | null>(null);
  const [membershipError, setMembershipError] = useState<string | null>(null);
  const [switchingAptId, setSwitchingAptId] = useState<string | null>(null);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      const authUser = data.session?.user;
      if (!authUser) return;
      setProviderLabel(
        authUser.is_anonymous
          ? '전화번호'
          : (PROVIDER_LABELS[authUser.app_metadata?.provider ?? ''] ?? '알 수 없음'),
      );
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    listMyGymMemberships(user!.id)
      .then((result) => {
        if (!cancelled) setMemberships(result);
      })
      .catch((error) => {
        if (!cancelled) {
          setMembershipError(
            error instanceof GymMembershipError ? error.message : '불러오지 못했어요.',
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const copySupportCode = useCallback(async () => {
    const code = user?.support_code;
    if (!code) return;

    const ok = await copyToClipboard(code);
    if (!ok) return;

    setCodeCopied(true);
    if (copyResetTimer.current) clearTimeout(copyResetTimer.current);
    copyResetTimer.current = setTimeout(() => setCodeCopied(false), 2_000);
  }, [user]);

  useEffect(() => {
    return () => {
      if (copyResetTimer.current) clearTimeout(copyResetTimer.current);
    };
  }, []);

  /**
   * 화면에 먼저 반영하고 서버에는 뒤따라 보낸다. 글자 크기는 눌러 보고 고르는
   * 값이라 왕복을 기다리면 "눌렀는데 안 바뀌네" 가 된다. 저장이 실패해도 이
   * 기기에는 남아 있고(AsyncStorage), 다음에 다시 보내진다.
   */
  const selectFontScale = useCallback(
    async (next: FontScale) => {
      setFontScale(next);
      const updated = await updateProfileData(user!.id, { font_scale: next }).catch(() => null);
      if (updated) setUser(updated);
    },
    [setFontScale, user, setUser],
  );

  const switchPrimary = useCallback(
    async (aptId: string) => {
      setSwitchingAptId(aptId);
      try {
        await makeGymPrimary(user!.id, aptId);
        setUser({ ...user!, apt_id: aptId });

        // 주 소속을 옮기면 다니던 다른 헬스장은 떠난 것으로 처리된다(그 단지
        // 랭킹에서 빠진다). 목록에서는 사라지지 않는다 — 방문 이력은 기록이다.
        const leftAt = new Date().toISOString();
        setMemberships(
          (current) =>
            current?.map((m) =>
              m.apt_id === aptId
                ? { ...m, is_primary: true, left_at: null }
                : { ...m, is_primary: false, left_at: m.left_at ?? leftAt },
            ) ?? current,
        );
      } catch (error) {
        setMembershipError(
          error instanceof GymMembershipError ? error.message : '바꾸지 못했어요.',
        );
      } finally {
        setSwitchingAptId(null);
      }
    },
    [user, setUser],
  );

  // 실명을 주신 분은 실명으로 부른다. 닉네임은 랭킹에 나가는 이름이라
  // 아래 줄에 따로 적는다 — 둘을 섞으면 실명이 랭킹에 나가는 줄 오해한다.
  const nickname = user?.profile_data?.nickname ?? '';
  const realName = user?.profile_data?.real_name?.trim() ?? '';
  const displayName = realName || nickname || '회원';

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + Spacing.xxl, paddingBottom: insets.bottom + Spacing.xl },
      ]}>
      <Text style={styles.title} maxFontSizeMultiplier={1.2}>
        내 정보
      </Text>

      {/* 신원 카드. 행 전체가 "고치기"로 들어가는 문이다 — 시안의 › 하나가
          그 뜻이라, 작은 버튼을 따로 두지 않는다. */}
      <Pressable
        onPress={() => router.push('/profile/edit')}
        accessibilityRole="button"
        accessibilityLabel={`내 정보 고치기. ${displayName}, 랭킹 닉네임 ${nickname}`}
        style={({ pressed }) => [styles.identityCard, pressed && styles.cardPressed]}>
        <View style={styles.avatar}>
          <Icon name="person" size={24} color={Colors.textSecondary} strokeWidth={1.9} />
        </View>
        <View style={styles.identityTexts}>
          <Text style={styles.identityName} maxFontSizeMultiplier={1.3}>
            {displayName}
          </Text>
          <Text style={styles.identityMeta} maxFontSizeMultiplier={1.3}>
            랭킹 닉네임 · {nickname || '아직 없음'}
          </Text>
        </View>
        <Text style={styles.chevron} maxFontSizeMultiplier={1.2}>
          ›
        </Text>
      </Pressable>

      {/* 경험치와 호칭. 운동 홈의 성장 카드와 같은 값을 요약해서 보여준다. */}
      <View style={styles.pointCard}>
        <GrowthBadge levelIndex={growthStatus(user?.total_points ?? 0).level.index} size={34} />
        <Text style={styles.pointLabel} maxFontSizeMultiplier={1.3}>
          {growthStatus(user?.total_points ?? 0).level.name}
        </Text>
        <Text style={styles.pointValue} maxFontSizeMultiplier={1.3}>
          경험치 {(user?.total_points ?? 0).toLocaleString('ko-KR')}점
        </Text>
      </View>

      {/* 시안에는 없지만 여기 남긴다. 글자 크기는 잘 안 보이는 분이 찾는
          설정이라, 한 겹 안쪽에 넣으면 정작 필요한 분이 못 찾는다. */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle} maxFontSizeMultiplier={1.2}>
          글자 크기
        </Text>
        <FontScalePicker value={fontScale} onChange={(next) => void selectFontScale(next)} />
        <Text style={styles.helper} maxFontSizeMultiplier={1.3}>
          누르시면 앱 전체 글씨가 바로 바뀌어요.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle} maxFontSizeMultiplier={1.2}>
          내 헬스장
        </Text>

        {membershipError ? (
          <Text style={styles.errorText} maxFontSizeMultiplier={1.3}>
            {membershipError}
          </Text>
        ) : memberships === null ? null : memberships.length === 0 ? (
          <Text style={styles.helper} maxFontSizeMultiplier={1.3}>
            아직 체크인한 헬스장이 없어요.
          </Text>
        ) : (
          <View style={styles.rows}>
            {memberships.map((m) => (
              <ListRow
                key={m.apt_id}
                icon="building"
                tint={m.is_primary ? 'blue' : 'grey'}
                title={m.apt_name}
                subtitle={
                  m.is_primary
                    ? '지금 다니는 곳'
                    : m.left_at
                      ? `이전에 다니던 곳 · 방문 ${m.visit_count}회`
                      : `방문 ${m.visit_count}회`
                }
                right={
                  !m.is_primary ? (
                    <PrimaryButton
                      label={m.left_at ? '다시 다니기' : '주 소속으로'}
                      variant="quiet"
                      size="compact"
                      loading={switchingAptId === m.apt_id}
                      onPress={() => void switchPrimary(m.apt_id)}
                    />
                  ) : undefined
                }
              />
            ))}
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle} maxFontSizeMultiplier={1.2}>
          연결과 계정
        </Text>

        <View style={styles.rows}>
          {/* getHealthConnectionStatus() 는 지금 항상 'unavailable' 이다
              (features/health/provider.ts 참고) — 네이티브 모듈 없이는 실제
              연동을 할 수 없어 "준비 중"만 정직하게 보여준다. */}
          {getHealthConnectionStatus() === 'unavailable' ? (
            <ListRow
              icon="heart"
              tint="red"
              title="애플 헬스 · Health Connect"
              subtitle="연결되면 걸음 수와 활동 시간을 자동으로 불러와요"
              value="준비 중"
              valueTone="secondary"
            />
          ) : null}

          {/* 고객대응용 계정번호. 문의 전화·채팅에서 "계정번호 알려주세요"
              한마디로 회원을 특정하기 위한 값이라, 눈에 띌 필요는 없고 찾을 수
              있으면 된다. 행 전체가 복사 버튼이다 — 작은 칩보다 누르기 쉽다. */}
          {user?.support_code ? (
            <ListRow
              icon="person"
              tint="grey"
              title="계정번호"
              subtitle={codeCopied ? '복사했어요' : '문의할 때 알려주세요 · 누르면 복사돼요'}
              value={user.support_code}
              onPress={() => void copySupportCode()}
              accessibilityLabel={`계정번호 ${user.support_code}, 누르면 복사해요`}
            />
          ) : null}

          <ListRow
            icon="document"
            tint="grey"
            title="이용약관"
            chevron
            onPress={() => router.push('/legal/terms')}
          />
          <ListRow
            icon="document"
            tint="grey"
            title="개인정보처리방침"
            chevron
            onPress={() => router.push('/legal/privacy')}
          />
          <ListRow
            icon="logout"
            tint="grey"
            title="로그아웃"
            subtitle={providerLabel ? `${providerLabel}로 로그인되어 있어요` : undefined}
            chevron
            onPress={() => void signOut()}
          />
        </View>
      </View>
    </ScrollView>
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
    maxWidth: 700,
    width: '100%',
    alignSelf: 'center',
  },
  title: {
    fontSize: FontSize.title,
    fontWeight: '700',
    letterSpacing: LetterSpacing.title,
    color: Colors.text,
  },
  identityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
    padding: Spacing.lg,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.divider,
    backgroundColor: Colors.background,
  },
  cardPressed: {
    backgroundColor: Colors.surfacePressed,
  },
  avatar: {
    // 시안은 56이지만 48로 줄였다. 시안에 없는 조건이 하나 있어서다 — 글자를
    // '크게'로 쓰시는 분의 좁은 폰(320px)에서는 56이면 이름 칸이 모자라
    // 닉네임이 어절 중간에서 잘렸다. 한글 닉네임은 띄어쓰기가 없어 끊을 자리가
    // 없으니, 칸을 넓혀 주는 것 말고는 방법이 없다.
    width: 48,
    height: 48,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityTexts: {
    flex: 1,
    gap: 2,
  },
  identityName: {
    fontSize: FontSize.subtitle,
    fontWeight: '700',
    letterSpacing: LetterSpacing.subtitle,
    color: Colors.text,
  },
  identityMeta: {
    fontSize: FontSize.caption,
    fontWeight: '500',
    letterSpacing: LetterSpacing.body,
    color: Colors.textSecondary,
  },
  chevron: {
    fontSize: FontSize.subtitle,
    color: Colors.textTertiary,
  },
  pointCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.lg,
    borderRadius: Radius.md,
    backgroundColor: Colors.primaryFaint,
  },
  pointLabel: {
    flex: 1,
    fontSize: FontSize.body,
    fontWeight: '600',
    letterSpacing: LetterSpacing.body,
    color: Colors.primaryPressed,
  },
  pointValue: {
    fontSize: FontSize.headline,
    fontWeight: '700',
    letterSpacing: LetterSpacing.subtitle,
    color: Colors.primary,
  },
  section: {
    gap: Spacing.md,
  },
  /** 토스의 "금융 서비스" 같은 회색 섹션 캡션 — 내용보다 조용해야 한다. */
  sectionTitle: {
    fontSize: FontSize.caption,
    fontWeight: '600',
    letterSpacing: LetterSpacing.body,
    color: Colors.grey[500],
  },
  rows: {
    gap: Spacing.xs,
  },
  helper: {
    fontSize: FontSize.caption,
    fontWeight: '500',
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
