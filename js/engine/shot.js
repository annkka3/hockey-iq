/* Физика броска — три слоя, разделены явно.
   1. Геометрия (точно): шайба летит из точки броска (высота льда) в точку на плоскости ворот;
      вратарь — набор прямоугольников в своей плоскости, проецируется на плоскость ворот лучами из точки броска.
      Чем ближе вратарь к броску, тем больше его силуэт на воротах — это и есть «выход на угол».
   2. Параметры (из публичных данных, приближённо, подписаны в интерфейсе): ворота 1,83 × 1,22 м,
      реакция вратаря ~0,2 с, скорость движения рук и щитков, силуэт в стойке и «бабочке».
   3. Механика самого броска (перенос веса, прогиб клюшки) здесь не считается — это лёд и тренер.
   Координаты площадки — как у карточек (м): x поперёк, y вдоль, чужая линия ворот y = 56. */

export const GOAL = { y: 56, w: 1.83, h: 1.22, half: 0.915 };
export const PUCK_R = 0.038;

/* Силуэты: w — поперёк тела (минус — сторона ловушки, т. е. правая сторона ворот для бросающего), h — высота. */
export const STANCES = {
  butterfly: {
    name: 'Бабочка',
    parts: [
      { id: 'pads', w: [-0.86, 0.86], h: [0, 0.3], speed: 1.0 },
      { id: 'body', w: [-0.27, 0.27], h: [0.22, 0.92], speed: 0.45 },
      { id: 'head', w: [-0.12, 0.12], h: [0.92, 1.1], speed: 0.4 },
      { id: 'glove', w: [-0.62, -0.27], h: [0.42, 0.78], speed: 1.4 },
      { id: 'blocker', w: [0.27, 0.6], h: [0.38, 0.7], speed: 1.1 },
    ],
  },
  stand: {
    name: 'Стойка',
    parts: [
      { id: 'legL', w: [-0.44, -0.08], h: [0, 0.72], speed: 0.9 },
      { id: 'legR', w: [0.08, 0.44], h: [0, 0.72], speed: 0.9 },
      { id: 'stick', w: [-0.16, 0.16], h: [0, 0.1], speed: 0.7 },
      { id: 'body', w: [-0.3, 0.3], h: [0.62, 1.32], speed: 0.45 },
      { id: 'head', w: [-0.13, 0.13], h: [1.32, 1.56], speed: 0.4 },
      { id: 'glove', w: [-0.68, -0.3], h: [0.62, 1.02], speed: 1.4 },
      { id: 'blocker', w: [0.3, 0.64], h: [0.5, 0.86], speed: 1.1 },
    ],
  },
};

/* Защитник или партнёр-заслон — простой силуэт человека в полный рост. */
export const BODY = { parts: [{ id: 'body', w: [-0.3, 0.3], h: [0, 1.45], speed: 0 }, { id: 'stick', w: [-0.6, 0.6], h: [0, 0.08], speed: 0 }] }; // в стойке, согнувшись

export const LEVELS = {
  // уровни — учебные наборы параметров, не откалиброванные модели реальных вратарей
  junior: { name: 'Учебный', reaction: 0.26, move: 0.85 },
  pro: { name: 'Сложный', reaction: 0.21, move: 1 },
  nhl: { name: 'Эксперт', reaction: 0.17, move: 1.15 },
};

/* Правильная позиция вратаря: на линии от центра ворот к шайбе, на глубине depth от линии ворот. */
export function goaliePos(shooter, depth = 1.0) {
  const dx = shooter.x, dy = shooter.y - GOAL.y;
  const L = Math.hypot(dx, dy) || 1;
  return { x: dx / L * depth, y: GOAL.y + dy / L * depth };
}

/* Проекция точки (x, y, h) на плоскость ворот лучом из точки броска (высота льда). */
export function project(S, p) {
  const t = (GOAL.y - S.y) / (p.y - S.y);
  return { u: S.x + (p.x - S.x) * t, v: p.h * t, t };
}

/* Силуэт тела в позиции P (повёрнут к бросающему) → полигоны на плоскости ворот. */
export function silhouette(S, P, shape, shift = { u: 0, v: 0 }) {
  const dx = P.x - S.x, dy = P.y - S.y, L = Math.hypot(dx, dy) || 1;
  const px = -dy / L, py = dx / L;
  return shape.parts.map(part => {
    const corners = [[part.w[0], part.h[0]], [part.w[1], part.h[0]], [part.w[1], part.h[1]], [part.w[0], part.h[1]]]
      .map(([w, h]) => project(S, { x: P.x + px * w, y: P.y + py * w, h }));
    return { id: part.id, speed: part.speed, scale: corners[0].t, pts: corners.map(c => ({ u: c.u + shift.u, v: c.v + shift.v })) };
  });
}

export function inPoly(pt, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a.v > pt.v) !== (b.v > pt.v) && pt.u < (b.u - a.u) * (pt.v - a.v) / (b.v - a.v) + a.u) inside = !inside;
  }
  return inside;
}

function segDist(p, a, b) {
  const vx = b.u - a.u, vy = b.v - a.v, L = vx * vx + vy * vy || 1;
  let t = ((p.u - a.u) * vx + (p.v - a.v) * vy) / L;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.u - (a.u + vx * t), p.v - (a.v + vy * t));
}
export function polyDist(pt, pts) {
  if (inPoly(pt, pts)) return 0;
  let d = Infinity;
  for (let i = 0; i < pts.length; i++) d = Math.min(d, segDist(pt, pts[i], pts[(i + 1) % pts.length]));
  return d;
}

