import type { DailyActivitySummary, HealthConnectionStatus } from './types';

/**
 * 웨어러블/폰 건강 앱(애플 헬스 · 구글 Health Connect) 연동 자리.
 *
 * "웨어러블? 휴대폰에서 건강 앱 피트니스 활동 인식할 수 있게 해줘" 요구사항에
 * 대한 스캐폴딩만이다. 실제 연동은 아직 하지 않는다 — 이유:
 *
 *   1. 네이티브 모듈이 필요하다. iOS 는 HealthKit 을 감싸는 패키지(예:
 *      react-native-health), Android 는 Health Connect 를 감싸는 패키지(예:
 *      react-native-health-connect)가 있어야 하고, 둘 다 app.json 에 config
 *      plugin 을 추가하고 네이티브 빌드(prebuild)를 다시 해야 붙는다.
 *   2. 이 개발 환경(샌드박스)은 네이티브 빌드를 실행/검증할 수 없다. EAS
 *      빌드는 시간이 오래 걸려서 사용자 확인 없이 새로 만들지 않기로 했고,
 *      확인 없이 새 네이티브 의존성 + plugin 설정을 미리 넣어 두면 다음 실제
 *      빌드에서야 설정 실수가 드러나 그 빌드를 통째로 날릴 위험이 있다.
 *
 * 그래서 인터페이스만 여기 만들어 두고, 지금은 "연동 안 됨"만 정직하게
 * 돌려준다. 나중에 실제 붙일 때 할 일:
 *
 *   1. react-native-health(iOS)/react-native-health-connect(Android) 설치
 *   2. app.json 에 각 패키지의 config plugin 추가 + 권한 문구
 *      (iOS: NSHealthShareUsageDescription 등 / Android: Health Connect 권한)
 *   3. 이 파일의 함수 3개만 실제 네이티브 호출로 바꾸면 된다 — 화면
 *      (profile 탭의 건강 앱 연동 섹션)은 이 인터페이스만 보고 있어서
 *      그대로 둬도 된다.
 *   4. 실 기기 EAS 빌드로 권한 요청 팝업까지 검증.
 */

export function getHealthConnectionStatus(): HealthConnectionStatus {
  return 'unavailable';
}

/** 아직 연결할 수 없다 — 항상 실패한다. UI 는 이 함수를 호출하기 전에 상태를 먼저 봐야 한다. */
export async function connectHealth(): Promise<never> {
  throw new Error('아직 지원하지 않는 기능이에요.');
}

export async function getTodayActivitySummary(): Promise<DailyActivitySummary> {
  return { steps: null, activeMinutes: null, source: null };
}
