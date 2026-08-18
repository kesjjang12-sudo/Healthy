import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/app-text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Keypad } from '@/components/keypad';
import { PrimaryButton } from '@/components/primary-button';
import { Colors, FontSize, LetterSpacing, Radius, Spacing } from '@/constants/theme';
import {
  discardSessionIfCreated,
  ensureSessionForPairing,
  type PairingSessionStart,
} from '@/features/auth/anonymous';
import { useAuthSession } from '@/features/auth/auth-session';
import { PairingError, completePairing } from '@/features/pairing/api';
import { parsePairingCode } from '@/features/pairing/qr-payload';

/** 태블릿이 보여주는 코드도 6자리라 수동 입력 상한을 맞춘다. */
const CODE_MAX_DIGITS = 6;

/**
 * "전화번호로 시작하기"를 눌렀는데 왜 갑자기 QR 이냐 — 이 화면에서 가장 많이
 * 막히는 지점이다. 이미 가입한 사람이 앱을 지웠거나 로그아웃된 경우, QR 을
 * 띄우는 방법(태블릿에 번호 누르기)을 모르면 폰은 "찍으세요", 태블릿은 가만히
 * 있는 교착에 빠진다. 그래서 얻는 방법을 화면에 직접 적어 둔다.
 */
const PAIRING_GUIDE =
  '헬스장 입구 태블릿에 전화번호를 누르면 QR이 떠요. 이미 가입하셨더라도 폰을 바꾸거나 앱이 로그아웃됐다면 이 연결을 한 번 더 해야 해요.';

/**
 * 로그인 화면에서 "전화번호로 시작하기"를 고르면 오는 화면.
 * 태블릿(키오스크)이 띄운 QR 을 카메라로 찍거나, 카메라가 어려우면 화면에 뜬
 * 6자리 숫자를 직접 입력해도 된다.
 */
export default function PairScanScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { setUser } = useAuthSession();
  const [permission, requestPermission] = useCameraPermissions();

  const [mode, setMode] = useState<'camera' | 'manual'>('camera');
  const [manualCode, setManualCode] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const hasHandledScan = useRef(false);

  const finishWithCode = useCallback(
    async (code: string) => {
      setIsProcessing(true);
      setErrorMessage(null);

      // 세션은 실제로 페어링을 시도하는 이 순간에만 만든다. 화면에 들어오자마자
      // 만들면 인증에 실패하거나 뒤로 나가도 세션이 남아서, 로그인한 적 없는
      // 사람이 로그인된 것으로 취급돼 로그인 화면이 곧장 설문으로 넘겨버린다.
      let sessionStart: PairingSessionStart | null = null;

      try {
        sessionStart = await ensureSessionForPairing();
        const user = await completePairing(code);
        setUser(user);
        router.replace(user.profile_data?.onboarded_at ? '/workout' : '/onboarding');
      } catch (error) {
        // 이번 시도에서 만든 임시 세션만 되돌린다. 로그아웃 자체가 실패해도
        // 화면에는 원래의 페어링 오류를 보여주는 게 맞다.
        await discardSessionIfCreated(sessionStart).catch(() => {});
        setErrorMessage(
          error instanceof PairingError
            ? error.message
            : '연결하지 못했어요. 인터넷 연결을 확인해 주세요.',
        );
        hasHandledScan.current = false;
        setIsProcessing(false);
      }
    },
    [router, setUser],
  );

  const handleBarcodeScanned = useCallback(
    ({ data }: { data: string }) => {
      if (hasHandledScan.current || isProcessing) return;

      const code = parsePairingCode(data);
      if (!code) return; // 관련 없는 QR. 계속 스캔한다.

      hasHandledScan.current = true;
      void finishWithCode(code);
    },
    [finishWithCode, isProcessing],
  );

  const content = (() => {
    if (mode === 'manual') {
      return (
        <>
          <View style={styles.headings}>
            <Text style={styles.title} maxFontSizeMultiplier={1.2}>
              태블릿에 뜬 번호를{'\n'}입력해 주세요
            </Text>
            <Text style={styles.helper} maxFontSizeMultiplier={1.3}>
              {PAIRING_GUIDE}
            </Text>
          </View>

          <Text style={styles.codeDisplay} maxFontSizeMultiplier={1.2}>
            {manualCode.padEnd(CODE_MAX_DIGITS, '·')}
          </Text>

          <Keypad
            onDigit={(digit) => {
              setErrorMessage(null);
              setManualCode((current) =>
                current.length >= CODE_MAX_DIGITS ? current : `${current}${digit}`,
              );
            }}
            onClear={() => {
              setErrorMessage(null);
              setManualCode('');
            }}
            onBackspace={() => {
              setErrorMessage(null);
              setManualCode((current) => current.slice(0, -1));
            }}
            disabled={isProcessing}
          />
        </>
      );
    }

    if (!permission) return null;

    if (!permission.granted) {
      return (
        <View style={styles.permissionBox}>
          <Text style={styles.title} maxFontSizeMultiplier={1.2}>
            카메라 권한이 필요해요
          </Text>
          <Text style={styles.helper} maxFontSizeMultiplier={1.3}>
            태블릿에 뜬 QR을 찍으려면 카메라를 허용해 주세요.
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
        {mode === 'camera' ? (
          <View style={styles.headings}>
            <Text style={styles.title} maxFontSizeMultiplier={1.2}>
              태블릿 화면을{'\n'}카메라로 찍어주세요
            </Text>
            <Text style={styles.helper} maxFontSizeMultiplier={1.3}>
              {PAIRING_GUIDE}
            </Text>
          </View>
        ) : null}

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
        {mode === 'manual' ? (
          <PrimaryButton
            label="연결하기"
            onPress={() => void finishWithCode(manualCode)}
            disabled={manualCode.length < CODE_MAX_DIGITS}
            loading={isProcessing}
          />
        ) : null}
        <PrimaryButton
          label={mode === 'camera' ? '번호로 직접 입력하기' : '카메라로 찍기'}
          variant="secondary"
          onPress={() => {
            setErrorMessage(null);
            setMode((current) => (current === 'camera' ? 'manual' : 'camera'));
          }}
        />
        <PrimaryButton label="뒤로" variant="quiet" size="compact" onPress={() => router.back()} />
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
    gap: Spacing.xxl,
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
  codeDisplay: {
    fontSize: FontSize.display,
    fontWeight: '700',
    letterSpacing: 8,
    color: Colors.primary,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
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
