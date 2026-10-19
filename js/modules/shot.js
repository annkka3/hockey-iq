/* «Бросок»: геометрия (интерактив) и игра свайпом с пятью режимами. Физика — engine/shot.js. */
import { h, icon, toast } from '../ui.js';
import { RINKS, boardsPath } from '../engine/rink.js';
import { drawRink } from '../engine/render.js';
import { tween, cancelAll, ease } from '../engine/anim.js';
import * as P from '../engine/shot.js';
import { state, startSession, logItem, finishSession, setProfile } from '../core/state.js';

const R = RINKS.iihf;
const NS = 'http://www.w3.org/2000/svg';
const sv = (tag, attrs = {}, parent) => { const n = document.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); if (parent) parent.appendChild(n); return n; };
const scr = p => ({ x: p.x, y: R.L - p.y });

let tab = 'geo';

export function render(view, rerender) {
  view.append(h('div.h1', 'Бросок'),
    h('div.toggle', { style: { '--n': 2, marginBottom: '14px' } },
      h('button', { class: tab === 'geo' ? 'on' : '', onclick: () => { tab = 'geo'; rerender(); } }, 'Геометрия'),
      h('button', { class: tab === 'game' ? 'on' : '', onclick: () => { tab = 'game'; rerender(); } }, 'Игра')));
  if (tab === 'geo') geometry(view); else gameMenu(view, rerender);
}

/* ---------------- Геометрия ---------------- */
const geo = { S: { x: -4, y: 47 }, G: null, auto: true, depth: 1.0, stance: 'butterfly', speed: 80, heat: false };

