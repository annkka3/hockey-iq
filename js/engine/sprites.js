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
  skater: { w: 560, h: 600, ax: 280, ay: 588 },
  goalie: { w: 640, h: 600, ax: 320, ay: 588 },
};

/* Точки перчаток в координатах спрайта полевого (для клюшки): две руки.
   Ракурсы q3front, side, stride, q3back нарисованы смотрящими влево; вправо — зеркально. */
export const SKATER_VIEWS = ['front', 'q3front', 'side', 'stride', 'q3back', 'back'];
export const GLOVES = {
  front: [[200, 316], [340, 316]],
  q3front: [[210, 300], [340, 320]],
  side: [[120, 300], [184, 310]],
  stride: [[90, 300], [250, 320]],
  q3back: [[180, 310], [300, 300]],
  back: [[160, 300], [384, 300]],
};

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
  return load(`skater-${team === 'us' ? 'us' : 'them'}-${SKATER_VIEWS.includes(view) ? view : 'front'}`);
}
/* Вратарь целиком для броска — набор поз в одном масштабе: 300 единиц = 1 м, кадр 640 × 600, коньки в (320, 588).
   Ловушка во всех позах — на его левой руке (справа для смотрящего); зеркалить нельзя.
   stand — стойка, butterfly — бабочка, glove / blocker — сейв ловушкой / блином, q3r и q3r2 — развёрнут к броску
   справа (умеренно / сильно), pushR — толчок вправо, padL — щиток выброшен влево по льду. */
export const GOALIE_UPM = 300;
export const GOALIE_POSES = ['stand', 'butterfly', 'glove', 'blocker', 'q3r', 'q3r2', 'pushR', 'padL'];
/* Где в каждой позе ловушка и блин: метры от точки между коньками (вправо для смотрящего, вверх). */
export const GOALIE_HANDS = {
  stand: { glove: [0.44, 0.86], blocker: [-0.45, 0.72] },
  butterfly: { glove: [0.43, 0.53], blocker: [-0.38, 0.45] },
  glove: { glove: [0.51, 1.43], blocker: [-0.47, 0.68] },
  blocker: { glove: [0.51, 0.83], blocker: [-0.49, 0.96] },
  q3r: { glove: [0.45, 0.86], blocker: [-0.43, 0.76] },
  q3r2: { glove: [0.51, 0.89], blocker: [-0.38, 0.8] },
  pushR: { glove: [0.51, 0.72], blocker: [-0.47, 0.72] },
  padL: { glove: [0.53, 0.85], blocker: [-0.38, 0.48] },
};
export function goaliePoseImage(pose) { return load('goalie-pose-' + (GOALIE_POSES.includes(pose) ? pose : 'stand')); }
export function goalieImage(team, back) {
  return load(`goalie-${team === 'us' ? 'us' : 'them'}-${back ? 'back' : 'front'}`);
}
export function ownStickImage(hand) { return load(hand === 'R' ? 'own-stick-right' : 'own-stick-left'); }
export function arenaImage() { return load('arena-back'); }

/* Заранее подготовить всё, что понадобится, — чтобы картинки не появлялись с задержкой посреди сцены. */
export function preload() {
  for (const team of ['us', 'them']) {
    for (const v of SKATER_VIEWS) skaterImage(team, v);
    goalieImage(team, false); goalieImage(team, true);
  }
  GOALIE_POSES.forEach(goaliePoseImage);
  ownStickImage('L'); ownStickImage('R'); arenaImage();
}
export const ready = img => !!img && img.complete && img.naturalWidth > 0;
