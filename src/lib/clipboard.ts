import { Platform } from 'react-native';

/**
 * 클립보드 복사. 성공 여부를 돌려준다 — 실패해도 예외를 안 던지는 이유는,
 * 복사 하나 때문에 화면이 죽으면 안 되고 호출한 쪽이 "길게 눌러 복사하세요"
 * 같은 대안을 보여주면 되기 때문이다.
 *
 * expo-clipboard 를 정적으로 import 하지 않는 이유: 네이티브 모듈이라
 * 이 패키지가 들어가기 전에 빌드된 APK 에서는 로드 자체가 실패한다.
 * EAS Update 는 JS 만 갈아끼우므로, 옛 빌드에서도 화면은 뜨고 복사만
 * 조용히 실패하도록 필요한 순간에만 불러온다.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (Platform.OS === 'web') {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }

  try {
    const Clipboard = await import('expo-clipboard');
    await Clipboard.setStringAsync(text);
    return true;
  } catch {
    return false;
  }
}
