import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/app-text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/primary-button';
import { Colors, FontSize, LetterSpacing, Radius, Spacing } from '@/constants/theme';
import { fillPlaceholders } from '@/features/legal/company';
import { PRIVACY_POLICY } from '@/features/legal/privacy';
import { TERMS_OF_SERVICE } from '@/features/legal/terms';
import type { LegalDocument } from '@/features/legal/types';

const DOCUMENTS: Record<string, LegalDocument> = {
  terms: TERMS_OF_SERVICE,
  privacy: PRIVACY_POLICY,
};

/**
 * 웹으로 내보낼 때 이 동적 경로를 실제 주소로 펼친다.
 *
 * 이게 없으면 정적 내보내기가 `legal/[doc].html` 파일 하나만 만들고,
 * `/legal/privacy` 로 들어오면 404 가 난다. 앱 안에서만 쓸 때는 몰랐는데,
 * **개인정보 처리방침은 밖에서 주소로 열려야 한다** — 카카오·구글의 개인정보
 * 동의항목 심사가 공개된 처리방침 URL 을 요구하고, 개인정보 보호법상으로도
 * 이용자가 언제든 확인할 수 있어야 한다.
 */
export function generateStaticParams(): { doc: string }[] {
  return Object.keys(DOCUMENTS).map((doc) => ({ doc }));
}

/**
 * 약관·개인정보처리방침 전문.
 *
 * 앱 안에 원문을 들고 있어서 네트워크 없이도 읽힌다 — 동의를 받는 화면에서
 * "전문 보기"가 안 열리면 읽을 기회를 준 게 아니다.
 */
export default function LegalDocumentScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { doc } = useLocalSearchParams<{ doc: string }>();

  const document = DOCUMENTS[doc ?? ''];

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  if (!document) {
    return (
      <View style={styles.screen}>
        <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.xl }]}>
          <Text style={styles.paragraph} maxFontSizeMultiplier={1.3}>
            찾으시는 문서가 없습니다.
          </Text>
        </ScrollView>
        <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.lg }]}>
          <PrimaryButton label="돌아가기" variant="secondary" onPress={goBack} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.xl }]}>
        <View style={styles.headings}>
          <Text style={styles.title} maxFontSizeMultiplier={1.2}>
            {document.title}
          </Text>
          <Text style={styles.meta} maxFontSizeMultiplier={1.3}>
            {document.version} 판 · {document.effectiveFrom} 시행
          </Text>
        </View>

        {document.sections.map((section) => (
          <View key={section.heading} style={styles.section}>
            <Text style={styles.heading} maxFontSizeMultiplier={1.2}>
              {section.heading}
            </Text>

            {section.blocks.map((block, index) =>
              typeof block === 'string' ? (
                <Text key={index} style={styles.paragraph} maxFontSizeMultiplier={1.3}>
                  {fillPlaceholders(block)}
                </Text>
              ) : (
                <View key={index} style={styles.list}>
                  {block.map((line) => (
                    <View key={line} style={styles.listItem}>
                      {/* 이 앱은 기호 글리프를 안 쓴다. 목록 표시도 도형으로 그린다. */}
                      <View style={styles.bullet} />
                      <Text style={styles.paragraph} maxFontSizeMultiplier={1.3}>
                        {fillPlaceholders(line)}
                      </Text>
                    </View>
                  ))}
                </View>
              ),
            )}
          </View>
        ))}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.lg }]}>
        <PrimaryButton label="다 읽었습니다" variant="secondary" onPress={goBack} />
      </View>
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
  headings: {
    gap: Spacing.xs,
  },
  title: {
    fontSize: FontSize.subtitle,
    fontWeight: '700',
    lineHeight: FontSize.subtitle * 1.35,
    letterSpacing: LetterSpacing.subtitle,
    color: Colors.text,
  },
  meta: {
    fontSize: FontSize.caption,
    fontWeight: '600',
    letterSpacing: LetterSpacing.body,
    color: Colors.textTertiary,
  },
  section: {
    gap: Spacing.sm,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
  },
  heading: {
    fontSize: FontSize.body,
    fontWeight: '700',
    letterSpacing: LetterSpacing.subtitle,
    color: Colors.text,
  },
  paragraph: {
    flex: 1,
    fontSize: FontSize.caption,
    fontWeight: '500',
    lineHeight: FontSize.caption * 1.7,
    letterSpacing: LetterSpacing.body,
    color: Colors.textSecondary,
  },
  list: {
    gap: Spacing.xs,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    paddingLeft: Spacing.sm,
  },
  bullet: {
    width: 5,
    height: 5,
    marginTop: FontSize.caption * 0.8,
    borderRadius: Radius.full,
    backgroundColor: Colors.textTertiary,
  },
  footer: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    backgroundColor: Colors.background,
    maxWidth: 700,
    width: '100%',
    alignSelf: 'center',
  },
});
