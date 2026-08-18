/**
 * 헬스반장 디자인 토큰 — FIT ROTEIN(Wanted 계열) 시스템.
 *
 * 색·라운드·치수 모두 계정의 FIT ROTEIN 디자인 시스템 시안을 그대로 따른다:
 * 주색 Blue 50 #0066FF, 회색은 Cool Neutral(살짝 파란기 도는 회색, 순회색 금지),
 * 본문 16 · 캡션 13 · 제목 28, 목록 행 56pt, 주 버튼 52pt.
 * 선을 긋지 않고 여백과 면으로 구분하고, 색은 파랑 하나만 쓰고, 주 버튼은
 * 화면 아래에 고정하는 문법도 시안 그대로다.
 *
 * 이전에 쓰던 시니어 확대 치수(본문 20·행 72·타깃 88)는 시안과 밀도가 달라
 * 화면 인상이 완전히 달라졌고, 시안대로 가기로 결정해 걷어냈다(2026-08-15).
 * 접근성 하한은 유지한다 — 터치 타깃 44pt 밑으로는 내리지 않는다.
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
  /** 설명글. 피드백: 연회색이라 안 읽힌다 → 한 단계 진하게 */
  textSecondary: grey[700],
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

/** FIT ROTEIN 시안 타이포 스케일. */
export const FontSize = {
  /** 보조 텍스트. 14 밑으로 내리지 않는다 — 디자인 피드백(2026-08-18) */
  caption: 14,
  /** 안내 문구 */
  body: 16,
  /** 목록 항목 제목 · 부제목 */
  subtitle: 16,
  /** 버튼 라벨 */
  label: 17,
  /** 섹션 제목 */
  section: 18,
  /** 목록에서 가장 먼저 읽혀야 하는 줄 — 쉬운 말로 쓴 운동 이름 */
  headline: 19,
  /** 화면 제목. 28은 폰에서 과했다 — 같은 피드백 */
  title: 22,
  /** 키패드 숫자 */
  keypad: 26,
  /** 입력된 전화번호 */
  display: 40,
} as const;

/**
 * 한글은 자소가 빽빽해서 자간을 조금 좁혀야 덩어리로 읽힌다.
 * 시안의 -0.023em/-0.019em 을 새 글자 크기에 맞춘 값이다.
 */
export const LetterSpacing = {
  title: -0.6,
  subtitle: -0.35,
  body: -0.1,
} as const;

/** 손가락으로 눌러야 하는 요소의 최소 크기. 시안 치수 — 44pt 밑으로는 안 내린다. */
export const TouchTarget = {
  min: 56,
  /** 하단 고정 주 버튼 */
  cta: 52,
  /** 폰 하단 탭 */
  tab: 56,
  /** 목록 행 */
  row: 56,
} as const;
