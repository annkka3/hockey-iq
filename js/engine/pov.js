/* Вид «Глазами»: та же ситуация от лица «Я», в стиле 2,5D-мультфильма.
   Камера на уровне глаз (1,6 м), слегка наклонена ко льду, поле зрения 90°: что за плечами — не видно,
   нужно повернуть голову (палец или «через плечо»). Арена: трибуны, стекло, рекламные борта, отражения на льду.
   Хоккеисты — объёмные фигуры из проекций реальных точек тела: видно, куда развёрнут корпус, на какой стороне крюк
   (хват), согнуты ли колени. Над головой — подпись амплуа, как на схеме.
   Источник правды — Scene: позиции, направление корпуса и хват берутся из её сущностей каждый кадр. */
import { fromScreen } from './rink.js';
import { gripSprite, goalieImage, goaliePoseImage, GOALIE_UPM, ownStickImage, arenaImage, META, ready, preload } from './sprites.js';
import { stickPose, toWorld, STICK } from './stick.js';

const EYE = 1.6, PITCH = 0.11, FOV = 80 * Math.PI / 180, NEAR = 0.35;
const NS = 'http://www.w3.org/2000/svg';
const KIT = {
  us: { jersey: '#1D4F8C', dark: '#0E2A4D', stripe: '#FFFFFF', pants: '#0B1626', helmet: '#123A66', glove: '#173E6B', pill: '#0F2D52' },
  them: { jersey: '#E23347', dark: '#9A1426', stripe: '#FFFFFF', pants: '#1B0B10', helmet: '#C21F35', glove: '#B01C30', pill: '#D8263C' },
  me: { jersey: '#16B3E6', dark: '#0A6E91', stripe: '#FFFFFF', pants: '#0B1626', helmet: '#0A6E91', glove: '#0E5F7E', pill: '#0077A8' },
};

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
    preload();
    this.fit();
    this._resize = () => this.fit();
    window.addEventListener('resize', this._resize);
    this.bindDrag();
    this.onPick = id => { if (this.scene.onPick) this.scene.onPick(id); }; // ответ касанием задаёт экран решения
    this.live = true;
    const loop = () => { if (!this.live) return; if (!this.cv.isConnected && this._drawn) { this.destroy(); return; } this.draw(); this._drawn = true; requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  fit() {
    const w = this.cv.clientWidth || 360, dpr = Math.min(2, window.devicePixelRatio || 1);
    this.cv.width = w * dpr; this.cv.height = w * 0.8 * dpr; this.cv.style.height = w * 0.8 + 'px';
    this.dpr = dpr;
  }

  bindDrag() {
    let x0 = null, h0 = 0, y0 = 0, t0 = 0, moved = false;
    this.cv.style.touchAction = 'none';
    this.cv.addEventListener('pointerdown', e => { x0 = e.clientX; y0 = e.clientY; t0 = performance.now(); moved = false; h0 = this.heading ?? 0; this.cv.setPointerCapture(e.pointerId); });
    this.cv.addEventListener('pointermove', e => {
      if (x0 == null) return;
      const dx = e.clientX - x0;
      if (Math.abs(dx) > 6 || Math.abs(e.clientY - y0) > 6) moved = true;
      if (Math.abs(dx) > 3) { this.follow = false; this.heading = h0 - dx / this.cv.clientWidth * FOV; if (this.onTurn) this.onTurn(); }
    });
    const up = e => {
      // короткое касание без сдвига — выбор игрока на сцене (ответ касанием), а не поворот головы
      if (x0 != null && !moved && performance.now() - t0 < 500 && e.type === 'pointerup' && this.onPick) {
        const id = this.hitTest(e.clientX, e.clientY);
        if (id) { this.heading = h0; this.onPick(id); }
        else if (this.scene.onSpot) { const w = this.iceAt(e.clientX, e.clientY); if (w) { this.heading = h0; this.scene.onSpot(w); } }
      }
      x0 = null;
    };
    this.cv.addEventListener('pointerup', up); this.cv.addEventListener('pointercancel', up);
    this.cv.addEventListener('dblclick', () => { this.heading = null; }); // двойное касание — вернуть взгляд по корпусу
  }

  /* Точка льда под точкой экрана (client px): обратная проекция луча из глаза на плоскость льда; null — выше горизонта. */
  iceAt(cx, cy) {
    const c = this.camState; if (!c) return null;
    const r = this.cv.getBoundingClientRect();
    const x = (cx - r.left) * this.cv.width / r.width, y = (cy - r.top) * this.cv.height / r.height;
    const sx = (x - c.cx) / c.f, uy = -(y - c.cy) / c.f;
    const den = -c.sp + uy * c.cp;            // «вверх» на единицу глубины луча
    if (den >= -1e-4) return null;
    const t = -EYE / den, dep = t * (c.cp + uy * c.sp), side = t * sx;
    return { x: c.me.x + dep * c.fx + side * c.rx, y: c.me.y + dep * c.fy + side * c.ry };
  }

  /* Кто на сцене под точкой экрана (client px): по прямоугольникам фигур последнего кадра, ближний к камере. */
  hitTest(cx, cy) {
    const r = this.cv.getBoundingClientRect();
    const x = (cx - r.left) * this.cv.width / r.width, y = (cy - r.top) * this.cv.height / r.height;
    let best = null;
    for (const b of this.boxes || []) {
      const pad = 6 * this.dpr;
      if (x >= b.x0 - pad && x <= b.x1 + pad && y >= b.y0 - pad && y <= b.y1 + pad && (!best || b.d < best.d)) best = b;
    }
    return best ? best.id : null;
  }

  /* Плечевой осмотр: быстрый поворот головы в сторону (−1 налево, +1 направо) и обратно, по времени, а не по кадрам. */
  shoulder(dir) {
    if (this._g) return;
    this._g = true;
    const t0 = performance.now(), A = dir * 1.75;
    const step = () => {
      const t = (performance.now() - t0) / 1000;
      this.glance = t < 0.18 ? A * (t / 0.18) : t < 0.55 ? A : t < 0.73 ? A * (1 - (t - 0.55) / 0.18) : 0;
      if (t < 0.73) requestAnimationFrame(step); else { this.glance = 0; this._g = false; }
      if (this.onTurn) this.onTurn();
    };
    requestAnimationFrame(step);
  }

  world(id) { const e = this.scene.ents[id]; return e ? fromScreen(e.pos, this.r) : null; }

  /* Начальное направление: куда развёрнут корпус «Я» на схеме. Дальше голова сама не поворачивается. */
  baseHeading(meEnt, me) {
    if (meEnt && meEnt.faceW) return Math.atan2(meEnt.faceW.x, meEnt.faceW.y);
    const p = this.world('puck');
    if (!p || Math.hypot(p.x - me.x, p.y - me.y) < 2.2) return 0;
    return Math.atan2(p.x - me.x, p.y - me.y);
  }

  draw() {
    const ents = this.scene.ents;
    const meId = Object.keys(ents).find(id => ents[id].data && ents[id].data.me);
    if (!meId) return;
    const me = this.world(meId);
    if (this.heading == null) this.heading = this.baseHeading(ents[meId], me);
    const hd = this.heading + this.glance;
    const fx = Math.sin(hd), fy = Math.cos(hd), rx = Math.cos(hd), ry = -Math.sin(hd);
    const W = this.cv.width, H = this.cv.height, f = (W / 2) / Math.tan(FOV / 2), cx = W / 2, cy = H * 0.36;
    const cp = Math.cos(PITCH), sp = Math.sin(PITCH), dpr = this.dpr;
    const cam = (x, y, z = 0) => {
      const dx = x - me.x, dy = y - me.y, dep = dx * fx + dy * fy, up = z - EYE;
      return { d: dep * cp - up * sp, s: dx * rx + dy * ry, u: dep * sp + up * cp };
    };
    const proj = c => ({ x: cx + f * c.s / c.d, y: cy - f * c.u / c.d });
    const P = (x, y, z) => { const c = cam(x, y, z); return c.d < NEAR ? null : { ...proj(c), d: c.d }; };
    this.camState = { me, fx, fy, rx, ry, f, cx, cy, cp, sp };
    const ctx = this.ctx;
    const fillPoly = (pts3, fill, stroke, lw) => {
      const c = clip(pts3.map(p => cam(p[0], p[1], p[2] || 0)));
      if (c.length < 3) return;
      ctx.beginPath(); c.forEach((q, i) => { const p = proj(q); i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); }); ctx.closePath();
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw * dpr; ctx.stroke(); }
    };
    const line = (a, b, color, w) => {
      let A = cam(...a), B = cam(...b);
      if (A.d < NEAR && B.d < NEAR) return;
      if (A.d < NEAR) A = cut(A, B); else if (B.d < NEAR) B = cut(B, A);
      const p = proj(A), q = proj(B);
      ctx.strokeStyle = color; ctx.lineWidth = w * dpr; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
    };
    const r = this.r, L = r.L, Wd = r.W, per = this.perimeter;

    // свод арены: тёмный купол, ряд прожекторов
    const sky = ctx.createLinearGradient(0, 0, 0, cy);
    sky.addColorStop(0, '#060B14'); sky.addColorStop(1, '#14243A');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    // фон арены — панорама (свод, прожекторы, трибуны, стекло), прокручивается вместе с поворотом головы.
    // Берём верхнюю часть картинки до кромки борта; низ панорамы — на уровне верха стекла у дальнего борта.
    const arena = arenaImage();
    if (ready(arena)) {
      const SRC_H = 0.64 * arena.naturalHeight;          // до кромки борта (ниже — свой борт и лёд в 3D)
      const bottom = cy - f * ((2.4 - EYE) / 32) + f * Math.tan(PITCH) * 0.2;
      const dh = Math.max(bottom, H * 0.2), dw = arena.naturalWidth * dh / SRC_H;
      const per = Math.max(dw, 2 * Math.PI * f);         // полный оборот = ширина панорамы
      let off = -((hd / (2 * Math.PI)) * per) % dw; if (off > 0) off -= dw;
      for (let x = off; x < W; x += dw) ctx.drawImage(arena, 0, 0, arena.naturalWidth, SRC_H, x, 0, dw, dh);
    } else {
      ctx.fillStyle = 'rgba(235,245,255,.85)';
      for (let k = 0; k < 6; k++) { const x = W * (0.1 + k * 0.16); ctx.fillRect(x, cy * 0.12, W * 0.05, 2.5 * dpr); }
    }

    // сегменты борта: от дальних к ближним
    const segs = [];
    for (let i = 0; i < per.length; i++) {
      const a = per[i], b = per[(i + 1) % per.length];
      const m = cam((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
      segs.push({ a, b, d: m.d, i });
    }
    segs.sort((x, y) => y.d - x.d);
    // трибуны: за стеклом, уходят вверх и назад
    const out = (p, k) => { const nx = p[0], ny = p[1] - L / 2, n = Math.hypot(nx, ny * 0.5) || 1; return [p[0] + nx / n * k, p[1] + ny / n * k]; };
    if (!ready(arena)) for (const s of segs) {
      const a0 = out(s.a, 1.2), b0 = out(s.b, 1.2), a1 = out(s.a, 12), b1 = out(s.b, 12);
      fillPoly([[a0[0], a0[1], 2.4], [b0[0], b0[1], 2.4], [b1[0], b1[1], 9], [a1[0], a1[1], 9]], s.i % 2 ? '#132B4C' : '#16315A');
    }
    // лёд: холодный белый, светлее ближе к камере
    const ice = ctx.createLinearGradient(0, cy, 0, H);
    ice.addColorStop(0, '#DCE8F1'); ice.addColorStop(1, '#F6FAFD');
    fillPoly(per.map(p => [p[0], p[1], 0]), ice);
    // отражения прожекторов на льду
    for (const [x, y] of [[-6, 20], [6, 40]]) {
      const p = P(x, y, 0); if (!p) continue;
      const rr = 3.2 * f / p.d;
      const gl = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rr);
      gl.addColorStop(0, 'rgba(255,255,255,.35)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.save(); ctx.translate(p.x, p.y); ctx.scale(1, 0.3); ctx.translate(-p.x, -p.y);
      ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(p.x, p.y, rr, 0, 7); ctx.fill(); ctx.restore();
    }
    // разметка
    const band = (y, w, color) => fillPoly([[-Wd / 2, y - w], [Wd / 2, y - w], [Wd / 2, y + w], [-Wd / 2, y + w]], color);
    band(r.blue, 0.15, '#2A63D9'); band(L - r.blue, 0.15, '#2A63D9'); band(L / 2, 0.15, '#E2283E');
    for (const y of [r.goalLine, L - r.goalLine]) line([-Wd / 2 + 1.2, y, 0], [Wd / 2 - 1.2, y, 0], '#E2283E', 1);
    const circle = (x0, y0, R, color) => {
      for (let k = 0; k < 40; k++) {
        const a = k / 40 * 2 * Math.PI, b = (k + 1) / 40 * 2 * Math.PI;
        line([x0 + R * Math.cos(a), y0 + R * Math.sin(a), 0], [x0 + R * Math.cos(b), y0 + R * Math.sin(b), 0], color, 1.3);
      }
    };
    circle(0, L / 2, r.circleR, '#2A63D9');
    for (const y of [r.goalLine + r.dotOut, L - r.goalLine - r.dotOut]) for (const x of [-r.dotSide, r.dotSide]) {
      circle(x, y, r.circleR, '#E2283E');
      const c = []; for (let k = 0; k < 12; k++) { const a = k / 12 * 2 * Math.PI; c.push([x + 0.3 * Math.cos(a), y + 0.3 * Math.sin(a)]); }
      fillPoly(c, '#E2283E');
    }
    // вратарские на льду; сами ворота — объёмные, рисуются вместе с игроками по глубине (ниже)
    for (const [gy, dir] of [[r.goalLine, -1], [L - r.goalLine, 1]]) {
      const cr = [];
      for (let k = 0; k <= 14; k++) { const a = Math.PI * k / 14; cr.push([Math.cos(a) * r.creaseR, gy - dir * Math.sin(a) * r.creaseR]); }
      fillPoly(cr, 'rgba(70,150,235,.45)', 'rgba(226,40,62,.8)', 1);
    }
    // ворота: сетка (задняя стенка, боковины, крыша) с ячейками, красная рама; низ рамы на льду
    const drawGoal = (gy, dir, k = 40) => {
      const px = m => Math.max(0.6, m * k / dpr); // толщина в метрах → пиксели на этой глубине
      const hw = r.goalW / 2, D = r.goalD, Hg = r.goalH, b = gy + dir * D, mid = gy + dir * D * 0.45;
      const NET = 'rgba(250,252,255,.62)', MESH = 'rgba(150,165,185,.75)';
      const face = (pts, fill) => fillPoly(pts, fill, 'rgba(120,135,155,.6)', 0.6);
      const mesh = (a, b2, c, d, n, m) => { // сетка ячеек на четырёхугольнике a-b-c-d
        const lerp = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];
        for (let i = 1; i < n; i++) line(lerp(a, b2, i / n), lerp(d, c, i / n), MESH, px(0.008));
        for (let j = 1; j < m; j++) line(lerp(a, d, j / m), lerp(b2, c, j / m), MESH, px(0.008));
      };
      // задняя стенка наклонна: от низа у заднего края к верху над серединой
      const BL = [-hw, b, 0], BR = [hw, b, 0], TL = [-hw, mid, Hg], TR = [hw, mid, Hg];
      const FL = [-hw, gy, 0], FR = [hw, gy, 0], FTL = [-hw, gy, Hg], FTR = [hw, gy, Hg];
      face([BL, BR, TR, TL], NET); mesh(BL, BR, TR, TL, 12, 6);
      face([FL, BL, TL, FTL], NET); mesh(FL, BL, TL, FTL, 5, 6);
      face([FR, BR, TR, FTR], NET); mesh(FR, BR, TR, FTR, 5, 6);
      face([FTL, FTR, TR, TL], 'rgba(250,252,255,.5)'); mesh(FTL, FTR, TR, TL, 12, 3);
      // рама: низ на льду (белый с красным), стойки и перекладина — красные трубы
      line(FL, BL, '#E2283E', px(0.05)); line(FR, BR, '#E2283E', px(0.05)); line(BL, BR, '#E2283E', px(0.05));
      const tube = (a, c) => { line(a, c, '#9E1426', px(0.075)); line(a, c, '#E2283E', px(0.055)); };
      tube(FL, FTL); tube(FR, FTR); tube(FTL, FTR);
    };
    // борта с рекламой, стекло, жёлтый кант
    const ads = ['#1E5BD8', '#FFFFFF', '#E2283E', '#FFFFFF', '#0F2D52', '#FFFFFF', '#FFC53D', '#FFFFFF'];
    for (const s of segs) {
      fillPoly([[s.a[0], s.a[1], 0], [s.b[0], s.b[1], 0], [s.b[0], s.b[1], 1.07], [s.a[0], s.a[1], 1.07]], '#FBFDFE', '#D5E0EA', 0.4);
      fillPoly([[s.a[0], s.a[1], 0.35], [s.b[0], s.b[1], 0.35], [s.b[0], s.b[1], 0.85], [s.a[0], s.a[1], 0.85]], ads[s.i % ads.length] === '#FFFFFF' ? 'rgba(15,45,82,.06)' : ads[s.i % ads.length] + 'CC');
      fillPoly([[s.a[0], s.a[1], 1.07], [s.b[0], s.b[1], 1.07], [s.b[0], s.b[1], 2.4], [s.a[0], s.a[1], 2.4]], 'rgba(190,225,255,.10)', 'rgba(220,240,255,.18)', 0.4);
      line([s.a[0], s.a[1], 1.07], [s.b[0], s.b[1], 1.07], '#F2C230', 2);
      line([s.a[0], s.a[1], 1.07], [s.a[0], s.a[1], 2.4], 'rgba(220,235,250,.35)', 1);
    }

    // места на льду, которые можно выбрать касанием (ответ «куда поеду»): пунктирный круг, выбранное — сплошной
    for (const sp0 of this.scene.spots || []) {
      const picked = this.scene.pickedSpot === sp0.id, R = 1.6, pts = [];
      for (let k = 0; k < 28; k++) { const a = k / 28 * 2 * Math.PI; pts.push(P(sp0.x + R * Math.cos(a), sp0.y + R * Math.sin(a), 0.01)); }
      if (pts.some(q => !q)) continue;
      ctx.save(); ctx.strokeStyle = picked ? '#33C8EA' : 'rgba(51,200,234,.85)'; ctx.fillStyle = picked ? 'rgba(51,200,234,.28)' : 'rgba(51,200,234,.10)';
      ctx.lineWidth = (picked ? 3.5 : 2) * dpr; if (!picked) ctx.setLineDash([6 * dpr, 5 * dpr]);
      ctx.beginPath(); pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y))); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
      const c0 = P(sp0.x, sp0.y, 0.01);
      if (sp0.k && c0) pill(ctx, c0.x, c0.y - 0.6 * f / c0.d, sp0.k, picked ? '#0077A8' : 'rgba(9,24,39,.75)', f / c0.d, dpr); // буква варианта над местом
    }

    // игроки и шайба — от дальних к ближним
    const items = [];
    for (const id in ents) {
      if (id === meId) continue;
      const p = fromScreen(ents[id].pos, r), c = cam(p.x, p.y, 0);
      if (c.d < NEAR + 0.2) continue;
      items.push({ id, e: ents[id], p, d: c.d });
    }
    for (const [gy, dir] of [[r.goalLine, -1], [L - r.goalLine, 1]]) {
      const c = cam(0, gy + dir * r.goalD * 0.5, 0);
      if (c.d > NEAR - 2) items.push({ id: 'goal' + dir, goal: [gy, dir], d: c.d });
    }
    items.sort((a, b) => b.d - a.d);
    const labels = [], seenNow = [];
    this.boxes = []; this.pickable = this.scene.pickable || null; this.picked = this.scene.picked || null;
    for (const it of items) {
      if (it.goal) { drawGoal(...it.goal, f / it.d); continue; }
      const foot = P(it.p.x, it.p.y, 0);
      if (!foot) continue;
      if (it.id === 'puck') {
        const rr = Math.max(2.2 * dpr, 0.09 * f / it.d);
        ctx.fillStyle = 'rgba(5,10,16,.25)'; ctx.beginPath(); ctx.ellipse(foot.x, foot.y + rr * 0.3, rr * 1.4, rr * 0.5, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#05090F'; ctx.beginPath(); ctx.ellipse(foot.x, foot.y, rr, rr * 0.45, 0, 0, 7); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.ellipse(foot.x - rr * 0.2, foot.y - rr * 0.1, rr * 0.45, rr * 0.15, 0, 0, 7); ctx.fill();
        continue;
      }
      const sx = 1.2 * f / it.d;
      if (foot.x + sx < 0 || foot.x - sx > W) continue;
      seenNow.push(it.id);
      const lab = this.drawPlayer(it, P, f, me);
      if (lab) labels.push(lab);
    }
    // подписи над головами — поверх всех
    for (const l of labels) pill(ctx, l.x, l.y, l.text, l.color, l.size, dpr);
    // свой крюк и перчатка внизу кадра: «это я»
    this.drawOwnStick(P, me, fx, fy, f, ents[meId]);
    // края поля зрения
    const v = ctx.createLinearGradient(0, 0, W, 0);
    v.addColorStop(0, 'rgba(4,8,14,.22)'); v.addColorStop(0.06, 'rgba(4,8,14,0)'); v.addColorStop(0.94, 'rgba(4,8,14,0)'); v.addColorStop(1, 'rgba(4,8,14,.22)');
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
    this.visible = seenNow.length; this.seen = seenNow;

    // конус обзора на схеме
    const sc = this.scene.pt({ x: me.x, y: me.y });
    const Lc = 22, a1 = hd - FOV / 2, a2 = hd + FOV / 2;
    const pA = this.scene.pt({ x: me.x + Math.sin(a1) * Lc, y: me.y + Math.cos(a1) * Lc });
    const pB = this.scene.pt({ x: me.x + Math.sin(a2) * Lc, y: me.y + Math.cos(a2) * Lc });
    this.cone.setAttribute('d', `M${sc.x} ${sc.y} L${pA.x} ${pA.y} A${Lc} ${Lc} 0 0 1 ${pB.x} ${pB.y} Z`);
  }

  /* Хоккеист — иллюстрированный спрайт, закреплённый точкой между коньками в его точке на льду (та же точка, что на схеме).
     Ракурс выбирается по тому, как он развёрнут относительно камеры: лицом, боком (влево/вправо — зеркало) или спиной.
     Клюшка рисуется в мировых координатах: от перчатки к крюку на льду — на стороне хвата или в точке stick со схемы. */
  drawPlayer(it, P, f, me) {
    const ctx = this.ctx, dpr = this.dpr, p = it.p, en = it.e;
    let fw = en.faceW || { x: 0, y: en.team === 'us' ? 1 : -1 };
    const pkW = this.world('puck');
    if (en.goalie) {
      // вратарь лицом к шайбе, но всегда к площадке: от своих ворот, а не к сетке
      const out = p.y < this.r.L / 2 ? 1 : -1;
      if (pkW) { const dx = pkW.x - p.x, dy = pkW.y - p.y, l = Math.hypot(dx, dy) || 1; fw = { x: dx / l, y: dy / l }; }
      if (fw.y * out < 0.25) fw = { x: fw.x * 0.5, y: out };
    }
    const fx = fw.x, fy = fw.y, lx = -fy, ly = fx;
    const hand = en.hand || 'L', hs = hand === 'L' ? 1 : -1;
    const team = en.team === 'us' ? 'us' : 'them';
    const foot = P(p.x, p.y, 0), ahead = P(p.x + fx, p.y + fy, 0);
    if (!foot) return null;
    const k = f / it.d;
    const toCam = { x: me.x - p.x, y: me.y - p.y }, tl = Math.hypot(toCam.x, toCam.y) || 1;
    const cosA = (fx * toCam.x + fy * toCam.y) / tl; // 1 — лицом к нам, −1 — спиной
    // тень под коньками
    ctx.fillStyle = 'rgba(30,60,90,.22)'; ctx.beginPath(); ctx.ellipse(foot.x, foot.y, 0.55 * k, 0.14 * k, 0, 0, 7); ctx.fill();
    if (en.goalie) {
      // позы — те же рисунки, что в броске (300 единиц = 1 м, коньки в (320, 588)): стойка, разворот к шайбе
      // под острым углом справа или слева, «бабочка», когда шайба на пятаке.
      // Синие позы есть только в стойке спереди и сзади; со спины — тоже стойка.
      const M = META.goalie, out = p.y < this.r.L / 2 ? 1 : -1;
      let pose = 'stand', img, H = 1.5;
      if (pkW && cosA > 0) {
        const gx = pkW.x - p.x, gy = (pkW.y - p.y) * out, ang = Math.atan2(Math.abs(gx), Math.max(0.01, gy)) * 180 / Math.PI;
        const pkS = P(pkW.x, pkW.y, 0), right = pkS ? pkS.x > foot.x : gx > 0;
        if (gy > 0 && gy < 4.5 && Math.abs(gx) < 3) pose = 'butterfly';
        else if (right && ang > 55) pose = 'q3r2';
        else if (right && ang > 28) pose = 'q3r';
        else if (!right && ang > 28) pose = 'q3l';
      }
      if (team === 'them' && cosA > 0) { img = goaliePoseImage(pose); if (pose === 'butterfly') H = 1.05; }
      else img = goalieImage(team, cosA < 0);
      const sc = team === 'them' && cosA > 0 ? k / GOALIE_UPM : (1.6 * k) / M.h;
      if (ready(img)) ctx.drawImage(img, foot.x - M.ax * sc, foot.y - M.ay * sc, M.w * sc, M.h * sc);
      this.boxes.push({ id: it.id, x0: foot.x - 0.6 * k, x1: foot.x + 0.6 * k, y0: foot.y - H * k, y1: foot.y, d: it.d });
      this.goaliePose = pose;
      return { x: foot.x, y: foot.y - H * k * 1.02, text: 'ВР', color: team === 'us' ? '#0F2D52' : '#D8263C', size: k };
    }
    // скорость по смене позиции между кадрами: едет — шаг катания вместо стойки боком
    const now = performance.now(), prev = (this.prevPos ||= {})[it.id];
    const spd = prev && now - prev.t > 0 && now - prev.t < 400 ? Math.hypot(p.x - prev.x, p.y - prev.y) / ((now - prev.t) / 1000) : 0;
    this.prevPos[it.id] = { x: p.x, y: p.y, t: now };
    const view = cosA > 0.82 ? 'front' : cosA > 0.3 ? 'q3front' : cosA > -0.3 ? (spd > 1.2 ? 'stride' : 'side') : cosA > -0.82 ? 'q3back' : 'back';
    const faceLeft = ahead ? ahead.x < foot.x : false;
    const gs = gripSprite(team, view, hand, faceLeft, en.stickPose && en.stickPose.action, spd < 3), img = gs.img, mirror = gs.mirror, M = META.skater;
    const hpx = 1.85 * k, sc = hpx / M.h; // рост в шлеме ~1,75 м (фигура 560 из 600 единиц холста)
    const toScr = ([gx, gy]) => ({ x: foot.x + (mirror ? M.ax - gx : gx - M.ax) * sc, y: foot.y + (gy - M.ay) * sc });
    // клюшка — модель (en.stickPose, как на схеме) + руки картинки: древко — прямая через верхнюю и нижнюю руку,
    // продолжается до льда на глубине пятки из модели; крюк направлен как в модели, рабочая сторона — лентой.
    const sp = en.stickPose || stickPose({ hand });
    const W3 = q => toWorld(q, p, fw);
    const heelW = W3(sp.heel), toeW = W3(sp.toe);
    const mHeel = P(heelW.x, heelW.y, 0.02), mToe = P(toeW.x, toeW.y, 0.02);
    const gTop = toScr(gs.top), gBot = toScr(gs.bottom);
    let heel = null, toe = null, knob = null;
    if (mHeel && mToe) {
      const dx = gBot.x - gTop.x, dy = gBot.y - gTop.y, len = Math.hypot(dx, dy) || 1;
      let s1 = dy > 1 ? (mHeel.y - gBot.y) / dy : 0;
      const maxS = (STICK.len * 1.05 * k - len) / len;          // клюшка не длиннее настоящей
      s1 = Math.max(0.4, Math.min(maxS, s1));
      heel = { x: gBot.x + dx * s1, y: gBot.y + dy * s1 };
      toe = { x: heel.x + (mToe.x - mHeel.x), y: heel.y + (mToe.y - mHeel.y) };
      knob = { x: gTop.x - dx / len * 0.08 * k, y: gTop.y - dy / len * 0.08 * k };
    }
    const stick = () => {
      if (!heel) return;
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#1B1E23'; ctx.lineWidth = Math.max(1.5, 0.04 * k);
      ctx.beginPath(); ctx.moveTo(knob.x, knob.y); ctx.lineTo(heel.x, heel.y); ctx.stroke();
      ctx.lineWidth = Math.max(2, 0.07 * k); ctx.beginPath(); ctx.moveTo(heel.x, heel.y); ctx.lineTo(toe.x, toe.y); ctx.stroke();
      const nW = W3({ f: (sp.heel.f + sp.toe.f) / 2 + sp.normal.f * 0.05, l: (sp.heel.l + sp.toe.l) / 2 + sp.normal.l * 0.05 }), nP = P(nW.x, nW.y, 0.02);
      const mm = { x: (mHeel.x + mToe.x) / 2, y: (mHeel.y + mToe.y) / 2 };
      const ox = nP ? Math.sign(nP.x - mm.x) * Math.min(Math.abs(nP.x - mm.x), 0.02 * k) : 0, oy = nP ? Math.sign(nP.y - mm.y) * Math.min(Math.abs(nP.y - mm.y), 0.02 * k) : 0;
      ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = Math.max(1, 0.03 * k);
      ctx.beginPath(); ctx.moveTo(heel.x + (toe.x - heel.x) * 0.2 + ox, heel.y + (toe.y - heel.y) * 0.2 + oy); ctx.lineTo(heel.x + (toe.x - heel.x) * 0.85 + ox, heel.y + (toe.y - heel.y) * 0.85 + oy); ctx.stroke();
    };
    // клюшка дальше от камеры, чем игрок, — рисуется до картинки (корпус её закрывает), ближе — после
    const behind = mHeel && mHeel.d > foot.d;
    if (behind) stick();
    if (ready(img)) {
      ctx.save();
      if (mirror) { ctx.translate(foot.x, 0); ctx.scale(-1, 1); ctx.translate(-foot.x, 0); }
      ctx.drawImage(img, foot.x - M.ax * sc, foot.y - M.ay * sc, M.w * sc, M.h * sc);
      ctx.restore();
    }
    if (!behind) stick();
    this.boxes.push({ id: it.id, x0: foot.x - 0.5 * k, x1: foot.x + 0.5 * k, y0: foot.y - 1.85 * k, y1: foot.y, d: it.d });
    if ((this.pickable && this.pickable.has(it.id)) || this.picked === it.id) {
      // кого можно выбрать касанием — пунктирное кольцо под ногами; выбранный — сплошное
      ctx.save(); ctx.strokeStyle = this.picked === it.id ? '#33C8EA' : 'rgba(51,200,234,.8)'; ctx.lineWidth = (this.picked === it.id ? 3.5 : 2) * dpr;
      if (this.picked !== it.id) ctx.setLineDash([5 * dpr, 4 * dpr]);
      ctx.beginPath(); ctx.ellipse(foot.x, foot.y, 0.7 * k, 0.2 * k, 0, 0, 7); ctx.stroke(); ctx.restore();
    }
    const lb = en.node.querySelector('text'), txt = lb ? lb.textContent : '';
    return txt ? { x: foot.x, y: foot.y - hpx * 0.98, text: txt, color: team === 'us' ? '#0F2D52' : '#D8263C', size: k } : null;
  }

  /* Свой крюк и перчатка внизу кадра: на стороне хвата «Я» (профиль). Шайбу и линии паса не закрывают. */
  drawOwnStick(P, me, fx, fy, f, en) {
    const ctx = this.ctx, H = this.cv.height, W = this.cv.width, dpr = this.dpr;
    const hand = (en && en.hand) || 'L', hs = hand === 'L' ? 1 : -1;
    const lx = -fy, ly = fx;
    // крюк лежит на льду в 1,1 м впереди, на стороне хвата; перчатка с рукавом уходит в нижний угол кадра
    const b = P(me.x + fx * 1.15 + lx * hs * 0.45, me.y + fy * 1.15 + ly * hs * 0.45, 0.03);
    const img = ownStickImage(hand);
    if (ready(img)) {
      // картинка 1024 × 512: рукав уходит за правый (у правого хвата — левый) и нижний край кадра, без «оторванной» перчатки
      const iw = W * 0.9, ih = iw / 2;
      // клюшка держится корпусом: поворот головы (взгляд через плечо) уводит её в сторону кадра, хват не меняется
      const gx = -(this.glance / (FOV / 2)) * W * 0.5;
      const x = (hs > 0 ? W - iw * 0.97 : -iw * 0.03) + gx, y = H - ih * 0.93;
      ctx.drawImage(img, x, y, iw, ih);
      return;
    }
    if (!b) return;
    const gx = W * (hs > 0 ? 0.86 : 0.14), gy = H * 0.96;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#15181D'; ctx.lineWidth = 14 * dpr; ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(b.x, b.y); ctx.stroke();
  }

  destroy() { this.live = false; window.removeEventListener('resize', this._resize); this.cv.remove(); this.cone.remove(); }
}

