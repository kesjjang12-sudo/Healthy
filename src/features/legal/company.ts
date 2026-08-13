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
  serviceName: '핏루틴',
  representative: '{{대표자명}}',
  businessNumber: '{{사업자등록번호}}',
  address: '{{사업장 주소}}',
  /** 이용 문의 */
  supportEmail: '{{문의 이메일}}',
  supportPhone: '{{문의 전화번호}}',
  /** 개인정보 보호법 제31조에 따른 개인정보 보호책임자 */
  privacyOfficer: {
    name: '{{보호책임자 성명}}',
    position: '{{직위}}',
    email: '{{보호책임자 이메일}}',
    phone: '{{보호책임자 전화번호}}',
  },
  /** 열람·정정·삭제 요구를 받는 부서 */
  privacyDesk: {
    department: '{{담당 부서}}',
    email: '{{담당 부서 이메일}}',
    phone: '{{담당 부서 전화번호}}',
  },
  /** 분쟁 시 관할 법원 소재지 */
  jurisdiction: '{{관할 법원 소재지}}',
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
