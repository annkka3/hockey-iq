/* «Реакция»: память на позиции, слежение, предсказание, вбрасывание, блиц-решения.
   Всё, что можно, строится на тех же кадрах карточек и том же рендере — игрок видит знакомый лёд. */
import { h, icon, toast } from '../ui.js';
import { Scene } from '../engine/render.js';
import { tween, wait, cancelAll, ease } from '../engine/anim.js';
import { lib, keysOf, trainCards } from '../content.js';
import { state, startSession, logItem, finishSession, setProfile } from '../core/state.js';
import { buildQueue } from '../engine/srs.js';
import { play } from './play.js';

const DRILLS = [
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
  for (const d of DRILLS) {
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

function start(d, rerender) {
  if (d.id === 'blitz') {
    const keys = buildQueue(trainCards().filter(c => c.question.kind === 'choice').flatMap(keysOf), state.progress, { size: 10, maxNew: 10 });
    play(keys, { module: 'react:blitz', timer: 4, onDone: rerender });
    return;
  }
  const root = h('div.play'), inner = h('div.play-in');
  root.appendChild(inner); document.body.appendChild(root); document.body.style.overflow = 'hidden';
  const session = startSession('react:' + d.id);
  let ended = false, round = 0;
  const marks = [];
  const close = () => { cancelAll(); live.on = false; if (!ended) { ended = true; finishSession(session); } root.remove(); document.body.style.overflow = ''; rerender(); };
  const live = { on: true };
  const top = () => h('div.play-top', h('button.x', { onclick: close }, icon('close')),
    h('div.dots', Array.from({ length: d.rounds }, (_, k) => h('i', { class: k < marks.length ? marks[k] : k === marks.length ? 'now' : '' }))));
  const log = (ok, extra = {}) => { marks.push(ok ? 'best' : 'bad'); logItem(session, { drill: d.id, verdict: ok ? 'best' : 'bad', timeMs: 0, ...extra }); };
  const next = () => { round++; if (round >= d.rounds) finish(); else run(); };
  const ctx = { inner, top, log, next, live, round: () => round };

  function finish() {
    if (!ended) { ended = true; finishSession(session); }
    const good = marks.filter(m => m === 'best').length;
    const fo = d.id === 'faceoff' ? session.items.filter(i => i.verdict === 'best').map(i => i.timeMs) : [];
    inner.innerHTML = '';
    inner.append(h('div.play-top', h('button.x', { onclick: close }, icon('close'))),
      h('div.final', h('div.q-meta', d.name),
        h('div.big', fo.length ? `${Math.round(fo.reduce((a, b) => a + b, 0) / fo.length)}` : `${good}/${d.rounds}`),
        h('div.muted', fo.length ? `мс в среднем · лучшее ${Math.min(...fo)} мс` : 'верно'),
        h('div.row', { style: { marginTop: '28px' } }, h('button.btn.grow', { onclick: () => { close(); start(d, rerender); } }, 'Ещё раз'), h('button.btn.primary.grow', { onclick: close }, 'Готово'))));
  }
  const run = () => ({ scan, memory, track, predict, faceoff })[d.id](ctx);
  run();
}

const pick = a => a[Math.floor(Math.random() * a.length)];
export const expo = () => state.profile.expo ?? 'auto';

/* ---------- Открытый игрок: кто из партнёров свободнее всех ---------- */
function freeness(f, foes) { return Math.min(...foes.map(o => Math.hypot(o.x - f.x, o.y - f.y))); }

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
    const fr = friends.map(f => freeness(f, foes));
    const best = fr.indexOf(Math.max(...fr));
    const sorted = [...fr].sort((x, y) => y - x);
    if (best === ans && sorted[0] - sorted[1] > (r < 3 ? 2.5 : 1.5)) return { friends, foes, answer: ans };
  }
  return lib.scans[0];
}

