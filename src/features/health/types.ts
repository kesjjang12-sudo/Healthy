/** 아직 연동을 시작할 수 없는 상태들. 지금은 항상 'unavailable' 이다 — 아래 provider.ts 참고. */
export type HealthConnectionStatus = 'unavailable' | 'not_connected' | 'connected';

export type DailyActivitySummary = {
  steps: number | null;
  activeMinutes: number | null;
  source: 'healthkit' | 'health_connect' | null;
};
