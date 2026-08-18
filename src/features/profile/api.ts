import type { User } from '@/lib/database.types';
import {
  GENERIC_ERROR_MESSAGE,
  NETWORK_ERROR_MESSAGE,
  isNetworkError,
  matchErrorCode,
  type RpcError,
} from '@/lib/rpc-error';
import { supabase } from '@/lib/supabase';

const RPC_ERROR_CODES = [
  'NICKNAME_INVALID',
  'NICKNAME_PROFANITY',
  'NICKNAME_RATE_LIMITED',
  'AUTH_REQUIRED',
  'USER_NOT_FOUND',
] as const;

const MESSAGES: Record<(typeof RPC_ERROR_CODES)[number], string> = {
  NICKNAME_INVALID: '닉네임은 2~12자로 입력해 주세요.',
  NICKNAME_PROFANITY: '닉네임에 쓸 수 없는 단어가 들어 있어요. 다른 이름을 골라 주세요.',
  NICKNAME_RATE_LIMITED: '닉네임은 2주에 한 번 바꿀 수 있어요.',
  AUTH_REQUIRED: '로그인 후 다시 시도해 주세요.',
  USER_NOT_FOUND: '회원 정보를 찾지 못했어요. 다시 로그인해 주세요.',
};

export class NicknameError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'NicknameError';
    this.cause = cause;
  }
}

/**
 * 서버는 'NICKNAME_RATE_LIMITED:2026-08-27T…Z' 처럼 다음 가능 시각을 붙여
 * 보낸다. 날짜를 읽을 수 있으면 "8월 27일부터"라고 구체적으로 안내한다 —
 * "2주에 한 번"만 들으면 언제부터인지 되물을 수밖에 없다.
 */
function rateLimitMessage(error: RpcError): string {
  const raw = /NICKNAME_RATE_LIMITED:(\S+)/.exec(error?.message ?? '')?.[1];
  const next = raw ? new Date(raw) : null;
  if (!next || Number.isNaN(next.getTime())) return MESSAGES.NICKNAME_RATE_LIMITED;

  return `닉네임은 2주에 한 번 바꿀 수 있어요. ${next.getMonth() + 1}월 ${next.getDate()}일부터 다시 바꿀 수 있어요.`;
}

/** 닉네임을 바꾼다. 비속어·변경 주기 검사는 전부 서버가 한다. */
export async function updateNickname(nickname: string): Promise<User> {
  const { data, error } = await supabase.rpc('update_nickname', { p_nickname: nickname });

  if (error) {
    const code = matchErrorCode(error, RPC_ERROR_CODES);
    if (code === 'NICKNAME_RATE_LIMITED') throw new NicknameError(rateLimitMessage(error), error);
    if (code) throw new NicknameError(MESSAGES[code], error);
    throw new NicknameError(
      isNetworkError(error) ? NETWORK_ERROR_MESSAGE : GENERIC_ERROR_MESSAGE,
      error,
    );
  }

  if (!data?.user) throw new NicknameError(GENERIC_ERROR_MESSAGE);
  return data.user;
}
