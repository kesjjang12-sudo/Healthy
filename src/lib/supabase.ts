import 'react-native-url-polyfill/auto';

import { createClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/database.types';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/lib/env';

/**
 * 헬스장 태블릿은 공용 기기다. 특정 개인의 Supabase Auth 세션을 기기에
 * 눌러앉히면 다음 사람이 그 세션을 물려받게 되므로, GoTrue 세션 저장을 끄고
 * 전화번호 인증은 sign_in_with_phone RPC 로 처리한다.
 */
export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});
