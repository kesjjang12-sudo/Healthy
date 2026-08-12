import type { LeaderboardRow } from '@/lib/database.types';
import {
  GENERIC_ERROR_MESSAGE,
  NETWORK_ERROR_MESSAGE,
  isNetworkError,
  matchErrorCode,
  type RpcError,
} from '@/lib/rpc-error';
import { supabase } from '@/lib/supabase';

const RPC_ERROR_CODES = ['AUTH_REQUIRED'] as const;

export class RankingError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'RankingError';
    this.cause = cause;
  }
}

function toRankingError(error: RpcError): RankingError {
  const code = matchErrorCode(error, RPC_ERROR_CODES);
  if (code) return new RankingError('로그인 후 다시 시도해 주세요.', error);
  return new RankingError(isNetworkError(error) ? NETWORK_ERROR_MESSAGE : GENERIC_ERROR_MESSAGE, error);
}

/** 같은 단지 랭킹. 닉네임/포인트만 오고 전화번호 등 PII 는 없다. */
export async function getApartmentLeaderboard(aptId: string, limit = 50): Promise<LeaderboardRow[]> {
  const { data, error } = await supabase.rpc('get_apartment_leaderboard', {
    p_apt_id: aptId,
    p_limit: limit,
  });

  if (error) throw toRankingError(error);
  return data ?? [];
}
