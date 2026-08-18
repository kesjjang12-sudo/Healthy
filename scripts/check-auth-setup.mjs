#!/usr/bin/env node
/**
 * 로그인 설정이 제대로 됐는지 서버에 직접 물어본다.
 *
 *   node scripts/check-auth-setup.mjs
 *
 * 카카오·구글은 대시보드에서 켜야 동작하는데, 앱 화면만 봐서는 "안 켜진 것"과
 * "키를 잘못 넣은 것"이 똑같이 보인다. 이 스크립트는 서버가 실제로 뭘 켰다고
 * 하는지 그대로 보여 준다 — 설정을 바꾼 직후 바로 돌려 확인하는 용도다.
 */
import { readFileSync } from 'node:fs';

function readEnv() {
  const out = {};
  try {
    for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (m) out[m[1]] = m[2];
    }
  } catch {
    // .env 가 없으면 아래에서 process.env 로 대신한다.
  }
  return out;
}

const env = readEnv();
const url = env.EXPO_PUBLIC_SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error('.env 에 EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY 가 필요합니다.');
  process.exit(1);
}

const response = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } });
if (!response.ok) {
  console.error(`서버에 물어보지 못했습니다 (HTTP ${response.status}).`);
  process.exit(1);
}

const settings = await response.json();
const external = settings.external ?? {};

const rows = [
  ['카카오', external.kakao, '제품 설정 → 카카오 로그인 + Supabase Providers → Kakao'],
  ['구글', external.google, 'Google Cloud OAuth + Supabase Providers → Google'],
  ['문자(SMS)', external.phone, 'Supabase → Providers → Phone'],
  ['익명(테스트 계정)', external.anonymous_users, '출시 전에 끄는 것을 권합니다'],
];

console.log(`\n서버: ${url}\n`);
for (const [name, on, hint] of rows) {
  console.log(`  ${on ? '✅ 켜짐' : '❌ 꺼짐'}  ${name}${on ? '' : `  → ${hint}`}`);
}

const missing = rows.filter(([, on], i) => !on && i < 3).map(([name]) => name);
console.log(
  missing.length
    ? `\n아직 ${missing.join(', ')} 이(가) 꺼져 있습니다. 켜면 앱 재배포 없이 버튼이 나타납니다.\n`
    : '\n로그인 수단이 모두 켜져 있습니다. 앱에서 실제로 눌러 확인해 보세요.\n',
);
