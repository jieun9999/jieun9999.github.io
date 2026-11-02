// Run after build: npm run preview -- --host 127.0.0.1 --port 4324
// Then: node scripts/test-light-reading.mjs (TEST_BASE_URL / TEST_ARTIFACT_DIR optional).
// Uses local Chrome and Node's WebSocket; no browser package is required.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const slugs = ['ncp-account-migration-terraform-nks', 'ncp-account-migration-strategy', 'ncp-migration-safe-rehearsal'];
const lang = process.env.TEST_LANG ?? 'ko';
assert.ok(['ko', 'en'].includes(lang), 'Supported test language');
const base = process.env.TEST_BASE_URL ?? 'http://127.0.0.1:4324';
const artifacts = process.env.TEST_ARTIFACT_DIR ?? await mkdtemp(path.join(tmpdir(), 'light-reading-'));
console.log(`Artifacts: ${artifacts}`);
const chrome = spawn(process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', '--no-first-run', '--remote-debugging-port=0',
  `--user-data-dir=${await mkdtemp(path.join(tmpdir(), 'ncp-chrome-'))}`, 'about:blank',
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
  const results = [];
  const screenshots = [];
  await call('Page.enable', {}, sessionId);
  // Old saved preferences and an OS dark preference must no longer change the page.
  await call('Page.addScriptToEvaluateOnNewDocument', { source: `try {
    localStorage.setItem('theme-override', JSON.stringify({mode:'dark',auto:'dark'}));
    localStorage.setItem('theme','dark');
  } catch {}` }, sessionId);
  const goto = async pathname => {
    await call('Page.navigate', {url:base+pathname}, sessionId);
    let ready = false;
    for(let i=0;i<200;i++) {
      ready = await evaluate(`location.pathname === ${JSON.stringify(pathname)} && document.readyState === 'complete'`);
      if(ready)break;
      await new Promise(resolve=>setTimeout(resolve,50));
    }
    assert.ok(ready, `Page loads: ${pathname}`);
    await evaluate('document.fonts.ready');
  };
  const shot = async (selector,filename) => {
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center',behavior:'instant'})`);
    await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    const result = await call('Page.captureScreenshot',{format:'png'},sessionId);
    await writeFile(path.join(artifacts,filename),Buffer.from(result.data,'base64'));
    screenshots.push(filename);
  };
  const common = async () => {
    const state = await evaluate(`({
      dark:document.documentElement.classList.contains('dark'),
      bg:getComputedStyle(document.body).backgroundColor,
      scheme:getComputedStyle(document.documentElement).colorScheme,
      meta:document.querySelector('meta[name="theme-color"]')?.content,
      toggle:document.querySelectorAll('[data-theme-toggle],.theme-toggle').length,
      overflow:document.documentElement.scrollWidth>innerWidth
    })`);
    assert.equal(state.dark,false);assert.equal(state.bg,'rgb(255, 255, 255)');
    assert.equal(state.scheme,'light');assert.equal(state.meta,'#ffffff');
    assert.equal(state.toggle,0);assert.equal(state.overflow,false);
    return state;
  };
  const contrast = (fg,bg) => {
    const luminance = color => color.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{
      v/=255;return v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4;
    }).reduce((sum,v,i)=>sum+v*[0.2126,0.7152,0.0722][i],0);
    const a=luminance(fg),b=luminance(bg);return (Math.max(a,b)+0.05)/(Math.min(a,b)+0.05);
  };
  for(const width of [320,390,900,1280]) {
    await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<500},sessionId);
    for(const prefersDark of [false,true]) {
      await call('Emulation.setEmulatedMedia',{features:[
        {name:'prefers-color-scheme',value:prefersDark?'dark':'light'},
        {name:'prefers-reduced-motion',value:'reduce'},
      ]},sessionId);
      await goto(`/${lang}/`);await common();
      assert.equal(await evaluate(`getComputedStyle(document.querySelector('.hero')).backgroundColor`),'rgb(233, 237, 241)');
      if(!prefersDark&&[390,1280].includes(width))await shot('.hero',`home-${width}.png`);
      if(width===390) {
        await evaluate(`document.querySelector('[data-menu-toggle]').click()`);
        assert.equal(await evaluate(`document.getElementById('mobile-menu').hidden`),false);
        await evaluate(`document.querySelector('[data-menu-toggle]').click()`);
        assert.equal(await evaluate(`document.getElementById('mobile-menu').hidden`),true);
      }
      results.push({page:'home',width,prefersDark,lightOnly:true});
      for(const [index,slug] of slugs.entries()) {
        await goto(`/${lang}/blog/${slug}/`);await common();
        const state=await evaluate(`(async()=>{
          const prose=document.querySelector('.prose'),p=prose.querySelector('p'),strong=prose.querySelector('strong');
          const table=prose.querySelector('table');
          const heads=[...table.querySelectorAll('th')].map(el=>({color:getComputedStyle(el).color,bg:getComputedStyle(el).backgroundColor}));
          const cells=[...table.querySelectorAll('tbody tr:first-child td')].map(el=>({color:getComputedStyle(el).color,bg:getComputedStyle(el).backgroundColor}));
          const diagrams=[...prose.querySelectorAll('.post-diagram img')];
          // Offscreen diagrams are lazy-loaded; request them before checking their decoded size.
          for(const img of diagrams) { img.loading='eager'; await img.decode(); }
          const cover=document.querySelector('.post-cover');await cover.decode();
          return {color:getComputedStyle(p).color,weight:+getComputedStyle(p).fontWeight,strong:+getComputedStyle(strong).fontWeight,
            font:getComputedStyle(p).fontSize,lineHeight:getComputedStyle(p).lineHeight,heads,cells,
            tableBg:getComputedStyle(table).backgroundColor,
            diagrams:diagrams.map(img=>({src:img.getAttribute('src'),w:img.getBoundingClientRect().width,nw:img.naturalWidth,nh:img.naturalHeight})),
            series:document.querySelectorAll('.series-parts li').length,
            current:document.querySelectorAll('.series-parts [aria-current="page"]').length,
            coverW:cover.getBoundingClientRect().width,coverH:cover.getBoundingClientRect().height,
            codeBg:document.querySelector('.expressive-code pre')?getComputedStyle(document.querySelector('.expressive-code pre')).backgroundColor:null,
            giscus:document.querySelector('.giscus-mount script')?.getAttribute('data-theme')};
        })()`);
        assert.ok(state.weight>=500,'Medium body strokes');assert.ok(state.strong>state.weight,'Distinct emphasis');
        assert.ok(contrast(state.color,'rgb(255,255,255)')>=12,'Strong paragraph contrast');
        assert.ok(new Set(state.heads.map(c=>c.bg)).size>=2,'Color-coded table columns');
        for(const cell of [...state.heads,...state.cells])assert.ok(contrast(cell.color,cell.bg)>=7,'Table text remains readable');
        assert.equal(state.tableBg,'rgba(0, 0, 0, 0)','Only table cells get backgrounds');
        assert.equal(state.diagrams.length,index===2?2:1,'Expected diagrams by part');
        assert.equal(state.series,3);assert.equal(state.current,1);
        assert.ok(Math.abs(state.coverW/state.coverH-16/9)<0.02);
        assert.equal(state.giscus,'https://jieun.dev/giscus/light.css');
        if(!prefersDark&&[390,1280].includes(width))await shot('.prose table',`part-${index+1}-table-${width}.png`);
        for(const diagram of state.diagrams) {
          assert.equal(diagram.nw,420);assert.ok(diagram.w<=420);
          if(width===390&&!prefersDark) {
            await shot(`img[src="${diagram.src}"]`,diagram.src.split('/').at(-1).replace('.svg','-390.png'));
            await evaluate(`document.querySelector(${JSON.stringify(`img[src="${diagram.src}"]`)}).click()`);
            assert.equal(await evaluate(`document.querySelector('#lightbox').getAttribute('aria-hidden')`),'false','Diagram expands');
            await evaluate(`document.querySelector('.lightbox-close').click()`);
            assert.equal(await evaluate(`document.querySelector('#lightbox').getAttribute('aria-hidden')`),'true');
          }
        }
        results.push({page:slug,width,prefersDark,contrast:+contrast(state.color,'rgb(255,255,255)').toFixed(2),bodyWeight:state.weight,diagrams:state.diagrams.length,lightOnly:true});
      }
    }
  }
  // Other languages, standard tables, search, code and About/Tags share the light shell.
  await goto('/en/blog/many-cheap-calls-over-one-good-model/');await common();
  assert.notEqual(await evaluate(`document.querySelector('.prose').dataset.series`),'ncp-account-migration');
  const neutral=await evaluate(`getComputedStyle(document.querySelector('.prose td')).backgroundColor`);
  assert.equal(neutral,'rgb(250, 250, 250)','Unrelated table palette stays neutral');
  for(const pathname of [`/${lang}/about/`,`/${lang}/tags/`,`/${lang}/category/devops/`]) {await goto(pathname);await common();}
  for(const name of ['roadmap','cutover-gates','rehearsal-isolation','centrifugo-routing']) {
    await goto(`/images/ncp-migration/${name}${lang==='en'?'-en':''}.svg`);
    const clipped = await evaluate(`(()=>{
      const svg=document.querySelector('svg'),b=svg.viewBox.baseVal;
      return [...svg.querySelectorAll('text')].filter(el=>{const r=el.getBBox();return r.x<0||r.y<0||r.x+r.width>b.width||r.y+r.height>b.height;}).map(el=>el.textContent);
    })()`);
    assert.deepEqual(clipped,[],`${name}: SVG text must fit canvas`);
  }
  await writeFile(path.join(artifacts,'results.json'),JSON.stringify({language:lang,checks:results,screenshots},null,2)+'\n');
  console.log(`PASS: ${results.length} home/post checks at 320/390/900/1280px under both OS preferences and stale dark storage; light shell, contrast, font weight, table colors, diagrams, zoom, menu, other pages, SVG bounds.`);
  console.log(`Artifacts: ${artifacts}`);
} finally {ws?.close();chrome.kill();}
