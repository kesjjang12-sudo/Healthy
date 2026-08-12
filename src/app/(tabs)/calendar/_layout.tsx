import { Stack } from 'expo-router';

import { Colors } from '@/constants/theme';

/** 달력 탭 안에서만 쓰는 스택. 월별 그리드(index) → 하루 상세([date]) 로 밀어 들어간다. */
export default function CalendarLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.background } }} />
  );
}
