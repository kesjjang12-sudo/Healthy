import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { useEffect } from 'react';

import { TextTabBar } from '@/components/tab-bar';
import { useAuthSession } from '@/features/auth/auth-session';
import { needsConsent } from '@/features/legal/api';
import { refreshReminders } from '@/features/notifications/workout-reminder';
import { useSyncFontScale } from '@/features/settings/font-scale';

/**
 * 개인 앱의 5개 하단 탭. 토스처럼 아이콘 + 글자를 세로로 쌓아 그린다.
 * 아이콘은 폰트 글리프가 아니라 SVG 로 직접 그린 것(tab-bar.tsx, icon.tsx 참고).
 *
 * 로그인/동의/온보딩 여부는 여기서 한 번만 확인한다 — 개별 탭 화면마다
 * 반복하지 않는다.
 */
export default function TabsLayout() {
  const { user, isRestoring } = useAuthSession();

  // 폰을 바꾸거나 앱을 다시 깔아도 자기가 고른 글자 크기로 돌아오게 한다.
  useSyncFontScale(user?.profile_data?.font_scale);

  // 운동 리마인더는 7일치씩 예약된다 — 앱을 열 때마다 앞으로 7일로 채워 둔다.
  useEffect(() => {
    void refreshReminders();
  }, []);

  if (isRestoring) return null;
  if (!user) return <Redirect href="/login" />;
  // 동의가 설문보다 먼저다. 설문에서 받는 "아프거나 불편한 곳"이 건강에 관한
  // 정보라, 동의 없이 물어보면 안 된다.
  if (needsConsent(user)) return <Redirect href="/consent" />;
  if (!user.profile_data?.onboarded_at) return <Redirect href="/onboarding" />;

  return (
    <Tabs tabBar={(props) => <TextTabBar {...props} />} screenOptions={{ headerShown: false }}>
      {/* 첫 화면이자 돌아오는 자리라 "홈"으로 부른다(아이콘도 집). 안에 든
          것은 그대로 오늘의 운동이다. */}
      <Tabs.Screen name="workout" options={{ title: '홈' }} />
      <Tabs.Screen name="calendar" options={{ title: '달력' }} />
      <Tabs.Screen name="ranking" options={{ title: '랭킹' }} />
      <Tabs.Screen name="analysis" options={{ title: '분석' }} />
      <Tabs.Screen name="profile" options={{ title: '프로필' }} />
    </Tabs>
  );
}
