/**
 * 약관·개인정보처리방침의 원문을 담는 자료 구조.
 *
 * 왜 마크다운 파일이 아니라 TypeScript 인가.
 *
 *   1. 앱 안에서 전문을 보여줘야 한다. 동의 화면에서 "전문 보기"를 눌렀을 때
 *      외부 브라우저로 나가면, 네트워크가 나쁜 헬스장 지하에서 아무것도 못 읽고
 *      동의만 누르게 된다 — 읽을 기회를 실제로 주려면 앱에 들어 있어야 한다.
 *   2. 마크다운을 화면에 그리려면 파서 라이브러리가 필요한데, 이 저장소는
 *      디자인 원칙(선 안 긋기·이모지 안 쓰기)을 지키려고 라이브러리를 얹지 않는
 *      쪽을 택해 왔다(달력·탭바도 직접 그렸다).
 *   3. 버전을 코드와 같이 배포해야 "이 사용자가 동의한 문서"를 특정할 수 있다.
 *
 * 웹사이트에 게시할 때는 `node scripts/export-legal.mjs` 로 docs/*.md 를 뽑는다.
 * 원문은 항상 이 폴더가 정본이다.
 */

/** 문단 하나. 문자열이면 그냥 문단, 배열이면 글머리 목록. */
export type LegalBlock = string | readonly string[];

export type LegalSection = {
  /** 조문 제목. "제1조(목적)" 처럼 통째로 넣는다 */
  readonly heading: string;
  readonly blocks: readonly LegalBlock[];
};

export type LegalDocumentKey = 'terms' | 'privacy';

export type LegalDocument = {
  readonly key: LegalDocumentKey;
  readonly title: string;
  /**
   * 문서 버전. 동의 기록에 이 값이 그대로 남는다.
   *
   * **내용을 고치면 반드시 올려야 한다.** 버전이 올라가면 앱이 기존 사용자에게
   * 다시 동의를 받는다 — 안 올리면 옛 문서에 동의한 사람이 새 문서에 동의한
   * 것처럼 기록에 남는다.
   */
  readonly version: string;
  /** 시행일 */
  readonly effectiveFrom: string;
  /** 동의 화면에 한 줄로 보여줄 요약 */
  readonly summary: string;
  readonly sections: readonly LegalSection[];
};
