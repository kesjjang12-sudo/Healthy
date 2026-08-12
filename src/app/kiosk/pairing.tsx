import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/primary-button';
import { Colors, FontSize, LetterSpacing, Radius, Spacing } from '@/constants/theme';
import { useDeviceRole } from '@/features/device-role/context';
import { getPairingStatus } from '@/features/pairing/api';
import { buildPairingDeepLink } from '@/features/pairing/qr-payload';
import type { PairingStatus } from '@/lib/database.types';

/** 키오스크가 상태를 확인하는 간격. 너무 잦으면 서버에 부담, 너무 뜸하면 반응이 굼떠 보인다. */
const POLL_INTERVAL_MS = 2_000;

/** 연결 완료 화면을 보여주는 시간 후 체크인 화면으로 돌아간다. */
const SUCCESS_RETURN_MS = 3_000;

/**
 * 키오스크가 발급한 QR 을 띄우고, 폰 앱이 스캔해서 연결을 끝낼 때까지 상태를 지켜본다.
 * 처음 오신 분(또는 아직 폰 앱과 연결 안 된 분)이 체크인하면 이 화면으로 온다.
 */
export default function KioskPairingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { role, isLoading: isRoleLoading } = useDeviceRole();
  const { code } = useLocalSearchParams<{ code: string }>();

  const [status, setStatus] = useState<PairingStatus>('pending');

  useEffect(() => {
    if (!code || status !== 'pending') return;

    let cancelled = false;

    const poll = async () => {
      try {
        const next = await getPairingStatus(code);
        if (!cancelled) setStatus(next);
      } catch {
        // 네트워크가 잠깐 흔들려도 다음 폴링에서 다시 시도한다. 여기서 화면을
        // 에러로 바꿔버리면 QR 이 사라져 사용자가 다시 찍을 걸 놓친다.
      }
    };

    void poll();
    const timer = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [code, status]);

  useEffect(() => {
    if (status !== 'consumed') return;
    const timer = setTimeout(() => router.replace('/kiosk/checkin'), SUCCESS_RETURN_MS);
    return () => clearTimeout(timer);
  }, [status, router]);

  if (!isRoleLoading && role !== 'kiosk') {
    return <Redirect href="/device-setup" />;
  }

  if (!code) {
    return <Redirect href="/kiosk/checkin" />;
  }

  return (
    <View style={styles.screen}>
      <View style={[styles.content, { paddingTop: insets.top + Spacing.xxl }]}>
        {status === 'consumed' ? (
          <View style={styles.centered}>
            <Text style={styles.title} maxFontSizeMultiplier={1.2}>
              연결 완료
            </Text>
            <Text style={styles.helper} maxFontSizeMultiplier={1.3}>
              다음 방문부터는 QR 없이 바로 체크인됩니다.
            </Text>
          </View>
        ) : status === 'expired' ? (
          <View style={styles.centered}>
            <Text style={styles.title} maxFontSizeMultiplier={1.2}>
              시간이 지났어요
            </Text>
            <Text style={styles.helper} maxFontSizeMultiplier={1.3}>
              전화번호를 다시 눌러주시면 새 QR을 만들어 드려요.
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.headings}>
              <Text style={styles.title} maxFontSizeMultiplier={1.2}>
                처음 오셨네요
              </Text>
              <Text style={styles.helper} maxFontSizeMultiplier={1.3}>
                휴대폰 카메라로 이 화면을 찍어주세요
              </Text>
            </View>

            <View style={styles.qrBox}>
              <QRCode value={buildPairingDeepLink(code)} size={240} />
            </View>

            <View style={styles.codeBox}>
              <Text style={styles.codeLabel} maxFontSizeMultiplier={1.3}>
                카메라가 어려우시면 앱에서 이 번호를 입력하세요
              </Text>
              <Text style={styles.codeValue} maxFontSizeMultiplier={1.2}>
                {code}
              </Text>
            </View>
          </>
        )}
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.lg }]}>
        <PrimaryButton
          label="목록으로"
          variant="secondary"
          onPress={() => router.replace('/kiosk/checkin')}
        />
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
    flex: 1,
    alignItems: 'center',
    gap: Spacing.xxl,
    paddingHorizontal: Spacing.xl,
    maxWidth: 700,
    width: '100%',
    alignSelf: 'center',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
  },
  headings: {
    alignItems: 'center',
    gap: Spacing.sm,
  },
  title: {
    fontSize: FontSize.title,
    fontWeight: '700',
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
  qrBox: {
    padding: Spacing.xl,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
  },
  codeBox: {
    alignItems: 'center',
    gap: Spacing.sm,
  },
  codeLabel: {
    fontSize: FontSize.caption,
    fontWeight: '500',
    letterSpacing: LetterSpacing.body,
    color: Colors.textTertiary,
    textAlign: 'center',
  },
  codeValue: {
    fontSize: FontSize.display,
    fontWeight: '700',
    letterSpacing: LetterSpacing.title,
    color: Colors.primary,
    fontVariant: ['tabular-nums'],
  },
  footer: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    backgroundColor: Colors.background,
    maxWidth: 700,
    width: '100%',
    alignSelf: 'center',
  },
});