function geometry(view) {
  // экранные координаты: чужой торец сверху, видна зона атаки (24 м от борта)
  const svg = sv('svg', { viewBox: '-15.6 -0.6 31.2 25.2', class: 'rink-svg geo-svg' });
  drawRink(sv('g', { class: 'rink' }, svg), R, 'geo');
  const lHeat = sv('g', {}, svg), lCone = sv('g', {}, svg), lEnt = sv('g', {}, svg);
  const wrap = h('div.rink-wrap', svg);
  const face = sv('svg', { viewBox: '-1.35 -0.08 2.7 1.62', class: 'goal-face' });
  const out = h('div.geo-stats');
  const note = h('p.muted.small');

  const shooter = token(lEnt, 'me', 'Я');
  const goalie = token(lEnt, 'g', 'ВР');

  function update() {
    if (geo.auto || !geo.G) geo.G = P.goaliePos(geo.S, geo.depth);
    const S = geo.S, G = geo.G;
    place(shooter, S); place(goalie, G);
    lCone.innerHTML = '';
    const s = scr(S);
    const pl = scr({ x: -P.GOAL.half, y: P.GOAL.y }), pr = scr({ x: P.GOAL.half, y: P.GOAL.y });
    sv('path', { d: `M${s.x} ${s.y} L${pl.x} ${pl.y} L${pr.x} ${pr.y} Z`, class: 'cone' }, lCone);
    const sil = P.silhouette(S, G, P.STANCES[geo.stance]);
    // тень вратаря на льду: лучи к краям его силуэта на уровне щитков
    const us = sil.flatMap(p => p.pts.map(q => q.u)), uMin = Math.max(-P.GOAL.half, Math.min(...us)), uMax = Math.min(P.GOAL.half, Math.max(...us));
    if (uMax > uMin) {
      const a = scr({ x: uMin, y: P.GOAL.y }), b = scr({ x: uMax, y: P.GOAL.y });
      sv('path', { d: `M${s.x} ${s.y} L${a.x} ${a.y} L${b.x} ${b.y} Z`, class: 'cone-block' }, lCone);
    }
    const open = P.openShare(S, [sil]);
    const dist = Math.hypot(S.x, P.GOAL.y - S.y);
    const T = dist / (geo.speed / 3.6);
    out.innerHTML = '';
    out.append(stat(P.goalAngle(S).toFixed(0) + '°', 'угол на ворота'), stat(Math.round(open * 100) + '%', 'ворот открыто'),
      stat(dist.toFixed(1) + ' м', 'до ворот'), stat(T.toFixed(2) + ' с', `полёт при ${geo.speed} км/ч`));
    note.textContent = T < 0.3 ? 'Вратарю нужно около 0,2 с, чтобы среагировать: из такой точки и с такой скоростью он почти не успевает двинуться — решает точность.'
      : T < 0.55 ? 'Вратарь успевает среагировать и немного сдвинуться: целься туда, куда ему дальше всего тянуться.'
      : 'Шайба летит долго: вратарь видит бросок и успевает. Отсюда нужен заслон, отскок или смена угла.';
    drawFace(face, sil, []);
  }

  dragOn(svg, [shooter, goalie], (which, p) => {
    if (which === 'me') geo.S = { x: clamp(p.x, -14, 14), y: clamp(p.y, 37.5, 55) };
    else { geo.auto = false; geo.G = { x: clamp(p.x, -2.5, 2.5), y: clamp(p.y, 53, 55.9) }; syncAuto(); }
    update();
  });

  const autoBtn = h('button', { class: geo.auto ? 'on' : '', onclick: () => { geo.auto = true; syncAuto(); update(); } }, 'Вратарь на угол');
  const syncAuto = () => autoBtn.className = geo.auto ? 'on' : '';
  const depthIn = h('input', { type: 'range', min: 0, max: 2, step: 0.1, value: geo.depth, oninput: e => { geo.depth = +e.target.value; geo.auto = true; syncAuto(); depthLab.textContent = geo.depth.toFixed(1) + ' м'; update(); } });
  const depthLab = h('b', geo.depth.toFixed(1) + ' м');
  const speedIn = h('input', { type: 'range', min: 40, max: 160, step: 5, value: geo.speed, oninput: e => { geo.speed = +e.target.value; speedLab.textContent = geo.speed + ' км/ч'; update(); } });
  const speedLab = h('b', geo.speed + ' км/ч');
  const stanceT = h('div.toggle', { style: { '--n': 2 } }, ...Object.entries(P.STANCES).map(([k, s]) => h('button', { class: geo.stance === k ? 'on' : '', onclick: e => { geo.stance = k; stanceT.querySelectorAll('button').forEach(b => b.classList.remove('on')); e.currentTarget.classList.add('on'); update(); heat(); } }, s.name)));
  const heatBtn = h('button.btn.small', { onclick: () => { geo.heat = !geo.heat; heat(); heatBtn.textContent = geo.heat ? 'Скрыть карту' : 'Карта: где ворота открыты'; } }, geo.heat ? 'Скрыть карту' : 'Карта: где ворота открыты');

  function heat() {
    lHeat.innerHTML = '';
    if (!geo.heat) return;
    for (let x = -13.5; x <= 13.5; x += 1.5) for (let y = 38; y <= 55; y += 1.5) {
      if (Math.abs(x) > 15 - 1 - Math.max(0, (y - 51.5)) * 1.1) continue;
      const S = { x, y };
      const share = P.openShare(S, [P.silhouette(S, P.goaliePos(S, geo.depth), P.STANCES[geo.stance])]);
      const s = scr(S);
      sv('rect', { x: s.x - 0.75, y: s.y - 0.75, width: 1.5, height: 1.5, class: 'heat', 'fill-opacity': Math.min(0.85, share * 1.6).toFixed(2) }, lHeat);
    }
  }

  view.append(h('p.lead', 'Двигай себя и вратаря. Синий клин — ворота, которые ты видишь; тёмный — что закрывает вратарь. Справа — ворота твоими глазами.'),
    wrap,
    h('div.geo-face', face),
    out, note,
    h('div.panel', { style: { marginTop: '12px' } },
      h('label.field', h('span', 'Вратарь'), stanceT),
      h('div.toggle', { style: { '--n': 1 } }, autoBtn),
      h('label.field', { style: { marginTop: '12px' } }, h('span', h('span', 'Выход из ворот '), depthLab), depthIn),
      h('label.field', h('span', h('span', 'Скорость броска '), speedLab), speedIn),
      heatBtn),
    h('p.muted.small', 'Расчёт: геометрия ворот 1,83 × 1,22 м, проекция силуэта вратаря из точки броска. Силуэт и реакция 0,2 с — приближённые значения. Карта показывает долю открытых ворот при вратаре на правильной позиции — это геометрия, а не статистика голов.'));
  update(); heat();
}