/* Доля открытых ворот: сетка 37 × 25 точек по створу, считаем не закрытые ни одним силуэтом. */
export function openShare(S, blockers) {
  let open = 0, n = 0;
  for (let i = 0; i <= 36; i++) for (let j = 0; j <= 24; j++) {
    const pt = { u: -GOAL.half + PUCK_R + (GOAL.w - 2 * PUCK_R) * i / 36, v: PUCK_R + (GOAL.h - 2 * PUCK_R) * j / 24 };
    n++;
    if (!blockers.some(b => b.some(part => inPoly(pt, part.pts)))) open++;
  }
  return open / n;
}

/* Видимый угол ворот из точки (градусы) — без вратаря. */
export function goalAngle(S) {
  const a = Math.atan2(GOAL.y - S.y, -GOAL.half - S.x), b = Math.atan2(GOAL.y - S.y, GOAL.half - S.x);
  return Math.abs(a - b) * 180 / Math.PI;
}

export const flightTime = (S, target, speedMs) => Math.hypot(target.u - S.x, GOAL.y - S.y, target.v) / speedMs;

/* Рама ворот: штанги и перекладина — трубы радиусом POST_R, внутренний край — по створу 1,83 × 1,22.
   Шайба — диск радиусом PUCK_R. Гол только если шайба целиком проходит внутри рамы;
   задела трубу — «штанга»; дальше — мимо. Проверяется центр шайбы в плоскости ворот. */
export const POST_R = 0.03;
export function frameHit(p) {
  const au = Math.abs(p.u);
  const inU = au <= GOAL.half - PUCK_R, inV = p.v >= 0 && p.v <= GOAL.h - PUCK_R;
  if (inU && inV) return null;
  const touchPost = au > GOAL.half - PUCK_R && au < GOAL.half + 2 * POST_R + PUCK_R && p.v < GOAL.h + 2 * POST_R + PUCK_R;
  const touchBar = p.v > GOAL.h - PUCK_R && p.v < GOAL.h + 2 * POST_R + PUCK_R && au < GOAL.half + 2 * POST_R + PUCK_R;
  return touchPost || touchBar ? 'post' : 'miss';
}

/* Исход броска.
   goalie: { pos, stance, level, delay } — delay: доп. задержка (заслон, переезд после паса).
   shift: где силуэт вратаря в момент выпуска (для королевской дороги он ещё едет).
   others: силуэты защитников/заслона (не двигаются). */
export function resolveShot({ S, target, speedMs, goalie, others = [], rng = Math.random }) {
  const T = flightTime(S, target, speedMs);
  const out = { T, target };
  const fr = frameHit(target);
  if (fr) return { ...out, result: fr };
  for (const b of others) if (b.parts.some(p => inPoly(target, p.pts))) return { ...out, result: 'blocked', by: b.who };
  const lvl = LEVELS[goalie.level] || LEVELS.pro;
  const reaction = lvl.reaction + (goalie.delay || 0) + (rng() - 0.5) * 0.06;
  const sil = goalie.sil;
  if (sil.some(p => inPoly(target, p.pts))) return { ...out, result: 'save', reason: 'body', reaction };
  let best = null;
  for (const p of sil) {
    // время до встречи шайбы с этой частью вратаря, а не до линии ворот: p.scale = (линия ворот − бросок) / (вратарь − бросок)
    const left = Math.max(0, T / Math.max(1, p.scale) - reaction);
    const d = Math.max(0, polyDist(target, p.pts) - PUCK_R);
    const reach = left * p.speed * lvl.move * p.scale;
    const margin = reach - d;
    if (!best || margin > best.margin) best = { part: p.id, d, reach, margin, left, tc: T / Math.max(1, p.scale) };
  }
  return { ...out, result: best.margin >= 0 ? 'save' : 'goal', reaction, part: best.part, need: best.d, reach: best.reach, left: best.left, tc: best.tc };
}

/* Разброс: чем сильнее бросок, тем шире (метры на плоскости ворот).
   speedFrac — доля от 40…150 км/ч. mult — множитель режима (новичок 0,6). sd — стандартное отклонение по ширине. */
export const spread = (speedFrac, mult = 1) => (0.025 + 0.07 * speedFrac * speedFrac) * mult;
export function scatter(target, speedFrac, rng = Math.random, mult = 1) {
  const sd = spread(speedFrac, mult);
  const g = () => { let s = 0; for (let i = 0; i < 4; i++) s += rng(); return (s - 2) / 0.58; };
  return { u: target.u + g() * sd, v: target.v + g() * sd * 0.8 };
}

/* Вратарь следит за шайбой с задержкой реакции и ограниченной скоростью смещения.
   Используется в режимах, где шайба или бросающий двигаются: пас, бросок в движении, протяжка, добивание. */
export const TRACK = {
  shuffle: 2.4,      // м/с — приставной шаг / толчок в бабочке (приближённо)
  fromDown: 1.7,     // м/с — после сейва, из бабочки
  notSet: 0.06,      // с — доп. задержка, если в момент выпуска вратарь ещё едет
  screen: 0.2,       // с — бросок сквозь заслон: вратарь поздно видит выпуск
};
/* Бросок в движении: шайба сохраняет боковую скорость игрока. Руки игрока гасят большую часть сноса
   (клюшка и кисть), в модели остаётся DRIFT от полного сноса vx·T. */
export const DRIFT = 0; // прицел — желаемая точка попадания: поправку на движение руки делают сами (см. «Как считается»)
export const SKATE = 5.2; // м/с — скорость игрока поперёк слота в режиме «В движении»

/* Воспроизводимая случайность: у каждого броска свой номер (seed) — по нему бросок можно повторить один в один. */
export function rngFrom(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export const kmh = ms => Math.round(ms * 3.6);
