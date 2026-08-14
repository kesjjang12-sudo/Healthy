/**
 * 시니어 맞춤 운동 가이드 생성 진입점.
 *
 * 로직은 handler.ts 에 있다. 여기를 얇게 두는 이유는 send-sms 와 같다 —
 * Deno.serve 를 조건 없이 최상위에서 불러야 엣지 런타임이 서버를 띄우고,
 * 그러면서도 테스트는 handler.ts 를 직접 불러 검증할 수 있다.
 */
import { handleRoutineGuide } from './handler.ts';

Deno.serve(handleRoutineGuide);
