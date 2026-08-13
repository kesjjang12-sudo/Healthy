#!/usr/bin/env node
/**
 * Supabase에 SQL을 바로 적용한다. 대시보드 SQL Editor에 붙여넣는 수작업을
 * 없애려고 만들었다(모바일에서는 에디터가 잘 안 열리기도 한다).
 *
 *   node scripts/apply-sql.mjs                     # supabase/setup.sql 전체
 *   node scripts/apply-sql.mjs supabase/migrations/2026...sql   # 파일 하나만
 *   node scripts/apply-sql.mjs --check             # 연결만 확인하고 끝
 *
 * 필요한 것:
 *   SUPABASE_ACCESS_TOKEN — https://supabase.com/dashboard/account/tokens
 *                           에서 만든 개인 액세스 토큰(sbp_ 로 시작).
 *                           .env 에 넣어두면 자동으로 읽는다.
 *
 * 프로젝트는 .env 의 EXPO_PUBLIC_SUPABASE_URL 에서 알아낸다 — 실수로 다른
 * 프로젝트에 쏘지 않도록 앱이 실제로 쓰는 주소를 그대로 따라간다.
 *
 * ⚠️ 이 토큰은 계정 전체를 다룰 수 있다. .env 는 이미 gitignore 되어 있지만,
 *    커밋되지 않는지 늘 확인할 것.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const MANAGEMENT_API = 'https://api.supabase.com';

/** .env 를 읽어 process.env 에 없는 값만 채운다. */
function loadDotEnv() {
  const path = resolve(process.cwd(), '.env');
  if (!existsSync(path)) return;

  for (const rawLine of readFileSync(path, 'utf8').split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const eq = line.indexOf('=');
    if (eq === -1) continue;

    const key = line.slice(0, eq).trim();
    // 값에 = 가 들어갈 수 있으니(JWT 등) 첫 = 뒤는 통째로 값이다.
    const value = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!(key in process.env)) process.env[key] = value;
  }
}

function fail(message) {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

/** https://<ref>.supabase.co → <ref> */
function projectRefFromUrl(url) {
  const match = /^https:\/\/([a-z0-9]+)\.supabase\.co/i.exec(url ?? '');
  return match ? match[1] : null;
}

async function runSql(ref, token, sql) {
  const response = await fetch(`${MANAGEMENT_API}/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });

  const text = await response.text();
  if (!response.ok) {
    // 관리 API 는 오류를 JSON 으로 주기도 하고 평문으로 주기도 한다.
    let detail = text;
    try {
      const parsed = JSON.parse(text);
      detail = parsed.message ?? parsed.error ?? text;
    } catch {
      /* 평문 그대로 쓴다 */
    }
    throw new Error(`HTTP ${response.status} — ${detail}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function main() {
  loadDotEnv();

  const args = process.argv.slice(2);
  const checkOnly = args.includes('--check');
  const file = args.find((arg) => !arg.startsWith('--')) ?? 'supabase/setup.sql';

  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) {
    fail(
      'SUPABASE_ACCESS_TOKEN 이 없습니다.\n' +
        '  https://supabase.com/dashboard/account/tokens 에서 토큰을 만들고\n' +
        '  .env 에 SUPABASE_ACCESS_TOKEN=sbp_... 로 넣어주세요.',
    );
  }

  const ref = projectRefFromUrl(process.env.EXPO_PUBLIC_SUPABASE_URL);
  if (!ref) {
    fail('.env 의 EXPO_PUBLIC_SUPABASE_URL 에서 프로젝트를 알아내지 못했습니다.');
  }

  console.log(`프로젝트: ${ref}`);

  if (checkOnly) {
    const rows = await runSql(ref, token, 'select current_database() as db, version() as version;');
    console.log('✓ 연결 확인:', JSON.stringify(rows));
    return;
  }

  const path = resolve(process.cwd(), file);
  if (!existsSync(path)) fail(`파일이 없습니다: ${file}`);

  const sql = readFileSync(path, 'utf8');
  console.log(`적용할 파일: ${file} (${(sql.length / 1024).toFixed(1)}KB)`);

  try {
    await runSql(ref, token, sql);
    console.log('✓ 적용 완료');
  } catch (error) {
    fail(`적용 실패\n  ${error.message}`);
  }
}

main().catch((error) => fail(error.message));
