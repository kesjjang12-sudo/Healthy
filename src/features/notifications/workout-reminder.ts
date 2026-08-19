import AsyncStorage from '@react-native-async-storage/async-storage';

import { loadNotificationsModule } from '@/features/notifications/cardio-alarm';

/**
 * 매일 정해진 시간에 "오늘 헬스장 가야 하는 이유"를 알려 주는 리마인더.
 *
 * 빠진 날을 서버가 감지해 푸시를 쏘는 방식이 아니다 — 그건 푸시 서버가
 * 필요하다. 대신 로컬 알림을 매일 같은 시간에 예약해 두고, 그날 운동을
 * 마치면(markWorkoutDoneToday) 오늘 것만 취소한다. 안 마친 날에만 울리는
 * 효과가 서버 없이 난다.
 *
 * 예약은 "오늘부터 7일치"를 날짜별로 걸고, 앱을 열 때마다 다시 건다
 * (repeats: true 하나로 걸면 완료한 날을 건너뛸 수 없다). 7일 넘게 앱을
 * 안 열면 알림도 멈춘다 — 그쯤이면 알림이 아니라 전화가 필요한 회원이다.
 *
 * ⚠️ expo-notifications 는 cardio-alarm 의 안전 로더로만 부른다. 지금 깔린
 * 바이너리에는 네이티브 모듈이 없어서(NATIVE_ALARM_READY 참고) 그 폰에서는
 * 설정만 저장되고, 다음 네이티브 빌드부터 실제로 울린다.
 */

const SETTINGS_KEY = 'fitroutine.workout-reminder';

export type ReminderHour = 8 | 12 | 18;

export type ReminderSettings = {
  enabled: boolean;
  /** 울릴 시각(24시간제 정시). 아침 8 / 점심 12 / 저녁 18. */
  hour: ReminderHour;
};

export const DEFAULT_REMINDER: ReminderSettings = { enabled: false, hour: 18 };

/** 4060 이 "그래, 가야지" 하게 만드는 이유들. 날짜로 골라 매일 다른 말이 나온다. */
const REASONS: readonly string[] = [
  '근육은 70대에도 자라요. 오늘 30분이 내일의 무릎을 지켜요.',
  '이틀 쉬면 사흘째는 더 가기 싫어져요. 오늘 가볍게라도 다녀오세요.',
  '운동한 날 밤이 안 한 날보다 깊게 잠들어요.',
  '엘리베이터 대신 계단이 편해지는 날이 와요. 오늘이 그 연습이에요.',
  '같은 단지 이웃들도 지금 운동하러 나서고 있어요.',
  '혈압도 혈당도, 약만큼 운동이 답이에요. 의사 선생님도 그렇게 말하죠.',
  '오늘 걷는 1km 가 국토종주 지도를 한 칸 채워요.',
  '몸이 무거운 날일수록 다녀오면 가벼워져요. 신발만 신으면 절반이에요.',
  '근력은 저축과 같아요. 오늘 든 무게가 10년 뒤 통장이에요.',
  '나가기 싫은 날 나간 사람만 아는 뿌듯함이 있어요.',
];

function reasonFor(date: Date): string {
  // 날짜 기반 고정 선택 — 같은 날 다시 예약해도 같은 문구라 중복 예약 티가 안 난다.
  const seed = date.getFullYear() * 1000 + date.getMonth() * 50 + date.getDate();
  return REASONS[seed % REASONS.length];
}

export async function getReminderSettings(): Promise<ReminderSettings> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_REMINDER;
    const parsed = JSON.parse(raw) as ReminderSettings;
    return { ...DEFAULT_REMINDER, ...parsed };
  } catch {
    return DEFAULT_REMINDER;
  }
}

/** 설정을 저장하고 예약을 그에 맞게 다시 건다. */
export async function saveReminderSettings(settings: ReminderSettings): Promise<void> {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)).catch(() => {});
  await syncReminders(settings);
}

/** 앱을 열 때 불러 예약을 신선하게 유지한다. */
export async function refreshReminders(): Promise<void> {
  const settings = await getReminderSettings();
  if (settings.enabled) await syncReminders(settings);
}

/**
 * 오늘 운동을 마쳤다 — 오늘 몫의 리마인더만 걷어낸다.
 * (내일 이후 예약은 그대로 두어야 내일 또 챙겨 준다.)
 */
export async function markWorkoutDoneToday(): Promise<void> {
  const mod = await loadNotificationsModule();
  if (!mod) return;
  try {
    const all = await mod.getAllScheduledNotificationsAsync();
    const today = new Date().toDateString();
    for (const item of all) {
      if (
        item.content.data?.kind === 'workout-reminder' &&
        item.content.data?.day === today
      ) {
        await mod.cancelScheduledNotificationAsync(item.identifier);
      }
    }
  } catch {
    // 알림은 부가 기능 — 실패해도 기록 저장을 막지 않는다.
  }
}

async function syncReminders(settings: ReminderSettings): Promise<void> {
  const mod = await loadNotificationsModule();
  if (!mod) return;

  try {
    // 우리 것만 걷어내고 다시 건다. 유산소 목표 알림은 건드리면 안 된다.
    const all = await mod.getAllScheduledNotificationsAsync();
    for (const item of all) {
      if (item.content.data?.kind === 'workout-reminder') {
        await mod.cancelScheduledNotificationAsync(item.identifier);
      }
    }

    if (!settings.enabled) return;

    const perm = await mod.getPermissionsAsync();
    if (!perm.granted) {
      const asked = await mod.requestPermissionsAsync();
      if (!asked.granted) return;
    }

    const now = new Date();
    for (let offset = 0; offset < 7; offset += 1) {
      const fireAt = new Date(now);
      fireAt.setDate(now.getDate() + offset);
      fireAt.setHours(settings.hour, 0, 0, 0);
      if (fireAt.getTime() <= now.getTime()) continue; // 오늘 시간이 지났으면 건너뛴다

      await mod.scheduleNotificationAsync({
        content: {
          title: '오늘 헬스장 가는 날이에요 💪',
          body: reasonFor(fireAt),
          sound: true,
          data: { kind: 'workout-reminder', day: fireAt.toDateString() },
        },
        trigger: {
          type: mod.SchedulableTriggerInputTypes.DATE,
          date: fireAt,
        },
      });
    }
  } catch {
    // 모듈 없음·권한 거부 — 조용히 넘어간다.
  }
}
