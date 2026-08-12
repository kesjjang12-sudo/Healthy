/** YYYY-MM-DD. 서버가 돌려주는 날짜 문자열, 그리고 그리드 비교에 쓰는 키. */
export type DateKey = string;

export function toDateKey(date: Date): DateKey {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export type CalendarCell = {
  date: Date;
  key: DateKey;
  /** 이번 달이 아니면 흐리게 표시(앞뒤 달의 빈 칸을 채우는 용도) */
  inCurrentMonth: boolean;
  isToday: boolean;
};

/**
 * 한 달을 주 단위 그리드로 만든다. 일요일 시작, 앞뒤 달의 날짜로 첫/마지막 주를 채운다
 * (달력이 이빨 빠진 모양이 되지 않게).
 */
export function getMonthGrid(year: number, month: number): CalendarCell[][] {
  const firstOfMonth = new Date(year, month, 1);
  const startOffset = firstOfMonth.getDay(); // 0(일)~6(토)
  const gridStart = new Date(year, month, 1 - startOffset);

  const today = toDateKey(new Date());
  const weeks: CalendarCell[][] = [];

  for (let week = 0; week < 6; week++) {
    const row: CalendarCell[] = [];
    for (let day = 0; day < 7; day++) {
      const date = new Date(gridStart);
      date.setDate(gridStart.getDate() + week * 7 + day);
      row.push({
        date,
        key: toDateKey(date),
        inCurrentMonth: date.getMonth() === month,
        isToday: toDateKey(date) === today,
      });
    }

    // 이번 달이 5주 안에 끝나면 마지막 주는 통째로 다음 달이라 만들 필요가 없다.
    // push 하기 전에 걸러야 한다 — push 뒤에 걸러내면 이미 빈 6번째 줄이 남는다.
    const isTrailingEmptyRow = week >= 4 && row.every((cell) => !cell.inCurrentMonth && cell.date > firstOfMonth);
    if (isTrailingEmptyRow) break;

    weeks.push(row);
  }

  return weeks;
}

export function formatMonthLabel(year: number, month: number): string {
  return `${year}년 ${month + 1}월`;
}