const stat = (b, s) => h('div', h('b', b), h('span', s));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function token(layer, id, label) {
  const g = sv('g', { class: `ent ${id === 'me' ? 'us me' : id === 'g' ? 'them goalie' : id === 'd' ? 'them' : 'us'} drag`, 'data-id': id }, layer);
  if (id === 'me') sv('circle', { r: 1.45, class: 'me-ring' }, g);
  if (id === 'g') sv('rect', { x: -1, y: -0.6, width: 2, height: 1.2, rx: 0.5, class: 'body' }, g);
  else sv('circle', { r: 0.95, class: 'body' }, g);
  const t = sv('text', { class: 'label', 'text-anchor': 'middle', y: 0.33 }, g); t.textContent = label;
  sv('circle', { r: 2.2, fill: 'transparent' }, g);
  return g;
}
function place(g, p) { const s = scr(p); g.setAttribute('transform', `translate(${s.x} ${s.y})`); }

function dragOn(svg, tokens, cb) {
  let cur = null;
  const pt = ev => { const m = svg.getScreenCTM(); const q = svg.createSVGPoint(); q.x = ev.clientX; q.y = ev.clientY; const s = q.matrixTransform(m.inverse()); return { x: s.x, y: R.L - s.y }; };
  svg.addEventListener('pointerdown', ev => {
    const t = ev.target.closest('.drag');
    cur = t ? t.dataset.id : 'me';
    svg.setPointerCapture(ev.pointerId);
    cb(cur, pt(ev));
    ev.preventDefault();
  });
  svg.addEventListener('pointermove', ev => { if (cur) cb(cur, pt(ev)); });
  const up = () => { cur = null; };
  svg.addEventListener('pointerup', up); svg.addEventListener('pointercancel', up);
  svg.style.touchAction = 'none';
}

/* Ворота глазами бросающего (SVG): створ, силуэты, точки бросков. */
function drawFace(face, sil, others, marks = []) {
  face.innerHTML = '';
  const v = y => 1.42 - y; // экранная высота: пол внизу
  sv('rect', { x: -1.35, y: v(0), width: 2.7, height: 0.2, class: 'face-ice' }, face);
  sv('rect', { x: -P.GOAL.half, y: v(P.GOAL.h), width: P.GOAL.w, height: P.GOAL.h, class: 'face-net' }, face);
  for (let u = -0.8; u <= 0.81; u += 0.16) sv('line', { x1: u, x2: u, y1: v(P.GOAL.h), y2: v(0), class: 'face-mesh' }, face);
  for (let y = 0.15; y < P.GOAL.h; y += 0.15) sv('line', { x1: -P.GOAL.half, x2: P.GOAL.half, y1: v(y), y2: v(y), class: 'face-mesh' }, face);
  const poly = (pts, cls) => sv('polygon', { points: pts.map(p => `${p.u.toFixed(3)},${v(p.v).toFixed(3)}`).join(' '), class: cls }, face);
  for (const o of others) for (const p of o.parts) poly(p.pts, 'face-other');
  for (const p of sil) poly(p.pts, 'face-goalie');
  sv('path', { d: `M${-P.GOAL.half} ${v(0)} V${v(P.GOAL.h)} H${P.GOAL.half} V${v(0)}`, class: 'face-frame' }, face);
  for (const m of marks) sv('circle', { cx: m.u, cy: v(m.v), r: 0.045, class: 'face-mark ' + m.cls }, face);
}

