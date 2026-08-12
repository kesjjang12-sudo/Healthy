import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/primary-button';
import { Colors, FontSize, LetterSpacing, Radius, Spacing } from '@/constants/theme';
import { useAuthSession } from '@/features/auth/auth-session';
import { parseEquipmentCode } from '@/features/equipment/qr-payload';
import { resolveEquipmentQr } from '@/features/equipment/resolve';
import { useDailyRoutine } from '@/features/routine/use-daily-routine';

/**
 * 운동 탭에서 "기구 QR 찍기"를 누르면 오는 화면.
 *
 * 오늘 루틴에 있는 기구면 처방 화면(workout/[id])으로, 없으면 탐색 전용
 * 화면(workout/explore/[qr])으로 보낸다 — 오늘 루틴 밖 기구라도 궁금하면
 * 볼 수 있어야 한다는 요구사항 때문에 나뉘었다.
 */
export default function EquipmentScanScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuthSession();
  const [permission, requestPermission] = useCameraPermissions();
  const { result: dailyRoutine } = useDailyRoutine(user!.id);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const hasHandledScan = useRef(false);

  const handleBarcodeScanned = useCallback(
    ({ data }: { data: string }) => {
      if (hasHandledScan.current) return;

      const code = parseEquipmentCode(data);
      if (!code) return; // 관련 없는 QR(예: 태블릿 페어링용). 계속 스캔한다.

      hasHandledScan.current = true;
      setErrorMessage(null);

      const resolution = resolveEquipmentQr(code, dailyRoutine);
      if (resolution.kind === 'prescribed') {
        router.replace(`/workout/${resolution.routineId}`);
      } else {
        router.replace(`/workout/explore/${encodeURIComponent(code)}`);
      }
    },
    [dailyRoutine, router],
  );

  const content = (() => {
    if (!permission) return null;

    if (!permission.granted) {
      return (
        <View style={styles.permissionBox}>
          <Text style={styles.title} maxFontSizeMultiplier={1.2}>
            카메라 권한이 필요해요
          </Text>
          <Text style={styles.helper} maxFontSizeMultiplier={1.3}>
            기구 앞 QR을 찍으려면 카메라를 허용해 주세요.
          </Text>
          <PrimaryButton label="카메라 허용하기" onPress={() => void requestPermission()} />
        </View>
      );
    }

    return (
      <View style={styles.cameraBox}>
        <CameraView
          style={styles.camera}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={handleBarcodeScanned}
        />
      </View>
    );
  })();

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.xl }]}>
        <View style={styles.headings}>
          <Text style={styles.title} maxFontSizeMultiplier={1.2}>
            기구 앞 QR을{'\n'}카메라로 찍어주세요
          </Text>
          <Text style={styles.helper} maxFontSizeMultiplier={1.3}>
            오늘 루틴에 없는 기구도 설명과 영상을 볼 수 있어요.
          </Text>
        </View>

        {content}

        {errorMessage ? (
          <Text
            style={styles.errorText}
            maxFontSizeMultiplier={1.3}
            accessibilityLiveRegion="polite">
            {errorMessage}
          </Text>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.lg }]}>
        <PrimaryButton label="운동 목록으로" variant="secondary" onPress={() => router.back()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    flexGrow: 1,
    gap: Spacing.xl,
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xl,
    maxWidth: 700,
    width: '100%',
    alignSelf: 'center',
  },
  headings: {
    gap: Spacing.sm,
  },
  title: {
    fontSize: FontSize.title,
    fontWeight: '700',
    lineHeight: FontSize.title * 1.3,
    letterSpacing: LetterSpacing.title,
    color: Colors.text,
    textAlign: 'center',
  },
  helper: {
    fontSize: FontSize.body,
    fontWeight: '500',
    letterSpacing: LetterSpacing.body,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  cameraBox: {
    aspectRatio: 1,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    backgroundColor: Colors.grey[900],
  },
  camera: {
    flex: 1,
  },
  permissionBox: {
    alignItems: 'center',
    gap: Spacing.lg,
    padding: Spacing.xl,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
  },
  errorText: {
    fontSize: FontSize.caption,
    fontWeight: '600',
    letterSpacing: LetterSpacing.body,
    color: Colors.danger,
    textAlign: 'center',
  },
  footer: {
    gap: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    backgroundColor: Colors.background,
    maxWidth: 700,
    width: '100%',
    alignSelf: 'center',
  },
});
