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

type NotificationsModule = typeof import('expo-notifications');

let cachedModule: NotificationsModule | null | undefined;

async function loadModule(): Promise<NotificationsModule | null> {
  if (cachedModule !== undefined) return cachedModule;
  if (Platform.OS === 'web') {
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
        body: `${checkpointName}에 도착했습니다. ${exerciseName}을(를) 마치고 오늘 기록을 저장하세요.`,
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
