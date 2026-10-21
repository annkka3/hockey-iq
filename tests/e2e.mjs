/* Сквозная проверка в браузере (Playwright + Chromium): приложение поднимается на своём статическом сервере,
   проходятся все карточки с фазой «Предскажи», открываются все режимы броска (новичок и профи), все тренажёры
   внимания, вид «Глазами» на нескольких карточках. Любая ошибка страницы — провал.
   Запуск: node tests/e2e.mjs   (нужен playwright: npm i -D playwright && npx playwright install chromium,
   или переменная PLAYWRIGHT=/путь/к/playwright/index.mjs). */
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, normalize } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const server = http.createServer(async (req, res) => {
  let path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  if (path.endsWith('/')) path += 'index.html';
  try { const body = await readFile(join(ROOT, path)); res.writeHead(200, { 'Content-Type': TYPES[extname(path)] || 'application/octet-stream' }); res.end(body); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(0, r));
const BASE = `http://localhost:${server.address().port}`;

const browser = await chromium.launch();
const errors = [];
const page = async (profile = {}) => {
  const p = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  p.setDefaultTimeout(6000);
  p.on('pageerror', e => errors.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await p.addInitScript(pr => { localStorage.setItem('hk_state_v1', JSON.stringify({ meta: { onboarded: true }, profile: { anim: false, ...pr } })); }, profile);
  await p.goto(BASE + '/#/today'); await p.waitForTimeout(600);
  return p;
};
const step = async (name, fn) => {
  const before = errors.length, t0 = Date.now();
  try { await fn(); } catch (e) { errors.push(`${name}: ${e.message.split('\n')[0]}`); }
  console.log(`${errors.length > before ? '✗' : '✓'} ${name} (${((Date.now() - t0) / 1000).toFixed(1)} с)`);
};

/* 1. Все карточки: ответ → фаза «Предскажи» → «Почему» → результат. */
await step('карточки', async () => {
  const p = await page();
  const ids = await p.evaluate(async () => { const c = await import('/js/content.js'); return c.lib.cards.filter(x => x.read).map(x => x.id); });
  for (const id of ids) {
    await p.evaluate(async id => { const m = await import('/js/modules/play.js'); m.play([id], { preview: true }); }, id);
    await p.waitForSelector('.opts .opt', { timeout: 8000 }); await p.click('.opts .opt >> nth=0');
    await p.waitForSelector('.read-fb', { timeout: 8000 });
    await p.waitForFunction(() => document.querySelector('.spd span:nth-child(3).on'), null, { timeout: 8000 });
    if (await p.$('.opts .opt')) await p.click('.opts .opt >> nth=0');
    else {
      const z = await p.evaluate(async id => { const c = await import('/js/content.js'); const card = c.lib.cards.find(x => x.id === id); const s = window.__hkScene; const q = s.pt(card.options[0].zone); const m = s.svg.getScreenCTM(); return { x: q.x * m.a + m.e, y: q.y * m.d + m.f }; }, id);
      await p.mouse.click(z.x, z.y);
    }
    if (await p.waitForSelector('.why-box .opt', { timeout: 2500 }).catch(() => null)) await p.click('.why-box .opt >> nth=0');
    await p.waitForSelector('.result', { timeout: 15000 });
    await p.click('.play-top .x');
  }
  console.log(`  пройдено карточек: ${ids.length}`);
  await p.close();
});

/* 2. Вид «Глазами»: холст рисуется, касание по сцене не ломает карточку. */
await step('вид «Глазами»', async () => {
  const p = await page({ pov: true });
  for (const id of ['u15-01', 'c-wp-10', 'c-fo-01', 'u15-31']) {
    await p.evaluate(async id => { const m = await import('/js/modules/play.js'); m.play([id], { preview: true }); }, id);
    await p.waitForSelector('.pov-cv', { timeout: 8000 }); await p.waitForTimeout(700);
    const box = await (await p.$('.pov-cv')).boundingBox();
    await p.mouse.click(box.x + box.width / 2, box.y + box.height * 0.45);
    await p.click('.pov-turn .btn >> nth=0'); await p.waitForTimeout(800);
    await p.click('.play-top .x');
  }
  await p.close();
});

/* 3. Бросок: все режимы, новичок и профи — до результата. */
for (const pro of [false, true]) await step(`бросок (${pro ? 'профи' : 'новичок'})`, async () => {
  const p = await page({ shotPro: pro });
  for (const mode of ['angle', 'goalie', 'royal', 'move', 'drag', 'screen', 'rebound']) {
    await p.goto(BASE + '/#/shot'); await p.waitForTimeout(400);
    await p.evaluate(async m => { const x = await import('/js/modules/shot.js'); x.openMode(m); }, mode);
    await p.waitForSelector('canvas.goal-cv', { timeout: 8000 }); await p.waitForTimeout(900);
    const c = await (await p.$('canvas.goal-cv')).boundingBox();
    const go = await p.$('button.shot-go');
    if (go && !(await go.isDisabled())) { await p.mouse.click(c.x + c.width * 0.62, c.y + c.height * 0.45); await p.waitForTimeout(150); await go.evaluate(b => b.click()); }
    else { await p.mouse.move(c.x + c.width * 0.62, c.y + c.height * 0.45 + 56); await p.mouse.down(); await p.waitForTimeout(500); await p.mouse.up(); }
    await p.waitForTimeout(2500);
  }
  await p.close();
});

/* 4. Тренажёры внимания: каждый открывается и живёт несколько секунд без ошибок. */
await step('тренажёры внимания', async () => {
  const p = await page({ pov: true });
  for (const id of ['shoulder', 'mates', 'pressure', 'open', 'danger', 'scan', 'memory', 'track', 'predict', 'faceoff', 'blitz']) {
    await p.goto(BASE + '/#/today'); await p.waitForTimeout(300);
    await p.evaluate(async id => { const m = await import('/js/modules/react.js'); m.openDrill(id); }, id);
    await p.waitForTimeout(2500);
    const opt = await p.$('.opts .opt'); if (opt) await opt.evaluate(b => b.click()).catch(() => {});
    await p.waitForTimeout(600);
  }
  await p.close();
});

await browser.close(); server.close();
if (errors.length) { console.error(`\nОшибки (${errors.length}):\n` + [...new Set(errors)].slice(0, 30).join('\n')); process.exit(1); }
console.log('\ne2e: всё прошло без ошибок');
