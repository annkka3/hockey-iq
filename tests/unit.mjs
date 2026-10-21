/* Юнит-проверки чистых моделей (без браузера): клюшка, бросок, контент.
   Запуск: node tests/unit.mjs  (или npm test). Падает с кодом 1, если хоть одна проверка не прошла. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as ST from '../js/engine/stick.js';
import * as P from '../js/engine/shot.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); pass++; } catch (e) { fail++; console.error('✗', name, '—', e.message); }
};
const ok = (cond, msg) => { if (!cond) throw new Error(msg || 'assert'); };
const near = (a, b, eps, msg) => ok(Math.abs(a - b) <= eps, `${msg || ''} ${a} ≠ ${b} (±${eps})`);
const hyp = (a, b) => Math.hypot(a.f - b.f, a.l - b.l);

/* ---------- клюшка ---------- */
t('хват L: крюк слева, нижняя рука левая', () => {
  const s = ST.stickPose({ hand: 'L' });
  ok(s.heel.l > 0 && s.toe.l > 0, 'крюк должен быть слева от тела');
  ok(s.bottomHand === 'L' && s.topHand === 'R', 'роли рук');
});
t('хват R: зеркально', () => {
  const s = ST.stickPose({ hand: 'R' });
  ok(s.heel.l < 0 && s.toe.l < 0, 'крюк должен быть справа');
  ok(s.bottomHand === 'R' && s.topHand === 'L', 'роли рук');
});
t('хват не меняется на бекхенде', () => {
  const s = ST.stickPose({ hand: 'L', contact: { f: 0.7, l: -0.5 } });
  ok(s.face === 'back', 'контакт с другой стороны — бекхенд');
  ok(s.bottomHand === 'L', 'нижняя рука та же');
});
t('клюшка не растягивается', () => {
  const reach = Math.sqrt(ST.STICK.len ** 2 - ST.STICK.knobH ** 2);
  for (const c of [{ f: 3, l: 2 }, { f: -2, l: 0 }, { f: 0.1, l: 0.05 }]) {
    const s = ST.stickPose({ hand: 'L', contact: c });
    ok(hyp(s.heel, s.knob) <= reach + 1e-6, 'пятка дальше длины клюшки');
  }
});
t('крюк продолжает древко, длина крюка постоянна', () => {
  for (const a of ['ready', 'carry', 'receive', 'pass', 'shot', 'block']) {
    const s = ST.stickPose({ hand: 'L', action: a });
    near(hyp(s.heel, s.toe), ST.STICK.blade, 1e-6, a);
  }
});
t('toWorld / toBody обратны', () => {
  const p = { x: 3, y: 20 }, fw = { x: 0.6, y: 0.8 }, q = { f: 0.9, l: -0.4 };
  const w = ST.toWorld(q, p, fw), b = ST.toBody(w, p, fw);
  near(b.f, q.f, 1e-9); near(b.l, q.l, 1e-9);
});
t('ведение: шайба у игрока', () => {
  ok(ST.actionOf({ id: 'a' }, null, { x: 0, y: 0 }, { x: 0.5, y: 0.5 }).action === 'carry');
});
t('явное действие из карточки важнее вычисленного', () => {
  ok(ST.actionOf({ id: 'a', action: 'shot' }, null, { x: 0, y: 0 }, { x: 0.2, y: 0 }).action === 'shot');
});

/* ---------- бросок ---------- */
t('дуга приходит на высоту прицела', () => {
  const S = { x: 0, y: 46 }, target = { u: 0.5, v: 0.8 };
  const ar = P.arc(S, target, 25);
  ok(!ar.weak, 'на 90 км/ч до 0,8 м должна долететь');
  near(ar.h(ar.D), 0.8, 0.01, 'высота на линии ворот');
});
t('слабый бросок не долетает до верха', () => {
  const ar = P.arc({ x: 0, y: 30 }, { u: 0, v: 1.1 }, 8);
  ok(ar.weak, 'должен быть weak');
});
t('низом — без дуги', () => {
  ok(P.arc({ x: 0, y: 46 }, { u: 0, v: 0.1 }, 25).slide);
});
t('рама: центр — внутри, за штангой — мимо', () => {
  ok(P.frameHit({ u: 0, v: 0.5 }) === null);
  ok(P.frameHit({ u: 1.5, v: 0.5 }) === 'miss');
  ok(P.frameHit({ u: P.GOAL.half + 0.02, v: 0.5 }) === 'post');
});
t('пустые ворота — гол', () => {
  const r = P.resolveShot({ S: { x: 0, y: 46 }, target: { u: 0.3, v: 0.4 }, speedMs: 25, goalie: { sil: [], level: 'pro' }, rng: () => 0.5 });
  ok(r.result === 'goal' && r.empty);
});
t('вратарь в центре берёт бросок в корпус', () => {
  const S = { x: 0, y: 46 }, G = P.goaliePos(S, 1);
  const sil = P.silhouette(S, G, P.STANCES.stand);
  const r = P.resolveShot({ S, target: { u: 0, v: 0.9 }, speedMs: 25, goalie: { sil, level: 'pro' }, rng: () => 0.5 });
  ok(r.result === 'save', r.result);
});
t('силуэт растёт, когда вратарь выходит на угол', () => {
  const S = { x: 0, y: 46 };
  const w = d => { const sil = P.silhouette(S, P.goaliePos(S, d), P.STANCES.stand); const b = sil.find(p => p.id === 'body'); const us = b.pts.map(p => p.u); return Math.max(...us) - Math.min(...us); };
  ok(w(1.5) > w(0.3), 'выход должен увеличивать силуэт');
});
t('генератор случайностей воспроизводим', () => {
  const a = P.rngFrom(7), b = P.rngFrom(7);
  for (let i = 0; i < 5; i++) ok(a() === b());
});

/* ---------- контент ---------- */
const content = JSON.parse(readFileSync(join(ROOT, 'data/content.json'), 'utf8'));
t('карточки: варианты и лучший ответ', () => {
  ok(content.cards.length >= 150, 'карточек меньше 150');
  for (const c of content.cards) {
    ok(c.options && c.options.length >= 2, c.id + ': меньше двух вариантов');
    // карточка с контекстами (конец смены, счёт…) — лучший ответ свой в каждом варианте
    if (c.variants) for (const v of c.variants) ok(Object.values(v.verdicts || {}).includes('best'), `${c.id}/${v.key}: нет лучшего ответа`);
    else ok(c.options.some(o => o.verdict === 'best'), c.id + ': нет лучшего ответа');
  }
});
t('крайние — ЛН / ПН (не ЛП / ПП)', () => {
  const txt = JSON.stringify(content);
  ok(!/\b(ЛП|ПП)\b/.test(txt), 'встречается ЛП или ПП');
});
t('игроки на площадке', () => {
  for (const c of content.cards) for (const e of [...(c.us || []), ...(c.them || [])]) {
    ok(Math.abs(e.x) <= 15.2 && e.y >= -0.2 && e.y <= 60.2, `${c.id}/${e.id} вне площадки`);
  }
});
t('действия в карточках — из допустимого списка', () => {
  const A = ['ready', 'carry', 'receive', 'pass', 'shot', 'block'];
  for (const c of content.cards) for (const e of [...(c.us || []), ...(c.them || [])]) if (e.action) ok(A.includes(e.action), `${c.id}/${e.id}: ${e.action}`);
});

console.log(`unit: ${pass} ok, ${fail} failed`);
if (fail) process.exit(1);
