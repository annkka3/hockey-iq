/* «Реакция»: память на позиции, слежение, предсказание, вбрасывание, блиц-решения.
   Всё, что можно, строится на тех же кадрах карточек и том же рендере — игрок видит знакомый лёд. */
import { h, icon, toast } from '../ui.js';
import { Scene } from '../engine/render.js';
import { tween, wait, cancelAll, ease } from '../engine/anim.js';
import { lib, keysOf, trainCards } from '../content.js';
import { state, startSession, logItem, finishSession, setProfile } from '../core/state.js';
import { buildQueue } from '../engine/srs.js';
import { play } from './play.js';
import { Pov } from '../engine/pov.js';
import { viewWindow, RINKS } from '../engine/rink.js';
import { fx } from '../core/fx.js';

/* Часы тренажёров: идут только пока вкладка видна — после возврата ничего не перескакивает,
   а время выбора не включает минуты, проведённые в другом приложении. Движение по кадрам — с шагом ≤ 50 мс. */
const clock = (() => {
  if (typeof document === 'undefined') return () => performance.now();
  let paused = 0, hidAt = document.hidden ? performance.now() : 0;
  document.addEventListener('visibilitychange', () => {
    const n = performance.now();
    if (document.hidden) hidAt = n; else if (hidAt) { paused += n - hidAt; hidAt = 0; }
  });
  return () => { const n = performance.now(); return n - paused - (hidAt ? n - hidAt : 0); };
})();
if (typeof window !== 'undefined') window.__hkDrillClock = clock;
const MAX_DT = 0.05;
/* Шаг кадра в секундах по часам тренажёров, не больше 50 мс. */
const stepper = () => { let last = clock(); return () => { const n = clock(), dt = Math.min(MAX_DT, Math.max(0, (n - last) / 1000)); last = n; return dt; }; };

/* «Авто»: время показа подстраивается под точность, а не под номер раунда.
   Короче — после 3 верных из 4 подряд, длиннее — после двух промахов подряд. Уровень хранится по каждому тренажёру. */
const AUTO_F = [1.45, 1.2, 1, 0.85, 0.72, 0.6, 0.5];
const AUTO_START = 2;
const autoState = id => ((state.profile.expoAuto || {})[id]) || { lvl: AUTO_START, h: [] };
const autoF = id => AUTO_F[Math.max(0, Math.min(AUTO_F.length - 1, autoState(id).lvl))];
/* Время показа, с: в «Авто» — base × уровень этого тренажёра, иначе выбранное вручную. */
const exposure = (id, base, min = 0.6) => (expo() === 'auto' ? Math.max(min, +(base * autoF(id)).toFixed(2)) : expo());
function autoUpdate(id, ok) {
  if (expo() !== 'auto') return 0;
  const all = { ...(state.profile.expoAuto || {}) }, cur = autoState(id);
  let { lvl } = cur, hist = [...cur.h, ok ? 1 : 0].slice(-4), ch = 0;
  if (hist.length >= 4 && hist.reduce((a, b) => a + b, 0) >= 3 && lvl < AUTO_F.length - 1) { lvl++; hist = []; ch = 1; }
  else if (hist.length >= 2 && !hist[hist.length - 1] && !hist[hist.length - 2] && lvl > 0) { lvl--; hist = []; ch = -1; }
  all[id] = { lvl, h: hist };
  setProfile({ expoAuto: all });
  return ch;
}

const DRILLS = [
  { id: 'shoulder', group: 'ice', name: 'Плечевой осмотр', line: 'Ты видишь лёд своими глазами. Пара секунд, чтобы оглянуться через плечо, — потом скажи, кто открыт.', rounds: 6 },
  { id: 'mates', group: 'ice', name: 'Где партнёры', line: 'Кадр матча. Потом партнёры исчезают — покажи, где стоял нужный.', rounds: 8 },
  { id: 'pressure', group: 'ice', name: 'Откуда давят', line: 'Шайба идёт к тебе. Пойми, откуда летит соперник, — до приёма.', rounds: 8 },
  { id: 'open', group: 'ice', name: 'Кто откроется', line: 'Партнёры двигаются. Заметь, кто ушёл от опеки, — раньше, чем он получит шайбу.', rounds: 8 },
  { id: 'danger', group: 'ice', name: 'Самый опасный', line: 'Своя зона. Найди соперника, который опаснее всех, — быстро.', rounds: 8 },
  { id: 'scan', name: 'Открытый игрок', line: 'Кадр на время показа. Потом скажи, кто из партнёров был свободнее всех.', rounds: 8 },
  { id: 'memory', name: 'Память', line: 'Кадр на пару секунд. Потом найди его среди похожих.', rounds: 8 },
  { id: 'track', name: 'Слежение', line: 'Запомни три шайбы и держи их взглядом, пока все двигаются.', rounds: 6 },
  { id: 'predict', name: 'Предсказание', line: 'Игрок едет и пропадает. Покажи, где он будет через секунду.', rounds: 8 },
  { id: 'faceoff', name: 'Вбрасывание', line: 'Жми, как только шайба упала. Раньше — нарушение.', rounds: 6 },
  { id: 'blitz', name: 'Блиц', line: 'Ситуации без подводки, на решение 4 секунды.', rounds: 10 },
];

export function render(view, rerender) {
  view.append(h('div.h1', 'Реакция'), h('p.lead', 'Смотри. Запоминай. Предугадывай. По 1–2 минуты, лучше перед тренировкой.'));
  const ex = expo();
  const t = h('div.toggle', { style: { '--n': 5 } }, [['auto', 'Авто'], [1, '1 с'], [2, '2 с'], [3, '3 с'], [5, '5 с']].map(([v, l]) => h('button', { class: ex === v ? 'on' : '', onclick: () => { setProfile({ expo: v }); rerender(); } }, l)));
  view.append(h('div.expo', h('span', 'Время показа'), h('div.grow', t)));
  let group = null;
  for (const d of DRILLS) {
    const g = d.group || 'base';
    if (g !== group) { group = g; view.append(h('div.h2', g === 'ice' ? 'Хоккейное внимание' : 'Базовые')); }
    const best = bestOf(d.id);
    view.append(h('div.panel.deck', { onclick: () => start(d, rerender) },
      h('div.ico', icon(d.id === 'faceoff' ? 'faceoff' : d.id === 'blitz' ? 'bolt' : 'react')),
      h('div.grow', h('div.nm', d.name), h('div.ln', d.line)),
      h('div.cnt', best)));
  }
}

function bestOf(id) {
  const ss = state.sessions.filter(s => s.module === 'react:' + id && s.items.length);
  if (!ss.length) return '';
  if (id === 'faceoff') {
    const t = ss.flatMap(s => s.items.filter(i => i.verdict === 'best').map(i => i.timeMs));
    return t.length ? `лучшее ${Math.min(...t)} мс` : '';
  }
  return `рекорд ${Math.max(...ss.map(s => s.items.filter(i => i.verdict === 'best').length))}`;
}

/* Открыть тренажёр напрямую (связка из разбора ситуации). */
export function openDrill(id, rerender = () => {}) {
  const d = DRILLS.find(x => x.id === id);
  if (d) start(d, rerender);
}