/* ---------------- Игра ---------------- */
const MODES = [
  { id: 'angle', name: 'Угол', line: 'Бросаешь из разных точек. Узнай, откуда ворота открыты, а откуда нет.', principle: null },
  { id: 'goalie', name: 'Обыграй вратаря', line: 'Бабочка — верх. Стойка — низ и между щитков. Глубоко — углы, вышел — обводи.', principle: null },
  { id: 'royal', name: 'Королевская дорога', line: 'Пас через слот — вратарь едет. Бросай в касание, пока он не встал.', principle: 'royal-road' },
  { id: 'drag', name: 'Смени угол', line: 'Защитник в линии броска. Протяни шайбу в сторону — и бросай.', principle: 'change-angle' },
  { id: 'screen', name: 'Заслон', line: 'Партнёр закрывает вратарю обзор. Бросай мимо него, а не в него.', principle: 'net-front' },
];
const SHOTS = 10;

function gameMenu(view, rerender) {
  const set = state.profile.shot || { level: 'pro', speedMode: 'age' };
  view.append(h('p.lead', 'Свайп от шайбы к точке в воротах: куда отпустил палец — туда и бросок. Быстрее свайп — сильнее бросок, но шире разброс.'),
    h('div.panel',
      h('label.field', h('span', 'Вратарь'), seg(Object.entries(P.LEVELS).map(([k, l]) => [k, l.name]), set.level, v => setProfile({ shot: { ...set, level: v } }), rerender)),
      h('label.field', { style: { marginBottom: 0 } }, h('span', 'Сила броска: до 95 или до 150 км/ч'), seg([['age', 'Мой возраст'], ['nhl', 'НХЛ']], set.speedMode, v => setProfile({ shot: { ...set, speedMode: v } }), rerender))));
  view.append(h('div.h2', 'Режимы'));
  for (const m of MODES) {
    const best = bestOf('shot:' + m.id);
    view.append(h('div.panel.deck', { onclick: () => runGame(m, set, rerender) },
      h('div.ico', icon('shot')),
      h('div.grow', h('div.nm', m.name), h('div.ln', m.line)),
      h('div.cnt', best != null ? `рекорд ${best}/${SHOTS}` : '')));
  }
}

function seg(opts, cur, set, rerender) {
  const box = h('div.toggle', { style: { '--n': opts.length } });
  for (const [v, t] of opts) box.append(h('button', { class: v === cur ? 'on' : '', onclick: () => { set(v); rerender(); } }, t));
  return box;
}

const bestOf = mod => {
  let b = null;
  for (const s of state.sessions) if (s.module === mod && s.items.length >= SHOTS) b = Math.max(b ?? 0, s.items.filter(i => i.verdict === 'best').length);
  return b;
};

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];

function setup(mode) {
  const stance = pick(['butterfly', 'stand']);
  if (mode === 'angle') {
    const S = pick([{ x: rnd(-2, 2), y: rnd(46, 50) }, { x: rnd(-9, -5), y: rnd(46, 51) }, { x: rnd(5, 9), y: rnd(46, 51) }, { x: rnd(-12, -9), y: rnd(51, 54) }, { x: rnd(9, 12), y: rnd(51, 54) }, { x: rnd(-6, 6), y: rnd(38.5, 42) }]);
    return { S, G: P.goaliePos(S, rnd(0.6, 1.2)), stance, others: [] };
  }
  if (mode === 'goalie') {
    const S = { x: rnd(-3.5, 3.5), y: rnd(45, 50) };
    const depth = pick([0.3, 0.9, 1.6]);
    return { S, G: P.goaliePos(S, depth), stance, others: [], depth };
  }
  if (mode === 'royal') {
    // хват: левше бросок в касание удобнее с правого круга (клюшка смотрит в середину), правше — с левого
    const side = state.profile.hand === 'R' ? -1 : 1;
    const from = { x: -6.8 * side, y: rnd(48.5, 50.5) }, S = { x: 6.6 * side, y: rnd(48.5, 50.5) };
    return { S, from, G: P.goaliePos(from, 1.0), Gend: P.goaliePos(S, 1.0), stance: 'butterfly', others: [] };
  }
  if (mode === 'drag') {
    const S = { x: rnd(-1.5, 1.5), y: rnd(43, 45) };
    const D = { x: S.x * 0.5 + rnd(-0.3, 0.3), y: S.y + 4.5 };
    return { S, G: P.goaliePos(S, 0.9), stance: 'butterfly', others: [], D };
  }
  const S = { x: rnd(-3, 3), y: rnd(40, 44) };
  const G = P.goaliePos(S, 0.8);
  const scr0 = { x: G.x * 0.4 + rnd(-0.2, 0.2), y: 53 };
  return { S, G, stance: pick(['butterfly', 'stand']), others: [], screen: scr0 };
}

