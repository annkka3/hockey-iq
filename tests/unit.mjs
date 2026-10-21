/* Юнит-проверки чистых моделей (без браузера): клюшка, бросок, контент.
   Запуск: node tests/unit.mjs  (или npm test). Падает с кодом 1, если хоть одна проверка не прошла. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as ST from '../js/engine/stick.js';
import * as P from '../js/engine/shot.js';
import * as SRS from '../js/engine/srs.js';
import * as SC from '../js/engine/scoring.js';
import * as SIM from '../js/engine/sim.js';

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

/* ---------- интервальное повторение ---------- */
t('SRS: лучшее — ящик вверх, интервал растёт', () => {
  const day0 = new Date('2026-01-10T12:00:00').getTime();
  let r = SRS.review(undefined, 'best', day0);
  ok(r.box === 1 && r.due === SRS.addDays('2026-01-10', SRS.INTERVALS[1]), 'первый ящик');
  r = SRS.review(r, 'best', day0); r = SRS.review(r, 'best', day0);
  ok(r.box === 3 && r.due === SRS.addDays('2026-01-10', SRS.INTERVALS[3]), 'третий ящик');
  ok(SRS.isLearned(r), 'выучена с ящика 3');
});
t('SRS: ошибка — ящик 1 и срыв; «можно» держит', () => {
  let r = { box: 4, lapses: 0 };
  r = SRS.review(r, 'ok'); ok(r.box === 4, '«можно» не роняет');
  r = SRS.review(r, 'bad'); ok(r.box === 1 && r.lapses === 1, 'ошибка');
  ok(r.h2.endsWith('~x'), 'история');
});
t('SRS: застрявшая — 2 ошибки из 3 последних или 3 срыва', () => {
  ok(SRS.isStuck({ h2: '++x+x' }), 'две из трёх');
  ok(!SRS.isStuck({ h2: 'xx+++' }), 'старые ошибки не считаются');
  ok(SRS.isStuck({ h2: '+', lapses: 3 }), 'три срыва');
  ok(!SRS.isStuck(null));
});
t('SRS: очередь — просроченные, потом новые не больше maxNew', () => {
  const day = '2026-02-01', progress = { a: { due: '2026-01-20', box: 2 }, b: { due: '2026-01-31', box: 1 }, c: { due: '2026-03-01', box: 5 } };
  const q = SRS.buildQueue(['a', 'b', 'c', 'n1', 'n2', 'n3'], progress, { size: 4, maxNew: 1, day });
  ok(q[0] === 'a' && q[1] === 'b', 'просроченные первыми по сроку: ' + q);
  ok(q.includes('n1') && q.length === 4, 'добивка: ' + q);
});

/* ---------- очки, звания, метрики ---------- */
const mkS = (daysAgo, items, module = 'today') => { const d = new Date(Date.now() - daysAgo * 864e5); return { id: 's' + daysAgo + module, day: SRS.today(d), module, startedAt: d.getTime(), durationSec: 60, items }; };
t('очки: качество решения, «Предскажи» и «Почему»', () => {
  ok(SC.itemPoints({ verdict: 'best' }) === 10 && SC.itemPoints({ verdict: 'ok' }) === 5 && SC.itemPoints({ verdict: 'risky' }) === 3 && SC.itemPoints({ verdict: 'bad' }) === 1);
  ok(SC.itemPoints({ verdict: 'best', read: true, why: true }) === 15);
});
t('звания и серия', () => {
  ok(SC.rankOf(0).name === 'Новичок' && SC.rankOf(260).name === 'Запасной');
  near(SC.rankOf(175).frac, 0.5, 1e-9, 'доля до следующего');
  const five = Array.from({ length: 5 }, () => ({ verdict: 'best' }));
  const sum = SC.summarize([mkS(0, five), mkS(1, five), mkS(3, five)]);
  ok(sum.streak === 2 && sum.points === 150, `серия ${sum.streak}, очки ${sum.points}`);
});
t('readRate: срез не считается', () => {
  const r = SC.readRate([mkS(1, [{ read: true }, { read: false }]), mkS(1, [{ read: false }], 'test')]);
  ok(r.n === 2 && r.ok === 1);
});
t('чтение игры: недели и тренд', () => {
  const ss = [mkS(25, [{ read: false }, { read: false }, { read: false }, { read: true }]), mkS(20, [{ read: false }, { read: true }]),
    mkS(10, [{ read: true }, { read: true }, { read: true }]), mkS(2, [{ read: true }, { read: false, why: true }])];
  const r = SC.readingTrend(ss);
  ok(r.weeks.length === 6 && r.n === 11, 'всего прогнозов ' + r.n);
  ok(r.trend > 0, 'тренд вверх: ' + r.trend);
  ok(r.whyN === 1 && r.whyRate === 1);
});
t('уверенность: спешит / сомневается / уверенно', () => {
  const it = (ms, v) => ({ cardId: 'x', timeMs: ms, verdict: v });
  const rush = SC.confidence([mkS(1, [...Array(5)].map(() => it(1000, 'bad')).concat([...Array(5)].map(() => it(8000, 'best'))))]);
  ok(rush.label === 'Спешит', rush.label);
  const doubt = SC.confidence([mkS(1, [...Array(8)].map(() => it(9000, 'best')).concat([...Array(2)].map(() => it(1200, 'ok'))))]);
  ok(doubt.label === 'Знает, но сомневается', doubt.label);
  const sure = SC.confidence([mkS(1, [...Array(6)].map(() => it(1200, 'best')).concat([...Array(4)].map(() => it(7000, 'ok'))))]);
  ok(sure.label === 'Уверенно', sure.label);
  ok(SC.confidence([mkS(1, [it(1000, 'best')])]).label === null, 'мало данных — без вывода');
  ok(SC.confidence([mkS(1, [...Array(10)].map(() => it(1000, 'bad')), 'react:scan')]).n === 0, 'тренажёры не считаются');
});

/* ---------- живая сцена не знает вердикта ---------- */
t('sim: реакция не зависит от вердикта ответа', () => {
  let checked = 0;
  for (const c of content.cards) {
    if (!c.puck) continue;
    for (const o of c.options || []) {
      const lists = [c.read ? c.read.reveal || [] : [], o.moves || []];
      const a = JSON.stringify(SIM.respond(c, lists, 'best')), b = JSON.stringify(SIM.respond(c, lists, 'bad')), r = JSON.stringify(SIM.respond(c, lists, 'risky'));
      ok(a === b && b === r, `${c.id}/${o.id}: реакция зависит от вердикта`);
      checked++;
    }
  }
  ok(checked > 100, 'проверено мало вариантов: ' + checked);
});
t('sim: перестановка вердиктов в карточке не меняет сцену', () => {
  const c = content.cards.find(x => x.puck && (x.options || []).length >= 3);
  const perm = { ...c, options: c.options.map((o, i, a) => ({ ...o, verdict: a[(i + 1) % a.length].verdict })) };
  for (let i = 0; i < c.options.length; i++) {
    const L = o => [c.read ? c.read.reveal || [] : [], o.moves || []];
    ok(JSON.stringify(SIM.respond(c, L(c.options[i]))) === JSON.stringify(SIM.respond(perm, L(perm.options[i]))), 'вариант ' + i);
  }
});

console.log(`unit: ${pass} ok, ${fail} failed`);
if (fail) process.exit(1);
