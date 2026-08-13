/** 국내 휴대폰 번호: 010/011/016/017/018/019 + 7~8자리 */
const PHONE_PATTERN = /^01[016789][0-9]{7,8}$/;

export const PHONE_MAX_DIGITS = 11;

/** 입력값에서 숫자만 남긴다. DB 저장 포맷과 동일하다. */
export function toDigits(input: string): string {
  return input.replace(/\D/g, '');
}

export function isValidPhoneNumber(input: string): boolean {
  return PHONE_PATTERN.test(toDigits(input));
}

/**
 * 입력 중에도 읽히도록 하이픈을 끼워 넣는다.
 * 010 → 010, 0101234 → 010-1234, 01012345678 → 010-1234-5678
 */
export function formatPhoneNumber(input: string): string {
  const digits = toDigits(input).slice(0, PHONE_MAX_DIGITS);

  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;

  // 10자리(011-123-4567)와 11자리(010-1234-5678)의 가운데 자리수가 다르다.
  const middleLength = digits.length <= 10 ? 3 : 4;
  return `${digits.slice(0, 3)}-${digits.slice(3, 3 + middleLength)}-${digits.slice(3 + middleLength)}`;
}

/**
 * Supabase Auth(signInWithOtp/verifyOtp)가 받는 E.164 형식으로.
 * 01012345678 → +821012345678. 유효한 국내 번호인지 먼저 확인하고 부를 것.
 */
export function toE164(input: string): string {
  return `+82${toDigits(input).slice(1)}`;
}

/** 화면에 남의 번호를 그대로 노출하지 않기 위한 마스킹. 예: 010-1234-**** */
export function maskPhoneNumber(input: string): string {
  const digits = toDigits(input);
  if (digits.length < 4) return formatPhoneNumber(digits);
  return formatPhoneNumber(digits).replace(/[0-9]{4}$/, '****');
}
