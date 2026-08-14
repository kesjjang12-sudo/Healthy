/**
 * 안내 문장 검사기(isSafeGuide)와 규칙 기반 대체 문구(fallbackGuide) 검증.
 *
 * LLM 을 부르는 부분은 테스트하지 않는다 — 거긴 실패해도 fallback 으로
 * 흘러가게 설계돼 있어서, 실제로 지켜야 할 방어선은 이 두 함수다. 여기가
 * 뚫리면 "20kg 을 꽂으세요" 같은 문장이 그대로 4060 회원 화면에 뜬다.
 */
import { assert, assertEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts';

import { fallbackGuide, isSafeGuide, type SafeMachine } from './handler.ts';

const machine = (overrides: Partial<SafeMachine> = {}): SafeMachine => ({
  machine_id: '00000000-0000-4000-8000-000000000000',
  machine_name: '레그 프레스',
  sets: 3,
  reps: 15,
  duration_minutes: null,
  image_url: null,
  target_muscle: '하체',
  station_kind: '머신',
  ...overrides,
});

Deno.test('통과: 칸과 자각도로 안내하는 존댓말 한 문장', () => {
  assert(isSafeGuide('15개째 밀어낼 때 "조금 무겁네" 싶은 칸에 핀을 꽂고 시작하세요.'));
});

Deno.test('차단: 무게 단위가 들어간 문장', () => {
  // 기구마다 같은 20kg 이 다른 무게라 이 문장은 그 자체로 위험하다.
  assertEquals(isSafeGuide('20kg 에 핀을 꽂고 시작하세요.'), false);
  assertEquals(isSafeGuide('30 킬로 정도로 맞추세요.'), false);
});

Deno.test('차단: 통증을 참으라는 문장', () => {
  assertEquals(isSafeGuide('무릎이 조금 아파도 참으세요. 곧 익숙해집니다.'), false);
});

Deno.test('차단: 의학적 단정', () => {
  assertEquals(isSafeGuide('꾸준히 하시면 무릎 관절염이 완치됩니다.'), false);
});

Deno.test('차단: 반말', () => {
  assertEquals(isSafeGuide('15개째에 좀 무겁다 싶은 칸에 핀을 꽂아라'), false);
});

Deno.test('차단: 너무 짧거나 긴 문장', () => {
  assertEquals(isSafeGuide('하세요.'), false);
  assertEquals(isSafeGuide(`${'가'.repeat(200)}하세요.`), false);
});

Deno.test('차단: 문자열이 아닌 값', () => {
  assertEquals(isSafeGuide(null), false);
  assertEquals(isSafeGuide(42), false);
  assertEquals(isSafeGuide({ rpe_guide: '15개째에...' }), false);
});

Deno.test('대체 문구도 검사기를 통과한다', () => {
  // fallback 이 검사기를 못 지나가면 LLM 이 죽었을 때 내보낼 문장이 없어진다.
  for (const m of [
    machine(),
    machine({ duration_minutes: 15, reps: null }),
    machine({ station_kind: '맨몸', reps: 12 }),
  ]) {
    assert(isSafeGuide(fallbackGuide(m)), `대체 문구가 검사에 걸림: ${fallbackGuide(m)}`);
  }
});

Deno.test('유산소 대체 문구는 시간으로 안내한다', () => {
  assertStringIncludes(fallbackGuide(machine({ duration_minutes: 15, reps: null })), '15분');
});