function start(d, rerender) {
  if (d.id === 'blitz') {
    const keys = buildQueue(trainCards().filter(c => c.question.kind === 'choice').flatMap(keysOf), state.progress, { size: 10, maxNew: 10 });
    play(keys, { module: 'react:blitz', timer: 4, onDone: rerender });
    return;
  }
  const root = h('div.play.drill'), inner = h('div.play-in');
  root.appendChild(inner); document.body.appendChild(root); document.body.style.overflow = 'hidden';
  const session = startSession('react:' + d.id);
  let ended = false, round = 0;
  const marks = [];
  const close = () => { cancelAll(); live.on = false; if (!ended) { ended = true; finishSession(session); } root.remove(); document.body.style.overflow = ''; rerender(); };
  const live = { on: true };
  const top = () => h('div.play-top', h('button.x', { onclick: close }, icon('close')),
    h('div.dots', Array.from({ length: d.rounds }, (_, k) => h('i', { class: k < marks.length ? marks[k] : k === marks.length ? 'now' : '' }))),
    h('div.drill-phase', { 'aria-live': 'polite' }));
  /* Внимание по каждому раунду: фальстарты (касание до вопроса), время осмотра (до первого касания после вопроса,
     в «Плечевом осмотре» — до первого взгляда через плечо), время выбора (от вопроса до ответа). */
  const at = { phase: 'idle', allow: null, falseStarts: 0, t0: 0, askAt: 0, firstAt: 0, glances: 0, firstGlance: 0, warned: 0 };
  inner.addEventListener('pointerdown', e => {
    if (e.target.closest('.play-top')) return;
    const now = clock();
    if (at.phase === 'expose') {
      if (at.allow && e.target.closest(at.allow)) return;
      at.falseStarts++; fx('false');
      if (now - at.warned > 1500) { at.warned = now; toast('Рано — сначала смотри'); }
    } else if (at.phase === 'ask' && !at.firstAt) at.firstAt = now;
  }, true);
  // видимое состояние раунда: show — смотри, answer — отвечай, feedback — разбор (чип в шапке и стили)
  const phase = p => { inner.dataset.phase = p; };
  const expose = (allow = null) => { at.phase = 'expose'; at.allow = allow; at.t0 = clock(); phase('show'); fx('start'); };
  const ask = () => { at.phase = 'ask'; at.askAt = clock(); at.firstAt = 0; phase('answer'); };
  const glance = () => { at.glances++; if (!at.firstGlance) at.firstGlance = clock(); };
  const log = (ok, extra = {}) => {
    const now = clock();
    const choiceMs = at.askAt ? Math.round(now - at.askAt) : null;
    const scanMs = d.id === 'shoulder' ? (at.firstGlance ? Math.round(at.firstGlance - at.t0) : null)
      : at.askAt && at.firstAt ? Math.round(at.firstAt - at.askAt) : choiceMs;
    const fs = at.falseStarts + (extra.foul ? 1 : 0);
    at.phase = 'done'; phase('feedback');
    marks.push(ok ? 'best' : 'bad');
    fx(ok ? 'best' : 'bad');
    const expoS = expo() === 'auto' ? +autoF(d.id).toFixed(2) : expo();
    logItem(session, { drill: d.id, verdict: ok ? 'best' : 'bad', timeMs: choiceMs ?? 0, av: 1, choiceMs, scanMs, falseStarts: fs, expoLevel: expoS, ...(d.id === 'shoulder' ? { glances: at.glances } : {}), ...extra });
    const ch = autoUpdate(d.id, ok);
    if (ch) toast(ch > 0 ? 'Три из четырёх верно — показ станет короче' : 'Два промаха подряд — показ станет длиннее');
  };
  const next = () => { round++; if (round >= d.rounds) finish(); else run(); };
  const ctx = { inner, top, log, next, live, round: () => round, expose, ask, glance, id: d.id, show: (base, min) => exposure(d.id, base, min), autoF: () => autoF(d.id) };

  function finish() {
    if (!ended) { ended = true; finishSession(session); }
    const good = marks.filter(m => m === 'best').length;
    const fo = d.id === 'faceoff' ? session.items.filter(i => i.verdict === 'best').map(i => i.timeMs) : [];
    inner.innerHTML = '';
    inner.append(h('div.play-top', h('button.x', { onclick: close }, icon('close'))),
      h('div.final', h('div.q-meta', d.name),
        h('div.big', fo.length ? `${Math.round(fo.reduce((a, b) => a + b, 0) / fo.length)}` : `${good}/${d.rounds}`),
        h('div.muted', fo.length ? `мс в среднем · лучшее ${Math.min(...fo)} мс` : 'верно'),
        attnLine(session.items),
        expo() === 'auto' && !['faceoff', 'danger'].includes(d.id) ? h('p.muted.small.drill-expo', `Время показа в «Авто»: ×${autoF(d.id).toFixed(2).replace('.', ',')} от базового. Короче — после 3 верных из 4, длиннее — после двух промахов подряд.`) : null,
        h('div.row', { style: { marginTop: '28px' } }, h('button.btn.grow', { onclick: () => { close(); start(d, rerender); } }, 'Ещё раз'), h('button.btn.primary.grow', { onclick: close }, 'Готово'))));
  }
  const run = () => {
    Object.assign(at, { phase: 'idle', allow: null, falseStarts: 0, t0: clock(), askAt: 0, firstAt: 0, glances: 0, firstGlance: 0 });
    inner.dataset.phase = 'show';
    return ({ scan, memory, track, predict, faceoff, shoulder, mates, pressure, open, danger })[d.id](ctx);
  };
  run();
}

const pick = a => a[Math.floor(Math.random() * a.length)];

