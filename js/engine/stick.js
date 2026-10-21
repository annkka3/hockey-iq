/* Клюшка полевого игрока — одна модель для схемы сверху и вида «Глазами».
   Система координат тела (метры): f — вперёд, l — влево от игрока, h — высота над льдом.
   Хват фиксирован для игрока и не зависит от камеры, поворота корпуса и бекхенда:
     L (левый хват): нижняя рука — левая, верхняя — правая; крюк на форхенде — слева от тела;
     R — наоборот.
   Отдельные сущности: верхняя рука (торец), нижняя рука, пятка, носок, рабочая сторона крюка
   (нормаль лицевой поверхности) и точка контакта с шайбой. Древко — прямая через обе руки к пятке;
   крюк продолжает горизонтальную проекцию древка (так клюшка лежит на льду при своём угле наклона),
   а его лицевая сторона — форхенд или бекхенд — определяется действием. */

export const STICK = { len: 1.45, knobH: 0.82, bottomAt: 0.42, blade: 0.3 };

const v = (f, l, h = 0) => ({ f, l, h });
const hyp = (a, b) => Math.hypot(a.f - b.f, a.l - b.l);

/* Действия и где у них по умолчанию крюк (f, l на стороне форхенда; side = +1 у левого хвата). */
const ACTIONS = {
  ready: { f: 0.78, l: 0.32, face: 'fore' },   // готовность: крюк на льду впереди на стороне хвата
  carry: { f: 0.72, l: 0.26, face: 'fore' },   // ведение: шайба перед крюком
  receive: { f: 0.7, l: 0.4, face: 'fore' },   // приём паса низом: крюк на льду лицом к шайбе
  pass: { f: 0.62, l: 0.42, face: 'fore' },
  shot: { f: 0.55, l: 0.5, face: 'fore' },
  block: { f: 0.95, l: 0.15, face: 'fore' },   // перехват: крюк вытянут в линию паса
};

/* hand — 'L'|'R'; action — ключ ACTIONS; contact — точка контакта в теле {f, l} или null; toward — откуда идёт шайба {f, l} (для приёма). */
export function stickPose({ hand = 'L', action = 'ready', contact = null, toward = null } = {}) {
  const side = hand === 'R' ? -1 : 1;
  const knob = v(0.22, -0.13 * side, STICK.knobH);                     // верхняя рука у бедра на своей стороне
  const reachMax = Math.sqrt(STICK.len ** 2 - STICK.knobH ** 2) - 0.04;  // горизонтальная досягаемость пятки от торца
  const a = ACTIONS[action] || ACTIONS.ready;
  let face = a.face;
  // точка, где должна быть середина крюка
  let mid = contact ? v(contact.f, contact.l) : v(a.f, a.l * side);
  if (action === 'receive' && toward && !contact) {
    // крюк встречает шайбу рабочей поверхностью: выносим его навстречу передаче на стороне хвата
    const L = Math.hypot(toward.f, toward.l) || 1, uf = toward.f / L, ul = toward.l / L;
    mid = v(a.f * 0.6 + uf * 0.35, a.l * side * 0.7 + ul * 0.35);
  }
  // бекхенд: контакт на другой стороне от хвата
  if ((mid.l - knob.l) * side < -0.05) face = 'back';
  // направление крюка — продолжение древка в плане; пятка = середина − половина крюка
  const dir0 = norm(v(mid.f - knob.f, mid.l - knob.l));
  let heel = v(mid.f - dir0.f * STICK.blade / 2, mid.l - dir0.l * STICK.blade / 2);
  // ограничение досягаемости: клюшка не растягивается
  let r = hyp(heel, knob);
  const rMin = 0.45;
  if (r > reachMax || r < rMin) {
    const k = Math.max(rMin, Math.min(reachMax, r)) / (r || 1);
    heel = v(knob.f + (heel.f - knob.f) * k, knob.l + (heel.l - knob.l) * k);
    if (r < 1e-6) heel = v(knob.f + rMin, knob.l);
  }
  const dir = norm(v(heel.f - knob.f, heel.l - knob.l));
  const toe = v(heel.f + dir.f * STICK.blade, heel.l + dir.l * STICK.blade);
  // лицевая сторона форхенда смотрит от стороны хвата к середине тела (у левого — вправо от крюка)
  let n = v(-dir.l, dir.f);                       // перпендикуляр влево от направления крюка
  if (n.l * side > 0) n = v(-n.f, -n.l);          // форхенд — в сторону, противоположную хвату
  if (face === 'back') n = v(-n.f, -n.l);
  const bottom = lerp3(knob, v(heel.f, heel.l, 0), STICK.bottomAt / STICK.len * 1.0);
  const c = contact ? v(contact.f, contact.l) : v((heel.f + toe.f) / 2 + n.f * 0.04, (heel.l + toe.l) / 2 + n.l * 0.04);
  return { hand, side, action, face, knob, bottom, heel, toe, normal: n, contact: c,
    topHand: hand === 'R' ? 'L' : 'R', bottomHand: hand === 'R' ? 'R' : 'L' };
}

/* Из тела в мир: fw — куда смотрит игрок (вектор), p — точка игрока на льду. */
export function toWorld(q, p, fw) {
  const L = Math.hypot(fw.x, fw.y) || 1, fx = fw.x / L, fy = fw.y / L;
  return { x: p.x + fx * q.f - fy * q.l, y: p.y + fy * q.f + fx * q.l, h: q.h || 0 };
}
/* Из мира в тело. */
export function toBody(w, p, fw) {
  const L = Math.hypot(fw.x, fw.y) || 1, fx = fw.x / L, fy = fw.y / L, dx = w.x - p.x, dy = w.y - p.y;
  return { f: dx * fx + dy * fy, l: -dx * fy + dy * fx };
}

/* Действие игрока по карточке: у кого шайба — ведение, к кому идёт пас — приём, у соперника в линии — перехват. */
export function actionOf(e, card, p, puck) {
  if (e.action) return e.action;
  if (puck && Math.hypot(puck.x - p.x, puck.y - p.y) < 1.3) return 'carry';
  return 'ready';
}

function norm(a) { const L = Math.hypot(a.f, a.l) || 1; return v(a.f / L, a.l / L); }
function lerp3(a, b, t) { return v(a.f + (b.f - a.f) * t, a.l + (b.l - a.l) * t, a.h + (b.h - a.h) * t); }
