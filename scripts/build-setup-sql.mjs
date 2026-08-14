/**
 * supabase/setup.sql 을 migrations/ + seed.sql 에서 다시 만든다.
 *
 *   node scripts/build-setup-sql.mjs           # 다시 만든다
 *   node scripts/build-setup-sql.mjs --check   # 최신인지 검사만 한다(CI용)
 *
 * 왜 스크립트로 만드나. setup.sql 은 마이그레이션을 순서대로 이어 붙인
 * "한 번에 실행용" 파일인데, 지금까지 손으로 관리했다. 그래서 두 갈래 작업이
 * 각자 마이그레이션을 추가하면 이 파일 하나에서 충돌이 수십 곳씩 났고(실제로
 * 2026-08-14 병합에서 20곳), 손으로 풀다 보면 마이그레이션에는 있는데 setup.sql
 * 에는 빠지는 조각이 생긴다. 그러면 빈 DB 를 이 파일로 세운 사람만 조용히 다른
 * 스키마를 갖게 된다.
 *
 * 생성물이므로 충돌이 나면 풀지 말고 이 스크립트를 다시 돌리면 된다.
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = 'supabase/migrations';
const SEED_FILE = 'supabase/seed.sql';
const OUT_FILE = 'supabase/setup.sql';

const RULE = '═'.repeat(59);

const HEADER = `-- 핏루틴 전체 설치 스크립트 (한 번에 실행용)
--
-- Supabase 대시보드 > SQL Editor 에 이 파일 전체를 붙여넣고 Run 하면 끝난다.
-- supabase/migrations/ 의 파일들과 seed.sql 을 순서대로 합친 것이고,
-- 전부 idempotent 라 여러 번 실행해도 안전하다.
--
-- CLI 를 쓴다면 이 파일 대신 \`npx supabase db push\` 를 쓰는 편이 낫다.
-- 그쪽이 마이그레이션 이력을 관리해 준다.
--
-- ⚠️ 이 파일은 손으로 고치지 않는다. scripts/build-setup-sql.mjs 가 만든다.
--    마이그레이션을 추가했으면 \`node scripts/build-setup-sql.mjs\` 를 돌릴 것.
`;

function section(title, body) {
  return `\n\n-- ${RULE}\n-- ${title}\n-- ${RULE}\n\n${body.trimEnd()}\n`;
}

function build() {
  // 파일명 앞의 타임스탬프가 곧 적용 순서다. 사전순 정렬이 그대로 시간순이 된다.
  const migrations = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort();

  const parts = [HEADER];

  for (const name of migrations) {
    parts.push(section(name, readFileSync(join(MIGRATIONS_DIR, name), 'utf8')));
  }

  parts.push(section('seed.sql (데모 단지 데이터)', readFileSync(SEED_FILE, 'utf8')));

  return { text: parts.join(''), count: migrations.length };
}

const { text, count } = build();

if (process.argv.includes('--check')) {
  const current = readFileSync(OUT_FILE, 'utf8');
  if (current === text) {
    console.log(`setup.sql 최신 (마이그레이션 ${count}개)`);
  } else {
    console.error(
      'setup.sql 이 supabase/migrations/ 와 어긋납니다.\n' +
        '  node scripts/build-setup-sql.mjs 를 돌리고 커밋하세요.',
    );
    process.exit(1);
  }
} else {
  writeFileSync(OUT_FILE, text);
  console.log(`setup.sql 을 다시 만들었습니다 (마이그레이션 ${count}개 + seed).`);
}
