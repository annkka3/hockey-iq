/* Рендер карточки: площадка, игроки, шайба, стрелки, зоны ответа. SVG в метрах.
   Сцена получает карточку и профиль площадки, ничего не знает о прогрессе и аккаунтах. */
import { RINKS, mapPoint, viewWindow, toScreen, fromScreen, boardsPath, dist } from './rink.js';
import { tween, lerp, ease } from './anim.js';

const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, parent) => {
  const n = document.createElementNS(NS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(n);
  return n;
};

let uid = 0;

/* Подписи на фишках: свои — по амплуа, у соперников подписан только вратарь. */
export const LABELS = { C: 'Ц', LW: 'ЛН', RW: 'ПН', LD: 'ЛЗ', RD: 'ПЗ', G: 'ВР', F: '', D: '' };

/* Разметка площадки (статичная). */
export function drawRink(g, r, id) {
  const { W, L } = r;
  el('path', { d: boardsPath(r), class: 'ice' }, g);
  const clip = el('clipPath', { id: `clip-${id}` }, g);
  el('path', { d: boardsPath(r) }, clip);
  const m = el('g', { 'clip-path': `url(#clip-${id})` }, g);
  // зоны: лёгкий тон, чтобы отличать свою, нейтральную и чужую
  el('rect', { x: -W / 2, y: 0, width: W, height: r.blue, class: 'zone-tint' }, m);
  el('rect', { x: -W / 2, y: L - r.blue, width: W, height: r.blue, class: 'zone-tint' }, m);
  for (const y of [r.goalLine, L - r.goalLine]) el('line', { x1: -W / 2, x2: W / 2, y1: y, y2: y, class: 'goal-line' }, m);
  for (const y of [r.blue, L - r.blue]) el('rect', { x: -W / 2, y: y - 0.15, width: W, height: 0.3, class: 'blue-line' }, m);
  el('rect', { x: -W / 2, y: L / 2 - 0.15, width: W, height: 0.3, class: 'red-line' }, m);
  el('circle', { cx: 0, cy: L / 2, r: r.circleR, class: 'center-circle' }, m);
  el('circle', { cx: 0, cy: L / 2, r: 0.15, class: 'dot-blue' }, m);
  for (const sy of [r.goalLine + r.dotOut, L - r.goalLine - r.dotOut]) {
    for (const sx of [-r.dotSide, r.dotSide]) {
      el('circle', { cx: sx, cy: sy, r: r.circleR, class: 'fo-circle' }, m);
      el('circle', { cx: sx, cy: sy, r: 0.3, class: 'dot' }, m);
      for (const d of [-1, 1]) for (const s of [-1, 1]) {
        el('line', { y1: sy + d * 0.85, y2: sy + d * 0.85, x1: sx + s * r.circleR, x2: sx + s * (r.circleR + 0.6), class: 'hash' }, m);
      }
    }
  }
  for (const sy of [r.blue + r.nzDotFromBlue, L - r.blue - r.nzDotFromBlue]) {
    for (const sx of [-r.nzDotSide, r.nzDotSide]) el('circle', { cx: sx, cy: sy, r: 0.3, class: 'dot' }, m);
  }
  // вратарские и ворота: экранная y=0 — чужой торец (атака вверх)
  const crease = (gy, dir) => `M${-r.creaseR} ${gy} A${r.creaseR} ${r.creaseR} 0 0 ${dir > 0 ? 0 : 1} ${r.creaseR} ${gy} Z`;
  el('path', { d: crease(r.goalLine, 1), class: 'crease' }, m);
  el('path', { d: crease(L - r.goalLine, -1), class: 'crease' }, m);
  el('rect', { x: -r.goalW / 2, y: r.goalLine - r.goalD, width: r.goalW, height: r.goalD, rx: 0.3, class: 'net' }, m);
  el('rect', { x: -r.goalW / 2, y: L - r.goalLine, width: r.goalW, height: r.goalD, rx: 0.3, class: 'net' }, m);
  el('path', { d: boardsPath(r), class: 'boards' }, g);
}

export class Scene {
  constructor(host, card, opts = {}) {
    this.card = card;
    this.rink = RINKS[opts.rink] || RINKS.iihf;
    this.animOn = opts.anim !== false;
    this.id = ++uid;
    const r = this.rink;
    const { y0, y1 } = viewWindow(card.view || 'full', r);
    const pad = 0.8;
    const top = r.L - y1, h = y1 - y0;
    this.tok = Math.max(1.3, Math.min(1.9, h / 22)); // фишки крупнее реального размера — чтобы читались на телефоне; на больших видах ещё крупнее
    this.hand = opts.hand || 'L';
    this.svg = el('svg', {
      viewBox: `${-r.W / 2 - pad} ${top - pad} ${r.W + pad * 2} ${h + pad * 2}`,
      class: 'rink-svg', role: 'img', 'aria-label': card.title || 'Ситуация на льду',
    });
    const defs = el('defs', {}, this.svg);
    for (const [k, cls] of [['skate', 'm-skate'], ['pass', 'm-pass'], ['shot', 'm-shot'], ['best', 'm-best']]) {
      const mk = el('marker', { id: `m-${k}-${this.id}`, viewBox: '0 0 10 10', refX: 7, refY: 5, markerWidth: 4, markerHeight: 4, orient: 'auto-start-reverse' }, defs);
      el('path', { d: 'M0 0L10 5L0 10z', class: cls }, mk);
    }
    const glow = el('filter', { id: `glow-${this.id}`, x: '-1', y: '-1', width: '3', height: '3' }, defs);
    el('feGaussianBlur', { stdDeviation: 0.45, result: 'b' }, glow);
    const merge = el('feMerge', {}, glow);
    el('feMergeNode', { in: 'b' }, merge);
    el('feMergeNode', { in: 'SourceGraphic' }, merge);

    drawRink(el('g', { class: 'rink' }, this.svg), r, this.id);
    this.lZones = el('g', { class: 'zones' }, this.svg);
    this.lTrails = el('g', { class: 'trails' }, this.svg);
    this.lArrows = el('g', { class: 'arrows' }, this.svg);
    this.lEnt = el('g', { class: 'ents' }, this.svg);
    this.lFx = el('g', { class: 'fx' }, this.svg);

    this.ents = {};
    const add = (e, team) => this.addEntity(e, team);
    (card.us || []).forEach(e => add(e, 'us'));
    (card.them || []).forEach(e => add(e, 'them'));
    if (card.puck) {
      const p = this.pt(card.puck);
      const g = el('g', { class: 'puck' }, this.lEnt);
      el('circle', { r: 0.42, class: 'puck-halo' }, g);
      el('circle', { r: 0.26, class: 'puck-core' }, g);
      this.ents.puck = { node: g, pos: p, home: p, from: card.puck.from ? this.pt({ x: card.puck.from[0], y: card.puck.from[1] }) : null, data: card.puck };
    }
    host.appendChild(this.svg);
    this.orientAll();
    this.placeAll(1);
  }

  pt(p) { return toScreen(mapPoint(p, this.rink), this.rink); }

  /* Хоккеист сверху: плечи, шлем, коньки и клюшка. Корпус повёрнут туда, куда игрок смотрит (face),
     крюк — там, где он держит клюшку (stick). Подпись — над головой, не поворачивается.
     Размер фишки растёт на крупных видах (вся площадка), чтобы на телефоне игроки не были мелкими. */
  addEntity(e, team) {
    const p = this.pt(e);
    const goalie = e.role === 'G';
    const cls = ['ent', team, goalie ? 'goalie' : '', e.me ? 'me' : ''].join(' ');
    const g = el('g', { class: cls }, this.lEnt);
    const s = el('g', { class: 'tok', transform: `scale(${this.tok})` }, g);
    if (e.me) el('circle', { r: 1.35, class: 'me-ring', filter: `url(#glow-${this.id})` }, s);
    const rot = el('g', { class: 'rot' }, s);
    let stick = null, blade = null;
    if (goalie) {
      stick = el('line', { x1: 0.15, y1: -0.45, x2: 0.35, y2: -0.85, class: 'stick' }, rot);
      blade = el('rect', { x: -0.45, y: -0.95, width: 0.9, height: 0.16, rx: 0.06, class: 'blade' }, rot);
      el('rect', { x: -0.95, y: -0.55, width: 1.9, height: 0.5, rx: 0.22, class: 'pads' }, rot);
      el('ellipse', { cx: 0, cy: 0.12, rx: 0.62, ry: 0.42, class: 'body' }, rot);
      el('circle', { cx: -0.86, cy: 0.0, r: 0.3, class: 'glove' }, rot);
      el('rect', { x: 0.62, y: -0.22, width: 0.38, height: 0.44, rx: 0.08, class: 'blocker' }, rot);
      el('circle', { cx: 0, cy: 0.02, r: 0.27, class: 'helmet mask' }, rot);
      el('path', { d: 'M-0.17 -0.12 H0.17 M-0.19 0.0 H0.19', class: 'cage' }, rot);
    } else {
      el('rect', { x: -0.36, y: -0.32, width: 0.15, height: 0.68, rx: 0.07, class: 'skate' }, rot);
      el('rect', { x: 0.2, y: -0.2, width: 0.15, height: 0.68, rx: 0.07, class: 'skate' }, rot);
      stick = el('line', { x1: -0.32, y1: -0.42, x2: -0.5, y2: -1.15, class: 'stick' }, rot);
      blade = el('rect', { x: -0.04, y: -0.08, width: 0.5, height: 0.16, rx: 0.07, class: 'blade' }, rot);
      el('ellipse', { cx: 0, cy: 0.04, rx: 0.72, ry: 0.44, class: 'body' }, rot);
      el('path', { d: 'M-0.62 0.08 Q0 0.36 0.62 0.08', class: 'trim' }, rot);
      el('circle', { cx: -0.34, cy: -0.36, r: 0.15, class: 'glove' }, rot);
      el('circle', { cx: 0.12, cy: -0.42, r: 0.15, class: 'glove' }, rot);
      el('circle', { cx: 0, cy: -0.04, r: 0.31, class: 'helmet' }, rot);
      el('path', { d: 'M-0.2 -0.22 Q0 -0.36 0.2 -0.22', class: 'visor' }, rot);
    }
    const t = el('text', { class: 'label', 'text-anchor': 'middle', y: goalie ? -1.2 : -1.05 }, s);
    t.textContent = e.me ? 'Я' : (e.label || (team === 'them' && e.role !== 'G' ? '' : LABELS[e.role] || ''));
    if (t.textContent.length > 1) t.setAttribute('class', 'label small');
    const from = e.from ? this.pt({ x: e.from[0], y: e.from[1] }) : null;
    this.ents[e.id] = { node: g, rot, stick, blade, pos: p, home: p, from, data: e, team, goalie };
  }

  /* Куда смотрит игрок (вектор в мировых координатах). */
  facingOf(en) {
    const e = en.data, me = mapPoint(e, this.rink);
    if (e.face) return { x: e.face[0], y: e.face[1] };
    const pk = this.card.puck ? mapPoint(this.card.puck, this.rink) : null;
    if (en.goalie) {
      const gy = me.y < this.rink.L / 2 ? 1 : -1;
      if (pk && (pk.y - this.rink.L / 2) * gy < 0) return { x: pk.x - me.x, y: pk.y - me.y };
      return { x: 0, y: gy };
    }
    if (e.from) { const f = mapPoint({ x: e.from[0], y: e.from[1] }, this.rink); if (Math.hypot(me.x - f.x, me.y - f.y) > 0.5) return { x: me.x - f.x, y: me.y - f.y }; }
    if (pk && Math.hypot(pk.x - me.x, pk.y - me.y) < 1.3) return { x: 0, y: en.team === 'us' ? 1 : -1 };
    if (pk) return { x: pk.x - me.x, y: pk.y - me.y };
    return { x: 0, y: en.team === 'us' ? 1 : -1 };
  }

  /* Повернуть корпус: вектор взгляда (мир) → угол SVG. Крюк: к точке stick или на сторону хвата перед собой. */
  orient(id, f, stickWorld = null) {
    const en = this.ents[id];
    if (!en || !en.rot) return;
    const L = Math.hypot(f.x, f.y) || 1, fx = f.x / L, fy = f.y / L;
    const a = Math.atan2(fx, fy);
    en.angle = a; en.faceW = { x: fx, y: fy };
    en.rot.setAttribute('transform', `rotate(${(a * 180 / Math.PI).toFixed(1)})`);
    const lefty = this.handOf(en) === 'L';
    let bx = en.goalie ? 0 : (lefty ? -0.5 : 0.5), by = en.goalie ? -0.87 : -1.15;
    if (stickWorld) {
      const sp = this.pt({ x: stickWorld[0], y: stickWorld[1] }), dx = (sp.x - en.home.x) / this.tok, dy = (sp.y - en.home.y) / this.tok;
      const c = Math.cos(a), s = Math.sin(a);
      bx = dx * c + dy * s; by = -dx * s + dy * c;
      const l = Math.hypot(bx, by), m = 1.9 / this.tok * 1.4;
      if (l > m) { bx *= m / l; by *= m / l; }
    }
    if (!en.goalie) {
      const hx = bx < 0 ? -0.32 : 0.28;
      en.stick.setAttribute('x1', hx); en.stick.setAttribute('y1', -0.42); en.stick.setAttribute('x2', bx); en.stick.setAttribute('y2', by);
      // крюк — «носком» наружу от корпуса, буквой Г к рукоятке
      const sh = Math.atan2(by + 0.42, bx - hx) * 180 / Math.PI;
      const ang = sh + (bx < 0 ? -90 : 90);
      en.blade.setAttribute('transform', `translate(${bx.toFixed(2)} ${by.toFixed(2)}) rotate(${ang.toFixed(1)})`);
    }
  }

  /* Хват: у «Я» — из профиля, у остальных — из карточки (hand), иначе устойчиво по id: ~60 % левшей, как в российском и канадском хоккее. */
  handOf(en) {
    if (en.hand) return en.hand;
    const e = en.data;
    let hnd = e.hand;
    if (!hnd && e.me) hnd = this.hand || 'L';
    if (!hnd) { let x = 7; for (const ch of (this.card.id || '') + e.id) x = (x * 31 + ch.charCodeAt(0)) >>> 0; hnd = x % 10 < 6 ? 'L' : 'R'; }
    en.hand = hnd;
    if (en.goalie && en.rot && hnd === 'R') en.rot.querySelectorAll('.glove, .blocker').forEach(n => n.setAttribute('transform', 'scale(-1 1)')); // ловушка на другой руке
    return hnd;
  }

  orientAll() {
    for (const id in this.ents) {
      const en = this.ents[id];
      if (!en.rot) continue;
      const f = this.facingOf(en);
      this.orient(id, f, en.data.stick || null);
      en.homeFace = en.faceW; en.homeStick = en.data.stick || null;
    }
  }

  place(id, p) {
    const e = this.ents[id];
    e.pos = p;
    e.node.setAttribute('transform', `translate(${p.x.toFixed(3)} ${p.y.toFixed(3)})`);
  }

  placeAll(t) {
    for (const id in this.ents) {
      const e = this.ents[id];
      const p = e.from ? { x: lerp(e.from.x, e.home.x, t), y: lerp(e.from.y, e.home.y, t) } : e.home;
      this.place(id, p);
    }
  }

  /* Подводка: 1,5 с движения от from к позициям, затем стоп-кадр, «призраки» и следы остаются. */
  async intro() {
    const moving = Object.values(this.ents).filter(e => e.from);
    for (const e of moving) {
      if (e === this.ents.puck) continue;
      el('line', { x1: e.from.x, y1: e.from.y, x2: e.home.x, y2: e.home.y, class: `trail ${e.team}` }, this.lTrails);
      const gh = e.node.cloneNode(true);
      gh.setAttribute('class', gh.getAttribute('class') + ' ghost');
      gh.setAttribute('transform', `translate(${e.from.x} ${e.from.y})`);
      this.lTrails.appendChild(gh);
    }
    if (!this.animOn || !moving.length) { this.placeAll(1); return; }
    this.placeAll(0);
    await tween(1500, t => this.placeAll(t), ease.out);
  }

  /* Нажатие по площадке → точка в авторских координатах IIHF (для сравнения с зонами). */
  onTap(cb) {
    this.svg.classList.add('tappable');
    this._tap = ev => {
      const m = this.svg.getScreenCTM();
      if (!m) return;
      const pt = this.svg.createSVGPoint();
      const src = ev.touches ? ev.touches[0] : ev;
      pt.x = src.clientX; pt.y = src.clientY;
      const s = pt.matrixTransform(m.inverse());
      const world = fromScreen(s, this.rink);
      el('circle', { cx: s.x, cy: s.y, r: 0.6, class: 'tap-mark' }, this.lFx);
      cb({ x: world.x, y: world.y, screen: s });
    };
    this.svg.addEventListener('click', this._tap);
  }

  offTap() {
    if (this._tap) this.svg.removeEventListener('click', this._tap);
    this.svg.classList.remove('tappable');
  }

  /* Выбор зоны по нажатию: ближайшая зона в радиусе (с запасом 1 м), иначе null. */
  pickZone(world, options) {
    let best = null, bd = Infinity;
    for (const o of options) {
      if (!o.zone) continue;
      const z = mapPoint(o.zone, this.rink);
      const d = dist(world, z);
      if (d <= (o.zone.r || 2.5) + 1 && d < bd) { best = o; bd = d; }
    }
    return best;
  }

  showZones(options, chosenId, verdictOf) {
    this.lZones.innerHTML = '';
    for (const o of options) {
      if (!o.zone) continue;
      const s = this.pt(o.zone);
      const v = verdictOf(o);
      const c = el('circle', { cx: s.x, cy: s.y, r: o.zone.r || 2.5, class: `zone v-${v}${o.id === chosenId ? ' chosen' : ''}` }, this.lZones);
      c.style.opacity = 0;
      tween(this.animOn ? 350 : 0, t => { c.style.opacity = t; });
    }
  }

  clearArrows() { this.lArrows.innerHTML = ''; this.lFx.innerHTML = ''; }

  /* Проиграть ходы варианта: стрелка рисуется, игрок или шайба едут по ней.
     moves: [{who, to:[x,y], kind:'skate'|'pass'|'shot', carry?:true, with?:true}] */
  async play(moves = [], style = '') {
    const steps = [];
    for (const mv of moves) {
      if (mv.with && steps.length) steps[steps.length - 1].push(mv); else steps.push([mv]);
    }
    for (const step of steps) {
      await Promise.all(step.map(mv => this.move(mv, style)));
    }
  }

  async move(mv, style) {
    const e = this.ents[mv.who];
    if (!e) return;
    const a = { ...e.pos };
    const b = this.pt({ x: mv.to[0], y: mv.to[1] });
    const kind = mv.kind || (mv.who === 'puck' ? 'pass' : 'skate');
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const shrink = mv.who === 'puck' ? 0.3 : 1.1;
    const k = len > shrink ? (len - shrink) / len : 1;
    const ex = a.x + (b.x - a.x) * k, ey = a.y + (b.y - a.y) * k;
    const sim = style === 'sim';
    const line = el('line', { x1: a.x, y1: a.y, x2: ex, y2: ey, class: `arrow a-${kind} ${style}${sim ? ' ' + (e.team || 'puck') : ''}` }, this.lArrows);
    if (!sim) line.setAttribute('marker-end', `url(#m-${style === 'best' ? 'best' : kind}-${this.id})`);
    const puck = this.ents.puck;
    const carry = mv.carry && puck;
    if (e.rot && kind === 'skate' && len > 0.8) this.orient(mv.who, { x: b.x - a.x, y: -(b.y - a.y) }); // корпус по ходу движения
    const dur = !this.animOn ? 0 : kind === 'skate' ? Math.max(500, len * 90) : kind === 'shot' ? 380 : Math.max(320, len * 35);
    if (kind === 'skate') {
      const L = Math.hypot(ex - a.x, ey - a.y);
      line.style.strokeDasharray = `${L} ${L}`;
      line.style.strokeDashoffset = L;
    } else line.style.opacity = 0;
    await tween(dur, t => {
      if (kind === 'skate') line.style.strokeDashoffset = (1 - t) * Math.hypot(ex - a.x, ey - a.y);
      else line.style.opacity = Math.min(1, t * 3);
      const p = { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
      this.place(mv.who, p);
      if (carry) this.place('puck', { x: p.x + 0.7, y: p.y - 0.7 });
    }, kind === 'skate' ? ease.inOut : ease.out);
    if (kind === 'skate') line.style.strokeDasharray = '';
  }

  /* Закрепить текущую расстановку как новый стоп-кадр (после показа продолжения в «Предскажи»). */
  commit() {
    this.clearArrows();
    for (const id in this.ents) { const en = this.ents[id]; en.home = { ...en.pos }; if (en.rot) { en.homeFace = en.faceW; en.homeStick = null; } }
  }

  /* Вернуть стоп-кадр (перед показом лучшего варианта). */
  reset() {
    this.clearArrows();
    for (const id in this.ents) { const en = this.ents[id]; this.place(id, en.home); if (en.rot && en.homeFace) this.orient(id, en.homeFace, en.homeStick); }
  }

  destroy() { if (this.onDestroy) this.onDestroy(); this.offTap(); this.svg.remove(); }
}
