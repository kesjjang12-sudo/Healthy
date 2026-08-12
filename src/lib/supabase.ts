import 'react-native-url-polyfill/auto';

import { createClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/database.types';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/lib/env';

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
});
