import { isValidPhoneNumber, toE164 } from '@/features/auth/phone';
import type { User } from '@/lib/database.types';
import {
  GENERIC_ERROR_MESSAGE,
  NETWORK_ERROR_MESSAGE,
  isNetworkError,
  matchErrorCode,
  type RpcError,
} from '@/lib/rpc-error';
import { supabase } from '@/lib/supabase';

/**
 * 전화번호 문자(SMS OTP) 로그인.
 *
 * QR 페어링과 달리 키오스크 없이 어디서든 되는 로그인 경로다. 문자 발송은
 * Supabase Auth 의 Send SMS 훅 → supabase/functions/send-sms → 솔라피로 나간다
 * (README 3.6). 훅/시크릿이 아직 설정 안 된 프로젝트에서는 requestSmsOtp 가
 * 서버 오류로 실패한다 — 화면은 그 메시지를 그대로 보여주면 된다.
 */

export type PhoneOtpErrorCode =
  | 'INVALID_PHONE'
  | 'SEND_FAILED'
  | 'CODE_INCORRECT'
  | 'TOO_MANY_REQUESTS'
  | 'PHONE_ALREADY_LINKED'
  | 'NETWORK'
  | 'UNKNOWN';

const MESSAGES: Record<PhoneOtpErrorCode, string> = {
  INVALID_PHONE: '올바른 휴대폰 번호를 입력해 주세요.',
  SEND_FAILED: '인증번호를 보내지 못했습니다. 잠시 후 다시 시도해 주세요.',
  CODE_INCORRECT: '인증번호가 올바르지 않거나 시간이 지났습니다. 다시 확인해 주세요.',
  TOO_MANY_REQUESTS: '요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.',
  PHONE_ALREADY_LINKED:
    '이 번호는 이미 카카오/구글 계정에 연결되어 있습니다. 그 계정으로 로그인해 주세요.',
  NETWORK: NETWORK_ERROR_MESSAGE,
  UNKNOWN: GENERIC_ERROR_MESSAGE,
};

export class PhoneOtpError extends Error {
  readonly code: PhoneOtpErrorCode;

  constructor(code: PhoneOtpErrorCode, cause?: unknown) {
    super(MESSAGES[code]);
    this.name = 'PhoneOtpError';
    this.code = code;
    this.cause = cause;
  }
}

/** supabase.auth 의 에러를 사용자 언어로. status 가 없는 건 대개 네트워크다. */
function toOtpError(error: { message?: string; status?: number }, fallback: PhoneOtpErrorCode) {
  if (error.status === 429) return new PhoneOtpError('TOO_MANY_REQUESTS', error);
  if (isNetworkError(error)) return new PhoneOtpError('NETWORK', error);
  return new PhoneOtpError(fallback, error);
}

/** 인증번호 문자를 보낸다. 처음 보는 번호면 Auth 계정도 이때 만들어진다. */
export async function requestSmsOtp(phoneDigits: string): Promise<void> {
  if (!isValidPhoneNumber(phoneDigits)) throw new PhoneOtpError('INVALID_PHONE');

  const { error } = await supabase.auth.signInWithOtp({ phone: toE164(phoneDigits) });
  if (error) throw toOtpError(error, 'SEND_FAILED');
}

/**
 * 받은 인증번호를 확인해 세션을 만들고, 프로필까지 확정해 돌려준다.
 *
 * 프로필 확정(bootstrap_oauth_profile)은 auth-session 도 세션 변화를 보고
 * 알아서 하지만, 여기서도 직접 부르는 이유는 실패를 이 화면에서 다뤄야 하기
 * 때문이다 — 특히 PHONE_ALREADY_LINKED(카카오/구글에 이미 연결된 번호)는
 * 세션을 되돌리고(로그아웃) 어느 계정으로 가야 하는지 알려줘야 한다.
 */
export async function verifySmsOtp(phoneDigits: string, token: string): Promise<User> {
  const { error } = await supabase.auth.verifyOtp({
    phone: toE164(phoneDigits),
    token,
    type: 'sms',
  });
  if (error) throw toOtpError(error, 'CODE_INCORRECT');

  const { data, error: rpcError } = await supabase.rpc('bootstrap_oauth_profile');

  if (rpcError) {
    const code = matchErrorCode(rpcError as RpcError, ['PHONE_ALREADY_LINKED'] as const);
    if (code) {
      // 이 세션으로는 프로필에 못 들어간다. 남겨두면 "로그인됐는데 화면은
      // 오류"인 어정쩡한 상태가 되므로 되돌린다.
      await supabase.auth.signOut().catch(() => {});
      throw new PhoneOtpError(code, rpcError);
    }
    throw toOtpError(rpcError as { message?: string }, 'UNKNOWN');
  }
  if (!data) throw new PhoneOtpError('UNKNOWN');

  return data.user;
}
