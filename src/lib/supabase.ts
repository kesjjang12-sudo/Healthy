import 'react-native-url-polyfill/auto';

import { createClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/database.types';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/lib/env';

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
 * 헬스장 태블릿은 공용 기기다. 특정 개인의 Supabase Auth 세션을 기기에
 * 눌러앉히면 다음 사람이 그 세션을 물려받게 되므로, GoTrue 세션 저장을 끄고
 * 전화번호 인증은 sign_in_with_phone RPC 로 처리한다.
 */
// 환경변수가 비어 있어도 createClient 가 던지지 않도록 형식만 맞춘 값을 넣는다.
// 이 경우 앱은 설정 안내 화면에서 멈추므로 실제로 요청이 나가지는 않는다.
const url = SUPABASE_URL || 'https://unconfigured.supabase.co';
const anonKey = SUPABASE_ANON_KEY || 'unconfigured';

export const supabase = createClient<Database>(url, anonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
  global: { fetch: fetchWithTimeout },
});
