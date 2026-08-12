/**
 * 핏루틴 디자인 토큰.
 *
 * 4060 시니어가 헬스장 벽에 걸린 태블릿을 서서 조작한다는 전제로 잡았다.
 * - 터치 타깃 최소 88pt (WCAG 권장 44pt의 2배)
 * - 본문 최소 22pt, 얇은 굵기 금지 (600 이상)
 * - 명도 대비 7:1 이상 (WCAG AAA), 다크모드 없이 밝은 화면 고정
 */

export const Colors = {
  /** 브랜드 */
  primary: '#0B5FD1',
  primaryPressed: '#08479C',
  primaryFaint: '#E8F0FC',

  /** 배경 */
  background: '#FFFFFF',
  surface: '#F4F6FA',
  surfacePressed: '#E2E7F0',

  /** 텍스트 (대비 7:1 이상) */
  text: '#111827',
  textSecondary: '#4B5563',
  textOnPrimary: '#FFFFFF',
  textDisabled: '#9CA3AF',

  /** 상태 */
  danger: '#C2261B',
  dangerFaint: '#FDECEA',
  success: '#0F7A3D',

  /** 구분선 */
  border: '#D3D9E3',
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const Radius = {
  md: 12,
  lg: 20,
  full: 999,
} as const;

export const FontSize = {
  /** 안내 문구 */
  body: 22,
  /** 버튼 라벨 */
  label: 26,
  /** 화면 제목 */
  title: 40,
  /** 키패드 숫자 */
  keypad: 44,
  /** 입력된 전화번호 */
  display: 56,
} as const;

/** 손가락으로 눌러야 하는 요소의 최소 크기 */
export const TouchTarget = {
  min: 88,
} as const;