/* ---------- Статистика внимания ---------- */
const med = a => { if (!a.length) return null; const b = [...a].sort((x, y) => x - y), m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
const plural = (n, one, few, many) => { const m = n % 100, k = n % 10; return m > 10 && m < 20 ? many : k === 1 ? one : k >= 2 && k <= 4 ? few : many; };
const sec = ms => (ms / 1000).toFixed(1).replace('.', ',') + ' с';
/* Итог одной серии — строкой под результатом. */
function attnLine(items) {
  const it = items.filter(i => i.av);
  if (!it.length) return null;
  const ch = med(it.map(i => i.choiceMs).filter(x => x > 0)), fs = it.reduce((a, i) => a + (i.falseStarts || 0), 0);
  const gl = it.filter(i => i.glances != null);
  const parts = [];
  if (ch) parts.push(`выбор ${sec(ch)}`);
  if (gl.length) parts.push(`оглядывался в ${gl.filter(i => i.glances > 0).length} из ${gl.length}`);
  parts.push(fs ? `фальстартов ${fs}` : 'без фальстартов');
  return h('div.attn-line', parts.join(' · '));
}
/* Сводка по всем тренажёрам «Реакции»: медианы времени выбора и осмотра, доля оглядываний, фальстарты,
   динамика по последним сериям (медиана выбора на серию). */
export function attentionStats(sessions) {
  const ss = sessions.filter(s => s.module && s.module.startsWith('react:') && s.module !== 'react:blitz' && (s.items || []).some(i => i.av));
  const items = ss.flatMap(s => s.items.filter(i => i.av));
  if (!items.length) return null;
  const choice = items.filter(i => i.drill !== 'faceoff').map(i => i.choiceMs).filter(x => x > 0);
  const scanI = items.filter(i => i.drill !== 'faceoff' && i.drill !== 'shoulder').map(i => i.scanMs).filter(x => x > 0);
  const sh = items.filter(i => i.drill === 'shoulder');
  const fs = items.reduce((a, i) => a + (i.falseStarts || 0), 0);
  const per = ss.slice(-10).map(s => { const it = s.items.filter(i => i.av && i.drill !== 'faceoff'); return { ch: med(it.map(i => i.choiceMs).filter(x => x > 0)), fs: it.reduce((a, i) => a + (i.falseStarts || 0), 0) + s.items.filter(i => i.av && i.drill === 'faceoff' && i.foul).length }; });
  const half = Math.floor(per.length / 2), early = med(per.slice(0, half).map(p => p.ch).filter(Boolean)), late = med(per.slice(half).map(p => p.ch).filter(Boolean));
  return {
    n: items.length, sessions: ss.length,
    choiceMs: med(choice), scanMs: med(scanI),
    shoulder: sh.length ? { n: sh.length, looked: sh.filter(i => i.glances > 0).length, firstMs: med(sh.map(i => i.scanMs).filter(x => x > 0)) } : null,
    falseStarts: fs, falseRate: fs / items.length,
    trend: per, delta: early && late && per.length >= 4 ? late - early : null,
  };
}
/* Панель «Внимание» для экранов игрока и родителя. */
export function attentionPanel(sessions) {
  const a = attentionStats(sessions);
  if (!a) return null;
  const max = Math.max(1, ...a.trend.map(p => p.ch || 0));
  return h('div.panel', { style: { marginTop: '12px' } },
    h('div.row', h('div.grow', h('b', 'Внимание'), h('div.muted.small', `Тренажёры «Реакции»: ${a.n} ${plural(a.n, 'попытка', 'попытки', 'попыток')} в ${a.sessions} ${plural(a.sessions, 'серии', 'сериях', 'сериях')}`))),
    h('div.attn-kv',
      h('div', h('b', a.choiceMs ? sec(a.choiceMs) : '—'), h('span', 'время выбора')),
      h('div', h('b', a.scanMs ? sec(a.scanMs) : '—'), h('span', 'осмотр до касания')),
      h('div', h('b', String(a.falseStarts)), h('span', `фальстартов · ${Math.round(a.falseRate * 100)}%`))),
    h('div.attn-trend', a.trend.map(p => h('i', { class: p.fs ? 'fs' : '', title: p.ch ? sec(p.ch) : '', style: { height: Math.max(3, Math.round((p.ch || 0) / max * 44)) + 'px' } }))),
    h('div.attn-note', [
      'Столбики — время выбора по последним сериям (красный — были фальстарты).',
      a.delta != null ? (a.delta < -150 ? ` Решает быстрее на ${sec(-a.delta)}.` : a.delta > 150 ? ` Стал думать дольше на ${sec(a.delta)} — проверьте точность.` : ' Темп ровный.') : '',
      a.shoulder ? ` Плечевой осмотр: оглядывается в ${a.shoulder.looked} из ${a.shoulder.n}${a.shoulder.firstMs ? `, первый взгляд через ${sec(a.shoulder.firstMs)}` : ''}.` : '',
    ].join('')));
}
export const expo = () => state.profile.expo ?? 'auto';

/* ---------- Открытый игрок: кто из партнёров свободнее всех ---------- */
function freeness(f, foes) { return Math.min(...foes.map(o => Math.hypot(o.x - f.x, o.y - f.y))); }
/* Шайба у «Я»: где он стоит в «Открытом игроке» — ниже всех партнёров по центру (пас вперёд). */
const scanMe = friends => ({ x: 0, y: Math.max(5, Math.min(...friends.map(f => f.y)) - 9) });
/* Линия паса от шайбы к партнёру перекрыта, если соперник ближе 1,3 м к отрезку (на 10–95 % пути). */
function laneBlocked(from, f, foes) {
  const vx = f.x - from.x, vy = f.y - from.y, L = vx * vx + vy * vy || 1;
  return foes.some(o => { const t = ((o.x - from.x) * vx + (o.y - from.y) * vy) / L; if (t < 0.1 || t > 0.95) return false; return Math.hypot(o.x - (from.x + vx * t), o.y - (from.y + vy * t)) < 1.3; });
}
/* Свободен = далеко от опеки И линия паса к нему открыта: перекрытый партнёр не свободен, как бы далеко ни был опекун. */
const scanScore = (f, foes, me) => (laneBlocked(me, f, foes) ? 0 : freeness(f, foes));

function genScan(r) {
  // три партнёра, соперники опекают двоих плотно, третий свободен с запасом
  for (let tries = 0; tries < 200; tries++) {
    const friends = ['А', 'Б', 'В'].map(label => ({ label, x: rnd(-12, 12), y: rnd(8, 52) }));
    if (friends.some((a, i) => friends.some((b, j) => i < j && Math.hypot(a.x - b.x, a.y - b.y) < 9))) continue;
    const ans = Math.floor(Math.random() * 3);
    const tight = r < 3 ? [1.6, 2.6] : [2.2, 3.4];
    const foes = [];
    friends.forEach((f, i) => {
      if (i === ans) return;
      const a = Math.random() * 7, d = rnd(...tight);
      foes.push({ x: Math.max(-13.5, Math.min(13.5, f.x + Math.cos(a) * d)), y: Math.max(3, Math.min(57, f.y + Math.sin(a) * d)) });
    });
    const free = friends[ans];
    const far = r < 3 ? 7 : 5;
    const a = Math.random() * 7;
    foes.push({ x: Math.max(-13.5, Math.min(13.5, free.x + Math.cos(a) * far)), y: Math.max(3, Math.min(57, free.y + Math.sin(a) * far)) });
    if (r >= 4) foes.push({ x: rnd(-12, 12), y: rnd(8, 52) });
    const me = scanMe(friends), fr = friends.map(f => scanScore(f, foes, me));
    const best = fr.indexOf(Math.max(...fr));
    const sorted = [...fr].sort((x, y) => y - x);
    if (best === ans && sorted[0] - sorted[1] > (r < 3 ? 2.5 : 1.5)) return { friends, foes, answer: ans };
  }
  return lib.scans[0];
}

async function scan(c) {
  const r = c.round();
  const pat = r < 2 && lib.scans.length ? lib.scans[(Math.random() * lib.scans.length) | 0] : genScan(r);
  const me = scanMe(pat.friends);
  const fr0 = pat.friends.map(x => scanScore(x, pat.foes, me));
  pat.answer = fr0.indexOf(Math.max(...fr0));
  const show = c.show(2.6, 0.8);
  const card = { title: 'Открытый игрок', view: 'full', question: { kind: 'choice' }, options: [],
    us: [{ id: 'C', role: 'C', me: true, x: me.x, y: me.y }, ...pat.friends.map((f, i) => ({ id: 'f' + i, role: 'LW', label: f.label, x: f.x, y: f.y }))],
    them: pat.foes.map((f, i) => ({ id: 'e' + i, role: 'F', x: f.x, y: f.y })), puck: { x: me.x + 0.5, y: me.y + 0.6 } };
  c.inner.innerHTML = '';
  const title = h('div.q', 'Шайба у тебя. Кто из партнёров свободнее всех — и опека далеко, и линия паса открыта?');
  c.inner.append(c.top(), h('div.q-meta', 'Открытый игрок'), title);
  const wrap = h('div.rink-wrap'); c.inner.append(wrap);
  const sc = new Scene(wrap, card, { anim: false });
  const bar = h('div.meter', { style: { marginTop: '12px' } }, h('i', { style: { width: '100%' } }));
  c.inner.append(bar);
  c.expose();
  await tween(show * 1000, k => { bar.firstChild.style.width = (100 - k * 100) + '%'; }, t => t);
  if (!c.live.on) return;
  bar.remove();
  sc.svg.style.opacity = 0.06;
  c.ask();
  title.textContent = 'Картинка исчезла. Где был свободный партнёр?';
  const box = h('div.opts');
  pat.friends.forEach((f, i) => box.append(h('button.opt', { 'data-k': f.label, onclick: () => {
    box.classList.add('locked');
    const ok = i === pat.answer;
    box.children[i].classList.add(ok ? 'v-best' : 'v-bad');
    box.children[pat.answer].classList.add('v-best');
    sc.svg.style.opacity = 1;
    const ds = pat.friends.map(x => freeness(x, pat.foes)), bl = pat.friends.map(x => laneBlocked(me, x, pat.foes));
    // линии паса: зелёная — открыта, красная — соперник в линии
    const NS = 'http://www.w3.org/2000/svg', a0 = sc.pt(me);
    pat.friends.forEach((x, k) => { const b = sc.pt(x), ln = document.createElementNS(NS, 'line');
      ln.setAttribute('x1', a0.x); ln.setAttribute('y1', a0.y); ln.setAttribute('x2', b.x); ln.setAttribute('y2', b.y);
      ln.setAttribute('class', 'scan-lane ' + (bl[k] ? 'blocked' : 'open') + (k === pat.answer ? ' best' : '')); sc.lArrows.append(ln); });
    c.log(ok, { exposure: show });
    c.inner.append(h('p.explain', `${pat.friends.map((x, k) => `${x.label}: опека ${ds[k].toFixed(1)} м, линия паса ${bl[k] ? 'перекрыта' : 'открыта'}`).join('; ')}. Свободнее всех ${pat.friends[pat.answer].label}: опекун дальше всех и пас к нему проходит.`),
      h('button.btn.primary.block', { style: { marginTop: '14px' }, onclick: c.next }, 'Дальше'));
  } }, 'Игрок ' + f.label)));
  c.inner.append(box);
}
const rnd = (a, b) => a + Math.random() * (b - a);
const clone = o => JSON.parse(JSON.stringify(o));

/* ---------- Память: кадр карточки → найди его среди четырёх ---------- */
async function memory(c) {
  const r = c.round();
  const card = clone(pick(trainCards())); // контрольные ситуации не показываем нигде, кроме среза
  for (const e of [...(card.us || []), ...(card.them || [])]) delete e.from;
  if (card.puck) delete card.puck.from;
  const show = c.show(2.6, 0.8);
  c.inner.innerHTML = '';
  c.inner.append(c.top(), h('div.q-meta', 'Память'), h('div.q', 'Запомни расстановку'));
  const wrap = h('div.rink-wrap'); c.inner.append(wrap);
  const sc = new Scene(wrap, card, { anim: false });
  const bar = h('div.meter', { style: { marginTop: '12px' } }, h('i', { style: { width: '100%' } }));
  c.inner.append(bar);
  c.expose();
  await tween(show * 1000, k => { bar.firstChild.style.width = (100 - k * 100) + '%'; }, t => t);
  sc.destroy(); wrap.remove(); bar.remove();
  // варианты: оригинал и три с одним сдвинутым игроком
  const shift = r < 3 ? 6 : r < 6 ? 4.5 : 3.2;
  const variants = [card];
  let guard = 0;
  while (variants.length < 4 && guard++ < 80) {
    const v = clone(card);
    const all = [...v.us, ...v.them].filter(e => e.role !== 'G');
    const e = all[Math.floor(Math.random() * all.length)];
    const { y0, y1 } = viewWindow(card.view || 'full', RINKS.iihf);
    // сдвиг должен остаться в видимой части площадки и не прятаться под другим игроком — иначе варианты не различить
    let moved = false;
    for (let t = 0; t < 24 && !moved; t++) {
      const a = Math.random() * Math.PI * 2, nx = e.x + Math.cos(a) * shift, ny = e.y + Math.sin(a) * shift;
      if (Math.abs(nx) > 13 || ny < y0 + 1.5 || ny > y1 - 1.5) continue;
      if (all.some(o => o !== e && Math.hypot(o.x - nx, o.y - ny) < 2)) continue;
      e.x = nx; e.y = ny; moved = true;
    }
    if (moved) variants.push(v);
  }
  if (variants.length < 3) return memory(c);
  variants.sort(() => Math.random() - 0.5);
  c.inner.querySelector('.q').textContent = 'Какой кадр ты видел?';
  const grid = h('div.mem-grid');
  c.inner.append(grid);
  c.ask();
  variants.forEach(v => {
    const cell = h('button.mem-cell');
    grid.append(cell);
    new Scene(cell, v, { anim: false });
    cell.onclick = () => {
      if (grid.dataset.done) return;
      grid.dataset.done = 1;
      const ok = v === card;
      cell.classList.add(ok ? 'ok' : 'no');
      grid.querySelectorAll('.mem-cell')[variants.indexOf(card)].classList.add('ok');
      c.log(ok, { exposure: show });
      c.inner.append(h('button.btn.primary.block', { style: { marginTop: '14px' }, onclick: c.next }, 'Дальше'));
    };
  });
}

/* ---------- Слежение: 3 из 8 шайб ---------- */
async function track(c) {
  const r = c.round();
  const n = 7 + Math.min(3, Math.floor(r / 2)), targets = 3;
  const speed = 0.16 + 0.035 * Math.max(0, (1 / c.autoF() - 1) * 6 + 2); // доля поля в секунду: в «Авто» растёт с точностью, а не с номером раунда
  c.inner.innerHTML = '';
  const title = h('div.q', 'Запомни подсвеченные шайбы');
  c.inner.append(c.top(), h('div.q-meta', 'Слежение'), title);
  const cv = h('canvas.track-cv'); c.inner.append(h('div.rink-wrap', cv));
  const W = cv.clientWidth || 340, H = W * 1.05, dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = W * dpr; cv.height = H * dpr; cv.style.height = H + 'px';
  const g = cv.getContext('2d'); g.scale(dpr, dpr);
  const R = 11;
  const pucks = Array.from({ length: n }, (_, i) => {
    const a = Math.random() * Math.PI * 2;
    return { x: rnd(R * 2, W - R * 2), y: rnd(R * 2, H - R * 2), vx: Math.cos(a), vy: Math.sin(a), t: i < targets };
  });
  for (let i = 0; i < pucks.length; i++) for (let j = 0; j < i; j++) if (Math.hypot(pucks[i].x - pucks[j].x, pucks[i].y - pucks[j].y) < R * 3) { pucks[i].x = rnd(R * 2, W - R * 2); pucks[i].y = rnd(R * 2, H - R * 2); j = -1; }
  let mode = 'show', picked = new Set();
  const draw = () => {
    g.clearRect(0, 0, W, H);
    g.fillStyle = '#EEF6FB'; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(226,40,62,.5)'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, H / 2); g.lineTo(W, H / 2); g.stroke();
    g.strokeStyle = 'rgba(29,95,209,.5)'; g.beginPath(); g.arc(W / 2, H / 2, W * 0.15, 0, 7); g.stroke();
    for (const p of pucks) {
      const hi = (mode === 'show' && p.t) || picked.has(p) || (mode === 'result' && p.t);
      if (hi) { g.fillStyle = mode === 'result' ? (p.t ? 'rgba(46,229,157,.45)' : 'rgba(255,77,106,.45)') : 'rgba(0,184,240,.45)'; g.beginPath(); g.arc(p.x, p.y, R * 1.9, 0, 7); g.fill(); }
      if (mode === 'result' && picked.has(p) && !p.t) { g.fillStyle = 'rgba(255,77,106,.5)'; g.beginPath(); g.arc(p.x, p.y, R * 1.9, 0, 7); g.fill(); }
      g.fillStyle = '#05090F'; g.beginPath(); g.ellipse(p.x, p.y, R, R * 0.8, 0, 0, 7); g.fill();
    }
  };
  draw();
  c.expose('.track-cv');
  await wait(1800);
  if (!c.live.on) return;
  c.expose();
  mode = 'move'; title.textContent = 'Следи…';
  const v = speed * W;
  const dtOf = stepper();
  await tween(6000, (k) => {
    const dt = dtOf(); // реальное время кадра (≤ 50 мс): одинаково на 60 и 120 Гц, после паузы не прыгает
    for (const p of pucks) {
      if (Math.random() < 0.02) { const a = Math.atan2(p.vy, p.vx) + rnd(-0.8, 0.8); p.vx = Math.cos(a); p.vy = Math.sin(a); }
      p.x += p.vx * v * dt; p.y += p.vy * v * dt;
      if (p.x < R || p.x > W - R) { p.vx *= -1; p.x = Math.max(R, Math.min(W - R, p.x)); }
      if (p.y < R || p.y > H - R) { p.vy *= -1; p.y = Math.max(R, Math.min(H - R, p.y)); }
    }
    draw();
  }, t => t);
  if (!c.live.on) return;
  mode = 'pick'; title.textContent = `Нажми на ${targets} шайбы`;
  draw(); c.ask();
  cv.onclick = ev => {
    if (mode !== 'pick') return;
    const rect = cv.getBoundingClientRect(), x = ev.clientX - rect.left, y = ev.clientY - rect.top;
    let best = null, bd = 1e9;
    for (const p of pucks) { const d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = p; } }
    if (!best || bd > R * 3) return;
    fx('tap');
    if (picked.has(best)) picked.delete(best); else picked.add(best);
    draw();
    if (picked.size === targets) {
      mode = 'result'; draw();
      const hits = [...picked].filter(p => p.t).length;
      c.log(hits === targets, { hits, n, level: r });
      title.textContent = hits === targets ? 'Все три — точно!' : `Угадано ${hits} из ${targets}`;
      c.inner.append(h('button.btn.primary.block', { style: { marginTop: '14px' }, onclick: c.next }, 'Дальше'));
    }
  };
}

