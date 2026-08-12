import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Colors, FontSize, Radius, Spacing } from '@/constants/theme';

/**
 * .env 가 없을 때 뜨는 개발자용 화면.
 * 실기기에서 빨간 에러 화면만 보고 원인을 짐작하지 않게 하려는 목적이다.
 */
export function SetupRequired({ missing }: { missing: string[] }) {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>설정이 필요합니다</Text>
      <Text style={styles.body}>
        프로젝트 루트에 <Text style={styles.code}>.env</Text> 를 만들고 아래 값을 채운 뒤 개발
        서버를 다시 시작해 주세요.
      </Text>

      <View style={styles.list}>
        {missing.map((name) => (
          <Text key={name} style={styles.item}>
            • {name}
          </Text>
        ))}
      </View>

      <Text style={styles.body}>
        <Text style={styles.code}>.env.example</Text> 을 복사하면 형식을 그대로 쓸 수 있습니다.
        환경변수는 Metro 시작 시점에 읽히므로 서버 재시작이 필요합니다.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    gap: Spacing.lg,
    padding: Spacing.xl,
    maxWidth: 700,
    width: '100%',
    alignSelf: 'center',
  },
  title: {
    fontSize: FontSize.title,
    fontWeight: '800',
    color: Colors.text,
  },
  body: {
    fontSize: FontSize.body,
    fontWeight: '600',
    color: Colors.textSecondary,
    lineHeight: FontSize.body * 1.5,
  },
  code: {
    fontWeight: '800',
    color: Colors.text,
  },
  list: {
    gap: Spacing.sm,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    backgroundColor: Colors.dangerFaint,
  },
  item: {
    fontSize: FontSize.body,
    fontWeight: '700',
    color: Colors.danger,
  },
});
