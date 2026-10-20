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
  const run = () => ({ scan, memory, track, predict, faceoff, shoulder, mates, pressure, open, danger })[d.id](ctx);
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
  const card = clone(pick(trainCards())); // контрольные ситуации не показываем нигде, кроме среза
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
  let last = performance.now();
  await tween(6000, (k) => {
    const nowT = performance.now(), dt = Math.min(0.05, (nowT - last) / 1000); last = nowT; // реальное время кадра: одинаково на 60 и 120 Гц
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
  // вся траектория — показ и точка ответа через секунду после него — должна остаться на льду
  const showS = expo() === 'auto' ? 1.2 : Math.max(0.8, expo() * 0.6);
  for (let t = 0; t <= showS + 1.001; t += 0.1) { const q = at(t); if (Math.abs(q.x) > 13 || q.y < 3 || q.y > 57) return predict(c); }
  const card = { title: 'Предсказание', view: 'full', us: [{ id: 'C', role: 'C', me: true, x: p1.x, y: p1.y }], them: [], question: { kind: 'tap' }, options: [] };
  c.inner.innerHTML = '';
  const title = h('div.q', 'Следи за игроком');
  c.inner.append(c.top(), h('div.q-meta', 'Предсказание'), title);
  const wrap = h('div.rink-wrap'); c.inner.append(wrap);
  const sc = new Scene(wrap, card, { anim: false });
  const show = showS;
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
    state = 'drop';
    pad.classList.add('drop');
    // отсчёт — с касания льда: конец анимации падения (transitionend), а не её начало
    const puck = pad.querySelector('.fo-puck');
    const landed = () => { if (!tDrop) tDrop = performance.now(); };
    puck.addEventListener('transitionend', landed, { once: true });
    setTimeout(landed, 160); // страховка, если событие не придёт
  }, delay);
  pad.onclick = () => {
    if (state === 'done') return;
    if (state === 'wait' || (state === 'drop' && !tDrop)) {
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

/* ================= Хоккейное внимание ================= */
const showTime = (r, base = 2.4) => (expo() === 'auto' ? Math.max(1.1, base - r * 0.15) : expo());
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
  const answer = free.indexOf(Math.max(...free));
  const card = { title: 'Осмотр', view: 'full', question: { kind: 'choice' }, options: [],
    us: [{ id: 'C', role: 'C', me: true, ...me }, ...friends.map((f, i) => ({ id: 'f' + i, role: 'LW', label: f.label, x: f.x, y: f.y }))],
    them: foes.map((f, i) => ({ id: 'e' + i, role: 'F', x: f.x, y: f.y })), puck: { x: me.x + 0.6, y: me.y + 0.6 } };
  c.inner.innerHTML = '';
  const title = h('div.q', 'Осмотрись: где свободный партнёр?');
  c.inner.append(c.top(), h('div.q-meta', 'Плечевой осмотр'), title, h('p.muted.small', 'Смотришь вперёд. Тяни картинку пальцем или жми «через плечо».'));
  const wrap = h('div.rink-wrap.pov-only'); c.inner.append(wrap);
  const sc = new Scene(wrap, card, { anim: false });
  const pov = new Pov(wrap, sc);
  pov.follow = false; pov.heading = 0;
  const seen = new Set();
  const watch = setInterval(() => (pov.seen || []).forEach(id => seen.add(id)), 50);
  const bar = h('div.pov-bar',
    h('button.btn.small', { onclick: () => pov.shoulder(-1) }, '↶ Через левое плечо'),
    h('button.btn.small', { onclick: () => pov.shoulder(1) }, 'Через правое ↷'));
  c.inner.append(bar);
  await timerBar(c, showTime(r, 3.6) + 0.8);
  if (!c.live.on) return;
  clearInterval(watch); pov.destroy(); bar.remove();
  sc.svg.style.opacity = 0.05; wrap.classList.remove('pov-only');
  title.textContent = 'Кто был свободен?';
  const box = h('div.opts'), t0 = performance.now();
  friends.forEach((f, i) => box.append(h('button.opt', { 'data-k': f.label, onclick: () => {
    box.classList.add('locked');
    const ok = i === answer;
    box.children[i].classList.add(ok ? 'v-best' : 'v-bad'); box.children[answer].classList.add('v-best');
    sc.svg.style.opacity = 1;
    const looked = seen.has('f' + answer);
    c.log(ok, { timeMs: Math.round(performance.now() - t0), looked });
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
  c.inner.innerHTML = '';
  const title = h('div.q', 'Запомни, где твои партнёры');
  c.inner.append(c.top(), h('div.q-meta', 'Где партнёры'), title);
  const wrap = h('div.rink-wrap'); c.inner.append(wrap);
  const sc = new Scene(wrap, card, { anim: false });
  await timerBar(c, showTime(r, 2.8));
  if (!c.live.on) return;
  for (const e of card.us) if (!e.me && e.role !== 'G') sc.ents[e.id].node.style.opacity = 0;
  title.textContent = `Где был ${ROLE_NAME[target.role]}? Нажми на лёд`;
  const t0 = performance.now();
  sc.onTap(p => {
    sc.offTap();
    const err = Math.hypot(p.x - target.x, p.y - target.y);
    const tol = r < 3 ? 4 : r < 6 ? 3.2 : 2.5, ok = err < tol;
    for (const e of card.us) sc.ents[e.id].node.style.opacity = 1;
    lineOn(sc, p.screen, sc.pt(target), 'arrow a-pass');
    c.log(ok, { err: +err.toFixed(1), timeMs: Math.round(performance.now() - t0) });
    title.textContent = ok ? `Точно: ошибка ${err.toFixed(1)} м` : `Мимо на ${err.toFixed(1)} м`;
    c.inner.append(h('p.explain', 'Центр держит в голове, где свои, — тогда пас уходит не глядя, а он сам успевает в поддержку.'));
    nextBtn(c, () => sc.destroy());
  });
}

/* ---------- Откуда давят: соперник летит к тебе до приёма шайбы ---------- */
const DIRS = { left: 'Слева', right: 'Справа', back: 'Сзади', front: 'Спереди' };
const DIR_TIP = {
  left: 'Давят слева — принимай шайбу справа от корпуса и уводи вправо, плечо к сопернику.',
  right: 'Давят справа — принимай шайбу слева от корпуса и уходи влево, закрывая её телом.',
  back: 'Давят сзади — не останавливайся: первым касанием в свободное место или отдай в касание.',
  front: 'Давят спереди — защити шайбу корпусом и отдай назад или в сторону, к поддержке.',
};
async function pressure(c) {
  const r = c.round();
  const me = { x: rnd(-6, 6), y: rnd(16, 42) };
  const dir = pick(Object.keys(DIRS));
  const base = { left: -Math.PI / 2, right: Math.PI / 2, back: Math.PI, front: 0 }[dir] + rnd(-0.45, 0.45);
  const at = (a, d) => ({ x: Math.max(-13.5, Math.min(13.5, me.x + Math.sin(a) * d)), y: Math.max(3, Math.min(57, me.y + Math.cos(a) * d)) });
  const end = at(base, rnd(3, 4)), start = at(base, rnd(9, 11));
  const decoys = [at(base + Math.PI + rnd(-0.9, 0.9), rnd(9, 12)), at(base + pick([-1, 1]) * rnd(1.6, 2.2), rnd(10, 13))];
  const passer = at(pick([Math.PI * 0.75, -Math.PI * 0.75, Math.PI]), rnd(10, 13));
  const card = { title: 'Давление', view: 'full', question: { kind: 'choice' }, options: [],
    us: [{ id: 'C', role: 'C', me: true, ...me }, { id: 'LD', role: 'LD', ...passer }],
    them: [{ id: 'p', role: 'F', ...end, from: [start.x, start.y] }, ...decoys.map((d, i) => ({ id: 'd' + i, role: 'F', ...d, from: [d.x + rnd(-1, 1), d.y + rnd(-1, 1)] }))],
    puck: { x: me.x, y: me.y, from: [passer.x, passer.y] } };
  c.inner.innerHTML = '';
  const title = h('div.q', 'Шайба идёт к тебе. Смотри вокруг');
  c.inner.append(c.top(), h('div.q-meta', 'Откуда давят'), title, h('p.muted.small', 'Ты смотришь вверх по площадке, в атаку.'));
  const wrap = h('div.rink-wrap'); c.inner.append(wrap);
  const sc = new Scene(wrap, card, { anim: true });
  const speedUp = Math.max(0.6, 1.2 - r * 0.08);
  sc.intro(); await wait(1500 * speedUp);
  if (!c.live.on) return;
  sc.svg.style.opacity = 0.05;
  title.textContent = 'Откуда давит соперник?';
  const box = h('div.opts'), t0 = performance.now();
  for (const k of ['left', 'right', 'back', 'front']) box.append(h('button.opt', { onclick: e => {
    box.classList.add('locked');
    const ok = k === dir;
    e.currentTarget.classList.add(ok ? 'v-best' : 'v-bad');
    [...box.children][['left', 'right', 'back', 'front'].indexOf(dir)].classList.add('v-best');
    sc.svg.style.opacity = 1;
    c.log(ok, { timeMs: Math.round(performance.now() - t0), dir });
    c.inner.append(h('p.explain', (ok ? '' : `Давили: ${DIRS[dir].toLowerCase()}. `) + DIR_TIP[dir]));
    nextBtn(c, () => sc.destroy());
  } }, DIRS[k]));
  c.inner.append(box);
}

/* ---------- Кто откроется: один партнёр уходит от опеки, двое — нет ---------- */
async function open(c) {
  const r = c.round();
  const labels = ['А', 'Б', 'В'];
  let friends;
  for (let k = 0; k < 100; k++) {
    friends = labels.map(label => ({ label, x: rnd(-11, 11), y: rnd(10, 50) }));
    if (!friends.some((a, i) => friends.some((b, j) => i < j && Math.hypot(a.x - b.x, a.y - b.y) < 10))) break;
  }
  const ans = Math.floor(Math.random() * 3);
  const us = [], them = [];
  friends.forEach((f, i) => {
    const a = Math.random() * 7, step = rnd(3.5, 5) * (r >= 4 ? 0.8 : 1);
    const to = { x: Math.max(-13, Math.min(13, f.x + Math.cos(a) * step)), y: Math.max(4, Math.min(56, f.y + Math.sin(a) * step)) };
    const ma = Math.random() * 7, mark = { x: f.x + Math.cos(ma) * 1.6, y: f.y + Math.sin(ma) * 1.6 };
    us.push({ id: 'f' + i, role: 'LW', label: f.label, x: to.x, y: to.y, from: [f.x, f.y] });
    if (i === ans) them.push({ id: 'e' + i, role: 'F', x: mark.x + (to.x - f.x) * 0.15, y: mark.y + (to.y - f.y) * 0.15, from: [mark.x, mark.y] });
    else them.push({ id: 'e' + i, role: 'F', x: mark.x + (to.x - f.x), y: mark.y + (to.y - f.y), from: [mark.x, mark.y] });
  });
  const card = { title: 'Открывание', view: 'full', question: { kind: 'choice' }, options: [], us, them };
  c.inner.innerHTML = '';
  const title = h('div.q', 'Следи за партнёрами');
  c.inner.append(c.top(), h('div.q-meta', 'Кто откроется'), title);
  const wrap = h('div.rink-wrap'); c.inner.append(wrap);
  const sc = new Scene(wrap, card, { anim: true });
  await sc.intro();
  if (!c.live.on) return;
  await wait(Math.max(150, 700 - r * 80));
  sc.svg.style.opacity = 0.05;
  title.textContent = 'Кто ушёл от опеки?';
  const box = h('div.opts'), t0 = performance.now();
  friends.forEach((f, i) => box.append(h('button.opt', { 'data-k': f.label, onclick: () => {
    box.classList.add('locked');
    const ok = i === ans;
    box.children[i].classList.add(ok ? 'v-best' : 'v-bad'); box.children[ans].classList.add('v-best');
    sc.svg.style.opacity = 1;
    c.log(ok, { timeMs: Math.round(performance.now() - t0) });
    c.inner.append(h('p.explain', 'Двоих соперник провожает, а один уехал в пустое место — его опекун остался на месте. Пас туда, куда партнёр едет, а не где он стоял.'));
    nextBtn(c, () => sc.destroy());
  } }, 'Игрок ' + f.label)));
  c.inner.append(box);
}

/* ---------- Самый опасный: своя зона, найди главную угрозу ---------- */
const NET = { x: 0, y: 4 };
function threat(o, ours, puck) {
  const dn = Math.hypot(o.x - NET.x, o.y - NET.y);
  const ang = Math.abs(Math.atan2(o.x, o.y - NET.y)); // 0 — прямо перед воротами
  const free = Math.min(...ours.map(p => Math.hypot(p.x - o.x, p.y - o.y)));
  const hasPuck = Math.hypot(puck.x - o.x, puck.y - o.y) < 1.2;
  return (12 / Math.max(3, dn)) * Math.max(0.2, Math.cos(ang)) * Math.min(1.6, free / 2.5) * (hasPuck ? 0.75 : 1);
}
async function danger(c) {
  const r = c.round();
  let them, ours, puck, ans;
  for (let k = 0; k < 300; k++) {
    const carrier = { x: pick([-1, 1]) * rnd(9, 12.5), y: rnd(6, 13) };
    const slot = { x: rnd(-3, 3), y: rnd(8, 12) };
    const point = { x: rnd(-8, 8), y: rnd(19, 22) };
    const wide = { x: -Math.sign(carrier.x) * rnd(8, 11), y: rnd(9, 16) };
    them = [carrier, slot, point, wide];
    puck = { x: carrier.x - Math.sign(carrier.x) * 0.7, y: carrier.y + 0.5 };
    // свои: кто-то у владельца, у дальнего, у синей; одного соперника иногда опекаем плотно
    const markSlot = Math.random() < 0.5;
    ours = [
      { x: carrier.x - Math.sign(carrier.x) * 1.4, y: carrier.y - 0.8 },
      markSlot ? { x: slot.x + rnd(-0.8, 0.8), y: slot.y - 1.2 } : { x: rnd(-2, 2), y: rnd(5, 6.5) },
      { x: point.x + rnd(-3, 3) * (r < 3 ? 1.5 : 1), y: point.y - rnd(2, 4) },
      markSlot ? { x: wide.x * 0.6, y: wide.y - 3 } : { x: wide.x + Math.sign(-wide.x) * rnd(4, 6), y: wide.y },
    ];
    const sc = them.map(o => threat(o, ours, puck));
    const order = [...sc].sort((a, b) => b - a);
    ans = sc.indexOf(order[0]);
    if (order[0] - order[1] > (r < 3 ? 0.9 : 0.5)) break;
  }
  const card = { title: 'Угроза', view: 'dz', question: { kind: 'tap' }, options: [],
    us: [{ id: 'C', role: 'C', me: true, x: ours[1].x, y: ours[1].y }, { id: 'LD', role: 'LD', ...ours[0] }, { id: 'RW', role: 'RW', ...ours[2] }, { id: 'RD', role: 'RD', ...ours[3] }, { id: 'G', role: 'G', x: 0, y: 4.9 }],
    them: them.map((o, i) => ({ id: 'e' + i, role: 'F', x: o.x, y: o.y })), puck };
  c.inner.innerHTML = '';
  const title = h('div.q', 'Нажми на самого опасного соперника');
  c.inner.append(c.top(), h('div.q-meta', 'Самый опасный'), title);
  const wrap = h('div.rink-wrap'); c.inner.append(wrap);
  const sc = new Scene(wrap, card, { anim: false });
  const t0 = performance.now();
  sc.onTap(p => {
    let best = 0, bd = 1e9;
    them.forEach((o, i) => { const d = Math.hypot(o.x - p.x, o.y - p.y); if (d < bd) { bd = d; best = i; } });
    if (bd > 4) return;
    sc.offTap();
    const ok = best === ans, ms = Math.round(performance.now() - t0);
    sc.ents['e' + ans].node.classList.add('hot');
    c.log(ok, { timeMs: ms, slow: ms >= 6000 }); // правильность и время — отдельно
    const o = them[ans], free = Math.min(...ours.map(q => Math.hypot(q.x - o.x, q.y - o.y)));
    title.textContent = ok ? `Верно · ${(ms / 1000).toFixed(1)} с${ms >= 6000 ? ' — верно, но долго' : ''}` : 'Не он';
    c.inner.append(h('p.explain', ans === 0 ? 'Опаснее всех тот, у кого шайба: он близко к воротам и под хорошим углом.'
      : `Главная угроза — соперник ${o.y < 13 && Math.abs(o.x) < 4 ? 'в слоте' : 'без опеки'}: до ближайшего нашего ${free.toFixed(1)} м, ворота рядом. Шайба у борта не забивает — забивает тот, кому её отдадут.`));
    nextBtn(c, () => sc.destroy());
  });
}