/* ---------- Предсказание: где игрок будет через секунду ---------- */
async function predict(c) {
  const r = c.round();
  const v0 = rnd(4.5, 8.5); // м/с — средний темп катания
  const ang = rnd(-Math.PI, Math.PI);
  const p1 = { x: rnd(-8, 8), y: rnd(15, 45) };
  const curve = r >= 4 ? rnd(-0.5, 0.5) : 0; // рад/с — поворот на дуге
  // торможение: с 3-го раунда игрок может сбрасывать скорость (скольжение или торможение «плугом»)
  const brake = r < 2 ? 0 : pick([0, 0.35, 0.7, 1.2]) * (r >= 5 ? 1.2 : 1); // 1/с — скорость ∝ e^(−k·t)
  const DT = 0.01, path = [{ x: p1.x, y: p1.y, v: v0 }];
  const at = t => {
    const n = Math.round(t / DT);
    while (path.length <= n) {
      const k = path.length - 1, q = path[k], tt = k * DT, v = v0 * Math.exp(-brake * tt), a = ang + curve * tt;
      path.push({ x: q.x + Math.cos(a) * v * DT, y: q.y + Math.sin(a) * v * DT, v });
    }
    return path[n];
  };
  // вся траектория — показ и точка ответа через секунду после него — должна остаться на льду
  const showS = expo() === 'auto' ? exposure('predict', 1.2, 0.6) : Math.max(0.8, expo() * 0.6);
  for (let t = 0; t <= showS + 1.001; t += 0.1) { const q = at(t); if (Math.abs(q.x) > 13 || q.y < 3 || q.y > 57) return predict(c); }
  const card = { title: 'Предсказание', view: 'full', us: [{ id: 'C', role: 'C', me: true, x: p1.x, y: p1.y }], them: [], question: { kind: 'tap' }, options: [] };
  c.inner.innerHTML = '';
  const title = h('div.q', 'Следи за игроком');
  c.inner.append(c.top(), h('div.q-meta', 'Предсказание'), title);
  const wrap = h('div.rink-wrap'); c.inner.append(wrap);
  const sc = new Scene(wrap, card, { anim: false });
  const show = showS;
  c.expose();
  await tween(show * 1000, k => sc.place('C', sc.pt(at(k * show))), t => t);
  if (!c.live.on) return;
  sc.ents.C.node.style.opacity = 0;
  const shown = at(show);
  const ghost = sc.pt(shown);
  title.textContent = 'Где он будет через 1 секунду?';
  const truth = at(show + 1);
  // где был бы игрок без торможения — для разбора: «по прямой со скоростью из кадра»
  const naive = { x: shown.x + Math.cos(ang + curve * show) * shown.v, y: shown.y + Math.sin(ang + curve * show) * shown.v };
  c.ask();
  sc.onTap(p => {
    sc.offTap();
    const err = Math.hypot(p.x - truth.x, p.y - truth.y);
    const ok = err < 2;
    sc.ents.C.node.style.opacity = 1;
    sc.place('C', sc.pt(truth));
    lineOn(sc, ghost, sc.pt(truth));
    if (brake > 0.2) lineOn(sc, ghost, sc.pt(naive), 'arrow a-ghost');
    c.log(ok, { err: +err.toFixed(1), speed: +v0.toFixed(1), brake: +brake.toFixed(2) });
    title.textContent = ok ? `Точно: ошибка ${err.toFixed(1)} м` : `Мимо на ${err.toFixed(1)} м`;
    const vEnd = at(show + 1).v;
    const slow = brake > 0.2
      ? ` Но он тормозил: скорость упала с ${(shown.v * 3.6).toFixed(0)} до ${(vEnd * 3.6).toFixed(0)} км/ч, и за секунду он проехал ${Math.hypot(truth.x - shown.x, truth.y - shown.y).toFixed(1)} м, а не ${shown.v.toFixed(1)} (пунктир — куда бы уехал без торможения). Смотри, наклонён ли корпус назад и развёрнуты ли коньки.`
      : '';
    c.inner.append(h('p.explain', `В конце показа он ехал ${(shown.v * 3.6).toFixed(0)} км/ч — это ${shown.v.toFixed(1)} м за секунду${curve ? ', да ещё по дуге' : ''}.${slow} Читать скорость и направление соперника — значит успевать раньше него.`),
      h('button.btn.primary.block', { style: { marginTop: '14px' }, onclick: () => { sc.destroy(); c.next(); } }, 'Дальше'));
  });
}

