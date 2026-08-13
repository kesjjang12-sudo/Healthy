/**
 * 앱 설정값. EXPO_PUBLIC_* 는 번들에 그대로 박히므로 anon key 처럼
 * "공개돼도 RLS 로 막히는" 값만 여기에 둔다. service_role key 는 절대 금지.
 *
 * 값이 없어도 여기서 예외를 던지지 않는다. 모듈 로드 시점에 던지면 실기기에서
 * 빨간 에러 화면만 뜨고 뭘 해야 하는지 알 수 없다. 대신 MISSING_ENV 를 채워서
 * 앱이 안내 화면을 띄우게 한다.
 */

export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

/**
 * 예전에 태블릿의 단지를 정하던 값. 이제는 태블릿이 최초 설정 때 등록 코드로
 * 받아 기기에 저장한다(device-role/storage) — 그래야 앱 빌드 하나로 여러 단지를
 * 감당한다. 빌드에 박힌 값은 단지마다 앱을 새로 빌드해야 했다.
 *
 * 남겨 두는 이유는 이미 설치된 태블릿 때문이다. 그 기기들엔 저장된 단지가
 * 없으므로, 지금까지 실제로 쓰던 이 값을 새 형식으로 옮길 때 한 번 읽는다.
 * 그 외에는 아무도 이 값을 쓰지 않는다.
 */
export const LEGACY_APT_ID = process.env.EXPO_PUBLIC_FITROUTINE_APT_ID ?? '';

/**
 * 비어 있는 환경변수 이름들. 하나라도 있으면 앱을 정상 구동할 수 없다.
 * 단지 id 는 여기 없다 — 이제 필수가 아니다.
 */
export const MISSING_ENV: string[] = [
  ['EXPO_PUBLIC_SUPABASE_URL', SUPABASE_URL],
  ['EXPO_PUBLIC_SUPABASE_ANON_KEY', SUPABASE_ANON_KEY],
]
  .filter(([, value]) => !value)
  .map(([name]) => name);
