/**
 * Send SMS Hook 진입점.
 *
 * 로직은 handler.ts 에 있다. 여기를 얇게 두는 이유는 두 가지다.
 *
 * 1) Deno.serve 를 조건 없이 부르기 위해서다. 예전에 import.meta.main 으로
 *    감싸 뒀었는데, Supabase 엣지 런타임이 이 파일을 메인 모듈로 보지 않으면
 *    서버가 아예 안 뜬다 — 배포는 성공했는데 문자만 안 오는, 알아채기 어려운
 *    실패가 된다. 공식 예제들이 전부 최상위에서 바로 부르는 이유이기도 하다.
 * 2) 그러면서도 테스트는 handler.ts 를 직접 불러 검증할 수 있다. 진입점을
 *    불러오면 테스트가 포트를 물고 늘어진다.
 */
import { handleSendSms } from './handler.ts';

Deno.serve(handleSendSms);
