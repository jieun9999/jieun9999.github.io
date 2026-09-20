// 홈 화면·앱 아이콘(apple-touch-icon·web-app-manifest-*)을 브랜드 SVG 에서 뽑는다.
//   npm run icons
// gen-og.mjs 와 같은 방식 — 로컬 헤드리스 크롬으로 그리고 sips 로 줄인다. CI 에서는 돌지 않으니
// 결과 PNG 를 커밋한다. 원본 그림(design/brand/jieun-icon*.svg)이 바뀌면 다시 돌린다.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BRAND = path.join(ROOT, 'design/brand');
const OUT = path.join(ROOT, 'public');

const CHROME =
  process.env.CHROME_PATH ??
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

if (!fs.existsSync(CHROME)) {
  console.error(`크롬을 찾지 못했다: ${CHROME}\nCHROME_PATH 로 경로를 지정한다.`);
  process.exit(1);
}

const square = fs.readFileSync(path.join(BRAND, 'jieun-icon-square.svg'), 'utf8');
const tile = fs.readFileSync(path.join(BRAND, 'jieun-icon.svg'), 'utf8');

// maskable 은 플랫폼이 가운데 80% 원만 남기고 자를 수 있다. 정사각 배경은 그대로 두고
// J 만 그 원 안에 들어오게 가운데 기준으로 줄인다(대각선 기준 0.86 이면 안전권에 들어온다).
const maskable = square.replace(
  '<g transform="translate(162.67 46)',
  '<g transform="translate(256 256) scale(0.86) translate(-256 -256)"><g transform="translate(162.67 46)',
).replace('</svg>', '</g></svg>');

const JOBS = [
  { svg: square, size: 180, out: 'apple-touch-icon.png' },
  { svg: tile, size: 192, out: 'web-app-manifest-192x192.png' },
  { svg: tile, size: 512, out: 'web-app-manifest-512x512.png' },
  { svg: maskable, size: 512, out: 'web-app-manifest-maskable-512x512.png' },
];

const RENDER = 1024; // 그리는 크기. 결과는 여기서 각 아이콘 크기로 줄인다.

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jieun-icons-'));

for (const { svg, size, out } of JOBS) {
  // 칸을 꽉 채우게 SVG 자신의 width/height 는 떼고 CSS 로 늘린다.
  // 여는 <svg> 태그에서만 뗀다 — 안쪽 <rect> 의 크기까지 지우면 배경이 사라진다.
  const body = svg.replace(/<svg[^>]*>/, (tag) => tag.replace(/\s(width|height)="\d+"/g, ''));
  const html = `<!doctype html><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;background:transparent}
    svg{display:block;width:100vw;height:100vh}
  </style>${body}`;
  const page = path.join(tmp, 'icon.html');
  const shot = path.join(tmp, 'shot.png');
  fs.writeFileSync(page, html);

  execFileSync(CHROME, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    // 언제나 1024 로 그린 뒤 sips 로 줄인다. 가장자리가 매끈해지고, 작은 창에서 크롬이
    // 뷰포트를 어긋나게 잡아 그림이 잘리는 것도 피한다(180·192 에서 실제로 잘렸다).
    `--window-size=${RENDER},${RENDER}`,
    '--default-background-color=00000000', // 둥근 타일의 바깥 모서리를 투명하게
    '--virtual-time-budget=2000',
    `--screenshot=${shot}`,
    `file://${page}`,
  ], { stdio: 'ignore' });

  execFileSync('sips', ['-z', String(size), String(size), shot, '--out', path.join(OUT, out)], {
    stdio: 'ignore',
  });
  console.log(`${out} (${size}x${size})`);
}

fs.rmSync(tmp, { recursive: true, force: true });