function runGame(mode, set, rerender) {
  const root = h('div.play'), inner = h('div.play-in');
  root.appendChild(inner); document.body.appendChild(root); document.body.style.overflow = 'hidden';
  const session = startSession('shot:' + mode.id);
  const results = [];
  let ended = false;
  const close = () => { cancelAll(); if (!ended) { ended = true; finishSession(session); } root.remove(); document.body.style.overflow = ''; rerender(); };
  const maxK = set.speedMode === 'nhl' ? 150 : 95, minK = 40;

  function round() {
    if (results.length >= SHOTS) return finish();
    inner.innerHTML = '';
    const sc = setup(mode.id);
    let S = { ...sc.S }, G = { ...sc.G }, t0 = performance.now(), shiftAt = null, received = mode.id !== 'royal';
    const dots = h('div.dots', Array.from({ length: SHOTS }, (_, k) => h('i', { class: k < results.length ? (results[k] ? 'best' : 'bad') : k === results.length ? 'now' : '' })));
    inner.append(h('div.play-top', h('button.x', { onclick: close }, icon('close')), dots),
      h('div.q-meta', mode.name), h('div.q', { style: { fontSize: '16px', margin: '8px 0' } }, mode.line));

    // мини-карта
    const map = sv('svg', { viewBox: '-15.6 -0.6 31.2 21', class: 'rink-svg mini-map' });
    drawRink(sv('g', { class: 'rink' }, map), R, 'mm' + results.length);
    const lCone = sv('g', {}, map), lEnt = sv('g', {}, map);
    const tMe = token(lEnt, 'me', 'Я'), tG = token(lEnt, 'g', 'ВР');
    const tD = sc.D ? token(lEnt, 'd', '') : null;
    const tScr = sc.screen ? token(lEnt, 'mate', 'ПН') : null;
    const tFrom = sc.from ? token(lEnt, 'mate', 'ЛН') : null;
    if (tFrom) place(tFrom, sc.from);
    if (tD) place(tD, sc.D);
    if (tScr) place(tScr, sc.screen);
    const puckDot = sv('circle', { r: 0.35, class: 'puck-core' }, lEnt);

    const face = h('canvas.goal-cv');
    const hud = h('div.shot-hud', h('span', 'Свайпни от шайбы в ворота'));
    const stage = h('div.shot-stage', face, h('div.puck-start'));
    inner.append(h('div.rink-wrap', { style: { padding: '6px' } }, map), stage, hud);

    let extra = null;
    if (mode.id === 'drag') {
      extra = h('div.row', { style: { marginTop: '10px' } },
        h('button.btn.small.grow', { onclick: () => dragStep(-1) }, '← Протяжка'),
        h('button.btn.small.grow', { onclick: () => dragStep(1) }, 'Протяжка →'));
      inner.append(extra);
    }

    const ctx = face.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const fit = () => { const w = face.clientWidth; face.width = w * dpr; face.height = w * 0.62 * dpr; face.style.height = w * 0.62 + 'px'; };
    fit();
    const U0 = -1.55, U1 = 1.55, V0 = -0.1, V1 = 1.82;
    const toPx = (u, v) => ({ x: (u - U0) / (U1 - U0) * face.width, y: face.height - (v - V0) / (V1 - V0) * face.height });
    const toUV = (x, y) => ({ u: U0 + x / face.clientWidth * (U1 - U0), v: V0 + (1 - y / face.clientHeight) * (V1 - V0) });

    const others = () => {
      const o = [];
      if (sc.D) o.push({ who: 'defender', parts: P.silhouette(S, sc.D, P.BODY) });
      if (sc.screen) o.push({ who: 'screen', parts: P.silhouette(S, sc.screen, P.BODY) });
      return o;
    };
    const goalieSil = (shift) => P.silhouette(S, G, P.STANCES[sc.stance], shift);

    function drawMap() {
      place(tMe, S); place(tG, G);
      const s = scr(S), pl = scr({ x: -P.GOAL.half, y: 56 }), pr = scr({ x: P.GOAL.half, y: 56 });
      lCone.innerHTML = '';
      sv('path', { d: `M${s.x} ${s.y} L${pl.x} ${pl.y} L${pr.x} ${pr.y} Z`, class: 'cone' }, lCone);
      const pk = received ? S : sc.from;
      puckDot.setAttribute('cx', scr(pk).x + 0.7); puckDot.setAttribute('cy', scr(pk).y - 0.6);
    }

    function drawFaceCv(sil, puck, partShift) {
      const W = face.width, Hh = face.height;
      ctx.clearRect(0, 0, W, Hh);
      const g = ctx.createLinearGradient(0, 0, 0, Hh); g.addColorStop(0, '#0B1A2C'); g.addColorStop(1, '#14304C');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, Hh);
      const ice = toPx(0, 0).y; ctx.fillStyle = '#E7F1F8'; ctx.fillRect(0, ice, W, Hh - ice);
      // вратарская
      ctx.fillStyle = 'rgba(63,160,255,.35)'; const c0 = toPx(-1.83, 0), c1 = toPx(1.83, 0);
      ctx.beginPath(); ctx.ellipse((c0.x + c1.x) / 2, ice, (c1.x - c0.x) / 2, Hh * 0.06, 0, 0, Math.PI); ctx.fill();
      // сетка
      const a = toPx(-P.GOAL.half, P.GOAL.h), b = toPx(P.GOAL.half, 0);
      ctx.fillStyle = 'rgba(255,255,255,.06)'; ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
      ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 1 * dpr;
      for (let u = -0.8; u <= 0.81; u += 0.16) { const p0 = toPx(u, 0), p1 = toPx(u, P.GOAL.h); ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke(); }
      for (let v = 0.15; v < P.GOAL.h; v += 0.15) { const p0 = toPx(-P.GOAL.half, v), p1 = toPx(P.GOAL.half, v); ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke(); }
      const polyF = (pts, fill, stroke, sh) => {
        ctx.beginPath(); pts.forEach((p, i) => { const q = toPx(p.u + (sh ? sh.u : 0), p.v + (sh ? sh.v : 0)); i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); }); ctx.closePath();
        ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = stroke; ctx.lineWidth = 1.5 * dpr; ctx.stroke();
      };
      for (const p of sil) polyF(p.pts, p.id === 'pads' || p.id.startsWith('leg') ? '#F4F7FA' : p.id === 'glove' || p.id === 'blocker' ? '#FF3D57' : '#E8EEF4', '#0F2D52', partShift && partShift.id === p.id ? partShift : null);
      for (const o of others()) for (const p of o.parts) polyF(p.pts, o.who === 'screen' ? 'rgba(15,45,82,.92)' : 'rgba(226,40,62,.85)', '#0B1C2E');
      // каркас
      ctx.strokeStyle = '#E2283E'; ctx.lineWidth = 5 * dpr; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(a.x, b.y); ctx.lineTo(a.x, a.y); ctx.lineTo(b.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      if (puck) {
        const q = toPx(puck.u, puck.v), r = Math.max(4, (puck.size || 1) * 0.05 / (U1 - U0) * W);
        ctx.fillStyle = 'rgba(63,215,255,.35)'; ctx.beginPath(); ctx.arc(q.x, q.y, r * 2.2, 0, 7); ctx.fill();
        ctx.fillStyle = '#05090F'; ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, 7); ctx.fill();
      }
    }

    // королевская дорога: пас, вратарь переезжает с задержкой
    const lvl = P.LEVELS[set.level];
    function goalieAt(t) {
      if (mode.id === 'royal') {
        if (!received) return { ...sc.G };
        const tt = Math.max(0, t - shiftAt - lvl.reaction * 0.8);
        const d = Math.hypot(sc.Gend.x - sc.G.x, sc.Gend.y - sc.G.y), travel = Math.min(1, tt * 2.6 * lvl.move / d);
        return { x: sc.G.x + (sc.Gend.x - sc.G.x) * ease.inOut(travel), y: sc.G.y + (sc.Gend.y - sc.G.y) * ease.inOut(travel) };
      }
      return G;
    }

    let live = true;
    const loop = () => {
      if (!live) return;
      const t = (performance.now() - t0) / 1000;
      if (mode.id === 'royal') G = goalieAt(t);
      drawMap(); drawFaceCv(goalieSil(), received ? null : null);
      requestAnimationFrame(loop);
    };

    async function dragStep(dir) {
      if (!received || busy) return;
      busy = true;
      const from = { ...S }, to = { x: clamp(S.x + dir * 1.3, -6, 6), y: S.y };
      const gFrom = { ...G }, gTo = P.goaliePos(to, 0.9);
      await tween(350, k => { S = { x: from.x + (to.x - from.x) * k, y: S.y }; });
      await tween(Math.max(0, lvl.reaction * 1000), () => {});
      tween(380 / lvl.move, k => { G = { x: gFrom.x + (gTo.x - gFrom.x) * k, y: gFrom.y + (gTo.y - gFrom.y) * k }; });
      busy = false;
    }
    let busy = false;

    if (mode.id === 'royal') {
      hud.firstChild.textContent = 'Пас идёт…';
      setTimeout(() => { received = true; shiftAt = (performance.now() - t0) / 1000; hud.firstChild.textContent = 'Бросай в касание!'; }, 700 + Math.random() * 300);
    }
    requestAnimationFrame(loop);

    // свайп
    let track = [];
    face.style.touchAction = 'none';
    face.addEventListener('pointerdown', ev => { if (!received || busy) return; track = [{ x: ev.offsetX, y: ev.offsetY, t: performance.now() }]; face.setPointerCapture(ev.pointerId); });
    face.addEventListener('pointermove', ev => { if (track.length) track.push({ x: ev.offsetX, y: ev.offsetY, t: performance.now() }); });
    face.addEventListener('pointerup', ev => {
      if (!track.length) return;
      const end = { x: ev.offsetX, y: ev.offsetY, t: performance.now() };
      track.push(end);
      const start = track[0];
      if (Math.hypot(end.x - start.x, end.y - start.y) < 30 && end.t - start.t > 250) { track = []; toast('Свайпни от шайбы к воротам'); return; }
      const recent = track.filter(p => end.t - p.t < 110);
      const p0 = recent[0];
      const pxs = Math.hypot(end.x - p0.x, end.y - p0.y) / Math.max(16, end.t - p0.t) * 1000 / face.clientHeight;
      const frac = clamp((pxs - 1.2) / 6, 0, 1);
      track = [];
      shoot(toUV(end.x, end.y), frac);
    });
    // начальная точка «шайба» внизу — визуальная подсказка
    drawMap();

    async function shoot(aim, frac) {
      busy = true; live = false;
      const k = minK + frac * (maxK - minK);
      const speedMs = k / 3.6;
      const t = (performance.now() - t0) / 1000;
      const gNow = goalieAt(t); G = gNow;
      let target = P.scatter(aim, (k - minK) / (150 - minK));
      let delay = 0;
      if (mode.id === 'royal') {
        const tt = t - shiftAt;
        if (tt < 0.9) delay += 0.06; // бросок в касание: вратарь ещё в движении и не успел «встать»
      }
      if (sc.screen) {
        const sp = P.project(S, { ...sc.screen, h: 1 });
        if (Math.abs(target.u - sp.u) < 0.75) delay += 0.2; // вратарь не видит выпуск
      }
      const sil = goalieSil();
      const r = P.resolveShot({ S, target, speedMs, goalie: { sil, level: set.level, delay }, others: others() });
      // анимация: шайба летит (замедление ×3), часть вратаря тянется к шайбе
      const dur = Math.min(1600, r.T * 3000);
      const part = sil.find(p => p.id === r.part);
      let shift = null;
      if (part) {
        const cu = part.pts.reduce((a, p) => a + p.u, 0) / 4, cv = part.pts.reduce((a, p) => a + p.v, 0) / 4;
        const dx = target.u - cu, dy = target.v - cv, L = Math.hypot(dx, dy) || 1;
        const go = Math.min(r.result === 'save' ? r.need + 0.02 : r.reach, L);
        shift = { id: part.id, du: dx / L * go, dv: dy / L * go };
      }
      const startT = (r.reaction || 0.2) / r.T;
      await tween(dur, kk => {
        const pu = { u: target.u * kk, v: target.v * kk, size: 2.4 - kk * 1.4 };
        const ps = shift && kk > startT ? { id: shift.id, u: shift.du * Math.min(1, (kk - startT) / (1 - startT)), v: shift.dv * Math.min(1, (kk - startT) / (1 - startT)) } : null;
        drawFaceCv(sil, { u: pu.u, v: Math.max(0, pu.v), size: pu.size }, ps);
      }, ease.linear);
      const goal = r.result === 'goal';
      results.push(goal);
      logItem(session, { mode: mode.id, level: set.level, principle: mode.principle, verdict: goal ? 'best' : 'bad', result: r.result, kmh: Math.round(k), timeMs: 0,
        S: [+S.x.toFixed(1), +S.y.toFixed(1)], target: [+target.u.toFixed(2), +target.v.toFixed(2)] });
      hud.innerHTML = '';
      hud.append(h('span.shot-res.' + (goal ? 'g' : 'n'), { goal: 'ГОЛ', save: 'СЕЙВ', post: 'ШТАНГА', miss: 'МИМО', blocked: 'БЛОК' }[r.result]),
        h('span.muted', ` ${Math.round(k)} км/ч · полёт ${r.T.toFixed(2)} с`), h('p.explain', { style: { margin: '6px 0 0' } }, explainShot(r, sc, mode)),
        h('button.btn.primary.block', { style: { marginTop: '10px' }, onclick: round }, results.length < SHOTS ? 'Следующий бросок' : 'Итоги'));
      busy = false;
    }
  }

  function finish() {
    if (!ended) { ended = true; finishSession(session); }
    const g = results.filter(Boolean).length;
    inner.innerHTML = '';
    inner.append(h('div.play-top', h('button.x', { onclick: close }, icon('close'))),
      h('div.final', h('div.q-meta', mode.name), h('div.big', `${g}/${SHOTS}`), h('div.muted', 'голов'),
        h('p', { style: { margin: '18px 0' } }, mode.line),
        h('div.row', { style: { marginTop: '24px' } }, h('button.btn.grow', { onclick: () => { results.length = 0; round(); } }, 'Ещё раз'), h('button.btn.primary.grow', { onclick: close }, 'Готово'))));
  }

  round();
}

