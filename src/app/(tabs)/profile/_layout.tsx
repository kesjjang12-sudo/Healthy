import { Stack } from 'expo-router';

import { Colors } from '@/constants/theme';

/**
 * 프로필 탭 안의 스택. 요약(index) → 내 정보 고치기(edit) 로 밀어 들어간다.
 *
 * 이 파일이 없으면 edit 이 탭으로 새어 나온다 — 하단 탭이 라우트 이름을
 * "profile/edit" 으로 받아 여섯 번째 탭을 그린다.
 */
export default function ProfileLayout() {
  return (
    <Stack
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.background } }}
    />
  );
}
