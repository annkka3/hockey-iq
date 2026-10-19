/* Геометрия площадки. Всё в метрах.
   Система координат карточек (авторская, одна для всех площадок):
     x — поперёк, от −15 (левый борт, если смотреть в атаку) до +15 (правый борт), 0 — центр;
     y — вдоль, 0 — свой торцевой борт, 60 — чужой. Атака всегда вверх.
   Карточки пишутся под IIHF 60×30; для другой площадки точки пересчитываются по ориентирам
   (линии ворот, синие, центр), поэтому карточка не зависит от размера льда.
   Размеры IIHF: синяя линия 22,86 м от торцевого борта, точки нейтральной зоны в 1,5 м от синей
   и в 14 м друг от друга, круги R 4,5 м (IIHF Rule Book, разд. 1). Линия ворот 4 м, точки зоны 6 м от линии
   ворот и 7 м от центра, вратарская R 1,83 м, ворота 1,83 × 1,22 м. */

export const RINKS = {
  iihf: { id: 'iihf', name: 'IIHF 60×30', L: 60, W: 30, R: 8.5, goalLine: 4, blue: 22.86, dotOut: 6, dotSide: 7,
          circleR: 4.5, nzDotFromBlue: 1.5, nzDotSide: 7, creaseR: 1.83, goalW: 1.83, goalH: 1.22, goalD: 1.12 },
  nhl:  { id: 'nhl', name: 'NHL 61×26', L: 60.96, W: 25.91, R: 8.53, goalLine: 3.35, blue: 22.86, dotOut: 6.1, dotSide: 6.71,
          circleR: 4.57, nzDotFromBlue: 1.52, nzDotSide: 6.71, creaseR: 1.83, goalW: 1.83, goalH: 1.22, goalD: 1.12 },
};

const AUTHOR = RINKS.iihf;

/* Ориентиры вдоль площадки: между ними пересчёт линейный. */
const marks = r => [0, r.goalLine, r.blue, r.L / 2, r.L - r.blue, r.L - r.goalLine, r.L];

export function mapPoint(p, rink) {
  if (rink.id === AUTHOR.id) return { x: p.x, y: p.y };
  const a = marks(AUTHOR), b = marks(rink);
  let y = p.y;
  for (let i = 1; i < a.length; i++) {
    if (p.y <= a[i] || i === a.length - 1) {
      const t = (p.y - a[i - 1]) / (a[i] - a[i - 1]);
      y = b[i - 1] + t * (b[i] - b[i - 1]);
      break;
    }
  }
  return { x: p.x * (rink.W / AUTHOR.W), y };
}

/* Окна просмотра: какая часть площадки видна на карточке. */
export function viewWindow(view, rink) {
  const r = rink, L = r.L;
  const win = {
    oz: [L - r.blue - 3.5, L],
    dz: [0, r.blue + 3.5],
    nz: [r.blue - 6, L - r.blue + 6],
    full: [0, L],
  };
  const [y0, y1] = Array.isArray(view) ? view.map(v => mapPoint({ x: 0, y: v }, rink).y) : (win[view] || win.full);
  return { y0, y1 };
}

/* Экранные координаты SVG: x как есть, y перевёрнут (в SVG ось вниз). */
export const toScreen = (p, rink) => ({ x: p.x, y: rink.L - p.y });
export const fromScreen = (s, rink) => ({ x: s.x, y: rink.L - s.y });

export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/* Контур площадки со скруглёнными углами в экранных координатах. */
export function boardsPath(rink) {
  const { W, L, R } = rink, x0 = -W / 2, x1 = W / 2;
  return `M${x0 + R} 0 H${x1 - R} A${R} ${R} 0 0 1 ${x1} ${R} V${L - R} A${R} ${R} 0 0 1 ${x1 - R} ${L} ` +
         `H${x0 + R} A${R} ${R} 0 0 1 ${x0} ${L - R} V${R} A${R} ${R} 0 0 1 ${x0 + R} 0 Z`;
}

/* Геометрия ворот для будущей физики броска: угол на ворота из точки (в градусах). */
export function goalAngle(p, rink, attacking = true) {
  const gy = attacking ? rink.L - rink.goalLine : rink.goalLine;
  const a = Math.atan2(gy - p.y, -rink.goalW / 2 - p.x);
  const b = Math.atan2(gy - p.y, rink.goalW / 2 - p.x);
  return Math.abs(a - b) * 180 / Math.PI;
}
