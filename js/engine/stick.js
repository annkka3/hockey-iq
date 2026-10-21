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
    // приём всегда на форхенде: крюк остаётся на стороне хвата (не меньше 0,18 м от середины), даже если пас идёт
    // с другой стороны — шайба приходит поперёк корпуса на лицевую сторону; руки местами не меняются
    let l0 = a.l * side * 0.7 + ul * 0.35;
    if (l0 * side < 0.18) l0 = side * 0.18;
    mid = v(Math.max(0.45, a.f * 0.6 + uf * 0.35), l0);
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

/* Действие игрока в стоп-кадре по карточке (позиции — мировые, м; map — точка карточки → мир).
   Порядок: явное e.action (ready|carry|receive|pass|shot|block) → у кого шайба (carry) → приём (receive) → перекрытие (block) → готовность.
   Приём ставится, только если ВСЕ варианты ответа начинаются с одной и той же передачи этому игроку
   (это часть ситуации, а не ответ): иначе поза клюшки подсказывала бы правильный вариант.
   Перекрытие: игрок без шайбы стоит рядом с владельцем (клюшка на шайбу) или у линии передачи от владельца
   к партнёру — крюк ставится в эту линию. Возвращает { action, from?, target? } (from/target — мир). */
export const ACT = { carry: 1.3, receive: 2.5, pressure: 2.4, lane: 1.9 };
export function actionOf(e, card, p, puck, map = q => q) {
  if (e.action) return { action: e.action }; // явное действие из карточки; точка крюка — её stick
  if (!puck) return { action: 'ready' };
  const dP = Math.hypot(puck.x - p.x, puck.y - p.y);
  if (dP < ACT.carry) return { action: 'carry' };
  // приём: общая первая передача всех вариантов
  const firsts = ((card && card.options) || []).map(o => (o.moves || []).find(m => m.who === 'puck'))
    .filter(Boolean);
  if (firsts.length && firsts.every(m => (m.kind || 'pass') === 'pass')) {
    const t0 = map({ x: firsts[0].to[0], y: firsts[0].to[1] });
    const same = firsts.every(m => { const t = map({ x: m.to[0], y: m.to[1] }); return Math.hypot(t.x - t0.x, t.y - t0.y) < 1.5; });
    if (same && Math.hypot(t0.x - p.x, t0.y - p.y) < ACT.receive) return { action: 'receive', from: puck };
  }
  if (e.role === 'G' || !card) return { action: 'ready' };
  // команда игрока и владелец шайбы
  const all = [...(card.us || []).map(x => ({ ...x, team: 'us' })), ...(card.them || []).map(x => ({ ...x, team: 'them' }))]
    .filter(x => x.role !== 'G').map(x => ({ ...x, w: map({ x: x.x, y: x.y }) }));
  const mine = all.find(x => x.id === e.id);
  let holder = null, hd = 1.6;
  for (const x of all) { const k = Math.hypot(x.w.x - puck.x, x.w.y - puck.y); if (k < hd) { hd = k; holder = x; } }
  if (!holder || !mine || holder.team === mine.team) return { action: 'ready' };
  // на шайбу клюшку ставит один — ближайший к ней игрок команды
  const nearest = all.filter(o => o.team === mine.team).every(o => o.id === mine.id || Math.hypot(o.w.x - puck.x, o.w.y - puck.y) >= dP);
  if (dP < ACT.pressure && nearest) return { action: 'block', target: puck };
  if (dP < ACT.pressure) return { action: 'ready' };
  // расстояние точки до линии передачи владелец → m (или null, если не между ними)
  const laneDist = (pt, m) => {
    const ax = puck.x, ay = puck.y, vx = m.w.x - ax, vy = m.w.y - ay, LL = vx * vx + vy * vy || 1;
    const t = ((pt.x - ax) * vx + (pt.y - ay) * vy) / LL;
    if (t < 0.15 || t > 0.9) return null;
    const q = { x: ax + vx * t, y: ay + vy * t };
    return { k: Math.hypot(pt.x - q.x, pt.y - q.y), q };
  };
  let best = null, bd = ACT.lane;
  for (const m of all) {
    if (m.team !== holder.team || m.id === holder.id) continue;
    const r = laneDist(p, m);
    if (!r || r.k >= bd) continue;
    // каждую линию перекрывает один — ближайший к ней игрок команды (остальные держат своих)
    const closer = all.some(o => o.team === mine.team && o.id !== mine.id && o.role !== 'G'
      && (() => { const ro = laneDist(o.w, m); return ro && ro.k < r.k; })());
    if (closer) continue;
    bd = r.k; best = r.q;
  }
  return best ? { action: 'block', target: best } : { action: 'ready' };
}

function norm(a) { const L = Math.hypot(a.f, a.l) || 1; return v(a.f / L, a.l / L); }
function lerp3(a, b, t) { return v(a.f + (b.f - a.f) * t, a.l + (b.l - a.l) * t, a.h + (b.h - a.h) * t); }