async function scan(c) {
  const r = c.round();
  const pat = r < 2 && lib.scans.length ? lib.scans[(Math.random() * lib.scans.length) | 0] : genScan(r);
  const fr0 = pat.friends.map(x => freeness(x, pat.foes));
  pat.answer = fr0.indexOf(Math.max(...fr0));
  const show = expo() === 'auto' ? Math.max(1.2, 3 - r * 0.2) : expo();
  const card = { title: 'Открытый игрок', view: 'full', question: { kind: 'choice' }, options: [],
    us: pat.friends.map((f, i) => ({ id: 'f' + i, role: 'LW', label: f.label, x: f.x, y: f.y })),
    them: pat.foes.map((f, i) => ({ id: 'e' + i, role: 'F', x: f.x, y: f.y })) };
  c.inner.innerHTML = '';
  const title = h('div.q', 'Кто из партнёров свободнее всех?');
  c.inner.append(c.top(), h('div.q-meta', 'Открытый игрок'), title);
  const wrap = h('div.rink-wrap'); c.inner.append(wrap);
  const sc = new Scene(wrap, card, { anim: false });
  const bar = h('div.meter', { style: { marginTop: '12px' } }, h('i', { style: { width: '100%' } }));
  c.inner.append(bar);
  await tween(show * 1000, k => { bar.firstChild.style.width = (100 - k * 100) + '%'; }, t => t);
  if (!c.live.on) return;
  bar.remove();
  sc.svg.style.opacity = 0.06;
  title.textContent = 'Картинка исчезла. Где был свободный партнёр?';
  const box = h('div.opts');
  const t0 = performance.now();
  pat.friends.forEach((f, i) => box.append(h('button.opt', { 'data-k': f.label, onclick: () => {
    box.classList.add('locked');
    const ok = i === pat.answer;
    box.children[i].classList.add(ok ? 'v-best' : 'v-bad');
    box.children[pat.answer].classList.add('v-best');
    sc.svg.style.opacity = 1;
    const ds = pat.friends.map(x => freeness(x, pat.foes));
    c.log(ok, { timeMs: Math.round(performance.now() - t0), exposure: show });
    c.inner.append(h('p.explain', `Ближайший соперник: ${pat.friends.map((x, k) => `${x.label} — ${ds[k].toFixed(1)} м`).join(', ')}. Свободнее всех ${pat.friends[pat.answer].label}: туда и пас, и открывание.`),
      h('button.btn.primary.block', { style: { marginTop: '14px' }, onclick: c.next }, 'Дальше'));
  } }, 'Игрок ' + f.label)));
  c.inner.append(box);
}
const rnd = (a, b) => a + Math.random() * (b - a);
const clone = o => JSON.parse(JSON.stringify(o));

/* ---------- Память: кадр карточки → найди его среди четырёх ---------- */
async function memory(c) {
  const r = c.round();
  const card = clone(pick(lib.cards));
  for (const e of [...(card.us || []), ...(card.them || [])]) delete e.from;
  if (card.puck) delete card.puck.from;
  const show = expo() === 'auto' ? Math.max(1.2, 3 - r * 0.25) : expo();
  c.inner.innerHTML = '';
  c.inner.append(c.top(), h('div.q-meta', 'Память'), h('div.q', 'Запомни расстановку'));
  const wrap = h('div.rink-wrap'); c.inner.append(wrap);
  const sc = new Scene(wrap, card, { anim: false });
  const bar = h('div.meter', { style: { marginTop: '12px' } }, h('i', { style: { width: '100%' } }));
  c.inner.append(bar);
  await tween(show * 1000, k => { bar.firstChild.style.width = (100 - k * 100) + '%'; }, t => t);
  sc.destroy(); wrap.remove(); bar.remove();
  // варианты: оригинал и три с одним сдвинутым игроком
  const shift = r < 3 ? 6 : r < 6 ? 4.5 : 3.2;
  const variants = [card];
  while (variants.length < 4) {
    const v = clone(card);
    const all = [...v.us, ...v.them].filter(e => e.role !== 'G');
    const e = all[Math.floor(Math.random() * all.length)];
    const a = Math.random() * Math.PI * 2;
    e.x = Math.max(-13, Math.min(13, e.x + Math.cos(a) * shift)); e.y = Math.max(2, Math.min(58, e.y + Math.sin(a) * shift));
    variants.push(v);
  }
  variants.sort(() => Math.random() - 0.5);
  c.inner.querySelector('.q').textContent = 'Какой кадр ты видел?';
  const grid = h('div.mem-grid');
  c.inner.append(grid);
  const t0 = performance.now();
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
      c.log(ok, { timeMs: Math.round(performance.now() - t0), exposure: show });
      c.inner.append(h('button.btn.primary.block', { style: { marginTop: '14px' }, onclick: c.next }, 'Дальше'));
    };
  });
}

