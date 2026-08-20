import { Stack } from 'expo-router';

import { Colors } from '@/constants/theme';

/**
 * 랭킹 탭 안의 스택. 순위(index) → 오늘의 응원(cheers) 로 밀어 들어간다.
 *
 * 이 파일이 없으면 cheers 가 탭으로 새어 나온다 — 하단 탭이 라우트 이름을
 * "ranking/cheers" 로 받아 여섯 번째 탭을 그린다(profile/_layout 과 같은 이유).
 */
export default function RankingLayout() {
  return (
    <Stack
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.background } }}
    />
  );
}
