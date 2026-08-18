/**
 * 화면에 운동 이름과 위치를 어떻게 적을지 한 곳에서 정한다.
 *
 * 루틴 목록·운동 상세·QR 조회 세 화면이 같은 규칙을 써야 한다 — 목록에서
 * "다리로 밀기"로 읽은 것이 상세에서 "레그 프레스"로 바뀌면 같은 운동인지
 * 확신하지 못한다.
 */

/** 이 모듈이 필요로 하는 최소한의 모양. RoutineItem 과 EquipmentLookup 둘 다 만족한다. */
type Named = {
  name: string;
  name_ko: string | null;
};

type Placed = {
  location_label: string | null;
  /** 루틴 항목에만 있다. 기구 없이 하는 맨몸 처방이면 null */
  equip_id?: string | null;
};

/**
 * 크게 읽히는 줄. 기구 이름("레그 프레스")보다 무슨 동작인지("다리로 밀기")가
 * 먼저다 — 기구 이름은 헬스장을 오래 다닌 사람의 말이라, 처음 오신 분에게는
 * 아무것도 알려주지 못한다.
 */
export function primaryName(item: Named): string {
  return item.name_ko ?? item.name;
}

/**
 * 작게 붙는 줄. 기구에 적힌 이름 그대로라, 기구를 찾을 때와 다른 사람에게
 * 물어볼 때 쓴다. 쉬운 이름이 없으면 큰 줄이 이미 기구 이름이므로 생략한다.
 */
export function secondaryName(item: Named): string | null {
  return item.name_ko ? item.name : null;
}

/**
 * 오른쪽 위치 칩. "22번 구역" 을 큰 글씨 "22번" + 작은 글씨 "구역" 으로 쪼갠다 —
 * 기구에 붙은 번호표와 같은 숫자가 멀리서도 먼저 보여야 찾아갈 수 있다.
 *
 * 마지막 띄어쓰기에서 자르므로 "매트 구역"·"덤벨 구역" 도 같은 모양이 된다.
 */
export function placeChip(item: Placed): { main: string; sub: string | null } | null {
  const label =
    item.location_label ??
    // 이 단지에 기구가 없어 맨몸운동으로 대체된 처방. 찾아갈 기구가 없다는
    // 사실 자체가 정보다 — 빈칸으로 두면 위치를 못 받은 것처럼 보인다.
    (item.equip_id === null ? '맨몸 운동' : null);

  if (!label) return null;

  const cut = label.lastIndexOf(' ');
  if (cut === -1) return { main: label, sub: null };
  return { main: label.slice(0, cut), sub: label.slice(cut + 1) };
}

/** 읽어 주기용 한 줄. "22번 구역" */
export function placeText(item: Placed): string | null {
  const chip = placeChip(item);
  if (!chip) return null;
  return chip.sub ? `${chip.main} ${chip.sub}` : chip.main;
}
