import { Platform } from 'react-native';

/**
 * 유산소 목표 시간 알림.
 *
 * 러닝머신 위에서는 폰을 거치대에 두고 화면이 꺼진다. 시간은 시작 시각
 * 기준이라 계속 가지만, 목표를 채운 순간을 알려주는 건 화면이 아니라
 * 알림이어야 한다. 운동을 시작할 때 "목표 분 뒤"로 로컬 알림을 예약하고,
 * 중간에 멈추거나 화면을 나가면 취소한다. 서버·인터넷이 필요 없어서
 * 지하 헬스장에서도 울린다.
 *
 * ⚠️ expo-notifications 를 정적으로 import 하지 않는 이유: 지금 회원들
 * 폰에 깔린 앱 바이너리에는 이 네이티브 모듈이 없다. EAS Update 는 JS 만
 * 갈아끼우므로, 정적 import 면 모듈이 없는 옛 바이너리에서 require 가
 * 던져 앱이 아예 안 켜진다. 동적 import + try/catch 로 감싸면 그런 폰에선
 * 알림만 조용히 빠지고 나머지는 다 돌아간다. 다음 네이티브 빌드부터
 * 알림이 살아난다.
 *
 * 웹(PWA)은 화면이 꺼지면 어차피 JS 가 멈추므로 예약하지 않는다 —
 * 화면이 켜져 있으면 타이머 화면 자체가 목표 도달을 보여준다.
 */

/**
 * 네이티브 빌드에 expo-notifications 가 들어간 뒤에 true 로 바꾼다.
 *
 * ⚠️ 이 스위치가 있는 이유 (2026-08-17 사고):
 * 동적 import + try/catch 로 감싸 두면 안전할 거라 보고 유산소 시작에 알림
 * 예약을 붙였는데, 설치된 앱에서 시작 버튼을 누르면 앱이 그대로 꺼졌다.
 * expo-notifications 는 모듈 최상단에서 `requireNativeModule('ExpoBadgeModule')`
 * 같은 호출을 실행한다 — 지금 깔린 바이너리에는 그 네이티브 모듈이 없어서
 * 불러오는 순간 실패하고, 그 실패는 네이티브 단계라 JS try/catch 로 잡히지
 * 않는다. Metro 는 동적 import 도 번들에 정적으로 넣기 때문에 "없으면 건너뛴다"가
 * 성립하지 않는다. 그래서 지금은 아예 손대지 않는 것만이 안전하다.
 *
 * 웹 검증만으로는 이걸 못 잡는다 — 웹에서는 이 경로를 통째로 건너뛰기 때문이다.
 * 이 값을 켤 때는 반드시 실제 기기에서 유산소 시작을 눌러 확인할 것.
 */
const NATIVE_ALARM_READY = false;

type NotificationsModule = typeof import('expo-notifications');

let cachedModule: NotificationsModule | null | undefined;

/**
 * 다른 알림 기능(운동 리마인더 등)도 이 안전한 로더를 같이 쓴다.
 * NATIVE_ALARM_READY 스위치와 사고 이력은 위 주석 참고 — 새 알림 기능을
 * 만들 때 이걸 우회해 expo-notifications 를 직접 import 하면 안 된다.
 */
export async function loadNotificationsModule(): Promise<NotificationsModule | null> {
  return loadModule();
}

async function loadModule(): Promise<NotificationsModule | null> {
  if (cachedModule !== undefined) return cachedModule;
  // 네이티브 모듈이 확실히 있을 때만 불러온다. 여기서 막지 않으면 아래
  // import 가 평가되는 순간 앱이 꺼진다.
  if (!NATIVE_ALARM_READY || Platform.OS === 'web') {
    cachedModule = null;
    return null;
  }
  try {
    const mod = await import('expo-notifications');
    // 앱이 떠 있는 동안(포그라운드) 도착한 알림도 배너로 보이게 한다.
    mod.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
    cachedModule = mod;
  } catch {
    // 옛 바이너리(네이티브 모듈 없음) — 알림 없이 진행한다.
    cachedModule = null;
  }
  return cachedModule;
}

/**
 * 목표 시간이 됐을 때 울릴 알림을 예약한다. 예약 id 를 돌려주고,
 * 못 하면(권한 거부·모듈 없음·웹) null — 부르는 쪽은 신경 쓸 것 없다.
 */
export async function scheduleCardioGoalAlarm(
  targetMinutes: number,
  exerciseName: string,
  checkpointName: string,
): Promise<string | null> {
  const mod = await loadModule();
  if (!mod) return null;

  try {
    const perm = await mod.getPermissionsAsync();
    if (!perm.granted) {
      const asked = await mod.requestPermissionsAsync();
      if (!asked.granted) return null;
    }

    return await mod.scheduleNotificationAsync({
      content: {
        title: `🎒 목표 ${targetMinutes}분을 다 채우셨어요!`,
        body: `${checkpointName}에 도착했어요. ${exerciseName}을(를) 마치고 오늘 기록을 저장하세요.`,
        sound: true,
      },
      trigger: {
        type: mod.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: Math.max(1, Math.round(targetMinutes * 60)),
        repeats: false,
      },
    });
  } catch {
    return null;
  }
}

/** 예약을 취소한다. 이미 울렸거나 id 가 없으면 조용히 지나간다. */
export async function cancelCardioGoalAlarm(id: string | null): Promise<void> {
  if (!id) return;
  const mod = await loadModule();
  if (!mod) return;
  try {
    await mod.cancelScheduledNotificationAsync(id);
  } catch {
    // 이미 울린 알림은 취소할 게 없다.
  }
}
