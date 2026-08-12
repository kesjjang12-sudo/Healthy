/**
 * 핏루틴 디자인 토큰.
 *
 * 시각 언어는 토스를 기준으로 잡았다 — 선을 긋지 않고 여백과 면으로 구분하고,
 * 색은 파랑 하나만 쓰고, 주 버튼은 화면 아래에 고정한다.
 *
 * 다만 치수는 토스보다 크다. 토스는 앉아서 폰을 보는 사람 기준이고, 우리는
 * 헬스장 벽에 걸린 태블릿을 서서 조작하는 4060 시니어가 기준이다.
 * - 터치 타깃 최소 88pt (WCAG 권장 44pt의 2배)
 * - 본문 최소 20pt, 얇은 굵기 금지
 * - 본문 대비 7:1 이상 (WCAG AAA), 다크모드 없이 밝은 화면 고정
 */

/** 회색은 파랑 쪽으로 살짝 기울여, 브랜드 색과 같은 계열로 읽히게 한다. */
const grey = {
  900: '#191F28',
  700: '#333D4B',
  600: '#4E5968',
  500: '#6B7684',
  400: '#8B95A1',
  300: '#B0B8C1',
  200: '#D1D6DB',
  100: '#E5E8EB',
  50: '#F2F4F6',
} as const;

export const Colors = {
  /** 브랜드 — 화면에서 파랑은 여기서만 나온다 */
  primary: '#3182F6',
  primaryPressed: '#1B64DA',
  primaryFaint: '#E8F3FF',

  /** 배경: 흰 바탕 위에 회색 "면"으로 영역을 나눈다 */
  background: '#FFFFFF',
  surface: grey[50],
  surfacePressed: grey[100],

  /** 텍스트 */
  text: grey[900],
  textSecondary: grey[600],
  textTertiary: grey[400],
  textOnPrimary: '#FFFFFF',
  textDisabled: grey[300],

  /** 상태 */
  danger: '#F04452',
  dangerFaint: '#FFF0F1',
  success: '#00A661',
  successFaint: '#E7F8F0',

  /** 선은 최후의 수단이다. 면으로 안 되는 곳에만 머리카락 굵기로 쓴다. */
  divider: grey[100],

  grey,
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const Radius = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  full: 999,
} as const;

export const FontSize = {
  caption: 17,
  /** 안내 문구 */
  body: 20,
  /** 목록 항목 제목 */
  subtitle: 24,
  /** 버튼 라벨 */
  label: 24,
  /** 화면 제목 */
  title: 34,
  /** 키패드 숫자 */
  keypad: 40,
  /** 입력된 전화번호 */
  display: 46,
} as const;

/**
 * 한글은 자소가 빽빽해서 자간을 조금 좁혀야 덩어리로 읽힌다.
 * 큰 글씨일수록 더 좁힌다.
 */
export const LetterSpacing = {
  title: -1.0,
  subtitle: -0.6,
  body: -0.3,
} as const;

/** 손가락으로 눌러야 하는 요소의 최소 크기 */
export const TouchTarget = {
  min: 88,
  /** 하단 고정 주 버튼 */
  cta: 68,
} as const;
