/* Иллюстрированные спрайты (растровые, img/sprites/*.webp, прозрачный фон).
   Полевой игрок: три ракурса — лицом (front), боком (side, смотрит влево; вправо — зеркально), спиной (back).
   Холст полевого 400 × 600, вратаря 640 × 600; фигура ростом 560 единиц, точка опоры — между коньками (центр, y 588).
   Клюшка полевого в спрайт не входит: она рисуется в мировых координатах сцены, чтобы крюк стоял ровно там же,
   где на схеме, и на стороне хвата. Вратарь в броске собирается из частей (маска, нагрудник, щитки, ловушка, блин,
   клюшка) — каждая встаёт в свой прямоугольник модели броска: что видно, то и считается. */

const BASE = new URL('../../img/sprites/', import.meta.url).href;

export const TEAMS = {
  us: { main: '#1B3F7A', dark: '#102A55', trim: '#FFFFFF' },
  them: { main: '#D42A3C', dark: '#9E1828', trim: '#FFFFFF' },
};

/* Размер холста и точка опоры (между коньками) в единицах картинки. */
export const META = {
  skater: { w: 400, h: 600, ax: 200, ay: 588 },
  goalie: { w: 640, h: 600, ax: 320, ay: 588 },
};

/* Точки перчаток в координатах спрайта полевого (для клюшки): две руки. */
export const GLOVES = {
  front: [[120, 312], [312, 312]],
  side: [[40, 304], [108, 304]],
  back: [[86, 300], [304, 300]],
};

/* Пропорции частей вратаря (ширина / высота) — чтобы часть не растягивалась при остром угле. */
export const PART_AR = { head: 0.758, body: 1.311, glove: 0.896, blocker: 0.701, stick: 2.994, legL: 0.451, legR: 0.451, pads: 3.03 };

const cache = new Map();
function load(name) {
  if (!cache.has(name)) {
    const img = new Image();
    img.decoding = 'async';
    img.src = BASE + name + '.webp';
    cache.set(name, img);
  }
  return cache.get(name);
}

export function skaterImage(team, view) {
  return load(`skater-${team === 'us' ? 'us' : 'them'}-${view === 'back' ? 'back' : view === 'side' ? 'side' : 'front'}`);
}
/* Вратарь целиком для броска: стойка или «бабочка» (кадр 640 × 600, опора (320, 588)); fig — высота фигуры в единицах. */
export const GOALIE_POSE = { stand: { file: 'goalie-them-front', fig: 560 }, butterfly: { file: 'goalie-them-butterfly', fig: 466 } };
export function goaliePoseImage(pose) { return load(GOALIE_POSE[pose].file); }
export function goalieImage(team, back) {
  return load(`goalie-${team === 'us' ? 'us' : 'them'}-${back ? 'back' : 'front'}`);
}
const PART_FILE = { head: 'g-head', body: 'g-body', glove: 'g-glove', blocker: 'g-blocker', stick: 'g-stick', legL: 'g-pad', legR: 'g-pad', pad: 'g-pad', pads: 'g-pads' };
export function goaliePartImage(id) {
  return PART_FILE[id] ? load(PART_FILE[id]) : null;
}
export function ownStickImage(hand) { return load(hand === 'R' ? 'own-stick-right' : 'own-stick-left'); }
export function arenaImage() { return load('arena-back'); }

/* Заранее подготовить всё, что понадобится, — чтобы картинки не появлялись с задержкой посреди сцены. */
export function preload() {
  for (const team of ['us', 'them']) {
    for (const v of ['front', 'side', 'back']) skaterImage(team, v);
    goalieImage(team, false); goalieImage(team, true);
  }
  goaliePoseImage('stand'); goaliePoseImage('butterfly');
  ownStickImage('L'); ownStickImage('R'); arenaImage();
}
export const ready = img => !!img && img.complete && img.naturalWidth > 0;
