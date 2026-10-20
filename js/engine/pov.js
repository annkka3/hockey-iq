/* Вид от первого лица: та же ситуация глазами «Я».
   Камера на уровне глаз (1,55 м) в точке игрока, слегка наклонена ко льду. Поле зрения ~100°:
   всё, что за плечами, не видно — чтобы увидеть, нужно повернуть голову (плечевой осмотр).
   Источник правды — Scene: позиции берутся из её сущностей каждый кадр, поэтому вид живёт
   вместе с подводкой, продолжением и ходами вариантов. На 2D-схеме рисуется конус обзора. */
import { fromScreen } from './rink.js';

const EYE = 1.6, PITCH = 0.19, FOV = 90 * Math.PI / 180, NEAR = 0.35;
const NS = 'http://www.w3.org/2000/svg';

export class Pov {
  constructor(host, scene, { onTurn } = {}) {
    this.scene = scene; this.r = scene.rink; this.onTurn = onTurn;
    this.cv = document.createElement('canvas');
    this.cv.className = 'pov-cv';
    host.prepend(this.cv);
    this.ctx = this.cv.getContext('2d');
    this.follow = false; this.heading = null; this.glance = 0; this.seen = [];
    this.cone = document.createElementNS(NS, 'path');
    this.cone.setAttribute('class', 'pov-cone');
    scene.svg.insertBefore(this.cone, scene.lEnt);
    this.perimeter = perimeter(this.r);
    this.fit();
    this._resize = () => this.fit();
    window.addEventListener('resize', this._resize);
    this.bindDrag();
    this.live = true;
    const loop = () => { if (!this.live) return; if (!this.cv.isConnected && this._drawn) { this.destroy(); return; } this.draw(); this._drawn = true; requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  fit() {
    const w = this.cv.clientWidth || 360, dpr = Math.min(2, window.devicePixelRatio || 1);
    this.cv.width = w * dpr; this.cv.height = w * 0.8 * dpr; this.cv.style.height = w * 0.8 + 'px'; // сцена крупнее: основное место на экране
    this.dpr = dpr;
  }

  bindDrag() {
    let x0 = null, h0 = 0;
    this.cv.style.touchAction = 'none';
    this.cv.addEventListener('pointerdown', e => { x0 = e.clientX; h0 = this.heading ?? 0; this.cv.setPointerCapture(e.pointerId); });
    this.cv.addEventListener('pointermove', e => {
      if (x0 == null) return;
      const dx = e.clientX - x0;
      if (Math.abs(dx) > 3) { this.follow = false; this.heading = h0 - dx / this.cv.clientWidth * FOV; if (this.onTurn) this.onTurn(); }
    });
    const up = () => { x0 = null; };
    this.cv.addEventListener('pointerup', up); this.cv.addEventListener('pointercancel', up);
    this.cv.addEventListener('dblclick', () => { this.heading = null; }); // двойное касание — вернуть взгляд по корпусу
  }

  /* Плечевой осмотр: быстрый поворот головы в сторону (dir = −1 налево, +1 направо) и обратно. */
  shoulder(dir) {
    if (this._g) return;
    this._g = true;
    const t0 = performance.now(), A = dir * 1.75; // ~100°
    const step = () => {
      const t = (performance.now() - t0) / 1000;
      this.glance = t < 0.18 ? A * (t / 0.18) : t < 0.55 ? A : t < 0.73 ? A * (1 - (t - 0.55) / 0.18) : 0;
      if (t < 0.73) requestAnimationFrame(step); else { this.glance = 0; this._g = false; }
      if (this.onTurn) this.onTurn();
    };
    requestAnimationFrame(step);
  }

  world(id) { const e = this.scene.ents[id]; return e ? fromScreen(e.pos, this.r) : null; }

  /* Начальное направление корпуса: на шайбу; если шайба у «Я» — вперёд в атаку. Угол: 0 — вверх по площадке.
     Дальше голова сама за шайбой не следит: осмотреться — задача игрока (палец или «через плечо»). */
  baseHeading(me) {
    const p = this.world('puck');
    if (!p || Math.hypot(p.x - me.x, p.y - me.y) < 2.2) return 0;
    return Math.atan2(p.x - me.x, p.y - me.y);
  }

  draw() {
    const meId = Object.keys(this.scene.ents).find(id => this.scene.ents[id].data && this.scene.ents[id].data.me);
    if (!meId) return;
    const me = this.world(meId);
    if (this.follow || this.heading == null) {
      const b = this.baseHeading(me);
      this.heading = this.heading == null ? b : this.heading + angDiff(b, this.heading) * 0.12;
    }
    const hd = this.heading + this.glance;
    const fx = Math.sin(hd), fy = Math.cos(hd), rx = Math.cos(hd), ry = -Math.sin(hd);
    const W = this.cv.width, H = this.cv.height, f = (W / 2) / Math.tan(FOV / 2), cx = W / 2, cy = H * 0.3;
    const cp = Math.cos(PITCH), sp = Math.sin(PITCH);
    // мир → камера: d — вглубь, s — вправо, u — вверх
    const cam = (x, y, z = 0) => {
      const dx = x - me.x, dy = y - me.y, dep = dx * fx + dy * fy, up = z - EYE;
      return { d: dep * cp - up * sp, s: dx * rx + dy * ry, u: dep * sp + up * cp };
    };
    const proj = c => ({ x: cx + f * c.s / c.d, y: cy - f * c.u / c.d });
    const ctx = this.ctx;

    // трибуны и лёд
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#050B14'); g.addColorStop(0.45, '#0E2238'); g.addColorStop(1, '#16314F');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const fillPoly = (pts3, fill, stroke, lw) => {
      const c = clip(pts3.map(p => cam(p[0], p[1], p[2] || 0)));
      if (c.length < 3) return;
      ctx.beginPath(); c.forEach((q, i) => { const p = proj(q); i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); }); ctx.closePath();
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw * this.dpr; ctx.stroke(); }
    };
    const line = (a, b, color, w) => {
      let A = cam(...a), B = cam(...b);
      if (A.d < NEAR && B.d < NEAR) return;
      if (A.d < NEAR) A = cut(A, B); else if (B.d < NEAR) B = cut(B, A);
      const p = proj(A), q = proj(B);
      ctx.strokeStyle = color; ctx.lineWidth = w * this.dpr; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
    };
    const r = this.r, L = r.L, Wd = r.W;
    // борта: стена высотой 1,07 м (рисуем дальние сегменты первыми)
    const per = this.perimeter;
    const walls = [];
    for (let i = 0; i < per.length; i++) {
      const a = per[i], b = per[(i + 1) % per.length];
      const m = cam((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
      walls.push({ a, b, d: m.d });
    }
    fillPoly(per.map(p => [p[0], p[1], 0]), '#EAF3F9');
    // разметка
    const band = (y, w, color) => fillPoly([[-Wd / 2, y - w], [Wd / 2, y - w], [Wd / 2, y + w], [-Wd / 2, y + w]], color);
    band(r.blue, 0.15, '#1E5BD8'); band(L - r.blue, 0.15, '#1E5BD8'); band(L / 2, 0.15, '#E2283E');
    for (const y of [r.goalLine, L - r.goalLine]) line([-Wd / 2 + 1.2, y, 0], [Wd / 2 - 1.2, y, 0], '#E2283E', 1);
    const circle = (x0, y0, R, color) => {
      for (let k = 0; k < 32; k++) {
        const a = k / 32 * 2 * Math.PI, b = (k + 1) / 32 * 2 * Math.PI;
        line([x0 + R * Math.cos(a), y0 + R * Math.sin(a), 0], [x0 + R * Math.cos(b), y0 + R * Math.sin(b), 0], color, 1.2);
      }
    };
    circle(0, L / 2, r.circleR, '#1E5BD8');
    for (const y of [r.goalLine + r.dotOut, L - r.goalLine - r.dotOut]) for (const x of [-r.dotSide, r.dotSide]) circle(x, y, r.circleR, '#E2283E');
    // вратарские и ворота
    for (const [gy, dir] of [[r.goalLine, -1], [L - r.goalLine, 1]]) {
      const cr = [];
      for (let k = 0; k <= 12; k++) { const a = Math.PI * k / 12; cr.push([Math.cos(a) * r.creaseR, gy - dir * Math.sin(a) * r.creaseR]); }
      fillPoly(cr, 'rgba(63,160,255,.35)');
      const hw = r.goalW / 2, back = gy + dir * r.goalD;
      fillPoly([[-hw, gy, 0], [hw, gy, 0], [hw, gy, r.goalH], [-hw, gy, r.goalH]], 'rgba(255,255,255,.18)');
      fillPoly([[-hw, back, 0], [hw, back, 0], [hw, gy, r.goalH], [-hw, gy, r.goalH]], 'rgba(255,255,255,.22)', 'rgba(255,255,255,.4)', 0.6);
      line([-hw, gy, 0], [-hw, gy, r.goalH], '#E2283E', 3); line([hw, gy, 0], [hw, gy, r.goalH], '#E2283E', 3); line([-hw, gy, r.goalH], [hw, gy, r.goalH], '#E2283E', 3);
    }
    walls.sort((a, b) => b.d - a.d);
    for (const w of walls) fillPoly([[w.a[0], w.a[1], 0], [w.b[0], w.b[1], 0], [w.b[0], w.b[1], 1.07], [w.a[0], w.a[1], 1.07]], '#F7FAFC', '#C9D6E2', 0.5);
    for (const w of walls) line([w.a[0], w.a[1], 1.07], [w.b[0], w.b[1], 1.07], '#E8B400', 1.5);

    // игроки и шайба — от дальних к ближним
    const items = [];
    for (const id in this.scene.ents) {
      const e = this.scene.ents[id];
      if (id === meId) continue;
      const p = fromScreen(e.pos, r), c = cam(p.x, p.y, 0);
      if (c.d < NEAR + 0.2) continue;
      items.push({ id, e, p, d: c.d });
    }
    items.sort((a, b) => b.d - a.d);
    const puckW = this.world('puck');
    let visible = 0;
    const seenNow = [];
    for (const it of items) {
      const foot = proj(cam(it.p.x, it.p.y, 0));
      if (it.id === 'puck') {
        const rr = Math.max(2 * this.dpr, 0.11 * f / it.d);
        ctx.fillStyle = '#05090F'; ctx.beginPath(); ctx.ellipse(foot.x, foot.y, rr, rr * 0.45, 0, 0, 7); ctx.fill();
        ctx.strokeStyle = 'rgba(63,215,255,.8)'; ctx.lineWidth = 1.5 * this.dpr; ctx.beginPath(); ctx.ellipse(foot.x, foot.y, rr * 2, rr * 0.9, 0, 0, 7); ctx.stroke();
        continue;
      }
      const goalie = it.e.data && it.e.data.role === 'G';
      const head = proj(cam(it.p.x, it.p.y, goalie ? 1.35 : 1.75));
      const pw = (goalie ? 1.05 : 0.62) * f / it.d;
      if (foot.x + pw * 2 < 0 || foot.x - pw * 2 > W) continue;
      visible++; seenNow.push(it.id);
      this.drawSkater(it, cam, proj, f, goalie, puckW);
    }
    // периферия: края поля зрения темнее
    const v = ctx.createLinearGradient(0, 0, W, 0);
    v.addColorStop(0, 'rgba(4,8,14,.55)'); v.addColorStop(0.12, 'rgba(4,8,14,0)'); v.addColorStop(0.88, 'rgba(4,8,14,0)'); v.addColorStop(1, 'rgba(4,8,14,.55)');
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
    this.visible = visible; this.seen = seenNow;

    // конус обзора на схеме
    const sc = this.scene.pt({ x: me.x, y: me.y });
    const Lc = 22, a1 = hd - FOV / 2, a2 = hd + FOV / 2;
    const pA = this.scene.pt({ x: me.x + Math.sin(a1) * Lc, y: me.y + Math.cos(a1) * Lc });
    const pB = this.scene.pt({ x: me.x + Math.sin(a2) * Lc, y: me.y + Math.cos(a2) * Lc });
    this.cone.setAttribute('d', `M${sc.x} ${sc.y} L${pA.x} ${pA.y} A${Lc} ${Lc} 0 0 1 ${pB.x} ${pB.y} Z`);
  }

  /* Хоккеист: корпус и плечи повёрнуты по направлению движения (или к шайбе, если стоит), наклон вперёд,
     ноги на коньках, руки на клюшке, крюк на льду с одной стороны. Боком к камере он узкий, лицом — широкий:
     по силуэту читается, куда он смотрит и куда закрыл клюшкой. */
  drawSkater(it, cam, proj, f, goalie, puckW) {
    const ctx = this.ctx, dpr = this.dpr, p = it.p;
    this.prev = this.prev || {};
    const pv = this.prev[it.id];
    let fx = 0, fy = it.e.team === 'us' ? 1 : -1;
    if (pv && Math.hypot(p.x - pv.x, p.y - pv.y) > 0.02) { fx = p.x - pv.x; fy = p.y - pv.y; }
    else if (puckW && Math.hypot(puckW.x - p.x, puckW.y - p.y) > 1.2) { fx = puckW.x - p.x; fy = puckW.y - p.y; }
    else if (pv && pv.fx != null) { fx = pv.fx; fy = pv.fy; }
    const L = Math.hypot(fx, fy) || 1; fx /= L; fy /= L;
    // плавный поворот корпуса
    if (pv && pv.fx != null) { fx = pv.fx + (fx - pv.fx) * 0.15; fy = pv.fy + (fy - pv.fy) * 0.15; const L2 = Math.hypot(fx, fy) || 1; fx /= L2; fy /= L2; }
    this.prev[it.id] = { x: p.x, y: p.y, fx, fy };
    const rx = fy, ry = -fx; // вправо от направления корпуса
    const P3 = (a, b, z) => proj(cam(p.x + fx * a + rx * b, p.y + fy * a + ry * b, z));
    const us = it.e.team === 'us';
    const jersey = us ? '#123A66' : '#D8263C', trim = us ? '#FFFFFF' : '#FFD6DC', pants = '#0A0F16';
    const lw = k => Math.max(1, k * f / it.d);
    // тень
    const c0 = P3(0, 0, 0);
    ctx.fillStyle = 'rgba(5,10,16,.2)'; ctx.beginPath(); ctx.ellipse(c0.x, c0.y, 0.55 * f / it.d, 0.14 * f / it.d, 0, 0, 7); ctx.fill();
    if (goalie) {
      const pads = [P3(0.05, -0.45, 0), P3(0.05, 0.45, 0), P3(0.05, 0.45, 0.55), P3(0.05, -0.45, 0.55)];
      poly(ctx, pads, '#F4F7FA', '#0F2D52', lw(0.03));
      poly(ctx, [P3(0, -0.32, 0.5), P3(0, 0.32, 0.5), P3(0.05, 0.3, 1.15), P3(0.05, -0.3, 1.15)], jersey, trim, lw(0.03));
      poly(ctx, [P3(0.15, -0.65, 0.55), P3(0.15, -0.38, 0.55), P3(0.15, -0.38, 0.85), P3(0.15, -0.65, 0.85)], '#F4F7FA', '#0F2D52', lw(0.02));
      poly(ctx, [P3(0.15, 0.38, 0.45), P3(0.15, 0.62, 0.45), P3(0.15, 0.62, 0.8), P3(0.15, 0.38, 0.8)], '#F4F7FA', '#0F2D52', lw(0.02));
      const hd = P3(0.05, 0, 1.3); ctx.fillStyle = '#E8EEF4'; ctx.strokeStyle = '#0F2D52'; ctx.lineWidth = lw(0.02); ctx.beginPath(); ctx.arc(hd.x, hd.y, 0.15 * f / it.d, 0, 7); ctx.fill(); ctx.stroke();
      this.label(it, P3(0.05, 0, 0.85), f);
      return;
    }
    // ноги и коньки
    const hipL = P3(0, -0.14, 0.85), hipR = P3(0, 0.14, 0.85), skL = P3(0.08, -0.2, 0.02), skR = P3(-0.12, 0.22, 0.02);
    ctx.strokeStyle = pants; ctx.lineCap = 'round'; ctx.lineWidth = lw(0.15);
    ctx.beginPath(); ctx.moveTo(hipL.x, hipL.y); ctx.lineTo(skL.x, skL.y); ctx.moveTo(hipR.x, hipR.y); ctx.lineTo(skR.x, skR.y); ctx.stroke();
    ctx.strokeStyle = '#C8D2DC'; ctx.lineWidth = lw(0.05);
    for (const [a, b] of [[0.08, -0.2], [-0.12, 0.22]]) { const s0 = P3(a - 0.15, b, 0), s1 = P3(a + 0.2, b, 0); ctx.beginPath(); ctx.moveTo(s0.x, s0.y); ctx.lineTo(s1.x, s1.y); ctx.stroke(); }
    // корпус с наклоном вперёд: таз → плечи
    const lean = 0.28;
    const sh = [P3(lean, -0.27, 1.42), P3(lean, 0.27, 1.42)], hp = [P3(0, 0.19, 0.82), P3(0, -0.19, 0.82)];
    poly(ctx, [hp[1], hp[0], sh[1], sh[0]], jersey, trim, lw(0.025));
    // клюшка: руки перед корпусом, крюк на льду слева-впереди (крюк закрывает сторону)
    const hand = P3(lean + 0.25, -0.05, 1.0), knob = P3(lean + 0.05, 0.2, 1.25), blade0 = P3(0.95, -0.42, 0.03), blade1 = P3(1.0, -0.72, 0.03);
    ctx.strokeStyle = '#2A2A2A'; ctx.lineWidth = lw(0.035);
    ctx.beginPath(); ctx.moveTo(knob.x, knob.y); ctx.lineTo(blade0.x, blade0.y); ctx.stroke();
    ctx.lineWidth = lw(0.06); ctx.beginPath(); ctx.moveTo(blade0.x, blade0.y); ctx.lineTo(blade1.x, blade1.y); ctx.stroke();
    ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(hand.x, hand.y, 0.07 * f / it.d, 0, 7); ctx.fill();
    // шлем
    const hd = P3(lean + 0.08, 0, 1.62);
    ctx.fillStyle = us ? '#0B2340' : '#9E1428'; ctx.strokeStyle = trim; ctx.lineWidth = lw(0.02);
    ctx.beginPath(); ctx.arc(hd.x, hd.y, 0.13 * f / it.d, 0, 7); ctx.fill(); ctx.stroke();
    this.label(it, P3(lean * 0.5, 0, 1.12), f);
  }

  label(it, at, f) {
    const lab = it.e.node.querySelector('text'), txt = lab ? lab.textContent : '';
    if (!txt) return;
    const ctx = this.ctx;
    ctx.font = `800 ${Math.max(9 * this.dpr, Math.min(20 * this.dpr, 0.26 * f / it.d))}px Manrope, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff'; ctx.fillText(txt, at.x, at.y); ctx.textBaseline = 'alphabetic';
  }

  destroy() { this.live = false; window.removeEventListener('resize', this._resize); this.cv.remove(); this.cone.remove(); }
}

const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
const cut = (A, B) => { const t = (NEAR - A.d) / (B.d - A.d); return { d: NEAR, s: A.s + (B.s - A.s) * t, u: A.u + (B.u - A.u) * t }; };
/* Отсечение многоугольника ближней плоскостью камеры. */
function clip(pts) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const ia = a.d >= NEAR, ib = b.d >= NEAR;
    if (ia) out.push(a);
    if (ia !== ib) out.push(cut(a, b));
  }
  return out;
}
/* Контур борта со скруглёнными углами (точки по часовой). */
function perimeter(r) {
  const { W, L, R } = r, pts = [], x0 = -W / 2, x1 = W / 2;
  const arc = (cx, cy, a0) => { for (let k = 0; k <= 6; k++) { const a = a0 + k / 6 * Math.PI / 2; pts.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]); } };
  const side = (ax, ay, bx, by, n) => { for (let k = 1; k < n; k++) pts.push([ax + (bx - ax) * k / n, ay + (by - ay) * k / n]); };
  arc(x1 - R, L - R, 0); side(x1 - R, L, x0 + R, L, 3);
  arc(x0 + R, L - R, Math.PI / 2); side(x0, L - R, x0, R, 10);
  arc(x0 + R, R, Math.PI); side(x0 + R, 0, x1 - R, 0, 3);
  arc(x1 - R, R, 3 * Math.PI / 2); side(x1, R, x1, L - R, 10);
  return pts;
}
function poly(ctx, pts, fill, stroke, lw) {
  ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath();
  ctx.fillStyle = fill; ctx.fill(); if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}
function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
