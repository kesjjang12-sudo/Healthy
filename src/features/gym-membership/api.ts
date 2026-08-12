import type { GymMembershipSummary } from '@/lib/database.types';
import {
  GENERIC_ERROR_MESSAGE,
  NETWORK_ERROR_MESSAGE,
  isNetworkError,
  matchErrorCode,
  type RpcError,
} from '@/lib/rpc-error';
import { supabase } from '@/lib/supabase';

const RPC_ERROR_CODES = ['AUTH_REQUIRED', 'FORBIDDEN', 'USER_NOT_FOUND', 'MEMBERSHIP_NOT_FOUND'] as const;

export class GymMembershipError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'GymMembershipError';
    this.cause = cause;
  }
}

function toMembershipError(error: RpcError): GymMembershipError {
  const code = matchErrorCode(error, RPC_ERROR_CODES);
  if (code) return new GymMembershipError('처리하지 못했습니다. 다시 시도해 주세요.', error);
  return new GymMembershipError(
    isNetworkError(error) ? NETWORK_ERROR_MESSAGE : GENERIC_ERROR_MESSAGE,
    error,
  );
}

/** 내가 다닌 헬스장 목록(주 소속 우선, 최근 방문순). */
export async function listMyGymMemberships(userId: string): Promise<GymMembershipSummary[]> {
  const { data, error } = await supabase.rpc('list_my_gym_memberships', { p_user_id: userId });

  if (error) throw toMembershipError(error);
  return data ?? [];
}

/** 이 헬스장을 주 소속으로 바꾼다. */
export async function makeGymPrimary(userId: string, aptId: string): Promise<void> {
  const { error } = await supabase.rpc('confirm_gym_membership', {
    p_user_id: userId,
    p_apt_id: aptId,
    p_make_primary: true,
  });

  if (error) throw toMembershipError(error);
}
