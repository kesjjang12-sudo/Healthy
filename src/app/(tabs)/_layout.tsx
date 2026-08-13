import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';

import { TextTabBar } from '@/components/tab-bar';
import { useAuthSession } from '@/features/auth/auth-session';
import { needsConsent } from '@/features/legal/api';

/**
 * 개인 앱의 5개 하단 탭. 이모지·아이콘을 안 쓰는 원칙이라 TextTabBar 로
 * 글자 + 도형 인디케이터만으로 그린다(tab-bar.tsx 참고).
 *
 * 로그인/동의/온보딩 여부는 여기서 한 번만 확인한다 — 개별 탭 화면마다
 * 반복하지 않는다.
 */
export default function TabsLayout() {
  const { user, isRestoring } = useAuthSession();

  if (isRestoring) return null;
  if (!user) return <Redirect href="/login" />;
  // 동의가 설문보다 먼저다. 설문에서 받는 "아프거나 불편한 곳"이 건강에 관한
  // 정보라, 동의 없이 물어보면 안 된다.
  if (needsConsent(user)) return <Redirect href="/consent" />;
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
