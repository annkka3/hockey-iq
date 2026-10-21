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

/* Баллистика: шайба вылетает со льда и летит по дуге (сила тяжести, без сопротивления воздуха).
   Угол вылета подбирается так, чтобы на расстоянии D (по льду до линии ворот) шайба была на высоте прицела H.
   Из двух решений берётся пологое (бросок, а не «свечка»). Если на этой скорости так высоко не долететь —
   шайба долетает только до наибольшей возможной высоты, а если и так не хватает — падает раньше и доезжает
   по льду низом (weak). Броски до 15 см — по льду, без дуги. h(x) — высота на расстоянии x по льду. */
export const G_ACC = 9.81;
export function arc(S, target, speedMs) {
  const D = Math.hypot(target.u - S.x, GOAL.y - S.y) || 0.01;
  const V = Math.max(1, speedMs), a = G_ACC * D * D / (2 * V * V);
  let H = Math.max(0, target.v), weak = false;
  // низом (до 15 см): шайба скользит по льду или чуть над ним — без дуги
  if (H <= 0.15) return { D, V, H, weak: false, slide: true, tan: H / D, theta: Math.atan(H / D), T: Math.hypot(D, H) / V, h: x => H * x / D, apex: H };
  const Hmax = D * D / (4 * a) - a;
  if (H > Hmax) { H = Math.max(0, Hmax); weak = true; }
  const disc = Math.max(0, D * D - 4 * a * (a + H));
  const tan = a < 1e-6 ? H / D : (D - Math.sqrt(disc)) / (2 * a);
  const cos = 1 / Math.sqrt(1 + tan * tan);
  const h = x => Math.max(0, x * tan - (a / (D * D)) * x * x * (1 + tan * tan));
  return { D, V, H, weak, tan, theta: Math.atan(tan), T: D / (V * cos), h, apex: tan > 0 ? h(Math.min(D, tan * D * D / (2 * a * (1 + tan * tan)))) : 0 };
}
/* Где шайба «видна» в плоскости ворот для предмета на доле пути 1/scale: высота дуги там, спроецированная лучом
   из точки броска (как и силуэты). Прямой полёт дал бы ровно target.v. */
export const arcPoint = (ar, target, scale) => ({ u: target.u, v: ar.h(ar.D / Math.max(1, scale)) * Math.max(1, scale) });

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
/* jitter — разброс реакции вратаря (с), по умолчанию ±30 мс; в учебном режиме («Новичок») 0 —
   тогда одинаковые условия всегда дают одинаковый исход. rng — генератор от seed ситуации (rngFrom). */
