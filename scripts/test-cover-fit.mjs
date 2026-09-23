// Run against `npm run preview -- --port 4322` after `npm run build`.
// Uses local Chrome and Node's WebSocket; no browser package is required.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const slugs = [
  'fcm-push-hiding-in-the-message-send-api-moving-it-to-a-dedicated-worker-queue',
  'sourcing-keywords-from-search-autocomplete',
  'many-cheap-calls-over-one-good-model',
  'escaping-in-app-browsers-so-login-does-not-lose-users',
];
const lang = process.env.TEST_LANG ?? 'ko';
assert.ok(['ko', 'en'].includes(lang), 'Supported test language');
const base = process.env.TEST_BASE_URL ?? 'http://127.0.0.1:4322';
const artifacts = await mkdtemp(path.join(tmpdir(), 'cover-fit-'));
const chrome = spawn(process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', '--no-first-run', '--remote-debugging-port=0',
  `--user-data-dir=${artifacts}/profile`, 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });
let ws;
try {
  const endpoint = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Chrome startup timed out')), 15000);
    let log = '';
    chrome.once('error', reject);
    chrome.stderr.on('data', data => {
      log += data;
      const match = log.match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) { clearTimeout(timeout); resolve(match[1]); }
    });
  });
  ws = new WebSocket(endpoint);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let id = 0;
  const pending = new Map();
  ws.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    clearTimeout(request.timer);
    message.error ? request.reject(new Error(JSON.stringify(message.error))) : request.resolve(message.result);
  };
  const call = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const key = ++id;
    const timer = setTimeout(() => { pending.delete(key); reject(new Error(`${method} timed out`)); }, 15000);
    pending.set(key, { resolve, reject, timer });
    ws.send(JSON.stringify({ id: key, method, params, sessionId }));
  });
  const { targetId } = await call('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await call('Target.attachToTarget', { targetId, flatten: true });
  const evaluate = async expression => {
    const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
    assert.ok(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  for (const width of [1280, 900, 390]) {
    await call('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
    await call('Page.navigate', { url: `${base}/${lang}/` }, sessionId);
    for (let attempt = 0; attempt < 100; attempt++) {
      if (await evaluate(`location.pathname === '/${lang}/' && document.readyState === 'complete' && !!document.querySelector('[data-load-more]')`)) break;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    await evaluate(`for (let i = 0; i < 5; i++) document.querySelector('[data-load-more]')?.click();`);
    for (const dark of [false, true]) {
      await evaluate(`document.documentElement.classList.toggle('dark', ${dark})`);
      for (const slug of slugs) {
        const selector = `a.img[href="/${lang}/blog/${slug}/"]`;
        await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center'})`);
        const state = await evaluate(`(async () => {
          const box = document.querySelector(${JSON.stringify(selector)});
          const img = box.querySelector('img'); await img.decode();
          const rect = box.getBoundingClientRect(); const style = getComputedStyle(img);
          return { fit: style.objectFit, transform: style.transform, width: rect.width, height: rect.height,
            x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, background: getComputedStyle(box).backgroundColor };
        })()`);
        assert.equal(state.fit, 'contain', `${slug}: image must not crop at ${width}px`);
        assert.ok(Math.abs(state.width / state.height - 16 / 9) < 0.02, 'Keep uniform list frame');
        assert.equal(state.background, slugs.indexOf(slug) < 2 ? 'rgb(255, 255, 255)' : 'rgb(13, 21, 18)');
        await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: state.x, y: state.y }, sessionId);
        await evaluate(`new Promise(resolve => setTimeout(resolve, 450))`);
        assert.equal(await evaluate(`getComputedStyle(document.querySelector(${JSON.stringify(selector)}).querySelector('img')).transform`), 'none', 'Hover must not crop');
        if (width === 1280 && !dark) {
          const shot = await call('Page.captureScreenshot', { format: 'png' }, sessionId);
          await writeFile(path.join(artifacts, `${slug}.png`), Buffer.from(shot.data, 'base64'));
        }
      }
      assert.equal(await evaluate(`getComputedStyle(document.querySelector('a.img[href="/${lang}/blog/redefining-ai-blog-product-after-beta-feedback/"] img')).objectFit`), 'cover', 'Other covers unchanged');
      assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, 'No horizontal overflow');
      if (lang === 'ko') assert.equal(await evaluate(`Array.from(document.querySelectorAll('.lead')).every(el => {
        const sentences = Array.from(new Intl.Segmenter('ko', { granularity: 'sentence' }).segment(el.textContent.trim()));
        return el.scrollHeight <= el.clientHeight + 1 && sentences.length === 2 && sentences.every(s => /니다\\.$/.test(s.segment.trim()));
      })`), true, 'Korean summaries must show two complete polite sentences');
    }
  }
  console.log(`PASS (${lang}): four covers, three widths, two themes, hover; screenshots: ${artifacts}`);
} finally {
  ws?.close();
  chrome.kill();
}