/* ---------- Вбрасывание: реакция на падение шайбы ---------- */
async function faceoff(c) {
  c.inner.innerHTML = '';
  const title = h('div.q', 'Жди, пока шайба упадёт');
  const pad = h('button.fo-pad', h('div.fo-ring'), h('div.fo-puck'), h('div.fo-hand'));
  c.inner.append(c.top(), h('div.q-meta', 'Вбрасывание'), title, pad, h('p.muted.small', 'Нажми на круг в момент, когда шайба коснулась льда.'));
  let state = 'wait', tDrop = 0;
  const delay = rnd(1000, 3200);
  c.expose('.fo-pad'); // фальстарт по кругу считается отдельно — как нарушение
  let cancelled = false;
  const timer = { clear: () => { cancelled = true; } };
  wait(delay).then(() => {
    if (cancelled || state !== 'wait' || !c.live.on) return;
    state = 'drop';
    pad.classList.add('drop');
    // отсчёт — с касания льда: конец анимации падения (transitionend), а не её начало
    const puck = pad.querySelector('.fo-puck');
    const landed = () => { if (!tDrop) { tDrop = clock(); c.ask(); } };
    puck.addEventListener('transitionend', landed, { once: true });
    setTimeout(landed, 160); // страховка, если событие не придёт
  });
  pad.onclick = () => {
    if (state === 'done') return;
    if (state === 'wait' || (state === 'drop' && !tDrop)) {
      timer.clear(); state = 'done';
      pad.classList.add('foul'); title.textContent = 'Рано! Судья выгнал с точки';
      c.log(false, { foul: true });
    } else {
      state = 'done';
      const ms = Math.round(clock() - tDrop);
      pad.classList.add('hit');
      title.textContent = `${ms} мс`;
      c.log(true, { timeMs: ms });
      c.inner.append(h('p.explain', ms < 250 ? 'Отличная реакция.' : ms < 350 ? 'Хорошо. Смотри на руку судьи, а не на соперника.' : 'Медленно — смотри только на шайбу в руке судьи.'));
    }
    c.inner.append(h('button.btn.primary.block', { style: { marginTop: '14px' }, onclick: c.next }, 'Дальше'));
  };
}

/* ================= Хоккейное внимание ================= */
const NSs = 'http://www.w3.org/2000/svg';
const lineOn = (sc, a, b, cls = 'arrow a-skate') => { const ln = document.createElementNS(NSs, 'line'); Object.entries({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: cls }).forEach(([k, v]) => ln.setAttribute(k, v)); sc.lArrows.appendChild(ln); };
const timerBar = async (c, sec) => {
  const bar = h('div.meter', { style: { marginTop: '12px' } }, h('i', { style: { width: '100%' } }));
  c.inner.append(bar);
  await tween(sec * 1000, k => { bar.firstChild.style.width = (100 - k * 100) + '%'; }, t => t);
  bar.remove();
};
const nextBtn = (c, extra) => c.inner.append(h('button.btn.primary.block', { style: { marginTop: '14px' }, onclick: () => { if (extra) extra(); c.next(); } }, 'Дальше'));

/* ---------- Плечевой осмотр: вид от первого лица, оглянись и найди открытого ---------- */
async function shoulder(c) {
  const r = c.round();
  const me = { x: rnd(-4, 4), y: rnd(22, 30) };
  // три партнёра: один впереди, двое по сторонам/сзади — без поворота головы всех не увидеть
  const slots = [{ a: rnd(-0.5, 0.5), d: rnd(9, 13) }, { a: rnd(-2.5, -1.7), d: rnd(7, 10) }, { a: rnd(1.7, 2.5), d: rnd(7, 10) }];
  const labels = ['А', 'Б', 'В'];
  const friends = slots.map((s, i) => ({ label: labels[i], x: Math.max(-13, Math.min(13, me.x + Math.sin(s.a) * s.d)), y: Math.max(4, Math.min(56, me.y + Math.cos(s.a) * s.d)) }));
  const ans = r < 2 ? 1 + (Math.random() < 0.5 ? 0 : 1) : Math.floor(Math.random() * 3); // сначала открытый — за плечом
  const foes = [];
  friends.forEach((f, i) => {
    const a = Math.random() * 7, d = i === ans ? rnd(6, 8) : rnd(1.5, 2.4);
    foes.push({ x: Math.max(-13.5, Math.min(13.5, f.x + Math.cos(a) * d)), y: Math.max(3, Math.min(57, f.y + Math.sin(a) * d)) });
  });
  // свободен — далеко от соперников и с открытой линией паса от «Я» (соперник не стоит на ней)
  const laneGap = (f, o) => { const vx = f.x - me.x, vy = f.y - me.y, L = vx * vx + vy * vy || 1; const t = Math.max(0, Math.min(1, ((o.x - me.x) * vx + (o.y - me.y) * vy) / L)); return Math.hypot(o.x - (me.x + vx * t), o.y - (me.y + vy * t)); };
  const free = friends.map(f => Math.min(...foes.map(o => Math.min(Math.hypot(o.x - f.x, o.y - f.y), laneGap(f, o) * 1.5))));
  let answer = free.indexOf(Math.max(...free));
  const card = { title: 'Осмотр', view: 'full', question: { kind: 'choice' }, options: [],
    us: [{ id: 'C', role: 'C', me: true, ...me }, ...friends.map((f, i) => ({ id: 'f' + i, role: 'LW', label: f.label, x: f.x, y: f.y }))],
    them: foes.map((f, i) => ({ id: 'e' + i, role: 'F', x: f.x, y: f.y })), puck: { x: me.x + 0.6, y: me.y + 0.6 } };
  c.inner.innerHTML = '';
  const title = h('div.q', 'Осмотрись: где свободный партнёр?');
  c.inner.append(c.top(), h('div.q-meta', 'Плечевой осмотр'), title, h('p.muted.small', 'Смотришь вперёд. Тяни картинку пальцем или жми «через плечо».'));
  const wrap = h('div.rink-wrap.pov-only'); c.inner.append(wrap);
  const sc = new Scene(wrap, card, { anim: false });
  let lastG = 0;
  const pov = new Pov(wrap, sc, { onTurn: () => { const n = clock(); if (n - lastG > 800) c.glance(); lastG = n; } }); // взгляд = поворот головы; серия кадров одного поворота — один взгляд
  pov.heading = 0;
  // все едут: каждый партнёр со своим опекуном — одной скоростью, так что «свободный» остаётся свободным,
  // но картинка за плечом через секунду уже другая
  const drift = friends.map(() => { const a = Math.random() * 7, v = rnd(0.8, 2.2); return { vx: Math.cos(a) * v, vy: Math.sin(a) * v }; });
  const P0 = { f: friends.map(f => ({ ...f })), e: foes.map(o => ({ ...o })) }, dtOf = stepper();
  let t = 0;
  const moveAll = () => {
    if (!pov.live) return;
    t += dtOf();
    friends.forEach((f, i) => {
      const nx = Math.max(-13, Math.min(13, P0.f[i].x + drift[i].vx * t)), ny = Math.max(4, Math.min(56, P0.f[i].y + drift[i].vy * t));
      const dx = nx - P0.f[i].x, dy = ny - P0.f[i].y;
      f.x = nx; f.y = ny; foes[i].x = P0.e[i].x + dx; foes[i].y = P0.e[i].y + dy;
      sc.place('f' + i, sc.pt(f)); sc.place('e' + i, sc.pt(foes[i]));
    });
    requestAnimationFrame(moveAll);
  };
  requestAnimationFrame(moveAll);
  const seen = new Set();
  const watch = setInterval(() => (pov.seen || []).forEach(id => seen.add(id)), 50);
  const bar = h('div.pov-bar',
    h('button.btn.small', { onclick: () => pov.shoulder(-1) }, '↶ Через левое плечо'),
    h('button.btn.small', { onclick: () => pov.shoulder(1) }, 'Через правое ↷'));
  c.inner.append(bar);
  c.expose('.pov-cv, .pov-bar');
  await timerBar(c, c.show(3.6, 1.6) + 0.8);
  if (!c.live.on) { clearInterval(watch); pov.destroy(); return; } // закрыли во время показа — таймер и цикл не оставляем
  clearInterval(watch); pov.destroy(); bar.remove();
  { const fr = friends.map(f => Math.min(...foes.map(o => Math.min(Math.hypot(o.x - f.x, o.y - f.y), laneGap(f, o) * 1.5)))); answer = fr.indexOf(Math.max(...fr)); }
  sc.svg.style.opacity = 0.05; wrap.classList.remove('pov-only');
  title.textContent = 'Кто был свободен?';
  const box = h('div.opts');
  c.ask();
  friends.forEach((f, i) => box.append(h('button.opt', { 'data-k': f.label, onclick: () => {
    box.classList.add('locked');
    const ok = i === answer;
    box.children[i].classList.add(ok ? 'v-best' : 'v-bad'); box.children[answer].classList.add('v-best');
    sc.svg.style.opacity = 1;
    const looked = seen.has('f' + answer);
    c.log(ok, { looked });
    c.inner.append(h('p.small', { style: { margin: '10px 0 0', color: looked ? 'var(--good)' : 'var(--gold)' } },
      looked ? `Ты посмотрел туда, где был ${friends[answer].label}.` : `Ты так и не посмотрел туда, где был ${friends[answer].label}${ok ? ' — угадал, а не увидел' : ''}.`));
    c.inner.append(h('p.explain', ok ? 'Увидел. Осмотр до приёма шайбы — и ты знаешь, куда отдать, ещё не получив её.'
      : `Свободен был ${friends[answer].label}${slots[answer].a ** 2 > 1 ? ' — за плечом. Его не видно, если не оглянуться' : ''}. Перед приёмом — быстрый взгляд через оба плеча.`));
    nextBtn(c, () => sc.destroy());
  } }, 'Игрок ' + f.label)));
  c.inner.append(box);
}