export function resolveShot({ S, target: aimed, speedMs, goalie, others = [], rng = Math.random, jitter = 0.06 }) {
  const ar = arc(S, aimed, speedMs);
  const target = ar.weak ? { u: aimed.u, v: ar.H } : aimed;
  const T = ar.T;
  const out = { T, target, arc: ar, weak: ar.weak };
  const fr = frameHit(target);
  if (fr) return { ...out, result: fr };
  // защитник и заслон: шайба на их глубине — на высоте дуги, а не на прямой
  for (const b of others) if (b.parts.some(p => inPoly(arcPoint(ar, target, p.scale), p.pts))) return { ...out, result: 'blocked', by: b.who };
  const lvl = LEVELS[goalie.level] || LEVELS.pro;
  const reaction = lvl.reaction + (goalie.delay || 0) + (rng() - 0.5) * jitter;
  const sil = goalie.sil;
  if (!sil.length) return { ...out, result: 'goal', empty: true, reaction }; // пустые ворота
  if (sil.some(p => inPoly(arcPoint(ar, target, p.scale), p.pts))) return { ...out, result: 'save', reason: 'body', reaction };
  let best = null;
  for (const p of sil) {
    // время до встречи шайбы с этой частью вратаря, а не до линии ворот: p.scale = (линия ворот − бросок) / (вратарь − бросок)
    const left = Math.max(0, T / Math.max(1, p.scale) - reaction);
    const d = Math.max(0, polyDist(arcPoint(ar, target, p.scale), p.pts) - PUCK_R);
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
/* Seed ситуации: одинаковая точка броска, вратарь, прицел, сила и режим → одинаковый seed → одинаковый исход. */
export function setupSeed(...parts) {
  let x = 2166136261 >>> 0;
  for (const ch of parts.map(v => (typeof v === 'number' ? v.toFixed(3) : String(v))).join('|')) { x ^= ch.charCodeAt(0); x = Math.imul(x, 16777619) >>> 0; }
  return x;
}

/* Тип броска после передачи или отскока: в одно касание — выпуск сразу, но разброс больше;
   после приёма — на обработку уходит время (вратарь успевает сместиться), зато точнее. */
export const SHOT_TYPES = {
  onetimer: { name: 'в одно касание', scatter: 1.35, handle: 0 },
  received: { name: 'после приёма', scatter: 0.8, handle: 0.18 },
};
export const ONE_TIMER_WINDOW = 0.15; // с после прихода шайбы — ещё «в касание»

/* Отскок после первого броска: направление зависит от того, во что попала шайба.
   dir — куда летит от вратаря (x — вбок к стороне части, y — от ворот), speed — м/с. Ловушка шайбу держит. */
export const REBOUND = {
  padL: { name: 'от левого щитка', side: -1, out: 0.55, speed: 6.5 },
  padR: { name: 'от правого щитка', side: 1, out: 0.55, speed: 6.5 },
  body: { name: 'от корпуса', side: 0, out: 1, speed: 3.5 },
  blocker: { name: 'от блина', side: -1, out: 0.35, speed: 8 },
};

/* Сила в «Новичке» — три пресета вместо ползунка. f — доля от диапазона силы (40 → 95/150 км/ч).
   Разброс исполнения у новичка не применяется (шайба летит в прицел), но показывается как риск на льду. */
export const PRESETS = {
  precise: { name: 'Точный', f: 0.25, line: 'медленнее, но кладёшь точно' },
  normal: { name: 'Обычный', f: 0.55, line: 'баланс скорости и точности' },
  strong: { name: 'Сильный', f: 0.95, line: 'быстрее до вратаря, разброс шире' },
};

/* Техника броска (режим «Техника»): время выпуска (замах — вратарь продолжает двигаться), множитель скорости,
   множитель разброса и сдвиг средней точки по высоте (бэкхенд обычно уходит ниже, щелчок — чуть выше).
   Приближённые учебные значения. */
export const TECH = {
  wrist: { name: 'Кистевой', release: 0.28, speed: 0.85, scatter: 0.9, dv: 0, blade: 'шайба катится с пятки на носок крюка, выпуск у носка' },
  snap: { name: 'Щелчок-кистевой', release: 0.18, speed: 0.95, scatter: 1.1, dv: 0.02, blade: 'короткий замах, крюк ставится за шайбу, удар с прогибом клюшки' },
  slap: { name: 'Щелчок', release: 0.55, speed: 1.15, scatter: 1.55, dv: 0.05, blade: 'широкий замах, удар крюком по льду перед шайбой' },
  backhand: { name: 'С неудобной руки', release: 0.32, speed: 0.7, scatter: 1.4, dv: -0.06, blade: 'тыльная сторона крюка, шайба уходит с выпуклой стороны' },
};

/* «Матч»: защитник сближается с бросающим. Достал клюшкой (ближе REACH) до выпуска — бросок заблокирован. */
export const MATCH = { closing: 3.2, reach: 1.25, delay: 0.35 }; // delay — защитник трогается не сразу (читает ситуацию)

/* Где прицел относительно рамы: 'out' — вне створа, 'edge' — ближе EDGE к штанге или перекладине, null — свободно. */
export const EDGE = 0.08;
export function aimEdge(a) {
  if (!a) return null;
  const inner = Math.min(GOAL.half - PUCK_R - Math.abs(a.u), GOAL.h - PUCK_R - a.v);
  if (inner < 0 || a.v < 0) return 'out';
  return inner < EDGE ? 'edge' : null;
}

/* Что было открыто в этом броске (по модели, при точном исполнении): лучшая точка сетки 9 × 5 по створу
   и её описание словами относительно вратаря. Нужна для разбора вместо общих правил. */
export function bestOpen({ S, speedMs, goalie, others = [] }) {
  let best = null;
  for (let i = 0; i <= 8; i++) for (let j = 0; j <= 4; j++) {
    const t = { u: -GOAL.half + 0.12 + (GOAL.w - 0.24) * i / 8, v: 0.08 + (GOAL.h - 0.2) * j / 4 };
    const r = resolveShot({ S, target: t, speedMs, goalie, others, rng: () => 0.5 });
    const m = r.result === 'goal' ? (r.empty ? 1 : (r.need ?? 0) - (r.reach ?? 0)) : -1;
    if (!best || m > best.m) best = { t, m, r };
  }
  return best && best.m > 0 ? best : null;
}
/* Описание точки створа словами: «верх у левой штанги», «низ по центру». Лево/право — как видит бросающий. */
export function spotName(t) {
  const h = t.v > 0.8 ? 'верх' : t.v < 0.35 ? 'низ' : 'середина по высоте';
  const s = t.u < -0.45 ? 'у левой штанги' : t.u > 0.45 ? 'у правой штанги' : 'по центру';
  return `${h} ${s}`;
}
