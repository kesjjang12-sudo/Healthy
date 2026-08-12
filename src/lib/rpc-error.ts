/** supabase-js 가 돌려주는 에러의 최소 형태 */
export type RpcError = { message?: string; code?: string } | null;

export const GENERIC_ERROR_MESSAGE = '잠시 후 다시 시도해 주세요.';
export const NETWORK_ERROR_MESSAGE = '인터넷 연결을 확인해 주세요.';

/**
 * 요청 자체가 서버에 닿지 못한 경우. supabase-js 는 이걸 message 에 담아준다.
 * 타임아웃으로 우리가 끊은 요청은 abort 로 올라오므로 같이 잡는다.
 */
export function isNetworkError(error: RpcError): boolean {
  return /fetch|network|timeout|abort/i.test(error?.message ?? '');
}

/**
 * RPC 가 `raise exception 'CODE'` 로 던진 코드를 골라낸다.
 * PostgREST 는 예외 메시지를 message 필드에 그대로 실어 보낸다.
 */
export function matchErrorCode<T extends string>(error: RpcError, codes: readonly T[]): T | null {
  const message = error?.message ?? '';
  return codes.find((code) => message.includes(code)) ?? null;
}
