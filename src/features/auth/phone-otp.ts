import { toDigits } from '@/features/auth/phone';
import { supabase } from '@/lib/supabase';

/**
 * 전화번호 + SMS 인증번호 로그인.
 *
 * QR 페어링과 무엇이 다른가. 페어링은 "헬스장에 실제로 와 있다"를 신뢰 근거로
 * 삼기 때문에 태블릿이 없으면 아무것도 못 한다 — 집에서는 로그인이 불가능하다.
 * SMS 인증은 "이 번호를 지금 들고 있다"를 근거로 삼으므로 어디서든 된다.
 * 번호만 알면 되는 게 아니라 그 번호로 온 문자를 받아야 하므로,
 * 예전에 지운 sign_in_with_phone(번호만 알면 로그인)과는 신뢰 수준이 다르다.
 *
 * ⚠️ Supabase 대시보드에서 Phone 인증을 켜고 SMS 업체(Twilio 등)를 연결해야
 * 동작한다. 안 켜져 있으면 signInWithOtp 가 오류를 돌려주므로, 아래에서
 * 그 상황을 따로 구분해 안내한다.
 */

/** GoTrue 는 E.164 를 요구한다. 010-1234-5678 → +821012345678 */
export function toE164(input: string): string {
  const digits = toDigits(input);
  return `+82${digits.replace(/^0/, '')}`;
}

export type PhoneOtpErrorCode =
  | 'NOT_CONFIGURED'
  | 'INVALID_CODE'
  | 'EXPIRED_CODE'
  | 'RATE_LIMITED'
  | 'NETWORK'
  | 'UNKNOWN';

const MESSAGES: Record<PhoneOtpErrorCode, string> = {
  NOT_CONFIGURED: '문자 인증이 아직 준비되지 않았어요. 카카오나 구글로 로그인해 주세요.',
  INVALID_CODE: '인증번호가 맞지 않아요. 다시 확인해 주세요.',
  EXPIRED_CODE: '인증번호가 만료됐어요. 다시 받아주세요.',
  RATE_LIMITED: '너무 자주 시도했어요. 잠시 후 다시 해주세요.',
  NETWORK: '인터넷 연결을 확인해 주세요.',
  UNKNOWN: '잠시 후 다시 시도해 주세요.',
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

/**
 * GoTrue 는 오류 코드를 일관되게 주지 않는다(상태코드 + 문구가 섞여 온다).
 * 사용자가 할 수 있는 행동이 갈리는 것만 구분하고 나머지는 UNKNOWN 으로 둔다.
 */
function toOtpError(error: { message?: string; status?: number } | null): PhoneOtpError {
  const message = (error?.message ?? '').toLowerCase();

  // 대시보드에서 Phone 인증을 안 켠 상태. 사용자가 뭘 해도 안 되므로 따로 알린다.
  if (
    message.includes('phone provider') ||
    message.includes('sms provider') ||
    message.includes('unsupported phone provider') ||
    message.includes('phone_provider_disabled') ||
    message.includes('signups not allowed') ||
    error?.status === 422
  ) {
    return new PhoneOtpError('NOT_CONFIGURED', error);
  }

  if (message.includes('expired')) return new PhoneOtpError('EXPIRED_CODE', error);
  if (message.includes('invalid') || message.includes('token')) {
    return new PhoneOtpError('INVALID_CODE', error);
  }
  if (error?.status === 429 || message.includes('rate limit')) {
    return new PhoneOtpError('RATE_LIMITED', error);
  }
  if (message.includes('network') || message.includes('fetch') || message.includes('abort')) {
    return new PhoneOtpError('NETWORK', error);
  }

  return new PhoneOtpError('UNKNOWN', error);
}

/** 인증번호 문자를 보낸다. 가입 여부와 무관하게 보낸다(없으면 새 계정이 된다). */
export async function sendPhoneOtp(phoneNumber: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({ phone: toE164(phoneNumber) });
  if (error) throw toOtpError(error);
}

/**
 * 받은 인증번호를 확인하고 세션을 만든다.
 *
 * 세션이 생기면 auth-session 이 bootstrap_oauth_profile 로 프로필을 가져온다.
 * 그때 users 행은 auth_user_id 기준으로 찾으므로, 예전에 QR 로 만든 계정이
 * 따로 있으면 여기서 자동으로 합쳐지지는 않는다 — 그 연결은 QR 페어링이
 * 담당한다(complete_pairing).
 */
export async function verifyPhoneOtp(phoneNumber: string, code: string): Promise<void> {
  const { error } = await supabase.auth.verifyOtp({
    phone: toE164(phoneNumber),
    token: code,
    type: 'sms',
  });

  if (error) throw toOtpError(error);
}
