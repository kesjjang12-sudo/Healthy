import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';

import { TextTabBar } from '@/components/tab-bar';
import { useAuthSession } from '@/features/auth/auth-session';

/**
 * 개인 앱의 5개 하단 탭. 토스처럼 아이콘 + 글자를 세로로 쌓아 그린다.
 * 아이콘은 폰트 글리프가 아니라 SVG 로 직접 그린 것(tab-bar.tsx, icon.tsx 참고).
 *
 * 로그인/온보딩 여부는 여기서 한 번만 확인한다 — 개별 탭 화면마다
 * 반복하지 않는다.
 */
export default function TabsLayout() {
  const { user, isRestoring } = useAuthSession();

  if (isRestoring) return null;
  if (!user) return <Redirect href="/login" />;
  if (!user.profile_data?.onboarded_at) return <Redirect href="/onboarding" />;

  return (
    <Tabs tabBar={(props) => <TextTabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="workout" options={{ title: '운동' }} />
      <Tabs.Screen name="calendar" options={{ title: '달력' }} />
      <Tabs.Screen name="ranking" options={{ title: '랭킹' }} />
      <Tabs.Screen name="analysis" options={{ title: '분석' }} />
      <Tabs.Screen name="profile" options={{ title: '프로필' }} />
    </Tabs>
  );
}
