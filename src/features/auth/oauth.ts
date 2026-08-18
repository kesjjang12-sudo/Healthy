import { makeRedirectUri } from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';

import { supabase } from '@/lib/supabase';

// 웹에서 인증 창이 새 탭으로 뜨는 경우를 대비한 필수 호출. 네이티브에서는 no-op 이다.
WebBrowser.maybeCompleteAuthSession();

export type OAuthProvider = 'kakao' | 'google';
export type OAuthOutcome = 'signed_in' | 'cancelled';

export class OAuthError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'OAuthError';
    this.cause = cause;
  }
}

/**
 * 로그인 완료 후 돌아올 주소. 딥링크 스킴(fitroutine://)을 쓰므로 앱이 설치돼
 * 있으면 시스템 브라우저에서 앱으로 자동 복귀한다.
 */
const REDIRECT_TO = makeRedirectUri({ scheme: 'fitroutine', path: 'auth-callback' });

/**
 * 카카오/구글 로그인 공통 처리.
 *
 * 네이티브 SDK 를 쓰지 않는다 — Supabase Auth 가 OAuth 토큰 교환을 대신 해주므로
 * `signInWithOAuth` 로 인가 URL 을 받아 시스템 브라우저에서 열고, 돌아온 인가
 * 코드를 세션으로 교환하는 것만 하면 된다. 심사 없이 되는 기본 프로필/이메일
 * 스코프만 쓴다 — 카카오 전화번호 스코프는 사업자등록+심사가 필요해 이번엔 안
 * 쓰고, 전화번호는 QR 페어링(anonymous.ts)으로 따로 연결한다.
 */
async function signInWithProvider(provider: OAuthProvider): Promise<OAuthOutcome> {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: REDIRECT_TO, skipBrowserRedirect: true },
  });

  if (error || !data.url) {
    throw new OAuthError('로그인을 시작하지 못했어요.', error);
  }

  const result = await WebBrowser.openAuthSessionAsync(data.url, REDIRECT_TO);

  // 사용자가 뒤로가기/취소로 창을 닫은 경우. 오류로 취급하지 않는다.
  if (result.type !== 'success' || !result.url) {
    return 'cancelled';
  }

  const code = new URL(result.url).searchParams.get('code');
  if (!code) {
    throw new OAuthError('로그인 응답이 올바르지 않아요.');
  }

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) {
    throw new OAuthError('로그인을 완료하지 못했어요.', exchangeError);
  }

  return 'signed_in';
}

export function signInWithKakao(): Promise<OAuthOutcome> {
  return signInWithProvider('kakao');
}

export function signInWithGoogle(): Promise<OAuthOutcome> {
  return signInWithProvider('google');
}
