import { Stack } from 'expo-router';

import { Colors } from '@/constants/theme';

/** 운동 탭 안에서만 쓰는 스택. 목록(index) → 기구 상세([id]) 로 밀어 들어간다. */
export default function WorkoutLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.background } }} />
  );
}
