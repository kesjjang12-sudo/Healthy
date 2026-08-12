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
 * 이 태블릿이 설치된 아파트 단지 id.
 * 지금은 빌드 시점 환경변수로 주입한다. 단지가 늘어나면 기기 최초 부팅 시
 * 관리자 코드로 단지를 고르고 AsyncStorage 에 저장하는 방식으로 바꾼다.
 */
export const APT_ID = process.env.EXPO_PUBLIC_FITROUTINE_APT_ID ?? '';

/** 비어 있는 환경변수 이름들. 하나라도 있으면 앱을 정상 구동할 수 없다. */
export const MISSING_ENV: string[] = [
  ['EXPO_PUBLIC_SUPABASE_URL', SUPABASE_URL],
  ['EXPO_PUBLIC_SUPABASE_ANON_KEY', SUPABASE_ANON_KEY],
  ['EXPO_PUBLIC_FITROUTINE_APT_ID', APT_ID],
]
  .filter(([, value]) => !value)
  .map(([name]) => name);
