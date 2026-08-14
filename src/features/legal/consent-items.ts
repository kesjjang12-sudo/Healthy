import { PRIVACY_POLICY } from './privacy';
import { TERMS_OF_SERVICE } from './terms';
import type { LegalDocumentKey } from './types';

/**
 * 동의를 받아야 하는 항목들.
 *
 * 개인정보 보호법이 요구하는 두 가지를 구조로 못 박았다.
 *
 *   - **필수와 선택을 나눈다.** 선택 항목을 거부해도 서비스를 쓸 수 있어야 한다.
 *     그래서 선택 항목에는 거부하면 무엇이 달라지는지(`declineNote`)를 반드시
 *     같이 보여준다.
 *   - **민감정보는 별도로 받는다.** 건강에 관한 정보(제23조)는 다른 개인정보
 *     동의와 한 덩어리로 묶어 받을 수 없다. 그래서 `sensitive: true` 항목은
 *     화면에서 따로 떼어 그린다.
 *
 * 운동 수행 기록과 아픈 곳을 굳이 두 항목으로 나눈 이유: 운동 기록이 없으면
 * 이 앱은 아무것도 못 하지만(그래서 필수), 아픈 곳은 없어도 동작한다 —
 * 실제로 `generate_daily_routine` 이 아픈 곳을 빈 값으로 두고도 루틴을 만든다.
 * 없어도 되는 걸 필수로 묶는 건 "필요 최소한" 원칙에 어긋난다.
 */
export type ConsentKey = 'age_14' | 'terms' | 'privacy' | 'health_records' | 'pain_areas';

export type ConsentItem = {
  readonly key: ConsentKey;
  readonly required: boolean;
  /** 건강에 관한 정보라 별도 동의가 필요한 항목인지 */
  readonly sensitive: boolean;
  readonly label: string;
  /** 목적·항목·보유기간을 한눈에 */
  readonly detail: string;
  /** 전문을 볼 수 있는 문서 */
  readonly document?: LegalDocumentKey;
  /** 선택 항목에서 거부하면 무엇이 달라지는지. 필수 항목에는 없다 */
  readonly declineNote?: string;
};

/**
 * 동의 버전.
 *
 * **약관·방침 본문이나 아래 항목 구성을 고치면 이 값을 올려야 한다.** 올리면
 * 기존 회원에게 다시 동의를 받는다. 안 올리면 옛 문서에 동의한 사람이 새
 * 문서에 동의한 것처럼 기록에 남는다.
 *
 * 아래 검사는 문서 버전을 올리면서 이 값을 안 올리는 실수를 막는다.
 */
export const CONSENT_VERSION = '2026-08-13';

if (
  TERMS_OF_SERVICE.version > CONSENT_VERSION ||
  PRIVACY_POLICY.version > CONSENT_VERSION
) {
  throw new Error(
    `약관/방침을 고쳤으면 CONSENT_VERSION 도 올려야 합니다 ` +
      `(약관 ${TERMS_OF_SERVICE.version}, 방침 ${PRIVACY_POLICY.version}, 동의 ${CONSENT_VERSION})`,
  );
}

export const CONSENT_ITEMS: readonly ConsentItem[] = [
  {
    key: 'age_14',
    required: true,
    sensitive: false,
    label: '만 14세 이상입니다',
    detail:
      '만 14세 미만은 법정대리인 동의가 필요해 지금은 가입을 받지 않습니다.',
  },
  {
    key: 'terms',
    required: true,
    sensitive: false,
    label: '이용약관에 동의합니다',
    detail:
      '서비스 이용 조건과 책임을 정한 문서입니다. 운동 안내가 의료 조언이 아니라는 내용이 8조에 있습니다.',
    document: 'terms',
  },
  {
    key: 'privacy',
    required: true,
    sensitive: false,
    label: '개인정보 수집·이용에 동의합니다',
    detail:
      '전화번호, 이름, 성별, 연령대, 운동 목적, 다니는 헬스장과 방문 기록을 받습니다. 회원님을 알아보고 맞는 운동을 짜기 위해서이며, 탈퇴하실 때까지 보관합니다.',
    document: 'privacy',
  },
  {
    key: 'health_records',
    required: true,
    sensitive: true,
    label: '운동 기록 수집·이용에 동의합니다',
    detail:
      '어떤 운동을 몇 kg로 몇 번, 몇 분 하셨는지 기록합니다. 건강에 관한 정보라 따로 여쭙습니다. 다음 운동을 정하고 달력·분석을 보여드리는 데 쓰며, 탈퇴하실 때까지 보관합니다.',
    document: 'privacy',
  },
  {
    key: 'pain_areas',
    required: false,
    sensitive: true,
    label: '아프거나 불편한 곳 수집·이용에 동의합니다',
    detail:
      '무릎·허리·어깨 등 불편한 곳을 받아, 그 부위에 무리가 가는 운동을 빼거나 무게를 낮춥니다. 건강에 관한 정보라 따로 여쭙습니다. 탈퇴하시거나 동의를 거두시면 바로 지웁니다.',
    document: 'privacy',
    declineNote:
      '동의하지 않으셔도 서비스를 그대로 쓰실 수 있습니다. 다만 아픈 곳을 피해 무게를 낮춰 드리지 못하고, 성별·연령대·운동 목적만으로 운동을 짜 드립니다.',
  },
] as const;

export const REQUIRED_CONSENT_KEYS: readonly ConsentKey[] = CONSENT_ITEMS.filter(
  (item) => item.required,
).map((item) => item.key);

export const OPTIONAL_CONSENT_KEYS: readonly ConsentKey[] = CONSENT_ITEMS.filter(
  (item) => !item.required,
).map((item) => item.key);

/** 필수 항목이 전부 체크됐는지. 서버(record_consents)도 같은 검사를 한다. */
export function hasAllRequired(checked: Partial<Record<ConsentKey, boolean>>): boolean {
  return REQUIRED_CONSENT_KEYS.every((key) => checked[key] === true);
}

/**
 * 키오스크(공용 태블릿)에서 받는 동의는 따로다.
 *
 * 태블릿은 전화번호 하나만 받고 개인 데이터를 아예 안 보여준다. 그 앞에 줄이
 * 서 있는데 약관 전문을 스크롤하게 하는 건 현실적이지 않고, 받지도 않는 정보에
 * 동의를 받는 것도 이상하다. 그래서 화면에 수집 고지를 상시로 띄우고, 번호를
 * 눌러 체크인한 사실을 그 항목에 대한 동의로 기록한다.
 */
export const KIOSK_CONSENT_KEY = 'kiosk_phone';

export const KIOSK_CONSENT_NOTICE =
  '출입 확인을 위해 전화번호를 받습니다. 이 화면에는 이름·기록이 표시되지 않습니다.';
