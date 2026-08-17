import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Text } from '@/components/app-text';
import { Colors, FontSize, LetterSpacing, Radius, Spacing, TouchTarget } from '@/constants/theme';

/**
 * 로그인 수단 버튼.
 *
 * 앱 공통 파란 버튼을 쓰지 않고 각 서비스의 색과 심벌을 그대로 쓴다. 4060
 * 회원은 "카카오로 시작하기"라는 글자보다 **노란 버튼에 말풍선**을 먼저
 * 알아본다 — 다른 앱에서 수십 번 눌러 본 그 모양이라 읽지 않고도 찾는다.
 * 글자만 있는 버튼 세 개가 세로로 서 있으면 셋 다 같은 것으로 보인다.
 *
 * 색·심벌은 각 사에서 정한 값을 따랐다(카카오 #FEE500 + 검은 말풍선,
 * 구글 흰 바탕 + 회색 테두리 + 4색 G). 심사에서 이 규격을 본다.
 */

export type SocialProvider = 'kakao' | 'google' | 'phone';

const STYLE: Record<
  SocialProvider,
  { bg: string; border?: string; text: string; label: string }
> = {
  // 카카오 브랜드 가이드: 배경 #FEE500, 심벌·글자는 불투명도 85% 검정.
  kakao: { bg: '#FEE500', text: 'rgba(0,0,0,0.85)', label: '카카오로 시작하기' },
  // 구글 가이드: 흰 바탕 + #747775 계열 테두리 + #1F1F1F 글자.
  google: { bg: '#FFFFFF', border: '#DADCE0', text: '#1F1F1F', label: '구글로 시작하기' },
  // 문자인증은 남의 브랜드가 아니라 우리 것이다. 앱 회색 면으로 조용히 둔다.
  phone: { bg: Colors.surface, text: Colors.text, label: '문자로 시작하기' },
};

export function SocialButton({
  provider,
  onPress,
  loading,
  disabled,
  /** "최근 로그인" 말풍선. 지난번에 쓴 수단에만 붙는다. */
  recent,
}: {
  provider: SocialProvider;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  recent?: boolean;
}) {
  const s = STYLE[provider];

  return (
    <View>
      {/* 지난번에 뭘로 들어왔는지 기억하는 분이 드물다. 앱이 대신 기억해서
          짚어 주면, 엉뚱한 수단으로 눌러 새 계정이 생기는 일을 막는다. */}
      {recent ? (
        <View style={styles.badgeRow} pointerEvents="none">
          <View style={styles.badge}>
            <Text style={styles.badgeText} maxFontSizeMultiplier={1.2}>
              최근 로그인
            </Text>
          </View>
          <View style={styles.badgeTail} />
        </View>
      ) : null}

      <Pressable
        onPress={onPress}
        disabled={disabled || loading}
        accessibilityRole="button"
        accessibilityLabel={recent ? `${s.label}. 최근에 사용한 방법입니다` : s.label}
        accessibilityState={{ disabled: disabled || loading, busy: loading }}
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: s.bg },
          s.border ? { borderWidth: 1, borderColor: s.border } : null,
          pressed && styles.pressed,
          (disabled || loading) && styles.disabled,
        ]}>
        {loading ? (
          <ActivityIndicator color={s.text} />
        ) : (
          <>
            <View style={styles.icon}>
              <ProviderIcon provider={provider} />
            </View>
            <Text style={[styles.label, { color: s.text }]} maxFontSizeMultiplier={1.2}>
              {s.label}
            </Text>
          </>
        )}
      </Pressable>
    </View>
  );
}

function ProviderIcon({ provider }: { provider: SocialProvider }) {
  if (provider === 'kakao') {
    // 카카오톡 말풍선. 아래로 뻗은 꼬리까지 있어야 그 모양으로 읽힌다.
    return (
      <Svg width={20} height={20} viewBox="0 0 24 24">
        <Path
          d="M12 3C6.9 3 2.8 6.3 2.8 10.3c0 2.6 1.7 4.9 4.3 6.2l-1.1 4c-.1.3.3.6.6.4l4.7-3.1c.2 0 .5.1.7.1 5.1 0 9.2-3.3 9.2-7.6S17.1 3 12 3z"
          fill="rgba(0,0,0,0.85)"
        />
      </Svg>
    );
  }

  if (provider === 'google') {
    // 구글 G. 네 색을 다 써야 그 로고로 보인다.
    return (
      <Svg width={20} height={20} viewBox="0 0 48 48">
        <Path
          fill="#4285F4"
          d="M45.1 24.5c0-1.6-.1-2.8-.4-4H24v7.3h12.1c-.2 1.9-1.6 4.8-4.5 6.8l6.9 5.3c4.1-3.8 6.6-9.4 6.6-15.4z"
        />
        <Path
          fill="#34A853"
          d="M24 46c5.9 0 10.9-2 14.5-5.3l-6.9-5.3c-1.9 1.3-4.4 2.2-7.6 2.2-5.8 0-10.7-3.8-12.5-9.1l-7.1 5.5C7.9 41.1 15.4 46 24 46z"
        />
        <Path
          fill="#FBBC05"
          d="M11.5 28.5c-.5-1.4-.7-2.9-.7-4.5s.3-3.1.7-4.5l-7.1-5.5C2.9 17 2 20.4 2 24s.9 7 2.4 10z"
        />
        <Path
          fill="#EA4335"
          d="M24 10.6c4.1 0 6.9 1.8 8.5 3.3l6.1-6C34.9 4.5 29.9 2 24 2 15.4 2 7.9 6.9 4.4 14l7.1 5.5c1.8-5.3 6.7-8.9 12.5-8.9z"
        />
      </Svg>
    );
  }

  // 문자(SMS): 말풍선 안에 점 세 개 — 인증번호가 문자로 온다는 뜻.
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Path
        d="M4 5.5h16a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5h-8.2l-4.6 3.2c-.4.3-.9 0-.9-.5v-2.7H4A1.5 1.5 0 0 1 2.5 16V7A1.5 1.5 0 0 1 4 5.5z"
        fill={Colors.primary}
      />
      <Path
        d="M8 11.5h.01M12 11.5h.01M16 11.5h.01"
        stroke="#FFFFFF"
        strokeWidth={2.4}
        strokeLinecap="round"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    minHeight: TouchTarget.cta,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.md,
  },
  pressed: {
    opacity: 0.85,
  },
  disabled: {
    opacity: 0.5,
  },
  icon: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: FontSize.label,
    fontWeight: '700',
    letterSpacing: LetterSpacing.body,
  },
  badgeRow: {
    alignItems: 'center',
    marginBottom: 6,
  },
  badge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 5,
    borderRadius: Radius.full,
    backgroundColor: Colors.text,
  },
  badgeText: {
    fontSize: FontSize.caption,
    fontWeight: '700',
    letterSpacing: LetterSpacing.body,
    color: Colors.background,
  },
  // 말풍선 꼬리. 아래 버튼을 가리키는 삼각형이라 테두리 트릭으로 그린다.
  badgeTail: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: Colors.text,
  },
});
