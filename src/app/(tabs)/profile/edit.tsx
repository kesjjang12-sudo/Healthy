import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/app-text';
import { ChoiceButton } from '@/components/choice-button';
import { PrimaryButton } from '@/components/primary-button';
import { TextField } from '@/components/text-field';
import { Colors, FontSize, LetterSpacing, Radius, Spacing } from '@/constants/theme';
import { useAuthSession } from '@/features/auth/auth-session';
import { ConsentError, revokeConsent } from '@/features/legal/api';
import { CONSENT_ITEMS } from '@/features/legal/consent-items';
import { updateProfileData } from '@/features/onboarding/api';
import { PROFILE_QUESTIONS } from '@/features/onboarding/questions';
import { NicknameError, updateNickname } from '@/features/profile/api';

const GENDER_QUESTION = PROFILE_QUESTIONS.find((q) => q.key === 'gender')!;
const AGE_QUESTION = PROFILE_QUESTIONS.find((q) => q.key === 'age_group')!;

/**
 * 내 정보 고치기.
 *
 * 프로필 탭은 "지금 내 상태"를 보는 곳이고, 고치는 일은 여기로 뺐다. 예전엔
 * 한 화면에 요약과 입력칸이 섞여 있어서, 로그아웃을 누르러 들어온 사람도
 * 닉네임 입력칸부터 지나가야 했다.
 */
export default function ProfileEditScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, setUser } = useAuthSession();

  const [nickname, setNickname] = useState(user?.profile_data?.nickname ?? '');
  const [isSavingNickname, setIsSavingNickname] = useState(false);
  const [nicknameNotice, setNicknameNotice] = useState<{
    kind: 'error' | 'done';
    text: string;
  } | null>(null);
  const [isRevoking, setIsRevoking] = useState(false);
  const [consentError, setConsentError] = useState<string | null>(null);

  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/profile');
  }, [router]);

  const saveNickname = useCallback(async () => {
    setIsSavingNickname(true);
    setNicknameNotice(null);
    try {
      const updated = await updateNickname(nickname.trim());
      setUser(updated);
      setNicknameNotice({ kind: 'done', text: '닉네임을 바꿨어요.' });
    } catch (error) {
      // 서버가 이유(비속어·중복·2주 제한)를 말해 주므로 그대로 보여준다 —
      // 말없이 안 바뀌면 고장으로 오해한다.
      setNicknameNotice({
        kind: 'error',
        text:
          error instanceof NicknameError
            ? error.message
            : '저장하지 못했어요. 다시 시도해 주세요.',
      });
    } finally {
      setIsSavingNickname(false);
    }
  }, [nickname, setUser]);

  const selectGender = useCallback(
    async (value: string | number) => {
      const updated = await updateProfileData(user!.id, {
        gender: value as 'male' | 'female',
      }).catch(() => null);
      if (updated) setUser(updated);
    },
    [user, setUser],
  );

  const selectAgeGroup = useCallback(
    async (value: string | number) => {
      const updated = await updateProfileData(user!.id, {
        age_group: value as (typeof AGE_QUESTION.options)[number]['value'],
      }).catch(() => null);
      if (updated) setUser(updated);
    },
    [user, setUser],
  );

  /**
   * 선택 동의 철회.
   *
   * 서버가 기록만 남기는 게 아니라 저장된 아픈 곳 값도 실제로 지운다 —
   * 개인정보처리방침에 "거두시면 바로 지웁니다"라고 적어 두고 안 지우면
   * 그 방침이 거짓말이 된다.
   */
  const revokePainAreas = useCallback(async () => {
    setIsRevoking(true);
    setConsentError(null);
    try {
      setUser(await revokeConsent(user!.id, 'pain_areas'));
    } catch (error) {
      setConsentError(
        error instanceof ConsentError ? error.message : '잠시 후 다시 시도해 주세요.',
      );
    } finally {
      setIsRevoking(false);
    }
  }, [setUser, user]);

  return (
    <View style={styles.screen}>
      <View style={[styles.topbar, { paddingTop: insets.top + Spacing.sm }]}>
        <PrimaryButton label="뒤로" variant="quiet" size="compact" onPress={goBack} />
        <Text style={styles.topbarTitle} maxFontSizeMultiplier={1.2}>
          내 정보 고치기
        </Text>
        {/* 제목을 가운데 두려고 오른쪽에 같은 폭의 빈 칸을 둔다. */}
        <View style={styles.topbarSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* 이 칸만 섹션 캡션을 안 붙인다 — TextField 가 자기 라벨을 그리는데,
            위에 캡션까지 두면 "랭킹 닉네임 / 닉네임" 이 두 줄로 겹쳐 보인다. */}
        <View style={styles.section}>
          <TextField
            label="랭킹 닉네임"
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
          {nicknameNotice ? (
            <Text
              style={nicknameNotice.kind === 'error' ? styles.errorText : styles.doneText}
              maxFontSizeMultiplier={1.3}
              accessibilityLiveRegion="polite">
              {nicknameNotice.text}
            </Text>
          ) : (
            <Text style={styles.helper} maxFontSizeMultiplier={1.3}>
              랭킹에서 다른 회원에게 보이는 이름이에요. 가입하실 때 하나 지어 드렸고, 마음에 안
              드시면 바꾸셔도 돼요. 같은 이름을 쓰는 분이 있으면 고를 수 없고, 한 번 바꾸면 2주
              뒤에 다시 바꿀 수 있어요.
            </Text>
          )}
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
            아픈 곳 정보
          </Text>
          {/* 선택 동의는 언제든 거둘 수 있어야 한다. 필수 동의는 여기 안 띄운다 —
              그건 서비스를 안 쓰겠다는 뜻이라 탈퇴 경로로 처리해야 한다. */}
          {user!.profile_data?.consent?.pain_areas === true ? (
            <View style={styles.consentBox}>
              <Text style={styles.helper} maxFontSizeMultiplier={1.3}>
                {CONSENT_ITEMS.find((item) => item.key === 'pain_areas')?.declineNote}
              </Text>
              <PrimaryButton
                label="아픈 곳 정보 동의 거두기"
                variant="quiet"
                size="compact"
                loading={isRevoking}
                onPress={() => void revokePainAreas()}
              />
            </View>
          ) : (
            <Text style={styles.helper} maxFontSizeMultiplier={1.3}>
              아픈 곳 정보는 받고 있지 않아요. 다시 받으시려면 문의해 주세요.
            </Text>
          )}
          {consentError ? (
            <Text
              style={styles.errorText}
              maxFontSizeMultiplier={1.3}
              accessibilityLiveRegion="polite">
              {consentError}
            </Text>
          ) : null}
        </View>

        <View style={{ height: insets.bottom + Spacing.xl }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.divider,
  },
  topbarTitle: {
    flex: 1,
    fontSize: FontSize.subtitle,
    fontWeight: '600',
    letterSpacing: LetterSpacing.subtitle,
    color: Colors.text,
    textAlign: 'center',
  },
  topbarSpacer: {
    width: 56,
  },
  content: {
    gap: Spacing.xxl,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xl,
    maxWidth: 700,
    width: '100%',
    alignSelf: 'center',
  },
  section: {
    gap: Spacing.md,
  },
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
  consentBox: {
    gap: Spacing.sm,
    padding: Spacing.lg,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
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
  doneText: {
    fontSize: FontSize.caption,
    fontWeight: '600',
    letterSpacing: LetterSpacing.body,
    color: Colors.success,
  },
});