/* ---------- Где партнёры: расстановка → партнёры исчезают → покажи нужного ---------- */
const ROLE_NAME = { LW: 'ЛН', RW: 'ПН', LD: 'ЛЗ', RD: 'ПЗ' };
async function mates(c) {
  const r = c.round();
  const pool = trainCards().filter(x => (x.us || []).filter(e => ROLE_NAME[e.role]).length >= 3);
  const card = clone(pick(pool));
  for (const e of [...(card.us || []), ...(card.them || [])]) delete e.from;
  if (card.puck) delete card.puck.from;
  const target = pick(card.us.filter(e => ROLE_NAME[e.role]));
  const { y0, y1 } = viewWindow(card.view || 'full', RINKS.iihf);
  // партнёры катятся и после того, как исчезли: спрашиваем, где он СЕЙЧАС. Скорость 2–5 м/с, плавно гаснет.
  const K = 0.5;
  const moving = card.us.filter(e => !e.me && e.role !== 'G').map(e => {
    const v = r < 2 ? rnd(1.5, 2.5) : rnd(2.5, 5);
    for (let k = 0; k < 20; k++) {
      const a = Math.random() * Math.PI * 2, far = v / K;
      const ex = e.x + Math.cos(a) * far, ey = e.y + Math.sin(a) * far;
      if (Math.abs(ex) < 13 && ey > y0 + 1.5 && ey < y1 - 1.5) return { e, x0: e.x, y0: e.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v };
    }
    return { e, x0: e.x, y0: e.y, vx: 0, vy: 0 };
  });
  const posAt = (m, t) => { const f = (1 - Math.exp(-K * t)) / K; return { x: m.x0 + m.vx * f, y: m.y0 + m.vy * f }; };
  c.inner.innerHTML = '';
  const title = h('div.q', 'Запомни, где твои партнёры и куда они едут');
  c.inner.append(c.top(), h('div.q-meta', 'Где партнёры'), title);
  const wrap = h('div.rink-wrap'); c.inner.append(wrap);
  const sc = new Scene(wrap, card, { anim: false });
  const dtOf = stepper();
  let T = 0, run = true;
  const tNow = () => T;
  const step = () => { if (!run || !c.live.on) return; T += dtOf(); for (const m of moving) { const q = posAt(m, T); sc.place(m.e.id, sc.pt(q)); } requestAnimationFrame(step); };
  requestAnimationFrame(step);
  c.expose();
  await timerBar(c, c.show(2.6, 0.9));
  if (!c.live.on) { run = false; return; }
  for (const e of card.us) if (!e.me && e.role !== 'G') sc.ents[e.id].node.style.opacity = 0;
  const tm = moving.find(m => m.e === target);
  title.textContent = `Где ${ROLE_NAME[target.role]} сейчас? Нажми на лёд`;
  c.inner.append(h('p.muted.small', 'Они не остановились, когда пропали.'));
  c.ask();
  sc.onTap(p => {
    sc.offTap();
    run = false;
    const t = tNow(), now = posAt(tm, t), was = posAt(tm, Math.max(0, t - 0.0001));
    const err = Math.hypot(p.x - now.x, p.y - now.y);
    const tol = r < 3 ? 4 : r < 6 ? 3.4 : 2.8, ok = err < tol;
    for (const m of moving) sc.place(m.e.id, sc.pt(posAt(m, t)));
    for (const e of card.us) sc.ents[e.id].node.style.opacity = 1;
    lineOn(sc, sc.pt({ x: tm.x0, y: tm.y0 }), sc.pt(now), 'arrow a-skate');
    lineOn(sc, p.screen, sc.pt(now), 'arrow a-pass');
    const gone = Math.hypot(now.x - tm.x0, now.y - tm.y0);
    c.log(ok, { err: +err.toFixed(1), moved: +gone.toFixed(1) });
    void was;
    title.textContent = ok ? `Точно: ошибка ${err.toFixed(1)} м` : `Мимо на ${err.toFixed(1)} м`;
    c.inner.append(h('p.explain', `Пока ты думал, ${ROLE_NAME[target.role]} уехал на ${gone.toFixed(1)} м. Центр держит в голове не где свои стояли, а куда они едут, — тогда пас уходит не глядя, туда, где партнёр будет.`));
    nextBtn(c, () => sc.destroy());
  });
}

/* ---------- Откуда давят: соперник летит к тебе до приёма шайбы ----------
   Направление читается относительно КОРПУСА, а не экрана: с 3-го раунда ты развёрнут куда угодно
   (к своим воротам, к борту, вполоборота), и «справа на экране» может оказаться «в спину».
   Ответы: спереди, слева, справа, в спину; с 4-го раунда ещё «за левым / за правым плечом». */
const DIRS = { front: 'Спереди', left: 'Слева', right: 'Справа', back: 'В спину', backL: 'За левым плечом', backR: 'За правым плечом' };
const REL = { front: 0, left: -Math.PI / 2, right: Math.PI / 2, back: Math.PI, backL: -Math.PI * 0.75, backR: Math.PI * 0.75 };
const DIR_TIP = {
  front: 'Давят спереди — защити шайбу корпусом и отдай назад или в сторону, к поддержке.',
  left: 'Давят слева — принимай шайбу справа от корпуса и уводи вправо, плечо к сопернику.',
  right: 'Давят справа — принимай шайбу слева от корпуса и уходи влево, закрывая её телом.',
  back: 'Давят в спину — не останавливайся: первым касанием в свободное место или отдай в касание.',
  backL: 'Давят из-за левого плеча — первым касанием уводи шайбу вправо-вперёд, корпус между ним и шайбой.',
  backR: 'Давят из-за правого плеча — первым касанием уводи шайбу влево-вперёд, закрываясь корпусом.',
};
const FACING = [[0, 'вверх по площадке, в атаку'], [Math.PI, 'к своим воротам'], [Math.PI / 2, 'к правому борту'], [-Math.PI / 2, 'к левому борту'],
  [Math.PI / 4, 'вверх, к правому борту'], [-Math.PI / 4, 'вверх, к левому борту'], [Math.PI * 0.75, 'к своим воротам и правому борту'], [-Math.PI * 0.75, 'к своим воротам и левому борту']];
