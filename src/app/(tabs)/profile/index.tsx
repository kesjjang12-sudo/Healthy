import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChoiceButton } from '@/components/choice-button';
import { ListRow } from '@/components/list-row';
import { PrimaryButton } from '@/components/primary-button';
import { TextField } from '@/components/text-field';
import { Colors, FontSize, LetterSpacing, Spacing } from '@/constants/theme';
import { useAuthSession } from '@/features/auth/auth-session';
import { GymMembershipError, listMyGymMemberships, makeGymPrimary } from '@/features/gym-membership/api';
import { getHealthConnectionStatus } from '@/features/health/provider';
import { updateProfileData } from '@/features/onboarding/api';
import { PROFILE_QUESTIONS } from '@/features/onboarding/questions';
import type { GymMembershipSummary } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';

const GENDER_QUESTION = PROFILE_QUESTIONS.find((q) => q.key === 'gender')!;
const AGE_QUESTION = PROFILE_QUESTIONS.find((q) => q.key === 'age_group')!;

const PROVIDER_LABELS: Record<string, string> = {
  kakao: '카카오',
  google: '구글',
};

/**
 * 프로필 탭. 닉네임/성별/연령대 수정, 연결된 로그인 수단, 내 헬스장 목록과
 * 주 소속 전환, 로그아웃까지 여기 다 모았다.
 */
export default function ProfileTab() {
  const insets = useSafeAreaInsets();
  const { user, setUser, signOut } = useAuthSession();

  const [nickname, setNickname] = useState(user?.profile_data?.nickname ?? '');
  const [isSavingNickname, setIsSavingNickname] = useState(false);
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
          setMembershipError(error instanceof GymMembershipError ? error.message : '불러오지 못했습니다.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const saveNickname = useCallback(async () => {
    setIsSavingNickname(true);
    try {
      const updated = await updateProfileData(user!.id, { nickname: nickname.trim() });
      setUser(updated);
    } catch {
      // 저장 실패는 조용히 넘어간다 — 닉네임 하나 때문에 화면을 막을 정도는 아니다.
    } finally {
      setIsSavingNickname(false);
    }
  }, [nickname, user, setUser]);

  const selectGender = useCallback(
    async (value: string | number) => {
      const updated = await updateProfileData(user!.id, { gender: value as 'male' | 'female' }).catch(
        () => null,
      );
      if (updated) setUser(updated);
    },
    [user, setUser],
  );

  const selectAgeGroup = useCallback(
    async (value: string | number) => {
      const updated = await updateProfileData(user!.id, {
        age_group: value as typeof AGE_QUESTION.options[number]['value'],
      }).catch(() => null);
      if (updated) setUser(updated);
    },
    [user, setUser],
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
        setMembershipError(error instanceof GymMembershipError ? error.message : '바꾸지 못했습니다.');
      } finally {
        setSwitchingAptId(null);
      }
    },
    [user, setUser],
  );

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.xxl }]}>
      <Text style={styles.title} maxFontSizeMultiplier={1.2}>
        내 정보
      </Text>

      <View style={styles.section}>
        <TextField
          label="닉네임"
          value={nickname}
          onChangeText={setNickname}
          placeholder="다른 회원에게 보일 이름"
          maxLength={12}
          returnKeyType="done"
          onSubmitEditing={() => void saveNickname()}
        />
        <PrimaryButton
          label="닉네임 저장"
          variant="secondary"
          size="compact"
          loading={isSavingNickname}
          disabled={nickname.trim() === (user?.profile_data?.nickname ?? '')}
          onPress={() => void saveNickname()}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle} maxFontSizeMultiplier={1.2}>
          성별
        </Text>
        <View style={styles.choiceRow}>
          {GENDER_QUESTION.options.map((option) => (
            <ChoiceButton
              key={String(option.value)}
              label={option.label}
              selected={user?.profile_data?.gender === option.value}
              onPress={() => void selectGender(option.value)}
              style={styles.choiceHalf}
            />
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle} maxFontSizeMultiplier={1.2}>
          연령대
        </Text>
        <View style={styles.choiceRow}>
          {AGE_QUESTION.options.map((option) => (
            <ChoiceButton
              key={String(option.value)}
              label={option.label}
              selected={user?.profile_data?.age_group === option.value}
              onPress={() => void selectAgeGroup(option.value)}
              style={styles.choiceThird}
            />
          ))}
        </View>
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
            아직 체크인한 헬스장이 없습니다.
          </Text>
        ) : (
          // 토스 "전체" 화면의 서비스 목록처럼 색 타일 + 제목 + 보조설명으로 쌓는다.
          // 지금 다니는 곳만 파란 타일이라 글자를 읽기 전에 구분된다.
          <View style={styles.gymList}>
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
          건강 앱 연동
        </Text>
        {/* getHealthConnectionStatus() 는 지금 항상 'unavailable' 이다(features/health/provider.ts 참고) —
            네이티브 모듈 없이는 실제 연동을 할 수 없어 "준비 중"만 정직하게 보여준다. */}
        {getHealthConnectionStatus() === 'unavailable' ? (
          <ListRow
            icon="heart"
            tint="red"
            title="애플 헬스 · Health Connect"
            subtitle="연결되면 걸음 수와 활동 시간을 자동으로 불러옵니다"
            value="준비 중"
            valueTone="secondary"
          />
        ) : null}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle} maxFontSizeMultiplier={1.2}>
          계정
        </Text>
        <ListRow
          icon="logout"
          tint="grey"
          title="로그아웃"
          subtitle={providerLabel ? `${providerLabel}로 로그인되어 있습니다` : undefined}
          chevron
          onPress={() => void signOut()}
        />
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
    paddingBottom: Spacing.xl,
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
  choiceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  choiceHalf: {
    flexGrow: 1,
    flexBasis: '46%',
  },
  choiceThird: {
    flexGrow: 1,
    flexBasis: '30%',
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
  gymList: {
    gap: Spacing.xs,
  },
});
