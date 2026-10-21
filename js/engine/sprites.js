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

/* Перчатки на картинках полевого — анатомически: L — левая рука игрока, R — правая (координаты исходной,
   незеркальной картинки). Ракурсы q3front, side, stride, q3back нарисованы смотрящими влево; вправо — зеркально,
   и тогда левая рука картинки становится правой (это учитывает вид «Глазами»).
   Сверено по картинкам: спереди правая рука игрока — слева для смотрящего; сзади и в профиль влево — наоборот. */
export const SKATER_VIEWS = ['front', 'q3front', 'side', 'stride', 'q3back', 'back'];
export const GLOVES = {
  front: { R: [215, 320], L: [335, 320] },
  q3front: { R: [205, 312], L: [325, 330] },
  side: { R: [122, 305], L: [180, 318] },
  stride: { R: [78, 310], L: [250, 322] },
  q3back: { L: [180, 305], R: [300, 300] },   // правая рука закрыта корпусом
  back: { L: [170, 305], R: [382, 305] },
};

/* Картинки с хватом: руки держат (невидимую) клюшку — верхняя рука у бедра, нижняя ниже и впереди,
   обе на одной прямой, которая продолжается к крюку на льду. Клюшку рисует код по этой прямой.
   top / bottom — центры кулаков верхней и нижней руки (координаты незеркальной картинки).
   Асимметричные ракурсы нарисованы смотрящими влево для обоих хватов; вправо — зеркало картинки другого хвата
   (зеркало левого хвата — это правый хват). Спереди и сзади есть только левый хват, правый — его зеркало. */
export const GRIPS = {
  'front-gL': { top: [205, 255], bottom: [292, 372] },
  'back-gL': { top: [408, 252], bottom: [178, 335] },
  'q3front-gL': { top: [185, 250], bottom: [270, 365] },
  'q3front-gR': { top: [372, 255], bottom: [270, 350] },
  'side-gL': { top: [350, 245], bottom: [182, 365] },
  'side-gR': { top: [302, 272], bottom: [100, 372] },
  'stride-gL': { top: [275, 245], bottom: [82, 375] },
  'stride-gR': { top: [268, 255], bottom: [72, 375] },
  'q3back-gL': { top: [400, 245], bottom: [150, 345] },
};
/* Какая картинка нужна игроку с хватом hand в ракурсе view, смотрящему влево (faceLeft) или вправо. */
export function gripSprite(team, view, hand, faceLeft) {
  const t = team === 'us' ? 'us' : 'them', other = hand === 'L' ? 'R' : 'L';
  let key, mirror;
  if (view === 'front' || view === 'back') { key = view + '-gL'; mirror = hand === 'R'; }
  else if (faceLeft) { key = view + '-g' + hand; mirror = false; }
  else { key = view + '-g' + other; mirror = true; }
  if (!GRIPS[key]) { key = 'back-gL'; mirror = hand === 'R'; } // вид три четверти со спины, правый хват влево — пока нет картинки
  return { img: load(`skater-${t}-${key}`), mirror, ...GRIPS[key] };
}

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
    for (const k of Object.keys(GRIPS)) load(`skater-${team}-${k}`);
    goalieImage(team, false); goalieImage(team, true);
  }
  GOALIE_POSES.forEach(goaliePoseImage);
  ownStickImage('L'); ownStickImage('R'); arenaImage();
}
export const ready = img => !!img && img.complete && img.naturalWidth > 0;
