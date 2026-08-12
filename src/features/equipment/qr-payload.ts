const SCHEME = 'fitroutine';

/**
 * 기구 앞에 붙일 QR 이 인코딩하는 딥링크. 페어링 QR(pairing/qr-payload.ts)과
 * 같은 이유로 딥링크 URL 형태로 만든다 — 시스템 카메라로 찍어도 앱이 바로
 * 열리게 하려면 순수 텍스트가 아니라 URL 이어야 한다.
 */
export function buildEquipmentDeepLink(qrCode: string): string {
  return `${SCHEME}://equip/${encodeURIComponent(qrCode)}`;
}

/**
 * 스캔한 값에서 기구 코드를 뽑아낸다.
 *
 * 페어링 코드와 달리 여기선 형식을 깐깐하게 안 따진다 — 관리사무소가
 * 우리 앱이 만든 딥링크가 아니라 아무 QR 생성기로 "FIT-DEMO-CHEST-01" 같은
 * 코드 문자열을 그대로 찍어 붙이는 경우도 있을 수 있다. 그래서:
 *   1) fitroutine://equip/<code> 형태면 <code> 를 꺼내고
 *   2) 아니면 스캔된 문자열 자체를 코드로 본다 (트리밍만 한다)
 * 실제로 존재하는 기구인지는 서버 조회(get_equipment_by_qr)가 최종 판단한다 —
 * 여기서 형식을 잘못 좁혀서 진짜 코드를 걸러내는 것보다, 서버에 물어보고
 * EQUIPMENT_NOT_FOUND 로 알려주는 게 안전하다.
 */
export function parseEquipmentCode(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === `${SCHEME}:`) {
      const segments = [parsed.hostname, ...parsed.pathname.split('/')].filter(Boolean);
      const [kind, code] = segments;
      if (kind === 'equip' && code) return decodeURIComponent(code);
      return null; // fitroutine:// 인데 equip 이 아니면(예: pair) 관련 없는 QR.
    }
    // fitroutine: 이 아닌 다른 URL(http 등)은 기구 코드가 아니다.
    return null;
  } catch {
    // URL 로 못 읽으면 순수 텍스트 코드로 취급한다.
    return trimmed;
  }
}
