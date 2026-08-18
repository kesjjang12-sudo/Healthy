import type { ProfileData, User } from '@/lib/database.types';
import {
  GENERIC_ERROR_MESSAGE,
  NETWORK_ERROR_MESSAGE,
  isNetworkError,
  matchErrorCode,
} from '@/lib/rpc-error';
import { supabase } from '@/lib/supabase';

const RPC_ERROR_CODES = ['USER_NOT_FOUND', 'INVALID_PROFILE_PATCH'] as const;

const MESSAGES: Record<(typeof RPC_ERROR_CODES)[number], string> = {
  USER_NOT_FOUND: '회원 정보를 찾지 못했어요. 번호부터 다시 눌러주세요.',
  INVALID_PROFILE_PATCH: GENERIC_ERROR_MESSAGE,
};

export class ProfileError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'ProfileError';
    this.cause = cause;
  }
}

/**
 * profile_data 를 병합 저장한다(덮어쓰기 아님).
 * 서버에서 `profile_data || patch` 로 처리하므로 보낸 키만 바뀐다.
 */
export async function updateProfileData(
  userId: string,
  patch: Partial<ProfileData>,
): Promise<User> {
  const { data, error } = await supabase.rpc('update_profile_data', {
    p_user_id: userId,
    p_patch: patch,
  });

  if (error) {
    const code = matchErrorCode(error, RPC_ERROR_CODES);
    if (code) throw new ProfileError(MESSAGES[code], error);
    throw new ProfileError(
      isNetworkError(error) ? NETWORK_ERROR_MESSAGE : GENERIC_ERROR_MESSAGE,
      error,
    );
  }

  if (!data) throw new ProfileError(GENERIC_ERROR_MESSAGE);

  return data;
}
