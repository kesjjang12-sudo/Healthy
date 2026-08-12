const SCHEME = 'fitroutine';

/**
 * 키오스크가 QR 로 인코딩하는 딥링크.
 * 앱 안의 전용 스캐너로 찍어도, 시스템 카메라 앱으로 찍어도 똑같이 앱이 열리게
 * 딥링크 URL 형태로 만든다 — 코드 문자열만 인코딩하면 시스템 카메라는 그냥
 * 텍스트로만 보여주고 앱을 열어주지 않는다.
 */
export function buildPairingDeepLink(code: string): string {
  return `${SCHEME}://pair/${code}`;
}

/** 스캔한 딥링크에서 페어링 코드만 뽑아낸다. 형식이 아니면 null. */
export function parsePairingCode(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== `${SCHEME}:`) return null;

    // fitroutine://pair/123456 은 "pair" 가 host, "/123456" 이 path 로 파싱된다.
    const segments = [parsed.hostname, ...parsed.pathname.split('/')].filter(Boolean);
    const [kind, code] = segments;

    return kind === 'pair' && code ? code : null;
  } catch {
    return null;
  }
}
