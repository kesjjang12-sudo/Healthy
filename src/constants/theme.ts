/**
 * 핏루틴 디자인 토큰 — FIT ROTEIN(Wanted 계열) 시스템.
 *
 * 색·라운드는 계정의 FIT ROTEIN 디자인 시스템에서 가져왔다:
 * 주색 Blue 50 #0066FF, 회색은 Cool Neutral(살짝 파란기 도는 회색, 순회색 금지).
 * 선을 긋지 않고 여백과 면으로 구분하고, 색은 파랑 하나만 쓰고, 주 버튼은
 * 화면 아래에 고정하는 문법은 그대로다.
 *
 * 치수는 시안보다 크게 유지한다. 우리는 헬스장에서 서서 조작하는 4060
 * 시니어가 기준이라, FIT ROTEIN 의 색만 가져오고 크기는 양보하지 않는다.
 * - 터치 타깃 최소 88pt (WCAG 권장 44pt의 2배)
 * - 본문 최소 20pt, 얇은 굵기 금지
 * - 본문 대비 7:1 이상 (WCAG AAA), 다크모드 없이 밝은 화면 고정
 */

/** Cool Neutral 램프(FIT ROTEIN). CN10→900 … CN99→50 로 매핑했다. */
const grey = {
  900: '#171719',
  700: '#37383C',
  600: '#5A5C63',
  500: '#70737C',
  400: '#989BA2',
  300: '#AEB0B6',
  200: '#C2C4C8',
  100: '#DBDCDF',
  50: '#F7F7F8',
} as const;

export const Colors = {
  /** 브랜드 — 화면에서 파랑은 여기서만 나온다. FIT ROTEIN Blue 50/40/95. */
  primary: '#0066FF',
  primaryPressed: '#0054D1',
  primaryFaint: '#EAF2FE',

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
  success: '#009F69',
  successFaint: '#E5F7F0',

  /** 선은 최후의 수단이다. CN50 을 16% 얹은 값 — 면으로 안 되는 곳에만. */
  divider: '#E9EAEC',

  grey,
} as const;

/**
 * 토스처럼 목록 행 왼쪽에 붙는 아이콘 타일의 바탕색. 위에는 항상 흰 아이콘이
 * 올라간다. 색은 의미가 아니라 "서로 다른 항목"을 구분하는 용도라, 같은
 * 화면에서 겹치지만 않으면 된다.
 */
export const IconTint = {
  blue: '#0066FF',
  green: '#009F69',
  orange: '#FF9200',
  red: '#F04452',
  teal: '#00B7B9',
  grey: grey[400],
} as const;

export type IconTintName = keyof typeof IconTint;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

/** FIT ROTEIN 라운드 스케일 — 이전(10/14/20/28)보다 각을 살렸다. */
export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
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
  /** 목록에서 가장 먼저 읽혀야 하는 줄 — 쉬운 말로 쓴 운동 이름 */
  headline: 28,
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
  /** 폰 하단 탭. 88pt 는 태블릿 기준이라 폰 탭바엔 과하다 — iOS HIG 44pt보다는 넉넉하게. */
  tab: 64,
  /** 토스식 목록 행(폰). 토스는 56pt 안팎이지만 시니어 손가락 기준으로 키웠다. */
  row: 72,
} as const;
