import type { ActivityWindow } from '@/lib/database.types';

/**
 * "내가 잘하고 있나"를 한 줄로 답한다.
 *
 * 숫자만 보여주면 판단은 결국 사람 몫이다. 3번이 많은 건지 적은 건지는
 * 지난번의 나와 비교해야 알 수 있어서, 서버가 직전 같은 길이 기간을 같이
 * 준다(get_progress_summary).
 *
 * 문장은 나무라지 않는다. 적게 나온 주에 "줄었습니다"라고 쏘아붙이면 그 주에
 * 앱을 안 열게 된다 — 사실은 그대로 말하되 다음 행동을 붙여 준다.
 */

/** 기준은 출석이다. 완료 개수는 버튼만 눌러도 늘지만 출석은 체크인이 있어야 남는다. */
export function attendanceLine(
  current: ActivityWindow,
  previous: ActivityWindow,
  days: number,
): string {
  const now = current.attendance_days;
  const before = previous.attendance_days;
  const label = `지난 ${days}일`;

  if (now === 0) {
    return before > 0
      ? `${label}에는 ${before}번 나오셨어요. 오늘 한 번 어떠세요`
      : '아직 기록이 없어요. 오늘이 첫날이 될 수 있습니다';
  }

  if (before === 0) return '다시 시작하셨네요. 이 흐름을 이어가 봐요';
  if (now > before) return `${label}보다 ${now - before}번 더 나오셨어요`;
  if (now === before) return `${label}과 같은 횟수예요. 잘 지키고 계세요`;

  return `${label}보다 ${before - now}번 적어요. 한 번만 더 채워 봐요`;
}

/** 연속 몇 주째인지. 0주면 아예 안 보여준다 — "0주 연속"은 놀리는 말이 된다. */
export function streakLine(weeks: number): string | null {
  if (weeks <= 0) return null;
  if (weeks === 1) return '이번 주에 나오셨어요';
  return `${weeks}주 연속으로 나오고 계세요`;
}

/**
 * 근력·유산소를 한 줄로. 둘 다 0이면 null 을 돌려 그 줄을 아예 빼 버린다
 * ("0세트 · 0분"은 안 하는 걸 굳이 확인시키는 문장이다).
 */
export function volumeLine(window: ActivityWindow): string | null {
  const parts: string[] = [];

  if (window.total_sets > 0) parts.push(`근력 ${window.total_sets}세트`);
  if (window.cardio_minutes > 0) parts.push(`유산소 ${window.cardio_minutes}분`);

  return parts.length > 0 ? parts.join(' · ') : null;
}
