/**
 * 앱 설정값. EXPO_PUBLIC_* 는 번들에 그대로 박히므로 anon key 처럼
 * "공개돼도 RLS 로 막히는" 값만 여기에 둔다. service_role key 는 절대 금지.
 */

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `[핏루틴] 환경변수 ${name} 가 설정되지 않았습니다. .env.example 을 복사해 .env 를 만들어 주세요.`,
    );
  }
  return value;
}

export const SUPABASE_URL = required(
  'EXPO_PUBLIC_SUPABASE_URL',
  process.env.EXPO_PUBLIC_SUPABASE_URL,
);

export const SUPABASE_ANON_KEY = required(
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
);

/**
 * 이 태블릿이 설치된 아파트 단지 id.
 * 지금은 빌드 시점 환경변수로 주입한다. 단지가 늘어나면 기기 최초 부팅 시
 * 관리자 코드로 단지를 고르고 AsyncStorage 에 저장하는 방식으로 바꾼다.
 */
export const APT_ID = required(
  'EXPO_PUBLIC_FITROUTINE_APT_ID',
  process.env.EXPO_PUBLIC_FITROUTINE_APT_ID,
);
