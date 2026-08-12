import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

import type { Database } from '@/lib/database.types';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/lib/env';

/**
 * 정적 웹 내보내기(prerender)는 Node 에서 돌아 window 가 없다. AsyncStorage 의
 * 웹 구현체는 window.localStorage 를 바로 찾다가 그 안에서 죽는다(전체 export
 * 자체가 실패한다). 네이티브(iOS/Android)는 window 가 원래 없어도 브릿지로
 * 동작하니 그대로 둔다 — 여기서 막는 건 "웹인데 window 가 없는" 프리렌더
 * 상황뿐이다.
 */
const authStorage =
  Platform.OS === 'web' && typeof window === 'undefined'
    ? {
        getItem: async () => null,
        setItem: async () => {},
        removeItem: async () => {},
      }
    : AsyncStorage;

/**
 * 요청이 이 시간을 넘기면 끊는다.
 *
 * supabase-js 는 기본 타임아웃이 없어서, 헬스장 Wi-Fi 가 끊기거나 응답이 오지 않으면
 * 화면이 로딩 상태로 영원히 멈춘다. 줄 서 있는 공용 태블릿에서는 그게 가장 나쁜 실패다.
 * 차라리 "인터넷 연결을 확인해 주세요" 를 띄우고 다시 시도하게 하는 편이 낫다.
 */
const REQUEST_TIMEOUT_MS = 15_000;

function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  // supabase-js 가 자체 signal 을 넘기는 경우가 있어 둘 다 존중한다.
  const caller = init?.signal;
  if (caller) {
    if (caller.aborted) controller.abort();
    else caller.addEventListener('abort', () => controller.abort(), { once: true });
  }

  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

/**
 * 이 클라이언트는 키오스크(헬스장 입구 태블릿)와 개인 폰 앱 양쪽에서 같이 쓴다.
 *
 * 세션 저장은 항상 켜져 있다 — 개인 폰 앱은 로그인이 앱을 껐다 켜도 유지돼야
 * 하기 때문이다. 그런데도 공용 태블릿이 안전한 이유는 저장을 꺼서가 아니라,
 * 키오스크 쪽 코드가 애초에 supabase.auth.* 를 절대 호출하지 않기 때문이다
 * (kiosk_check_in 은 세션 없는 anon 키 RPC 호출일 뿐이다). 그래서 키오스크
 * 기기에는 애초에 저장할 세션 자체가 생기지 않는다.
 *
 * flowType: 'pkce' 는 카카오/구글 OAuth 리다이렉트가 RN(주소창이 없는 환경)에서
 * 안전하게 동작하려면 필요하다 — 인가 코드를 앱이 직접 교환하는 방식이라
 * 리다이렉트 URL 에 토큰이 그대로 노출되는 implicit flow보다 안전하다.
 */
// 환경변수가 비어 있어도 createClient 가 던지지 않도록 형식만 맞춘 값을 넣는다.
// 이 경우 앱은 설정 안내 화면에서 멈추므로 실제로 요청이 나가지는 않는다.
const url = SUPABASE_URL || 'https://unconfigured.supabase.co';
const anonKey = SUPABASE_ANON_KEY || 'unconfigured';

export const supabase = createClient<Database>(url, anonKey, {
  auth: {
    storage: authStorage,
    persistSession: true,
    autoRefreshToken: true,
    // RN 에는 주소창이 없어 리다이렉트 URL 을 브라우저가 아니라 앱이 직접
    // 받는다(oauth.ts 의 WebBrowser.openAuthSessionAsync 콜백에서 처리).
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
  global: { fetch: fetchWithTimeout },
});