/* ---------- Слежение: 3 из 8 шайб ---------- */
async function track(c) {
  const r = c.round();
  const n = 7 + Math.min(3, Math.floor(r / 2)), targets = 3;
  const speed = 0.16 + r * 0.035; // доля поля в секунду
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
  await wait(1800);
  if (!c.live.on) return;
  mode = 'move'; title.textContent = 'Следи…';
  const v = speed * W;
  await tween(6000, (k) => {
    const dt = 1 / 60;
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
  draw();
  cv.onclick = ev => {
    if (mode !== 'pick') return;
    const rect = cv.getBoundingClientRect(), x = ev.clientX - rect.left, y = ev.clientY - rect.top;
    let best = null, bd = 1e9;
    for (const p of pucks) { const d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = p; } }
    if (!best || bd > R * 3) return;
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
  const speed = rnd(4.5, 8.5); // м/с — средний темп катания
  const ang = rnd(-Math.PI, Math.PI);
  const p1 = { x: rnd(-8, 8), y: rnd(15, 45) };
  const curve = r >= 4 ? rnd(-0.5, 0.5) : 0; // рад/с — поворот на дуге
  const at = t => {
    if (!curve) return { x: p1.x + Math.cos(ang) * speed * t, y: p1.y + Math.sin(ang) * speed * t };
    const a = ang + curve * t, R0 = speed / curve;
    return { x: p1.x + R0 * (Math.sin(a) - Math.sin(ang)), y: p1.y - R0 * (Math.cos(a) - Math.cos(ang)) };
  };
  // начало подальше от борта, чтобы траектория осталась на льду
  const end = at(2.2);
  if (Math.abs(end.x) > 13 || end.y < 3 || end.y > 57) return predict(c);
  const card = { title: 'Предсказание', view: 'full', us: [{ id: 'C', role: 'C', me: true, x: p1.x, y: p1.y }], them: [], question: { kind: 'tap' }, options: [] };
  c.inner.innerHTML = '';
  const title = h('div.q', 'Следи за игроком');
  c.inner.append(c.top(), h('div.q-meta', 'Предсказание'), title);
  const wrap = h('div.rink-wrap'); c.inner.append(wrap);
  const sc = new Scene(wrap, card, { anim: false });
  const show = expo() === 'auto' ? 1.2 : Math.max(0.8, expo() * 0.6);
  await tween(show * 1000, k => sc.place('C', sc.pt(at(k * show))), t => t);
  if (!c.live.on) return;
  sc.ents.C.node.style.opacity = 0;
  const shown = at(show);
  const ghost = sc.pt(shown);
  title.textContent = 'Где он будет через 1 секунду?';
  const truth = at(show + 1);
  sc.onTap(p => {
    sc.offTap();
    const err = Math.hypot(p.x - truth.x, p.y - truth.y);
    const ok = err < 2;
    sc.ents.C.node.style.opacity = 1;
    sc.place('C', sc.pt(truth));
    const NS = 'http://www.w3.org/2000/svg';
    const ln = document.createElementNS(NS, 'line');
    const tp = sc.pt(truth);
    Object.entries({ x1: ghost.x, y1: ghost.y, x2: tp.x, y2: tp.y, class: 'arrow a-skate' }).forEach(([k, v]) => ln.setAttribute(k, v));
    sc.lArrows.appendChild(ln);
    c.log(ok, { err: +err.toFixed(1), speed: +speed.toFixed(1) });
    title.textContent = ok ? `Точно: ошибка ${err.toFixed(1)} м` : `Мимо на ${err.toFixed(1)} м`;
    c.inner.append(h('p.explain', `Он ехал ${(speed * 3.6).toFixed(0)} км/ч — это ${speed.toFixed(1)} м за секунду${curve ? ', да ещё по дуге' : ''}. Читать скорость и направление соперника — значит успевать раньше него.`),
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
  const timer = setTimeout(() => {
    if (state !== 'wait') return;
    state = 'drop'; tDrop = performance.now();
    pad.classList.add('drop');
  }, delay);
  pad.onclick = () => {
    if (state === 'done') return;
    if (state === 'wait') {
      clearTimeout(timer); state = 'done';
      pad.classList.add('foul'); title.textContent = 'Рано! Судья выгнал с точки';
      c.log(false, { foul: true });
    } else {
      state = 'done';
      const ms = Math.round(performance.now() - tDrop);
      pad.classList.add('hit');
      title.textContent = `${ms} мс`;
      c.log(true, { timeMs: ms });
      c.inner.append(h('p.explain', ms < 250 ? 'Отличная реакция.' : ms < 350 ? 'Хорошо. Смотри на руку судьи, а не на соперника.' : 'Медленно — смотри только на шайбу в руке судьи.'));
    }
    c.inner.append(h('button.btn.primary.block', { style: { marginTop: '14px' }, onclick: c.next }, 'Дальше'));
  };
}
