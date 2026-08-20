import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/app-text';
import { BackButton } from '@/components/back-button';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { GrowthBadge } from '@/components/growth-badge';
import { PrimaryButton } from '@/components/primary-button';
import { TextField } from '@/components/text-field';
import { Colors, FontSize, LetterSpacing, Radius, Spacing } from '@/constants/theme';
import { useAuthSession } from '@/features/auth/auth-session';
import {
  RankingError,
  deleteMyCheer,
  getApartmentCheers,
  postCheer,
} from '@/features/ranking/api';
import type { CheerFeed, CheerPost } from '@/lib/database.types';

/** 서버(apartment_cheers_message_len)와 같은 값. 넘기 전에 앱이 먼저 막는다. */
const MAX_LENGTH = 60;

/**
 * 오늘의 응원 — 같은 단지 이웃끼리 한 줄씩 남기는 자리.
 *
 * 자유게시판이 아니다. 얼굴 아는 이웃끼리 싸움이 나면 헬스장 자체가 불편해지고,
 * 신고·삭제를 감당할 사람도 없다. 그래서 구조로 막아 둔다 — 하루 한 사람 한 줄,
 * 60자, 답글·좋아요 없음, 이번 주 글만. 서버도 같은 규칙을 다시 확인한다.
 */
export default function CheersScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuthSession();
  const aptId = user?.apt_id ?? null;

  const [feed, setFeed] = useState<CheerFeed | null>(null);
  const [draft, setDraft] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDeleteAsking, setIsDeleteAsking] = useState(false);

  useEffect(() => {
    if (!aptId) return;
    let cancelled = false;
    getApartmentCheers(aptId)
      .then((result) => {
        if (cancelled) return;
        setFeed(result);
        // 이미 쓴 글이 있으면 그대로 입력칸에 올려 둔다 — 고치기가 곧 다시 쓰기다.
        setDraft(result.my_message ?? '');
      })
      .catch((error) => {
        if (!cancelled) {
          setErrorMessage(error instanceof RankingError ? error.message : '잠시 후 다시 시도해 주세요.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [aptId]);

  const submit = useCallback(async () => {
    if (!aptId) return;
    const text = draft.trim();
    if (text.length === 0) return;

    setIsSaving(true);
    setErrorMessage(null);
    try {
      setFeed(await postCheer(aptId, text));
    } catch (error) {
      setErrorMessage(error instanceof RankingError ? error.message : '잠시 후 다시 시도해 주세요.');
    } finally {
      setIsSaving(false);
    }
  }, [aptId, draft]);

  const removeMine = useCallback(async () => {
    if (!aptId) return;
    setIsDeleteAsking(false);
    setIsSaving(true);
    try {
      setFeed(await deleteMyCheer(aptId));
      setDraft('');
    } catch (error) {
      setErrorMessage(error instanceof RankingError ? error.message : '잠시 후 다시 시도해 주세요.');
    } finally {
      setIsSaving(false);
    }
  }, [aptId]);

  const posted = feed?.my_message ?? null;
  // 이미 쓴 글과 똑같으면 저장할 게 없다.
  const canSubmit = draft.trim().length > 0 && draft.trim() !== posted && !isSaving;

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
        <BackButton onPress={() => (router.canGoBack() ? router.back() : router.replace('/ranking'))} />
        <Text style={styles.headerTitle} maxFontSizeMultiplier={1.2}>
          오늘의 응원
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.xxl }]}
        keyboardShouldPersistTaps="handled">
        {/* 쓰는 자리가 맨 위다 — 읽으러 왔다가 쓰고 가는 게 아니라, 쓰고 나서
            남의 글을 보는 순서가 참여를 만든다. */}
        <View style={styles.writeCard}>
          <TextField
            label={posted ? '오늘 남긴 글 (고칠 수 있어요)' : '오늘 한 줄 남기기'}
            value={draft}
            onChangeText={setDraft}
            placeholder="오늘도 힘내세요!"
            maxLength={MAX_LENGTH}
            returnKeyType="done"
            onSubmitEditing={() => void submit()}
          />
          <Text style={styles.counter} maxFontSizeMultiplier={1.2}>
            {draft.length} / {MAX_LENGTH}
          </Text>

          {errorMessage ? (
            <Text style={styles.errorText} maxFontSizeMultiplier={1.3} accessibilityLiveRegion="polite">
              {errorMessage}
            </Text>
          ) : null}

          <View style={styles.writeButtons}>
            {posted ? (
              <PrimaryButton
                label="지우기"
                variant="secondary"
                disabled={isSaving}
                onPress={() => setIsDeleteAsking(true)}
                style={styles.writeButton}
              />
            ) : null}
            <PrimaryButton
              label={posted ? '고치기' : '남기기'}
              disabled={!canSubmit}
              loading={isSaving}
              onPress={() => void submit()}
              style={styles.writeButton}
            />
          </View>
        </View>

        <Text style={styles.rule} maxFontSizeMultiplier={1.3}>
          하루 한 줄씩, 이번 주 글만 보여요
        </Text>

        {!aptId ? (
          <Text style={styles.empty} maxFontSizeMultiplier={1.3}>
            아직 주 소속 헬스장이 없어요.
          </Text>
        ) : feed === null ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        ) : feed.posts.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle} maxFontSizeMultiplier={1.2}>
              아직 아무도 안 남겼어요
            </Text>
            <Text style={styles.empty} maxFontSizeMultiplier={1.3}>
              첫 글을 남겨 보세요
            </Text>
          </View>
        ) : (
          <View style={styles.posts}>
            {feed.posts.map((post) => (
              <PostRow key={post.id} post={post} />
            ))}
          </View>
        )}
      </ScrollView>

      <ConfirmDialog
        visible={isDeleteAsking}
        title="글을 지울까요?"
        message="지우면 이웃들 화면에서도 사라져요. 오늘 다시 쓸 수 있어요."
        confirmLabel="지우기"
        destructive
        onConfirm={() => void removeMine()}
        onCancel={() => setIsDeleteAsking(false)}
      />
    </View>
  );
}