const cut = (A, B) => { const t = (NEAR - A.d) / (B.d - A.d); return { d: NEAR, s: A.s + (B.s - A.s) * t, u: A.u + (B.u - A.u) * t }; };
const numberOf = id => { let x = 3; for (const ch of String(id)) x = (x * 33 + ch.charCodeAt(0)) >>> 0; return String(2 + (x % 97)); };

/* Подпись над головой: таблетка цвета команды. */
function pill(ctx, x, y, text, color, k, dpr) {
  const fs = Math.max(10 * dpr, Math.min(18 * dpr, 0.24 * k));
  ctx.font = `800 ${fs}px Unbounded, sans-serif`;
  const w = ctx.measureText(text).width + fs * 0.9, h = fs * 1.45;
  ctx.fillStyle = color; ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 1.5 * dpr;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x - w / 2, y - h, w, h, h / 2); else ctx.rect(x - w / 2, y - h, w, h);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, x, y - h / 2 + fs * 0.05); ctx.textBaseline = 'alphabetic';
}

/* Трибуны: мелкая «толпа» из цветных точек — узор повторяется, без случайности между кадрами. */
function crowdPattern(ctx) {
  try {
    const c = document.createElement('canvas'); c.width = 48; c.height = 24;
    const g = c.getContext('2d');
    g.fillStyle = '#1A2638'; g.fillRect(0, 0, 48, 24);
    const cols = ['#3A4F6B', '#5B6F88', '#8E2A3A', '#2C4E7E', '#C9B27A', '#46607F'];
    let s = 9;
    for (let y = 2; y < 24; y += 5) for (let x = 2 + (y % 2) * 2; x < 48; x += 4) { s = (s * 1103515245 + 12345) >>> 0; g.fillStyle = cols[s % cols.length]; g.beginPath(); g.arc(x, y, 1.3, 0, 7); g.fill(); }
    return ctx.createPattern(c, 'repeat');
  } catch (e) { return null; }
}

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
/* Контур борта со скруглёнными углами. */
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
