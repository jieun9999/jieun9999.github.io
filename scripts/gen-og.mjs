#!/usr/bin/env node
/**
 * 글별 SNS 공유 카드(OG 이미지) 생성기.
 *
 *   node scripts/gen-og.mjs            # 없는 것만 만든다
 *   node scripts/gen-og.mjs --force    # 전부 다시 만든다
 *
 * src/content/blog/<lang>/<slug>.md 의 frontmatter 를 읽어
 * public/og/<lang>/<slug>.jpg 를 만든다. 언어별로 따로 만들기 때문에
 * /ko/ 글을 공유하면 한글 제목 카드가 뜬다.
 *
 * 렌더링은 로컬 크롬(headless)에 맡긴다 — 브라우저 의존성을 package.json 에
 * 넣지 않으려는 선택이라, CI 에서는 돌지 않는다. 새 글을 쓰면 로컬에서 한 번
 * 돌리고 결과 JPG 를 커밋한다. (빌드는 이 파일이 없으면 기본 배너로 폴백한다)
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const ROOT = path.resolve(import.meta.dirname, '..');
const BLOG = path.join(ROOT, 'src/content/blog');
const OUT = path.join(ROOT, 'public/og');
const FORCE = process.argv.includes('--force');

const CHROME =
  process.env.CHROME_PATH ??
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

if (!fs.existsSync(CHROME)) {
  console.error(`크롬을 찾지 못했다: ${CHROME}\nCHROME_PATH 로 경로를 지정한다.`);
  process.exit(1);
}

// --- frontmatter 최소 파서 -------------------------------------------------
// 필요한 건 title/category/pubDate 뿐이고 전부 한 줄짜리 스칼라라, 이 정도면 충분하다.
function frontmatter(md) {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  const out = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([a-zA-Z]+):\s*(.*)$/);
    if (!kv) continue;
    let v = kv[2].trim();
    if (v.startsWith("'") && v.endsWith("'")) v = v.slice(1, -1).replace(/''/g, "'");
    else if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1).replace(/\\"/g, '"');
    out[kv[1]] = v;
  }
  return out;
}

// "[메신저 부하 테스트 2편] AI가 …" → { series: '메신저 부하 테스트 2편', title: 'AI가 …' }
// 대괄호 프리픽스는 시리즈 칩으로 빼서 제목이 차지할 공간을 확보한다.
function splitSeries(raw) {
  const t = raw.replace(/`/g, ''); // 제목 속 인라인 코드 백틱은 이미지에선 노이즈다
  const m = t.match(/^\[([^\]]+)\]\s*(.+)$/);
  return m ? { series: m[1], title: m[2] } : { series: '', title: t };
}

// --- 렌더 -----------------------------------------------------------------
const CARD = path.join(ROOT, 'scripts/og-card.html');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'og-'));

// 카드 HTML 이 같은 디렉터리에서 찾는 자산을 옆에 둔다
fs.copyFileSync(path.join(ROOT, 'public/web-app-manifest-512x512.png'), path.join(tmp, 'tree.png'));
fs.copyFileSync(
  path.join(ROOT, 'node_modules/pretendard/dist/web/variable/woff2/PretendardVariable.woff2'),
  path.join(tmp, 'PretendardVariable.woff2'),
);
fs.copyFileSync(CARD, path.join(tmp, 'card.html'));

function render(data, outJpg) {
  const png = path.join(tmp, 'shot.png');
  const url = `file://${path.join(tmp, 'card.html')}?d=${encodeURIComponent(JSON.stringify(data))}`;
  execFileSync(CHROME, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-device-scale-factor=2', // 2x 로 그린 뒤 1200x630 으로 줄여 글자를 또렷하게
    '--window-size=1200,630',
    '--virtual-time-budget=3000',
    '--allow-file-access-from-files',
    `--screenshot=${png}`,
    url,
  ], { stdio: 'ignore' });

  fs.mkdirSync(path.dirname(outJpg), { recursive: true });
  execFileSync('sips', [
    '-z', '630', '1200',
    '--setProperty', 'format', 'jpeg',
    '--setProperty', 'formatOptions', '88',
    png, '--out', outJpg,
  ], { stdio: 'ignore' });
}

// --- 실행 -----------------------------------------------------------------
let made = 0;
let skipped = 0;

for (const lang of fs.readdirSync(BLOG)) {
  const dir = path.join(BLOG, lang);
  if (!fs.statSync(dir).isDirectory()) continue;

  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.md'))) {
    const slug = file.replace(/\.md$/, '');
    const outJpg = path.join(OUT, lang, `${slug}.jpg`);
    if (!FORCE && fs.existsSync(outJpg)) {
      skipped++;
      continue;
    }

    const fm = frontmatter(fs.readFileSync(path.join(dir, file), 'utf8'));
    if (fm.draft === 'true') continue;

    const { series, title } = splitSeries(fm.title ?? slug);
    const date = (fm.pubDate ?? '').slice(0, 7).replace('-', '.');

    render({ title, series, category: fm.category ?? 'systems', date }, outJpg);
    made++;
    console.log(`✓ og/${lang}/${slug}.jpg`);
  }
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${made}개 생성${skipped ? `, ${skipped}개 건너뜀 (--force 로 다시 만든다)` : ''}`);
