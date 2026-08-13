import type { AgeGroup } from '@/lib/database.types';

/** 생년월일은 8자리로만 받는다. 19850312 처럼. */
export const BIRTH_DATE_LENGTH = 8;

/** 숫자만 남긴다. */
export function toDigits(input: string): string {
  return input.replace(/\D/g, '');
}

/** 입력 중에도 읽히게 점을 끼운다. 1985 → 1985, 19850312 → 1985.03.12 */
export function formatBirthDate(input: string): string {
  const digits = toDigits(input).slice(0, BIRTH_DATE_LENGTH);

  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}.${digits.slice(4)}`;
  return `${digits.slice(0, 4)}.${digits.slice(4, 6)}.${digits.slice(6)}`;
}

/**
 * 실제로 존재하는 날짜인지 본다.
 *
 * 자리수만 세면 19851345 같은 값이 통과한다. Date 로 되돌려 같은 날이 나오는지
 * 확인하면 2월 30일 같은 것도 걸러진다.
 */
export function isValidBirthDate(input: string): boolean {
  const digits = toDigits(input);
  if (digits.length !== BIRTH_DATE_LENGTH) return false;

  const year = Number(digits.slice(0, 4));
  const month = Number(digits.slice(4, 6));
  const day = Number(digits.slice(6, 8));

  const now = new Date();
  // 사람이 살아 있을 수 있는 범위 밖이면 오타로 본다.
  if (year < 1900 || year > now.getFullYear()) return false;

  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return false;
  }

  return date.getTime() <= now.getTime();
}

/** 19850312 → 1985-03-12 (DB 저장 포맷) */
export function toIsoDate(input: string): string {
  const digits = toDigits(input);
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

/**
 * 생년월일에서 연령대를 뽑는다.
 *
 * 설문(onboarding)이 묻는 값과 같은 칸에 넣어 두면 그 질문을 한 번 덜 묻는다 —
 * 이미 답한 것을 또 묻는 화면만큼 신뢰를 깎는 것도 없다.
 * 70 은 "70대 이상"이라 상한이고, 10 은 하한이다.
 */
export function toAgeGroup(input: string): AgeGroup {
  const digits = toDigits(input);
  const birth = new Date(
    Number(digits.slice(0, 4)),
    Number(digits.slice(4, 6)) - 1,
    Number(digits.slice(6, 8)),
  );

  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();

  // 생일이 아직 안 지났으면 한 살 뺀다.
  const hadBirthday =
    now.getMonth() > birth.getMonth() ||
    (now.getMonth() === birth.getMonth() && now.getDate() >= birth.getDate());
  if (!hadBirthday) age -= 1;

  const decade = Math.floor(age / 10) * 10;
  return Math.min(70, Math.max(10, decade)) as AgeGroup;
}
