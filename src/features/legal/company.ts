/**
 * 사업자 정보. 약관·개인정보처리방침 곳곳에 들어간다.
 *
 * ⚠️ `{{ }}` 로 감싼 값은 **아직 안 채워진 자리**다. 실서비스 전에 전부 실제
 * 값으로 바꿔야 한다 — 개인정보처리방침에 개인정보 보호책임자와 연락처를
 * 공개하는 것은 개인정보 보호법 제31조·제30조상 의무라, 비워 둔 채로 서비스를
 * 열면 방침 자체가 요건 미달이 된다.
 *
 * 화면에서는 `fillPlaceholders` 가 안 채워진 자리를 눈에 띄게 표시한다. 데모
 * 중에는 그대로 두고, 출시 전에 이 파일만 고치면 약관·방침·동의 화면이 한꺼번에
 * 바뀐다.
 */
export const COMPANY = {
  /** 회사 이름 */
  name: '실버캐슬',
  /** 서비스(앱) 이름 */
  serviceName: '헬스반장',
  representative: '김은성',
  businessNumber: '608-33-73057',
  /** 이용 문의 */
  supportEmail: 'kesjjang4545@naver.com',
  supportPhone: '010-2924-1452',
  /** 개인정보 보호법 제31조에 따른 개인정보 보호책임자 */
  privacyOfficer: {
    name: '김은성',
    position: '대표',
    email: 'kesjjang4545@naver.com',
    phone: '010-2924-1452',
  },
  /**
   * 사업장 주소와 관할 법원은 **일부러 두지 않는다.**
   *
   * - 약관·처리방침 어디에서도 쓰지 않는다. 개인정보 처리방침이 요구하는 것은
   *   보호책임자와 연락처(개인정보 보호법 제30·31조)이지 사업장 주소가 아니다.
   * - 이 저장소는 공개다. 1인 사업자는 사업장 주소가 집 주소인 경우가 많아,
   *   쓰지도 않는 값을 적어 두면 그 순간부터 집 주소가 공개된다.
   * - 관할 법원은 약관 본문에서 "민사소송법에 따른 관할 법원"으로 둔다.
   *   소비자 계약에서 특정 법원을 못박는 조항은 약관규제법상 다툼의 여지가 있다.
   *
   * 나중에 결제를 붙여 통신판매업 신고 대상이 되면 사업자 정보 표시 의무가
   * 생긴다. 그때는 여기가 아니라 표시 의무에 맞는 화면을 따로 만들 것.
   */

  /** 열람·정정·삭제 요구를 받는 부서 */
  privacyDesk: {
    department: '대표',
    email: 'kesjjang4545@naver.com',
    phone: '010-2924-1452',
  },
} as const;

/** 아직 안 채워진 자리인지. `{{대표자명}}` 처럼 생겼으면 그렇다. */
export function isPlaceholder(value: string): boolean {
  return /^\{\{.*\}\}$/.test(value.trim());
}

/**
 * 화면에 내보내기 전에 안 채워진 자리를 눈에 띄게 만든다.
 *
 * 조용히 빈칸으로 두면 데모 자리에서 아무도 못 알아채고 그대로 출시된다.
 * 차라리 "[미입력: 대표자명]" 이라고 크게 남겨 두는 편이 낫다.
 */
export function fillPlaceholders(text: string): string {
  return text.replace(/\{\{(.+?)\}\}/g, (_, label: string) => `[미입력: ${label.trim()}]`);
}

/** 아직 안 채운 항목 목록. 출시 전 점검용이라 화면과 스크립트가 같이 쓴다. */
export function missingCompanyFields(): string[] {
  const missing: string[] = [];

  const walk = (value: unknown, path: string): void => {
    if (typeof value === 'string') {
      if (isPlaceholder(value)) missing.push(path);
      return;
    }
    if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        walk(child, path === '' ? key : `${path}.${key}`);
      }
    }
  };

  walk(COMPANY, '');
  return missing;
}