function explainShot(r, sc, mode) {
  if (r.result === 'miss') return 'Мимо створа. Сильный бросок даёт разброс — иногда точнее бросить чуть слабее.';
  if (r.result === 'post') return 'Штанга! Совсем чуть-чуть — целься на ширину шайбы внутрь.';
  if (r.result === 'blocked') return r.by === 'screen' ? 'Попал в своего на пятаке. Бросай в коридор рядом с заслоном.' : 'Шайба в защитника. Смени угол перед броском — протяжка в сторону.';
  const part = { glove: 'ловушка', blocker: 'блин', pads: 'щитки', body: 'корпус', head: 'корпус', legL: 'щиток', legR: 'щиток', stick: 'клюшка' }[r.part] || 'вратарь';
  if (r.result === 'save' && r.reason === 'body') return `Прямо в вратаря. ${sc.stance === 'butterfly' ? 'В бабочке он закрывает низ — верх открыт.' : 'В стойке открыты низ и между щитков.'}`;
  if (r.result === 'save') return `Успел: ${part} дотянулся. Шайба летела ${r.T.toFixed(2)} с, на реакцию ушло около ${r.reaction.toFixed(2)} с. Дальше от его рук и щитков — или быстрее выпуск.`;
  const left = Math.max(0, r.T - r.reaction);
  return `Вратарю не хватило ${(r.need - r.reach).toFixed(2)} м: за ${left.toFixed(2)} с ${part} не дотянулся.${mode.id === 'royal' ? ' Бросок в касание — он ещё ехал.' : ''}`;
}