const screenWord = a => { // где это на экране (атака вверх): для разбора «на экране — одно, относительно тебя — другое»
  const d = ((a % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI;
  return Math.abs(d) < Math.PI / 4 ? 'сверху' : Math.abs(d) > Math.PI * 0.75 ? 'снизу' : d > 0 ? 'справа' : 'слева';
};
async function pressure(c) {
  const r = c.round();
  const me = { x: rnd(-5, 5), y: rnd(18, 40) };
  // первые два раунда — лицом в атаку (знакомство), дальше корпус развёрнут как угодно
  const [H, faceTxt] = r < 2 ? FACING[0] : pick(FACING);
  const keys = r >= 3 ? ['front', 'left', 'right', 'back', 'backL', 'backR'] : ['front', 'left', 'right', 'back'];
  const dir = pick(keys);
  const wa = H + REL[dir] + rnd(-0.22, 0.22); // мировой угол прихода давления (0 — вверх, по часовой)
  const at = (a, d) => ({ x: Math.max(-13.5, Math.min(13.5, me.x + Math.sin(a) * d)), y: Math.max(3, Math.min(57, me.y + Math.cos(a) * d)) });
  const end = at(wa, rnd(3, 4)), start = at(wa, rnd(9, 11));
  const decoys = [at(wa + Math.PI + rnd(-0.6, 0.6), rnd(10, 13)), at(wa + pick([-1, 1]) * rnd(1.9, 2.4), rnd(11, 14))];
  // пас приходит из-за спины или сбоку — относительно корпуса
  const passer = at(H + pick([Math.PI * 0.7, -Math.PI * 0.7, Math.PI]) + rnd(-0.2, 0.2), rnd(10, 13));
  const card = { title: 'Давление', view: 'full', question: { kind: 'choice' }, options: [],
    us: [{ id: 'C', role: 'C', me: true, ...me, face: [Math.sin(H), Math.cos(H)] }, { id: 'LD', role: 'LD', ...passer }],
    them: [{ id: 'p', role: 'F', ...end, from: [start.x, start.y] }, ...decoys.map((d, i) => ({ id: 'd' + i, role: 'F', ...d, from: [d.x + rnd(-1, 1), d.y + rnd(-1, 1)] }))],
    puck: { x: me.x, y: me.y, from: [passer.x, passer.y] } };
  c.inner.innerHTML = '';
  const title = h('div.q', 'Шайба идёт к тебе. Смотри вокруг');
  c.inner.append(c.top(), h('div.q-meta', 'Откуда давят'), title,
    h('p.muted.small.drill-face', h('b', 'Ты развёрнут ' + faceTxt + '. '), 'Отвечай относительно своего корпуса (голубая стрелка), а не экрана.'));
  const wrap = h('div.rink-wrap'); c.inner.append(wrap);
  const sc = new Scene(wrap, card, { anim: true });
  // стрелка «куда смотрит корпус»
  { // поверх фишек: от кольца «Я» на 6 м вперёд, с наконечником
    const u = { x: Math.sin(H), y: Math.cos(H) }, w = { x: u.y, y: -u.x };
    const P = k => sc.pt({ x: me.x + u.x * k, y: me.y + u.y * k });
    const a0 = P(1.9), a1 = P(6.2), tip = P(7.3);
    const side = s2 => sc.pt({ x: me.x + u.x * 6.2 + w.x * s2, y: me.y + u.y * 6.2 + w.y * s2 });
    const g = document.createElementNS(NSs, 'g'); g.setAttribute('class', 'drill-facing-g');
    const ln = document.createElementNS(NSs, 'line'); Object.entries({ x1: a0.x, y1: a0.y, x2: a1.x, y2: a1.y, class: 'arrow drill-facing' }).forEach(([k, v]) => ln.setAttribute(k, v));
    const hd = document.createElementNS(NSs, 'path'); const l = side(0.9), r2 = side(-0.9);
    hd.setAttribute('d', `M${tip.x} ${tip.y} L${l.x} ${l.y} L${r2.x} ${r2.y} Z`); hd.setAttribute('class', 'drill-facing-head');
    g.append(ln, hd); sc.lFx.appendChild(g);
  }
  c.expose();
  sc.intro(); await wait(Math.round(c.show(1.5, 0.7) * 1000));
  if (!c.live.on) return;
  sc.svg.style.opacity = 0.05;
  title.textContent = 'Откуда давит соперник — относительно тебя?';
  const box = h('div.opts.drill-dirs' + (keys.length > 4 ? '.six' : ''));
  c.ask();
  for (const k of keys) box.append(h('button.opt', { onclick: e => {
    box.classList.add('locked');
    const ok = k === dir;
    e.currentTarget.classList.add(ok ? 'v-best' : 'v-bad');
    [...box.children][keys.indexOf(dir)].classList.add('v-best');
    sc.svg.style.opacity = 1;
    lineOn(sc, sc.pt(start), sc.pt(end), 'arrow a-shot');
    c.log(ok, { dir, facing: +H.toFixed(2) });
    const scr = screenWord(wa), same = { front: 'сверху', back: 'снизу', left: 'слева', right: 'справа' }[dir] === scr;
    c.inner.append(h('p.explain', (ok ? '' : `Давили: ${DIRS[dir].toLowerCase()}. `)
      + (r >= 2 && !same ? `На экране он ${scr}, но ты развёрнут ${faceTxt} — для тебя это «${DIRS[dir].toLowerCase()}». ` : '')
      + DIR_TIP[dir]));
    nextBtn(c, () => sc.destroy());
  } }, DIRS[k]));
  c.inner.append(box);
}

/* ---------- Кто откроется: партнёры едут, опекуны — кто за ними, кто нет; открыт тот, к кому есть чистая линия паса ---------- */
/* Расстояние от точки до отрезка a–b (м). */
const segGap = (a, b, o) => { const vx = b.x - a.x, vy = b.y - a.y, L = vx * vx + vy * vy || 1; const t = Math.max(0, Math.min(1, ((o.x - a.x) * vx + (o.y - a.y) * vy) / L)); return Math.hypot(o.x - (a.x + vx * t), o.y - (a.y + vy * t)); };
const LANE = 1.3; // ближе этого к линии паса соперник успевает перехватить
/* Насколько открыт партнёр: зазор опеки (до ближайшего соперника) и чистота линии паса от шайбы
   (соперник на линии — пас перехватят, даже если опекун далеко). */
function openness(f, carrier, foes) {
  const mark = Math.min(...foes.map(o => Math.hypot(o.x - f.x, o.y - f.y)));
  const lane = Math.min(...foes.map(o => segGap(carrier, f, o)));
  return { mark, lane, blocked: lane < LANE, score: lane < LANE ? Math.min(mark, lane) * 0.4 : Math.min(mark, 6) };
}
async function open(c) {
  const r = c.round();
  const labels = ['А', 'Б', 'В'];
  let me, friends, us, them, ans, trick, info;
  for (let k = 0; k < 300; k++) {
    me = { x: rnd(-6, 6), y: rnd(8, 14) };
    friends = labels.map(label => ({ label, x: rnd(-11, 11), y: rnd(me.y + 8, 52) }));
    if (friends.some((a, i) => friends.some((b, j) => i < j && Math.hypot(a.x - b.x, a.y - b.y) < 9))) continue;
    ans = Math.floor(Math.random() * 3);
    // с 3-го раунда — ловушка: второй партнёр тоже уходит от опеки, но на его линии паса стоит соперник
    trick = r >= 2 ? (ans + 1 + Math.floor(Math.random() * 2)) % 3 : -1;
    us = [{ id: 'C', role: 'C', me: true, ...me }]; them = [];
    const ends = [];
    friends.forEach((f, i) => {
      const a = Math.random() * 7, step = rnd(3.5, 5) * (r >= 4 ? 0.8 : 1);
      const to = { x: Math.max(-13, Math.min(13, f.x + Math.cos(a) * step)), y: Math.max(me.y + 6, Math.min(56, f.y + Math.sin(a) * step)) };
      const ma = Math.random() * 7, mark = { x: f.x + Math.cos(ma) * 1.6, y: f.y + Math.sin(ma) * 1.6 };
      us.push({ id: 'f' + i, role: 'LW', label: f.label, x: to.x, y: to.y, from: [f.x, f.y] });
      const escaped = i === ans || i === trick;
      const mEnd = escaped ? { x: mark.x + (to.x - f.x) * 0.15, y: mark.y + (to.y - f.y) * 0.15 } : { x: mark.x + (to.x - f.x), y: mark.y + (to.y - f.y) };
      them.push({ id: 'e' + i, role: 'F', ...mEnd, from: [mark.x, mark.y] });
      ends.push(to);
    });
    if (trick >= 0) { // соперник съезжает в линию паса к «ловушке»
      const t = ends[trick], q = rnd(0.45, 0.65), side = pick([-1, 1]) * rnd(0.2, 0.7);
      const lx = me.x + (t.x - me.x) * q, ly = me.y + (t.y - me.y) * q, L = Math.hypot(t.x - me.x, t.y - me.y) || 1;
      const bx = lx + (-(t.y - me.y) / L) * side, by = ly + ((t.x - me.x) / L) * side;
      them.push({ id: 'e3', role: 'F', x: bx, y: by, from: [bx + rnd(-3, 3), by + rnd(1, 3)] });
    }
    const foesEnd = them.map(o => ({ x: o.x, y: o.y }));
    info = ends.map(f => openness(f, me, foesEnd));
    const sc = info.map(x => x.score), best = sc.indexOf(Math.max(...sc)), srt = [...sc].sort((a, b) => b - a);
    if (best === ans && srt[0] - srt[1] > 1.2 && (trick < 0 || info[trick].blocked)) { friends.forEach((f, i) => Object.assign(f, ends[i])); break; }
  }
  const card = { title: 'Открывание', view: 'full', question: { kind: 'choice' }, options: [], us, them, puck: { x: me.x + 0.6, y: me.y + 0.6 } };
  c.inner.innerHTML = '';
  const title = h('div.q', 'Шайба у тебя. Следи за партнёрами');
  c.inner.append(c.top(), h('div.q-meta', 'Кто откроется'), title);
  const wrap = h('div.rink-wrap'); c.inner.append(wrap);
  const sc = new Scene(wrap, card, { anim: true });
  c.expose();
  await sc.intro();
  if (!c.live.on) return;
  await wait(Math.round(c.show(0.6, 0.15) * 1000));
  sc.svg.style.opacity = 0.05;
  title.textContent = 'Кому можно отдать прямо сейчас?';
  const box = h('div.opts');
  c.ask();
  friends.forEach((f, i) => box.append(h('button.opt', { 'data-k': f.label, onclick: () => {
    box.classList.add('locked');
    const ok = i === ans;
    box.children[i].classList.add(ok ? 'v-best' : 'v-bad'); box.children[ans].classList.add('v-best');
    sc.svg.style.opacity = 1;
    // линии паса от шайбы: зелёная — чистая, красная — на ней соперник
    friends.forEach((g, k) => lineOn(sc, sc.pt(me), sc.pt(g), info[k].blocked ? 'lane lane-bad' : k === ans ? 'lane lane-ok' : 'lane'));
    c.log(ok, { trick: trick >= 0 });
    const why = info.map((x, k) => `${friends[k].label}: опека ${x.mark.toFixed(1)} м${x.blocked ? ', линия паса перекрыта' : ''}`).join(' · ');
    c.inner.append(h('p.explain', (trick >= 0 && i === trick ? `${friends[trick].label} ушёл от опекуна, но на линии паса соперник — шайбу перехватят. ` : '')
      + `Открыт тот, кто ушёл от опеки И к кому чистая линия паса. ${why}.`));
    nextBtn(c, () => sc.destroy());
  } }, 'Игрок ' + f.label)));
  c.inner.append(box);
}

/* ---------- Самый опасный: своя зона, найди главную угрозу ----------
   Угроза складывается из факторов, каждый виден на льду:
   • близость и угол к воротам; • опека (до ближайшего нашего);
   • линия паса от шайбы — открыта или её перекрывает наш игрок;
   • куда развёрнут — к воротам/шайбе (готов бросать) или спиной;
   • скорость сближения с воротами (едет в слот или от него). У владельца шайбы опасность чуть ниже: забивают обычно те, кому отдают. */
const NET = { x: 0, y: 4 };
const DZ_LANE = 1.3;
function threatInfo(o, ours, puck) {
  const dn = Math.hypot(o.x - NET.x, o.y - NET.y);
  const ang = Math.abs(Math.atan2(o.x, o.y - NET.y)); // 0 — прямо перед воротами
  const free = Math.min(...ours.map(p => Math.hypot(p.x - o.x, p.y - o.y)));
  const hasPuck = Math.hypot(puck.x - o.x, puck.y - o.y) < 1.2;
  const lane = hasPuck ? Infinity : Math.min(...ours.map(p => segGap(puck, o, p)));
  const blocked = lane < DZ_LANE;
  // ориентация: косинус между «куда смотрит» и направлением на ворота (или на шайбу — кто ждёт паса)
  const toNet = { x: NET.x - o.x, y: NET.y - o.y }, toPuck = { x: puck.x - o.x, y: puck.y - o.y };
  const cosTo = v => (o.fx * v.x + o.fy * v.y) / (Math.hypot(v.x, v.y) || 1);
  const facing = Math.max(cosTo(toNet), hasPuck ? -1 : cosTo(toPuck));
  // сближение: на сколько м/с сокращается расстояние до ворот
  const closing = dn - Math.hypot(o.x + o.vx - NET.x, o.y + o.vy - NET.y);
  const f = {
    base: (12 / Math.max(3, dn)) * Math.max(0.2, Math.cos(ang)),
    mark: Math.min(1.6, free / 2.5),
    lane: blocked ? 0.55 : 1,
    face: facing > 0.3 ? 1.15 : facing < -0.3 ? 0.72 : 0.95,
    speed: 1 + 0.12 * Math.max(-3, Math.min(4, closing)),
    puck: hasPuck ? 0.75 : 1,
  };
  const score = f.base * f.mark * f.lane * f.face * f.speed * f.puck;
  return { score, dn, free, blocked, facing, closing, hasPuck };
}
const threat = (o, ours, puck) => threatInfo(o, ours, puck).score;
const threatWords = t => [
  `до ворот ${t.dn.toFixed(0)} м`,
  t.hasPuck ? 'с шайбой' : t.blocked ? 'линия паса перекрыта' : 'линия паса открыта',
  `опека ${t.free.toFixed(1)} м`,
  t.facing > 0.3 ? 'развёрнут к воротам' : t.facing < -0.3 ? 'спиной к воротам' : 'вполоборота',
  t.closing > 0.6 ? `едет к воротам ${t.closing.toFixed(1)} м/с` : t.closing < -0.6 ? 'уезжает от ворот' : 'на месте',
].join(', ');
async function danger(c) {
  const r = c.round();
  let them, ours, puck, ans, info;
  for (let k = 0; k < 400; k++) {
    const carrier = { x: pick([-1, 1]) * rnd(9, 12.5), y: rnd(6, 13) };
    const slot = { x: rnd(-3, 3), y: rnd(8, 13) };
    const point = { x: rnd(-8, 8), y: rnd(19, 22) };
    const wide = { x: -Math.sign(carrier.x) * rnd(8, 11), y: rnd(9, 16) };
    them = [carrier, slot, point, wide].map(o => {
      // скорость (м/с) и разворот: кто-то въезжает в слот, кто-то стоит, кто-то уезжает; смотрят на шайбу, на ворота или в сторону
      const go = Math.random(), toN = Math.atan2(NET.x - o.x, NET.y - o.y);
      const va = go < 0.45 ? toN + rnd(-0.4, 0.4) : go < 0.75 ? rnd(-Math.PI, Math.PI) : toN + Math.PI + rnd(-0.5, 0.5);
      const v = go < 0.45 ? rnd(1.5, 4) : go < 0.75 ? rnd(0, 0.6) : rnd(1, 2.5);
      const fa = Math.random() < 0.6 ? toN + rnd(-0.4, 0.4) : rnd(-Math.PI, Math.PI);
      return { ...o, vx: Math.sin(va) * v, vy: Math.cos(va) * v, fx: Math.sin(fa), fy: Math.cos(fa) };
    });
    them[0].vx = 0; them[0].vy = rnd(-0.5, 0.5);
    puck = { x: them[0].x - Math.sign(them[0].x) * 0.7, y: them[0].y + 0.5 };
    { const toP = Math.atan2(puck.x - them[0].x, puck.y - them[0].y); them[0].fx = Math.sin(toP); them[0].fy = Math.cos(toP); }
    const markSlot = Math.random() < 0.5;
    ours = [
      { x: them[0].x - Math.sign(them[0].x) * 1.4, y: them[0].y - 0.8 },
      markSlot ? { x: slot.x + rnd(-0.8, 0.8), y: slot.y - 1.2 } : { x: pick([-1, 1]) * rnd(2.2, 3.2), y: rnd(6.5, 8) },
      { x: point.x + rnd(-3, 3) * (r < 3 ? 1.5 : 1), y: point.y - rnd(2, 4) },
      markSlot ? { x: wide.x * 0.6, y: wide.y - 3 } : { x: wide.x + Math.sign(-wide.x) * rnd(4, 6), y: wide.y },
    ];
    info = them.map(o => threatInfo(o, ours, puck));
    const sc = info.map(x => x.score), order = [...sc].sort((a, b) => b - a);
    ans = sc.indexOf(order[0]);
    if (order[0] - order[1] > (r < 3 ? 0.9 : 0.5)) break;
  }
  const SHOW = 1.0; // с — сколько видно движение: позиции в стоп-кадре — через секунду после «from»
  const card = { title: 'Угроза', view: 'dz', question: { kind: 'tap' }, options: [],
    us: [{ id: 'C', role: 'C', me: true, x: ours[1].x, y: ours[1].y }, { id: 'LD', role: 'LD', ...ours[0] }, { id: 'RW', role: 'RW', ...ours[2] }, { id: 'RD', role: 'RD', ...ours[3] }, { id: 'G', role: 'G', x: 0, y: 4.9 }],
    them: them.map((o, i) => ({ id: 'e' + i, role: 'F', x: o.x, y: o.y, face: [o.fx, o.fy], from: [o.x - o.vx * SHOW, o.y - o.vy * SHOW] })), puck };
  c.inner.innerHTML = '';
  const title = h('div.q', 'Смотри, кто куда едет и куда развёрнут');
  c.inner.append(c.top(), h('div.q-meta', 'Самый опасный'), title);
  const wrap = h('div.rink-wrap'); c.inner.append(wrap);
  const sc = new Scene(wrap, card, { anim: true });
  c.expose();
  await sc.intro();
  if (!c.live.on) return;
  title.textContent = 'Нажми на самого опасного соперника';
  c.ask();
  const t0 = clock();
  sc.onTap(p => {
    let best = 0, bd = 1e9;
    them.forEach((o, i) => { const d = Math.hypot(o.x - p.x, o.y - p.y); if (d < bd) { bd = d; best = i; } });
    if (bd > 4) return;
    sc.offTap();
    const ok = best === ans, ms = Math.round(clock() - t0);
    sc.ents['e' + ans].node.classList.add('hot');
    if (!ok) sc.ents['e' + best].node.classList.add('picked-wrong');
    // линии паса от шайбы к каждому сопернику без шайбы: зелёная — открыта, красная — перекрыта нашим
    them.forEach((o, i) => { if (i) lineOn(sc, sc.pt(puck), sc.pt(o), info[i].blocked ? 'lane lane-bad' : i === ans ? 'lane lane-ok' : 'lane'); });
    c.log(ok, { timeMs: ms, slow: ms >= 6000 }); // правильность и время — отдельно
    title.textContent = ok ? `Верно · ${(ms / 1000).toFixed(1)} с${ms >= 6000 ? ' — верно, но долго' : ''}` : 'Не он';
    const name = i => (i === 0 ? 'с шайбой' : them[i].y < 14 && Math.abs(them[i].x) < 4 ? 'в слоте' : them[i].y > 17 ? 'у синей' : 'на дальнем фланге');
    c.inner.append(h('div.drill-factors',
      h('p', h('b', `Главная угроза — ${name(ans)}: `), threatWords(info[ans]) + '.'),
      ok ? null : h('p', h('b', `Ты выбрал — ${name(best)}: `), threatWords(info[best]) + '.'),
      h('p.muted.small', 'Опасен тот, кто близко и под углом, без опеки, к кому открыта линия паса, кто развёрнут к воротам и въезжает в слот. Шайба у борта не забивает — забивает тот, кому её отдадут.')));
    nextBtn(c, () => sc.destroy());
  });
}
