import type { KioskApartment, KioskEnrollmentResult } from '@/lib/database.types';
import {
  GENERIC_ERROR_MESSAGE,
  NETWORK_ERROR_MESSAGE,
  isNetworkError,
  type RpcError,
} from '@/lib/rpc-error';
import { supabase } from '@/lib/supabase';

export type EnrollmentErrorCode = 'INVALID' | 'PIN_NOT_SET' | 'LOCKED' | 'NETWORK' | 'UNKNOWN';

const MESSAGES: Record<EnrollmentErrorCode, string> = {
  // 코드가 없는 건지 PIN 이 틀린 건지 구분해 주지 않는다. 구분해 주면 코드를
  // 훑어서 어느 단지가 존재하는지 알아낼 수 있다.
  INVALID: '단지 코드 또는 PIN이 올바르지 않습니다.',
  PIN_NOT_SET: '이 단지는 아직 관리자 PIN이 설정되지 않았습니다. 본사에 문의해 주세요.',
  LOCKED: '시도가 너무 많습니다. 15분 뒤에 다시 시도해 주세요.',
  NETWORK: NETWORK_ERROR_MESSAGE,
  UNKNOWN: GENERIC_ERROR_MESSAGE,
};

/** 서버가 돌려주는 실패 상태 → 화면이 쓰는 오류 코드. */
const CODE_BY_STATUS: Record<Exclude<KioskEnrollmentResult['status'], 'ok'>, EnrollmentErrorCode> = {
  invalid: 'INVALID',
  pin_not_set: 'PIN_NOT_SET',
  locked: 'LOCKED',
};

export class EnrollmentError extends Error {
  readonly code: EnrollmentErrorCode;

  constructor(code: EnrollmentErrorCode, cause?: unknown) {
    super(MESSAGES[code]);
    this.name = 'EnrollmentError';
    this.code = code;
    this.cause = cause;
  }
}

function toEnrollmentError(error: RpcError): EnrollmentError {
  if (isNetworkError(error)) return new EnrollmentError('NETWORK', error);
  return new EnrollmentError('UNKNOWN', error);
}

/**
 * 태블릿 최초 설정. 관리사무소가 받은 단지 코드와 관리자 PIN 을 확인하고,
 * 그 태블릿이 앞으로 쓸 apt_id 를 받아 온다. 이 값이 곧 "이 태블릿에서 번호를
 * 누른 사람은 어느 단지 사람인가"의 답이다.
 *
 * 이 RPC 만은 실패를 예외가 아니라 status 로 돌려준다(서버 쪽 주석 참고).
 * 예외로 바꾸는 건 여기서 한다 — 부르는 화면은 다른 API 와 똑같이 쓰면 된다.
 */
export async function resolveApartmentForKiosk(
  enrollCode: string,
  pin: string,
): Promise<KioskApartment> {
  const { data, error } = await supabase.rpc('resolve_apartment_for_kiosk', {
    p_enroll_code: enrollCode,
    p_pin: pin,
  });

  if (error) throw toEnrollmentError(error);
  if (!data) throw new EnrollmentError('UNKNOWN');
  if (data.status !== 'ok') throw new EnrollmentError(CODE_BY_STATUS[data.status] ?? 'UNKNOWN');

  return { apt_id: data.apt_id, apt_name: data.apt_name };
}
