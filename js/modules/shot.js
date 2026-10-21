/* «Бросок»: геометрия (интерактив) и игра свайпом с пятью режимами. Физика — engine/shot.js. */
import { h, icon, toast } from '../ui.js';
import { RINKS, boardsPath } from '../engine/rink.js';
import { drawRink } from '../engine/render.js';
import { tween, cancelAll, ease } from '../engine/anim.js';
import * as P from '../engine/shot.js';
import { ownStickImage, arenaImage, skaterImage, goaliePoseImage, GOALIE_UPM, META, ready as imgReady, preload as preloadSprites } from '../engine/sprites.js';
import { state, startSession, logItem, finishSession, setProfile } from '../core/state.js';

const R = RINKS.iihf;
const NS = 'http://www.w3.org/2000/svg';
const sv = (tag, attrs = {}, parent) => { const n = document.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); if (parent) parent.appendChild(n); return n; };
const scr = p => ({ x: p.x, y: R.L - p.y });

let tab = 'game';

export function render(view, rerender) {
  view.append(h('div.h1', 'Бросок'),
    h('div.toggle', { style: { '--n': 3, marginBottom: '14px' } },
      [['game', 'Игра'], ['geo', 'Геометрия'], ['model', 'Как считается']].map(([k, t]) =>
        h('button', { class: tab === k ? 'on' : '', onclick: () => { tab = k; rerender(); } }, t))));
  if (tab === 'geo') geometry(view); else if (tab === 'model') model(view); else gameMenu(view, rerender);
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
  const g = sv('g', { class: `ent legacy ${id === 'me' ? 'us me' : id === 'g' ? 'them goalie' : id === 'd' ? 'them' : 'us'} drag`, 'data-id': id }, layer);
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


/* Открыть режим игры напрямую (связка из разбора ситуации). */
export function openMode(id, rerender = () => {}) {
  const m = MODES.find(x => x.id === id);
  if (m) runGame(m, shotSet(), rerender);
}

/* ---------------- Игра ---------------- */
const MODES = [
  { id: 'angle', name: 'Угол', line: 'Бросаешь из разных точек. Узнай, откуда ворота открыты, а откуда нет.', principle: null },
  { id: 'goalie', name: 'Обыграй вратаря', line: 'Вратарь стоит по-разному: глубоко, на углу, вышел далеко. Смотри, что реально открыто в этот раз, — универсального «верного угла» нет.', principle: null },
  { id: 'royal', name: 'Королевская дорога', line: 'Пас через слот — вратарь едет. Бросай в касание, пока он не встал.', principle: 'royal-road' },
  { id: 'move', name: 'В движении', line: 'Едешь поперёк слота. Вратарь догоняет угол с опозданием — бросай, пока он едет.', principle: 'change-angle' },
  { id: 'drag', name: 'Протяжка', line: 'Защитник в линии броска. Протяни шайбу в сторону — меняется угол, вратарь не успевает за ним.', principle: 'change-angle' },
  { id: 'screen', name: 'Заслон', line: 'Партнёр закрывает вратарю обзор. Бросай мимо него, а не в него.', principle: 'net-front' },
  { id: 'rebound', name: 'Добивание', line: 'Бросок от синей, вратарь отбил. Шайба у тебя на пятаке — добивай, пока он не встал на угол.', principle: 'net-front' },
];
const SHOTS = 10;
const CTRL = {
  novice: { name: 'Новичок', line: 'Точный бросок: ползунком выбери силу, нажми точку в воротах и жми «Бросок». Случайного разброса нет — шайба летит ровно в прицел (в движении — со сносом, он виден заранее).', mult: 0 },
  pro: { name: 'Профи', line: 'Зажми палец на воротах: прицел стоит чуть выше пальца, чтобы его не закрывать. Кольцо силы качается от слабой к максимальной — отпусти в нужный момент. Эллипс показывает разброс исполнения, он растёт с силой.', mult: 1 },
};
const shotSet = () => ({ level: 'pro', speedMode: 'age', ctrl: 'novice', power: 0.5, ...(state.profile.shot || {}) });

function gameMenu(view, rerender) {
  const set = shotSet();
  const save = patch => setProfile({ shot: { ...shotSet(), ...patch } });
  view.append(
    h('div.panel',
      h('label.field', h('span', 'Управление'), seg([['novice', 'Новичок'], ['pro', 'Профи']], set.ctrl, v => save({ ctrl: v }), rerender)),
      h('p.muted.small', { style: { margin: '-4px 0 12px' } }, CTRL[set.ctrl].line),
      h('label.field', h('span', 'Вратарь'), seg(Object.entries(P.LEVELS).map(([k, l]) => [k, l.name]), set.level, v => save({ level: v }), rerender)),
      h('label.field', { style: { marginBottom: 0 } }, h('span', 'Сила броска: до 95 или до 150 км/ч'), seg([['age', 'Мой возраст'], ['nhl', 'Взрослый']], set.speedMode, v => save({ speedMode: v }), rerender))));
  view.append(h('div.h2', 'Режимы'));
  for (const m of MODES) {
    const best = bestOf('shot:' + m.id);
    view.append(h('div.panel.deck', { onclick: () => runGame(m, shotSet(), rerender) },
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
  for (const s of state.sessions) if (s.module === mod && s.items.length >= SHOTS) b = Math.max(b ?? 0, s.items.filter(i => i.goal ?? i.verdict === 'best').length);
  return b;
};

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
const lerpP = (a, b, k) => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });

function setup(mode) {
  const stance = pick(['butterfly', 'stand']);
  if (mode === 'angle') {
    const S = pick([{ x: rnd(-2, 2), y: rnd(46, 50) }, { x: rnd(-9, -5), y: rnd(46, 51) }, { x: rnd(5, 9), y: rnd(46, 51) }, { x: rnd(-12, -9), y: rnd(51, 54) }, { x: rnd(9, 12), y: rnd(51, 54) }, { x: rnd(-6, 6), y: rnd(38.5, 42) }]);
    const depth = rnd(0.6, 1.2);
    return { S, depth, G: P.goaliePos(S, depth), stance };
  }
  if (mode === 'goalie') {
    const S = { x: rnd(-3.5, 3.5), y: rnd(45, 50) };
    const depth = pick([0.3, 0.9, 1.6]);
    return { S, depth, G: P.goaliePos(S, depth), stance };
  }
  if (mode === 'royal') {
    // хват: левше бросок в касание удобнее с правого круга (клюшка смотрит в середину), правше — с левого
    const side = state.profile.hand === 'R' ? -1 : 1;
    const from = { x: -6.8 * side, y: rnd(48.5, 50.5) }, S = { x: 6.6 * side, y: rnd(48.5, 50.5) };
    return { S, from, depth: 1.0, G: P.goaliePos(from, 1.0), stance: 'butterfly', passAt: rnd(0.7, 1.0), passDur: 0.45 };
  }
  if (mode === 'move') {
    const dir = pick([-1, 1]), y = rnd(46.5, 49);
    const a = { x: -6.5 * dir, y }, b = { x: 6.5 * dir, y: y + rnd(-0.6, 0.6) };
    return { S: a, path: { a, b, dur: Math.hypot(b.x - a.x, b.y - a.y) / P.SKATE }, depth: 0.9, G: P.goaliePos(a, 0.9), stance };
  }
  if (mode === 'drag') {
    const S = { x: rnd(-1.5, 1.5), y: rnd(43, 45) };
    const D = { x: S.x * 0.5 + rnd(-0.3, 0.3), y: S.y + 4.5 };
    return { S, base: { ...S }, depth: 0.9, G: P.goaliePos(S, 0.9), stance: 'butterfly', D };
  }
  if (mode === 'rebound') {
    const P0 = { x: pick([-1, 1]) * rnd(5, 8.5), y: rnd(38.5, 40) };
    const reb = { x: (Math.random() < 0.5 ? -1 : 1) * rnd(1.2, 2.6), y: rnd(51, 52.8) };
    return { S: reb, P0, reb, depth: 0.6, G: P.goaliePos(P0, 0.6), stance: 'butterfly', saveAt: 0.9, rebDur: 0.32 };
  }
  const S = { x: rnd(-3, 3), y: rnd(40, 44) };
  const G = P.goaliePos(S, 0.8);
  return { S, depth: 0.8, G, stance: pick(['butterfly', 'stand']), screen: { x: G.x * 0.4 + rnd(-0.2, 0.2), y: 53 } };
}

function runGame(mode, set, rerender) {
  const root = h('div.play'), inner = h('div.play-in');
  root.appendChild(inner); document.body.appendChild(root); document.body.style.overflow = 'hidden';
  const session = startSession('shot:' + mode.id);
  const results = [];
  let ended = false, live = false;
  const close = () => { live = false; cancelAll(); if (!ended) { ended = true; finishSession(session); } root.remove(); document.body.style.overflow = ''; rerender(); };
  const pro = set.ctrl === 'pro', mult = CTRL[pro ? 'pro' : 'novice'].mult;
  const maxK = set.speedMode === 'nhl' ? 150 : 95, minK = 40;
  const kOf = f => minK + f * (maxK - minK);
  const sdOf = k => P.spread((k - minK) / (150 - minK), mult); // разброс зависит от абсолютной скорости
  const lvl = P.LEVELS[set.level];
  let power = clamp(set.power ?? 0.5, 0, 1);

  function round() {
    if (results.length >= SHOTS) return finish();
    inner.innerHTML = '';
    const sc = setup(mode.id);
    let S = { ...sc.S }, G = { ...sc.G }, puck = { ...(sc.from || sc.P0 || sc.S) }, vx = 0, drag = 0;
    const hist = [];
    let gState = sc.saveAt ? 'готов' : 'готов';
    let ready = !(sc.passAt || sc.saveAt), phase = 'aim', aim = null, charge = null, lastT = 0;
    const t0 = performance.now();
    const now = () => (performance.now() - t0) / 1000;

    const dots = h('div.dots', Array.from({ length: SHOTS }, (_, k) => h('i', { class: k < results.length ? (results[k] ? 'best' : 'bad') : k === results.length ? 'now' : '' })));
    inner.append(h('div.play-top', h('button.x', { onclick: close }, icon('close')), dots),
      h('div.q-meta', `${mode.name} · ${pro ? 'профи' : 'новичок'}`), h('div.q', { style: { margin: '6px 0 2px' } }, 'Куда направишь бросок?'),
      h('p.muted.small', { style: { margin: '0 0 10px' } }, mode.line));
    preloadSprites();

    // мини-карта
    const map = sv('svg', { viewBox: '-15.6 -0.6 31.2 21', class: 'rink-svg mini-map' });
    drawRink(sv('g', { class: 'rink' }, map), R, 'mm' + results.length);
    const lCone = sv('g', {}, map), lEnt = sv('g', {}, map);
    const tMe = token(lEnt, 'me', 'Я'), tG = token(lEnt, 'g', 'ВР');
    if (sc.D) place(token(lEnt, 'd', ''), sc.D);
    if (sc.screen) place(token(lEnt, 'mate', 'ПН'), sc.screen);
    if (sc.from) place(token(lEnt, 'mate', 'ЛН'), sc.from);
    if (sc.P0) place(token(lEnt, 'mate', sc.P0.x < 0 ? 'ЛЗ' : 'ПЗ'), sc.P0);
    const puckDot = sv('circle', { r: 0.35, class: 'puck-core' }, lEnt);

    const face = h('canvas.goal-cv');
    const hud = h('div.shot-hud');
    const stage = h('div.shot-stage', face);
    const pre = h('div.pre-val', '—');
    const preBox = h('div.pre-box', h('span', 'До броска'), pre);
    inner.append(stage, h('div.shot-row', h('div.mini-wrap', map), preBox));
    pre.textContent = `${Math.round(P.goalAngle(sc.S))}° · ${Math.hypot(sc.S.x, P.GOAL.y - sc.S.y).toFixed(1)} м`; pre.className = 'pre-val small';

    // протяжка: шайба на дорожке, тянешь влево-вправо
    if (mode.id === 'drag') {
      const knob = h('i.drag-knob');
      const track = h('div.drag-track', h('span', '← протяжка →'), knob);
      const setDrag = ev => {
        const r = track.getBoundingClientRect();
        const k = clamp((ev.clientX - r.left) / r.width, 0, 1);
        drag = (k - 0.5) * 4.8; knob.style.left = (k * 100) + '%';
      };
      track.addEventListener('pointerdown', ev => { if (phase !== 'aim') return; track.setPointerCapture(ev.pointerId); setDrag(ev); track.onpointermove = setDrag; });
      track.addEventListener('pointerup', () => { track.onpointermove = null; });
      knob.style.left = '50%';
      inner.append(track);
    }

    // управление
    const live$ = h('div.shot-live');
    let shootBtn = null;
    const replayBtn = h('button.btn.shot-replay', { disabled: true }, '↻ Повтор');
    if (!pro) {
      const pLab = h('b');
      const slider = h('input.power', { type: 'range', min: 0, max: 1, step: 0.01, value: power,
        oninput: e => { power = +e.target.value; setProfile({ shot: { ...shotSet(), power } }); syncPower(); } });
      const syncPower = () => { const k = kOf(power); pLab.textContent = `${Math.round(k)} км/ч`; slider.style.setProperty('--p', (power * 100) + '%'); };
      syncPower();
      shootBtn = h('button.btn.primary.shot-go', { disabled: true, onclick: () => { if (aim && phase === 'aim') tryShoot(aim, power); } }, 'Бросок');
      inner.append(h('div.power-box', h('div.row', h('span.kicker.grow', 'Сила броска'), pLab), slider),
        h('div.shot-hint', icon('target'), live$), h('div.shot-btns', replayBtn, shootBtn));
    } else inner.append(h('div.shot-hint', icon('target'), live$), h('div.shot-btns', replayBtn));
    inner.append(hud);

    const ctx = face.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    // Холст — вид от бросающего: арена, лёд, ворота. Плоскость ворот занимает центр: ширина ворот — 42 % кадра,
    // линия льда на 64 % высоты. toPx/toUV — единственный пересчёт плоскости ворот ↔ экран (и для прицела, и для вратаря).
    const fit = () => { const w = face.clientWidth; face.width = w * dpr; face.height = w * 0.86 * dpr; face.style.height = w * 0.86 + 'px'; };
    fit();
    const GW = 0.42, YICE = 0.64;
    const mpx = face.width * GW / P.GOAL.w; // пикселей в метре в плоскости ворот
    const toPx = (u, v) => ({ x: face.width / 2 + u * mpx, y: face.height * YICE - v * mpx });
    const toUV = (x, y) => ({ u: clamp((x * dpr - face.width / 2) / mpx, -1.4, 1.4), v: clamp((face.height * YICE - y * dpr) / mpx, 0, 1.75) });
    const LIFT = 56; // прицел над пальцем, CSS-пиксели
    let finger = null;

    const others = () => {
      const o = [];
      if (sc.D) o.push({ who: 'defender', parts: P.silhouette(S, sc.D, P.BODY) });
      if (sc.screen) o.push({ who: 'screen', parts: P.silhouette(S, sc.screen, P.BODY) });
      return o;
    };
    const goalieSil = () => P.silhouette(S, G, P.STANCES[sc.stance]);

    // мир: где шайба и бросающий в момент t, вратарь догоняет угол с задержкой
    function step(t) {
      const dt = Math.min(0.05, t - lastT); lastT = t;
      if (sc.path) {
        const k = clamp(t / sc.path.dur, 0, 1);
        S = lerpP(sc.path.a, sc.path.b, k);
        vx = k < 1 ? (sc.path.b.x - sc.path.a.x) / sc.path.dur : 0;
        puck = { ...S };
      } else if (sc.base) { S = { x: sc.base.x + drag, y: sc.base.y }; puck = { ...S }; }
      else if (sc.passAt) {
        const k = clamp((t - sc.passAt) / sc.passDur, 0, 1);
        puck = lerpP(sc.from, S, k);
        if (k >= 1 && !ready) { ready = true; status(); firePending(); }
      } else if (sc.saveAt) {
        const k = clamp((t - sc.saveAt) / sc.rebDur, 0, 1);
        puck = t < sc.saveAt ? lerpP(sc.P0, { x: G.x, y: G.y - 0.6 }, clamp(t / sc.saveAt, 0, 1)) : lerpP({ x: G.x, y: G.y - 0.6 }, sc.reb, k);
        if (k >= 1 && !ready) { ready = true; status(); firePending(); }
      }
      hist.push({ t, x: puck.x, y: puck.y });
      if (sc.saveAt && t < sc.saveAt) { gState = 'готов'; return; } // до сейва вратарь в позиции против броска от синей
      const react = lvl.reaction + (sc.saveAt ? 0.05 : 0);
      let seen = hist[0];
      for (const p of hist) { if (p.t <= t - react) seen = p; else break; }
      const tgt = P.goaliePos(seen, sc.depth);
      const v = (sc.saveAt ? P.TRACK.fromDown : P.TRACK.shuffle) * lvl.move;
      const d = Math.hypot(tgt.x - G.x, tgt.y - G.y), go = Math.min(d, v * dt);
      gState = d > 0.15 ? (sc.saveAt ? 'восстанавливается' : 'смещается') : 'готов';
      if (d > 0.001) G = { x: G.x + (tgt.x - G.x) / d * go, y: G.y + (tgt.y - G.y) / d * go };
    }
    const unset = () => { const ideal = P.goaliePos(puck, sc.depth); return Math.hypot(ideal.x - G.x, ideal.y - G.y) > 0.15; };

    function drawMap() {
      place(tMe, S); place(tG, G);
      const s = scr(S), pl = scr({ x: -P.GOAL.half, y: 56 }), pr = scr({ x: P.GOAL.half, y: 56 });
      lCone.innerHTML = '';
      sv('path', { d: `M${s.x} ${s.y} L${pl.x} ${pl.y} L${pr.x} ${pr.y} Z`, class: 'cone' }, lCone);
      puckDot.setAttribute('cx', scr(puck).x + (ready ? 0.7 : 0)); puckDot.setAttribute('cy', scr(puck).y - (ready ? 0.6 : 0));
    }

    /* Кадр: арена → лёд → сетка и рама ворот → вратарь (по частям модели) → прицел → шайба → своя клюшка. */
    function frame(sil, opts = {}) {
      const W = face.width, Hh = face.height, yI = Hh * YICE;
      const dist = Math.hypot(S.x, P.GOAL.y - S.y) || 8;
      const persp = d => dist / (dist + d);        // уменьшение для предметов за плоскостью ворот
      const hor = yI - 1.6 * mpx;                    // горизонт на высоте глаз
      const atDepth = d => hor + (yI - hor) * persp(d); // линия льда на глубине d за воротами
      ctx.clearRect(0, 0, W, Hh);
      // арена: тёмный свод со светильниками, трибуны-стена, стекло, борт с жёлтым кантом
      const g = ctx.createLinearGradient(0, 0, 0, yI); g.addColorStop(0, '#081426'); g.addColorStop(1, '#1A3558');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, Hh);
      ctx.fillStyle = 'rgba(235,245,255,.85)';
      for (let k = 0; k < 5; k++) ctx.fillRect(W * (0.12 + k * 0.18), Hh * 0.05, W * 0.06, 2.5 * dpr);
      const bBase = atDepth(4), bTop = bBase - 1.07 * mpx * persp(4), gTop = bBase - 2.4 * mpx * persp(4);
      const arena = arenaImage();
      if (imgReady(arena)) {
        // фон арены: кромка борта в картинке на 0,646 высоты, лёд — с 0,784; масштаб — по высоте борта (1,07 м на глубине 4 м)
        const ih = Math.max((bBase - bTop) / 0.138, Hh * 0.5), iw = ih * arena.naturalWidth / arena.naturalHeight;
        ctx.drawImage(arena, W / 2 - iw / 2, bBase - 0.784 * ih, iw, ih);
      } else {
      ctx.fillStyle = '#16305A'; ctx.fillRect(0, gTop - 30 * dpr, W, 30 * dpr);
      for (let x = 0; x < W; x += W / 7) { ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fillRect(x, gTop - 30 * dpr, 2 * dpr, 30 * dpr); }
      ctx.fillStyle = 'rgba(170,205,235,.18)'; ctx.fillRect(0, gTop, W, bTop - gTop);
      ctx.strokeStyle = 'rgba(220,235,250,.35)'; ctx.lineWidth = 1.5 * dpr;
      for (let x = W * 0.08; x < W; x += W / 6) { ctx.beginPath(); ctx.moveTo(x, gTop); ctx.lineTo(x, bTop); ctx.stroke(); }
      ctx.fillStyle = '#2A64C8'; ctx.fillRect(0, gTop, W, 3 * dpr);
      ctx.fillStyle = '#F4F7FA'; ctx.fillRect(0, bTop, W, bBase - bTop);
      ctx.fillStyle = '#E3B21B'; ctx.fillRect(0, bBase - (bBase - bTop) * 0.22, W, (bBase - bTop) * 0.22);
      }
      // лёд
      const ice = ctx.createLinearGradient(0, bBase, 0, Hh); ice.addColorStop(0, '#D7E6F1'); ice.addColorStop(1, '#F3F8FC');
      ctx.fillStyle = ice; ctx.fillRect(0, bBase, W, Hh - bBase);
      ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.beginPath(); ctx.ellipse(W * 0.3, yI + (Hh - yI) * 0.45, W * 0.25, 10 * dpr, -0.08, 0, 7); ctx.fill();
      // линия ворот и вратарская (полукруг на льду перед воротами)
      ctx.strokeStyle = 'rgba(226,40,62,.85)'; ctx.lineWidth = 2.5 * dpr; ctx.beginPath(); ctx.moveTo(0, yI); ctx.lineTo(W, yI); ctx.stroke();
      const crR = 1.83 * mpx, crY = crR * 0.32;
      ctx.fillStyle = 'rgba(70,150,235,.42)'; ctx.strokeStyle = 'rgba(226,40,62,.9)'; ctx.lineWidth = 2 * dpr;
      ctx.beginPath(); ctx.ellipse(W / 2, yI, crR, crY, 0, 0, Math.PI); ctx.fill(); ctx.stroke();
      // ворота: задняя рама, сетка, боковины
      const fl = toPx(-P.GOAL.half, 0), fr = toPx(P.GOAL.half, 0), tl = toPx(-P.GOAL.half, P.GOAL.h), tr = toPx(P.GOAL.half, P.GOAL.h);
      const dk = persp(1.12), bY = atDepth(1.12), bl = { x: W / 2 - P.GOAL.half * mpx * dk, y: bY }, br = { x: W / 2 + P.GOAL.half * mpx * dk, y: bY };
      const tY = tl.y + (bY - fl.y) * 0.25;
      ctx.fillStyle = 'rgba(255,255,255,.14)';
      ctx.beginPath(); ctx.moveTo(bl.x, bl.y); ctx.lineTo(br.x, br.y); ctx.lineTo(tr.x, tY); ctx.lineTo(tl.x, tY); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1 * dpr;
      for (let i = 0; i <= 12; i++) { const k = i / 12; ctx.beginPath(); ctx.moveTo(bl.x + (br.x - bl.x) * k, bl.y); ctx.lineTo(tl.x + (tr.x - tl.x) * k, tY); ctx.stroke(); }
      for (let i = 0; i <= 7; i++) { const k = i / 7; const y1 = bl.y + (tY - bl.y) * k; ctx.beginPath(); ctx.moveTo(bl.x + (tl.x - bl.x) * k, y1); ctx.lineTo(br.x + (tr.x - br.x) * k, y1); ctx.stroke(); }
      for (const [f0, b0] of [[fl, bl], [fr, br]]) {
        ctx.beginPath(); ctx.moveTo(f0.x, f0.y); ctx.lineTo(b0.x, b0.y); ctx.lineTo(b0.x, tY); ctx.lineTo(f0.x === fl.x ? tl.x : tr.x, tl.y); ctx.closePath();
        ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fill(); ctx.stroke();
      }
      ctx.strokeStyle = '#C81E2E'; ctx.lineWidth = 3 * dpr; ctx.beginPath(); ctx.moveTo(bl.x, bl.y); ctx.lineTo(br.x, br.y); ctx.stroke();
      // рама ворот (трубы) — за вратарём
      ctx.strokeStyle = '#E2283E'; ctx.lineWidth = Math.max(5 * dpr, 2 * P.POST_R * mpx); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(fl.x, fl.y); ctx.lineTo(tl.x, tl.y); ctx.lineTo(tr.x, tr.y); ctx.lineTo(fr.x, fr.y); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.lineWidth = 1.5 * dpr; ctx.beginPath(); ctx.moveTo(tl.x + 3 * dpr, tl.y - 1.5 * dpr); ctx.lineTo(tr.x - 3 * dpr, tr.y - 1.5 * dpr); ctx.stroke();
      const polyF = (pts, fill, stroke) => {
        ctx.beginPath(); pts.forEach((p, i) => { const q = toPx(p.u, p.v); i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); }); ctx.closePath();
        ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = stroke; ctx.lineWidth = 1.5 * dpr; ctx.stroke();
      };
      // летящая шайба: если гол и она уже за вратарём — рисуем до него (вратарь её перекрывает)
      const drawFlight = () => {
        if (!opts.puck) return;
        const end = toPx(opts.puck.u, Math.max(0, opts.puck.v)), st = { x: W / 2 + (pro ? 0 : 0), y: Hh * 0.88 };
        const k = opts.puck.k ?? 1, q = { x: st.x + (end.x - st.x) * k, y: st.y + (end.y - st.y) * k };
        const r = Math.max(3.5 * dpr, (1 - k) * 18 * dpr + k * 0.038 * mpx * 1.6);
        ctx.fillStyle = 'rgba(5,10,16,.18)'; ctx.beginPath(); ctx.ellipse(q.x, q.y + r * 0.9, r * 1.2, r * 0.35, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#0A0D12'; ctx.beginPath(); ctx.ellipse(q.x, q.y, r, r * 0.55, 0, 0, 7); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.beginPath(); ctx.ellipse(q.x - r * 0.25, q.y - r * 0.15, r * 0.45, r * 0.14, 0, 0, 7); ctx.fill();
      };
      if (opts.behind) drawFlight();
      drawGoalie(sil, opts.part);
      // заслон (наш, спиной к нам) и защитник (соперник, лицом к нам) — рисунками в прямоугольнике тела по модели
      for (const o of others()) {
        const body = o.parts.find(q => q.id === 'body');
        const img = skaterImage(o.who === 'screen' ? 'us' : 'them', o.who === 'screen' ? 'back' : 'front'), M = META.skater;
        if (!body || !imgReady(img)) { for (const p of o.parts) polyF(p.pts, o.who === 'screen' ? 'rgba(27,63,122,.92)' : 'rgba(212,42,60,.88)', '#0B1C2E'); continue; }
        const us = body.pts.map(q => q.u), vs = body.pts.map(q => q.v);
        const top = toPx((Math.min(...us) + Math.max(...us)) / 2, Math.max(...vs)), bot = toPx((Math.min(...us) + Math.max(...us)) / 2, Math.min(...vs));
        const sc = (bot.y - top.y) / 560;
        ctx.fillStyle = 'rgba(20,40,70,.25)'; ctx.beginPath(); ctx.ellipse(bot.x, bot.y, 140 * sc, 22 * sc, 0, 0, 7); ctx.fill();
        ctx.drawImage(img, bot.x - M.ax * sc, bot.y - M.ay * sc, M.w * sc, M.h * sc);
      }
      // состояние вратаря
      if (!opts.puck) {
        const col = gState === 'готов' ? '#FF4D6A' : '#2EE59D';
        ctx.font = `800 ${11 * dpr}px Manrope, sans-serif`; ctx.textAlign = 'left';
        ctx.fillStyle = 'rgba(4,8,14,.6)'; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(10 * dpr, 10 * dpr, 150 * dpr, 22 * dpr, 11 * dpr) : ctx.rect(10 * dpr, 10 * dpr, 150 * dpr, 22 * dpr); ctx.fill();
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(22 * dpr, 21 * dpr, 4 * dpr, 0, 7); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.fillText('Вратарь: ' + gState, 32 * dpr, 25 * dpr);
      }
      if (opts.trail) {
        ctx.strokeStyle = 'rgba(51,200,234,.85)'; ctx.lineWidth = 2.5 * dpr; ctx.beginPath();
        opts.trail.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y))); ctx.stroke();
      }
      if (opts.aim && opts.finger) {
        const q = toPx(opts.aim.u, opts.aim.v);
        ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 1.5 * dpr; ctx.setLineDash([3 * dpr, 3 * dpr]);
        ctx.beginPath(); ctx.moveTo(opts.finger.x * dpr, opts.finger.y * dpr); ctx.lineTo(q.x, q.y); ctx.stroke(); ctx.setLineDash([]);
      }
      if (opts.aim) reticle(opts.aim, opts.f, opts.drift || 0, opts.ring);
      if (opts.hit) {
        const q = toPx(opts.aim.u, opts.aim.v), r2 = toPx(opts.hit.u, Math.max(0, opts.hit.v));
        ctx.setLineDash([4 * dpr, 4 * dpr]); ctx.strokeStyle = 'rgba(9,24,39,.75)'; ctx.lineWidth = 1.8 * dpr;
        ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(r2.x, r2.y); ctx.stroke(); ctx.setLineDash([]);
      }
      if (!opts.behind) drawFlight();
      // своя клюшка и шайба на крюке (до броска)
      ownStick(!opts.puck);
    }

    /* Своя клюшка снизу кадра: на стороне хвата из профиля; шайба у крюка, пока не бросил. */
    function ownStick(withPuck) {
      const W = face.width, Hh = face.height, hand = state.profile.hand || 'L', hs = hand === 'L' ? 1 : -1;
      const px = W / 2, py = Hh * 0.9;
      const img = ownStickImage(hand);
      if (imgReady(img)) {
        // своя перчатка и клюшка (картинка 1024 × 512): середина крюка у левого хвата — (0,36; 0,85), у правого — зеркально;
        // крюк ложится под шайбу, перчатка с рукавом уходит в нижний угол
        const iw = W * 1.05, ih = iw / 2, bx = hs > 0 ? 0.33 : 0.67;
        ctx.drawImage(img, px - bx * iw, py + 6 * dpr - 0.85 * ih, iw, ih);
      } else {
        const heel = { x: px - hs * W * 0.24, y: Hh * 0.985 }, toe = { x: px - hs * W * 0.065, y: Hh * 0.925 };
        ctx.lineCap = 'round'; ctx.strokeStyle = '#14171C'; ctx.lineWidth = 15 * dpr;
        ctx.beginPath(); ctx.moveTo(px - hs * W * 0.78, Hh * 0.6); ctx.lineTo(heel.x, heel.y); ctx.lineTo(toe.x, toe.y); ctx.stroke();
      }
      if (withPuck) {
        const r = 18 * dpr;
        ctx.fillStyle = 'rgba(5,10,16,.18)'; ctx.beginPath(); ctx.ellipse(px, py + r * 0.6, r * 1.3, r * 0.4, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#0A0D12'; ctx.beginPath(); ctx.ellipse(px, py, r, r * 0.5, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#23272E'; ctx.fillRect(px - r, py - r * 0.5, r * 2, r * 0.45);
        ctx.fillStyle = '#0A0D12'; ctx.beginPath(); ctx.ellipse(px, py - r * 0.5, r, r * 0.5, 0, 0, 7); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.beginPath(); ctx.ellipse(px - r * 0.3, py - r * 0.6, r * 0.45, r * 0.15, 0, 0, 7); ctx.fill();
      }
    }

    /* Вратарь — цельный рисунок (стойка или «бабочка»), без растяжек: пропорции головы, корпуса и щитков
       всегда как у человека. Ставится коньками на лёд в центр корпуса по модели, рост — по высоте силуэта модели.
       Что именно перекрыто воротам по расчёту — полупрозрачная тень под рисунком; при сейве часть, которая
       дотянулась (ловушка, блин, щиток), обводится пунктиром там, где её остановила модель. */
    let lastGx = null;
    function drawGoalie(sil, partShift) {
      const box = (p, sh) => {
        const us = p.pts.map(q => q.u + (sh ? sh.u : 0)), vs = p.pts.map(q => q.v + (sh ? sh.v : 0));
        const a = toPx(Math.min(...us), Math.max(...vs)), b = toPx(Math.max(...us), Math.min(...vs));
        return { x: a.x, y: a.y, w: Math.max(2, b.x - a.x), h: Math.max(2, b.y - a.y) };
      };
      const shiftOf = p => (partShift && partShift.id === p.id ? partShift : null);
      const all = sil.map(p => box(p));
      const minX = Math.min(...all.map(b => b.x)), maxX = Math.max(...all.map(b => b.x + b.w));
      const topY = Math.min(...all.map(b => b.y)), baseY = Math.max(...all.map(b => b.y + b.h));
      // закрытая часть ворот по модели
      ctx.fillStyle = 'rgba(212,42,60,.14)';
      for (const p of sil) {
        const sh = shiftOf(p);
        ctx.beginPath(); p.pts.forEach((q, i) => { const pp = toPx(q.u + (sh ? sh.u : 0), q.v + (sh ? sh.v : 0)); i ? ctx.lineTo(pp.x, pp.y) : ctx.moveTo(pp.x, pp.y); }); ctx.closePath(); ctx.fill();
      }
      const fly = sil.some(q => q.id === 'pads');
      const body = sil.find(q => q.id === 'body'), bb = body ? box(body) : null;
      const cx = bb ? bb.x + bb.w / 2 : (minX + maxX) / 2;
      // поза: сейв той частью, что дотянулась → смещение → разворот к броску сбоку → стойка / бабочка
      let pose = fly ? 'butterfly' : 'stand';
      const lat = Math.atan2(S.x, P.GOAL.y - S.y) * 180 / Math.PI;      // >0 — бросок справа для смотрящего
      const moving = lastGx != null && Math.abs(cx - lastGx) > 0.5 * dpr ? Math.sign(cx - lastGx) : 0;
      lastGx = cx;
      if (partShift) {
        const id = partShift.id;
        pose = id === 'glove' ? 'glove' : id === 'blocker' ? 'blocker'
          : (id === 'pads' || id === 'legL' || id === 'legR') && partShift.u < 0 ? 'padL' : pose;
      } else if (moving > 0 && gState !== 'готов') pose = 'pushR';
      else if (!fly && lat > 50) pose = 'q3r2';
      else if (!fly && lat > 22) pose = 'q3r';
      const img = goaliePoseImage(pose), M = META.goalie;
      // масштаб: пикселей на метр на глубине вратаря (как у модели), картинка — 300 единиц на метр
      const ppm = mpx * (body ? body.scale : 1), sc = ppm / GOALIE_UPM;
      ctx.fillStyle = 'rgba(20,40,70,.28)'; ctx.beginPath(); ctx.ellipse(cx, baseY, 0.75 * ppm, 0.07 * ppm, 0, 0, 7); ctx.fill();
      if (imgReady(img)) ctx.drawImage(img, cx - M.ax * sc, baseY - M.ay * sc, M.w * sc, M.h * sc);
      if (partShift) for (const p of sil.filter(q => q.id === partShift.id)) {
        ctx.setLineDash([5 * dpr, 4 * dpr]); ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = 2 * dpr;
        ctx.beginPath(); p.pts.forEach((q, i) => { const pp = toPx(q.u + partShift.u, q.v + partShift.v); i ? ctx.lineTo(pp.x, pp.y) : ctx.moveTo(pp.x, pp.y); }); ctx.closePath(); ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    /* Прицел: крест в точке прицеливания, эллипс — куда реально уйдёт 9 бросков из 10 при этой силе.
       В профи вокруг креста кольцо силы. В движении у новичка эллипс сдвинут на снос. */
    function reticle(p, f, drift, ring) {
      const k = kOf(f), sd = sdOf(k);
      const q = toPx(p.u, p.v), c = toPx(p.u + drift, p.v);
      if (sd > 0.001) { // разброс исполнения — только в «Профи»
        ctx.fillStyle = 'rgba(51,200,234,.16)'; ctx.strokeStyle = 'rgba(51,200,234,.6)'; ctx.lineWidth = 1.5 * dpr;
        ctx.beginPath(); ctx.ellipse(c.x, c.y, Math.max(3, 2 * sd * mpx), Math.max(3, 1.6 * sd * mpx), 0, 0, 7); ctx.fill(); ctx.stroke();
      }
      const R = 17 * dpr;
      ctx.strokeStyle = 'rgba(9,24,39,.55)'; ctx.lineWidth = 6 * dpr; ctx.beginPath(); ctx.arc(q.x, q.y, R, 0, 7); ctx.stroke();
      ctx.strokeStyle = '#33C8EA'; ctx.lineWidth = 3.5 * dpr; ctx.beginPath(); ctx.arc(q.x, q.y, R, 0, 7); ctx.stroke();
      ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.arc(q.x, q.y, 3.5 * dpr, 0, 7); ctx.fill();
      ctx.strokeStyle = '#33C8EA'; ctx.lineWidth = 1.5 * dpr; ctx.beginPath(); ctx.arc(q.x, q.y, 3.5 * dpr, 0, 7); ctx.stroke();
      if (ring) {
        const R2 = R + 9 * dpr, col = powerColor(f);
        ctx.strokeStyle = 'rgba(255,255,255,.3)'; ctx.lineWidth = 5 * dpr; ctx.beginPath(); ctx.arc(q.x, q.y, R2, 0, 7); ctx.stroke();
        ctx.strokeStyle = col; ctx.beginPath(); ctx.arc(q.x, q.y, R2, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2); ctx.stroke();
        ctx.font = `800 ${13 * dpr}px Unbounded, sans-serif`; ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(9,24,39,.8)'; ctx.lineWidth = 4 * dpr;
        ctx.strokeText(Math.round(k) + ' км/ч', q.x, q.y - R2 - 8 * dpr); ctx.fillText(Math.round(k) + ' км/ч', q.x, q.y - R2 - 8 * dpr);
      }
    }

    // сила копится до максимума за 0,9 с и держится — без «ловли» качающегося индикатора
    const grow = sec => Math.min(1, sec / 0.9);
    const curF = () => (pro ? (charge ? grow(now() - charge.t) : 0) : power);
    const driftPreview = f => (vx && aim ? P.DRIFT * vx * P.flightTime(S, aim, kOf(f) / 3.6) : 0);

    function status() {
      if (phase !== 'aim') return;
      if (!ready) live$.textContent = sc.passAt ? 'Пас идёт… готовь клюшку' : 'Бросок от синей…';
      else if (pro) live$.textContent = charge ? `${Math.round(kOf(curF()))} км/ч · разброс ±${Math.round(sdOf(kOf(curF())) * 200)} см` : 'Зажми точку в воротах, отпусти — бросок';
      else live$.textContent = aim ? (sc.passAt || sc.saveAt ? 'Бросай в касание!' : 'Прицел есть — бросай') : 'Нажми точку в воротах';
      if (shootBtn) shootBtn.disabled = !aim;
    }

    const loop = () => {
      if (!live || phase !== 'aim') return;
      step(now());
      drawMap();
      const f = curF();
      frame(goalieSil(), aim ? { aim, f, drift: driftPreview(f), ring: pro && !!charge, finger: pro && charge ? finger : null } : {});
      if (pro && charge) status();
      requestAnimationFrame(loop);
    };

    // ввод
    face.style.touchAction = 'none';
    face.addEventListener('pointerdown', ev => {
      if (phase !== 'aim') return;
      aim = pro ? toUV(ev.offsetX, ev.offsetY - LIFT) : toUV(ev.offsetX, ev.offsetY);
      if (pro) { charge = { t: now() }; finger = { x: ev.offsetX, y: ev.offsetY }; face.setPointerCapture(ev.pointerId); }
      status();
    });
    face.addEventListener('pointermove', ev => { if (pro && charge && phase === 'aim') { aim = toUV(ev.offsetX, ev.offsetY - LIFT); finger = { x: ev.offsetX, y: ev.offsetY }; } });
    // ранний ввод: нажал чуть раньше прихода шайбы — бросок выполнится в момент приёма (буфер 0,35 с)
    let pending = null;
    function firePending() {
      if (!pending || phase !== 'aim') return;
      const p = pending; pending = null;
      if (now() - p.t <= 0.35) shoot(p.aim, p.f);
      else { toast(sc.passAt ? 'Рано: шайба ещё не пришла' : 'Рано: шайба ещё у вратаря'); status(); }
    }
    const tryShoot = (a, f) => {
      if (ready) return shoot(a, f);
      pending = { aim: a, f, t: now() };
    };
    const release = () => {
      if (!pro || !charge || phase !== 'aim') return;
      const f = curF(); charge = null;
      tryShoot(aim, f);
    };
    face.addEventListener('pointerup', release);
    face.addEventListener('pointercancel', () => { charge = null; });

    live = true; status(); requestAnimationFrame(loop);

    async function shoot(aimP, f) {
      phase = 'flight';
      const k = kOf(f), speedMs = k / 3.6;
      const notSet = unset();
      const sil = goalieSil();
      const seed = (Math.random() * 2 ** 32) >>> 0, rng = P.rngFrom(seed);
      let target = mult ? P.scatter(aimP, (k - minK) / (150 - minK), rng, mult) : { ...aimP };
      const drift = vx ? P.DRIFT * vx * P.flightTime(S, target, speedMs) : 0;
      target = { u: target.u + drift, v: target.v };
      let delay = notSet ? P.TRACK.notSet : 0;
      let screened = false;
      if (sc.screen) {
        const sp = P.project(S, { ...sc.screen, h: 1 });
        if (Math.abs(target.u - sp.u) < 0.75) { delay += P.TRACK.screen; screened = true; }
      }
      const r = P.resolveShot({ S, target, speedMs, goalie: { sil, level: set.level, delay }, others: others(), rng });
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
      const gFrac = 1 / Math.max(1, (sil[0] && sil[0].scale) || 1); // доля пути до плоскости вратаря
      const isGoal = r.result === 'goal';
      await tween(dur, kk => {
        const pu = { u: target.u, v: target.v, k: kk };
        const ps = shift && kk > startT ? { id: shift.id, u: shift.du * Math.min(1, (kk - startT) / (1 - startT)), v: shift.dv * Math.min(1, (kk - startT) / (1 - startT)) } : null;
        frame(sil, { aim: aimP, f, part: ps, puck: pu, behind: isGoal && kk > gFrac });
      }, ease.linear);
      frame(sil, { aim: aimP, f, part: shift ? { id: shift.id, u: shift.du, v: shift.dv } : null, puck: { u: target.u, v: target.v, k: 1 }, hit: target, behind: isGoal });
      phase = 'done';
      // повтор: та же траектория втрое медленнее, со следом шайбы и движением той части вратаря, что встретила шайбу
      const replay = async () => {
        const trail = [];
        const end = toPx(target.u, Math.max(0, target.v)), st = { x: face.width / 2, y: face.height * 0.88 };
        await tween(dur * 3, kk => {
          const pu = { u: target.u, v: target.v, k: kk };
          trail.push({ x: st.x + (end.x - st.x) * kk, y: st.y + (end.y - st.y) * kk });
          const ps = shift && kk > startT ? { id: shift.id, u: shift.du * Math.min(1, (kk - startT) / (1 - startT)), v: shift.dv * Math.min(1, (kk - startT) / (1 - startT)) } : null;
          frame(sil, { aim: aimP, f, part: ps, puck: pu, trail, behind: isGoal && kk > gFrac });
        }, ease.linear);
        frame(sil, { aim: aimP, f, part: shift ? { id: shift.id, u: shift.du, v: shift.dv } : null, puck: { u: target.u, v: target.v, k: 1 }, hit: target, trail, behind: isGoal });
      };
      const goal = r.result === 'goal';
      // три отдельные оценки: решение (была ли выбранная точка голевой при точном исполнении),
      // исполнение (насколько попал в прицел), исход (что случилось)
      const ideal = P.resolveShot({ S, target: aimP, speedMs, goalie: { sil, level: set.level, delay }, others: others(), rng: () => 0.5 });
      const decision = ideal.result === 'goal';
      const execErr = Math.hypot(target.u - aimP.u, target.v - aimP.v);
      const executed = execErr <= 0.06;
      results.push(goal);
      if (ended) return;
      logItem(session, { mode: mode.id, ctrl: pro ? 'pro' : 'novice', level: set.level, principle: mode.principle, verdict: decision ? 'best' : 'bad', decision, executed, goal, result: r.result, kmh: Math.round(k), timeMs: 0,
        seed, S: [+S.x.toFixed(1), +S.y.toFixed(1)], aim: [+aimP.u.toFixed(2), +aimP.v.toFixed(2)], target: [+target.u.toFixed(2), +target.v.toFixed(2)] });
      live$.textContent = { goal: 'Гол', save: 'Сейв', post: 'Штанга', miss: 'Мимо', blocked: 'Блок' }[r.result] + ` · ${Math.round(k)} км/ч`;
      pre.textContent = { goal: 'ГОЛ', save: 'СЕЙВ', post: 'ШТАНГА', miss: 'МИМО', blocked: 'БЛОК' }[r.result];
      pre.className = 'pre-val ' + (goal ? 'g' : 'n');
      preBox.firstChild.textContent = 'Результат';
      replayBtn.disabled = false; replayBtn.onclick = replay;
      const nextBtn = h('button.btn.primary.shot-go', { onclick: round }, results.length < SHOTS ? 'Дальше' : 'Итоги');
      if (shootBtn) shootBtn.replaceWith(nextBtn); else replayBtn.after(nextBtn);
      const miss = Math.round(Math.hypot(target.u - aimP.u, target.v - aimP.v) * 100);
      hud.innerHTML = '';
      hud.append(h('span.shot-res.' + (goal ? 'g' : 'n'), { goal: 'ГОЛ', save: 'СЕЙВ', post: 'ШТАНГА', miss: 'МИМО', blocked: 'БЛОК' }[r.result]),
        h('span.muted', ` ${Math.round(k)} км/ч · полёт ${r.T.toFixed(2)} с`),
        h('p.aim-line', `Прицел ✕ → попадание ● : ${miss} см${drift ? ` (из них снос в движении ${Math.round(Math.abs(drift) * 100)} см)` : ''}. ${mult ? `Разброс исполнения на этой силе ±${Math.round(sdOf(k) * 200)} см.` : 'Без случайного разброса.'}`),
        h('div.shot-eval',
          h('span', { class: decision ? 'ok' : 'no' }, h('b', 'Решение'), decision ? 'точка была голевой' : ideal.result === 'miss' || ideal.result === 'post' ? 'прицел вне створа' : ideal.result === 'blocked' ? 'в линии защитника' : 'вратарь успевал туда'),
          h('span', { class: executed ? 'ok' : 'no' }, h('b', 'Исполнение'), executed ? 'точно в прицел' : `мимо прицела на ${Math.round(execErr * 100)} см`),
          h('span', { class: goal ? 'ok' : 'no' }, h('b', 'Исход'), { goal: 'гол', save: 'сейв', post: 'штанга', miss: 'мимо', blocked: 'блок' }[r.result])),
        h('p.explain', { style: { margin: '6px 0 0' } }, explainShot(r, sc, mode, { notSet, screened })),
        null);
      setTimeout(() => hud.scrollIntoView({ behavior: 'smooth', block: 'end' }), 50);
    }
  }

  function finish() {
    live = false;
    if (!ended) { ended = true; finishSession(session); }
    const g = results.filter(Boolean).length;
    inner.innerHTML = '';
    inner.append(h('div.play-top', h('button.x', { onclick: close }, icon('close'))),
      h('div.final', h('div.q-meta', mode.name), h('div.big', `${g}/${SHOTS}`), h('div.muted', 'голов'),
        h('p', { style: { margin: '18px 0' } }, mode.line),
        h('div.row', { style: { marginTop: '24px' } }, h('button.btn.grow', { onclick: () => { close(); runGame(mode, set, rerender); } }, 'Ещё раз'), h('button.btn.primary.grow', { onclick: close }, 'Готово'))));
  }

  round();
}

const powerColor = f => (f < 0.45 ? '#2EE59D' : f < 0.75 ? '#FFC53D' : '#FF4D6A');

function explainShot(r, sc, mode, { notSet, screened }) {
  if (r.result === 'miss') return 'Мимо створа. Смотри на кружок: если он вылезает за штангу или перекладину, часть бросков уйдёт мимо. Целься глубже в створ или бросай чуть слабее.';
  if (r.result === 'post') return 'Штанга! Совсем чуть-чуть — целься на ширину шайбы внутрь.';
  if (r.result === 'blocked') return r.by === 'screen' ? 'Попал в своего на пятаке. Бросай в коридор рядом с заслоном.' : 'Шайба в защитника. Протяни шайбу в сторону — выйди из его линии и бросай.';
  const part = { glove: 'ловушка', blocker: 'блин', pads: 'щитки', body: 'корпус', head: 'корпус', legL: 'щиток', legR: 'щиток', stick: 'клюшка' }[r.part] || 'вратарь';
  const why = [notSet ? 'вратарь ещё ехал и не встал на угол' : null, screened ? 'заслон закрыл ему выпуск' : null].filter(Boolean).join(', ');
  if (r.result === 'save' && r.reason === 'body') return `Прямо в вратаря. ${sc.stance === 'butterfly' ? 'В бабочке он закрывает низ — верх открыт.' : 'В стойке открыты низ и между щитков.'}${mode.id === 'rebound' || mode.id === 'move' ? ' Бросай в дальнюю от него сторону.' : ''}`;
  const reached = part === 'ловушка' || part === 'клюшка' ? 'дотянулась' : part === 'щитки' ? 'дотянулись' : 'дотянулся';
  if (r.result === 'save') return `Успел: ${part} ${reached}. До встречи с ним шайба летела ${(r.tc ?? r.T).toFixed(2)} с, на реакцию ушло ${r.reaction.toFixed(2)} с. Дальше от его рук и щитков — или быстрее выпуск.`;
  const left = r.left ?? Math.max(0, r.T - r.reaction);
  return `Вратарю не хватило ${(r.need - r.reach).toFixed(2)} м: за ${left.toFixed(2)} с ${part} не ${reached}${why ? ` — ${why}` : ''}.`;
}

/* ---------------- Как считается ---------------- */
function model(view) {
  const lv = Object.values(P.LEVELS).map(l => `${l.name} — ${Math.round(l.reaction * 1000)} мс`).join(', ');
  const block = (title, rows) => h('div.panel.model', h('b', title), h('ul', rows.map(r => h('li', r))));
  view.append(
    h('p.lead', 'Игра — тренажёр геометрии и времени, а не предсказание настоящего броска. Здесь честно: что посчитано точно, что взято приближённо и чего в модели нет.'),
    block('Точно (геометрия)', [
      'Ворота 1,83 × 1,22 м, шайба 7,6 см. Площадка 60 × 30, ворота в 4 м от борта.',
      'Рама ворот — трубы толщиной 6 см. Гол, только если шайба целиком прошла внутри рамы; задела трубу — штанга.',
      'Видимый угол и закрытая часть ворот: силуэт вратаря проецируется на створ лучами из точки броска. Вышел ближе — закрыл больше.',
      'Время полёта = расстояние ÷ скорость. Шайба летит по прямой с постоянной скоростью.',
    ]),
    block('Приближённо (из публичных данных и тренерской практики)', [
      `Реакция вратаря: ${lv}; плюс случайные ±30 мс. Уровни — учебные настройки, а не модель реального вратаря определённой лиги.`,
      'Скорость рук и щитков: ловушка быстрее всего, корпус медленнее всего; смещение в бабочке и приставным шагом — около 2,4 м/с, из положения после сейва — 1,7 м/с.',
      'Силуэты «бабочка» и «стойка» — прямоугольники по размерам взрослого вратаря. Детский вратарь меньше — открыто больше, особенно верх.',
      `Разброс растёт с силой: ±${Math.round(P.spread(0) * 200)} см на 40 км/ч, ±${Math.round(P.spread((95 - 40) / 110) * 200)} см на 95, ±${Math.round(P.spread(1) * 200)} см на 150. Это разброс исполнения в режиме «Профи»; в «Новичке» его нет — шайба летит точно в прицел. У каждого броска свой номер: одинаковые условия дают одинаковый результат.`,
      `Заслон: если шайба проходит рядом с партнёром, вратарь видит выпуск на ${Math.round(P.TRACK.screen * 1000)} мс позже.`,
      `Вратарь не встал на угол (ещё едет) — плюс ${Math.round(P.TRACK.notSet * 1000)} мс к реакции.`,
      `Бросок в движении (${P.SKATE} м/с поперёк слота): прицел — это точка, куда хочешь попасть. Поправку на собственное движение руки делают сами, поэтому снос в игре не добавляется. Сложность режима — вратарь, который догоняет угол.`,
      'Время на реакцию вратаря считается до встречи шайбы с ним, а не до линии ворот: вышедший вперёд вратарь получает меньше времени.',
    ]),
    block('Не учитывается', [
      'Подставление клюшки и рикошеты, кроме блока защитником.',
      'Как вратарь читает корпус и клюшку бросающего, обманные движения, бросок «через ногу» защитника.',
      'Вращение и «парусность» шайбы, торможение о воздух, подскок на льду.',
      'Техника самого броска: перенос веса, прогиб клюшки, точка выпуска — это лёд и тренер.',
    ]),
    h('div.panel.model', h('b', 'Проверь на льду'),
      h('p.muted.small', { style: { margin: '6px 0 0' } }, 'По 10 бросков из трёх точек (слот, круг, синяя) в мишени по углам. Сравни, где получалось лучше, с тем, что показывает «Геометрия». Если на льду иначе — значит, детали техники важнее геометрии, и это повод для разговора с тренером.')));
}