function PostRow({ post }: { post: CheerPost }) {
  return (
    <View style={[styles.post, post.is_me && styles.postMe]}>
      <GrowthBadge levelIndex={post.level_index} size={32} />
      <View style={styles.postBody}>
        <Text style={styles.postName} maxFontSizeMultiplier={1.2} numberOfLines={1}>
          {post.is_me ? `${post.nickname} (나)` : post.nickname}
        </Text>
        <Text style={styles.postMessage} maxFontSizeMultiplier={1.3}>
          {post.message}
        </Text>
      </View>
      <Text style={styles.postDay} maxFontSizeMultiplier={1.2}>
        {formatDay(post.cheered_on)}
      </Text>
    </View>
  );
}

/** "2026-08-20" → "8/20" */
function formatDay(date: string): string {
  const [, m, d] = date.split('-');
  return `${Number(m)}/${Number(d)}`;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  headerTitle: {
    fontSize: FontSize.section,
    fontWeight: '700',
    letterSpacing: LetterSpacing.subtitle,
    color: Colors.text,
  },
  content: {
    flexGrow: 1,
    gap: Spacing.lg,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
  },
  writeCard: {
    gap: Spacing.sm,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
  },
  counter: {
    fontSize: FontSize.caption,
    fontWeight: '600',
    color: Colors.textTertiary,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  writeButtons: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  writeButton: {
    flex: 1,
  },
  errorText: {
    fontSize: FontSize.caption,
    fontWeight: '600',
    letterSpacing: LetterSpacing.body,
    color: Colors.danger,
  },
  rule: {
    fontSize: FontSize.caption,
    fontWeight: '500',
    letterSpacing: LetterSpacing.body,
    color: Colors.textTertiary,
  },
  centered: {
    alignItems: 'center',
    paddingVertical: Spacing.xxxl,
  },
  emptyBox: {
    gap: Spacing.xs,
    alignItems: 'center',
    paddingVertical: Spacing.xxl,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
  },
  emptyTitle: {
    fontSize: FontSize.body,
    fontWeight: '700',
    letterSpacing: LetterSpacing.body,
    color: Colors.text,
  },
  empty: {
    fontSize: FontSize.caption,
    fontWeight: '500',
    letterSpacing: LetterSpacing.body,
    color: Colors.textSecondary,
  },
  posts: {
    gap: Spacing.sm,
  },
  post: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
  },
  postMe: {
    backgroundColor: Colors.primaryFaint,
  },
  postBody: {
    flex: 1,
    gap: 2,
  },
  postName: {
    fontSize: FontSize.caption,
    fontWeight: '600',
    letterSpacing: LetterSpacing.body,
    color: Colors.textSecondary,
  },
  postMessage: {
    fontSize: FontSize.body,
    fontWeight: '600',
    lineHeight: FontSize.body * 1.5,
    letterSpacing: LetterSpacing.body,
    color: Colors.text,
  },
  postDay: {
    fontSize: FontSize.caption,
    fontWeight: '500',
    color: Colors.textTertiary,
    fontVariant: ['tabular-nums'],
  },
});
