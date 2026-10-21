/* «Живой лёд»: после решения игрока соперники и партнёры реагируют по простым правилам.
   Не игровой ИИ, а несколько хоккейных правил, которые показывают последствия выбора:
   — ближайший соперник закрывает дистанцию с владельцем шайбы (при хорошем решении опаздывает);
   — второй соперник смещается в линию паса к открытому партнёру;
   — партнёр без шайбы уезжает в свободное место (поддержка);
   — вратарь смещается за шайбой;
   — соперник у линии паса ставит в неё клюшку (крюк в линии, а не в погоне);
   — защитник соперника пятится, держа дистанцию с владельцем (гэп) между ним и своими воротами;
   — в нашей зоне второй форчекер заходит под углом со стороны центра, прижимая владельца к борту;
   — у своих ворот свободный соперник смыкается на пятак со стороны шайбы;
   — третий наш игрок остаётся выше (страховка центра): между шайбой и своей синей, ближе к середине;
   — смена опеки: если наш игрок проехал через зону соперника, ближайший к нему свободный соперник
     подхватывает его, вставая со стороны своих ворот;
   — потеря шайбы: наши свободные игроки, оказавшиеся выше шайбы, возвращаются (бэкчек) и встают
     между ближайшим соперником без шайбы и своими воротами.
   Работает в авторских координатах карточки (метры, атака вверх), сам «Я» не двигается —
   его ход уже сделан выбором. Возвращает ходы в формате Scene.play(). */

const W = 30, L = 60, R = 8.5;
const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const REACH = 4.5; // м — сколько игрок успевает проехать за окно реакции (~0,3 с задержки + 0,7 с хода)
const GAP = 4;      // м — дистанция, которую защитник держит с владельцем, отъезжая к своим воротам
const BACK = 3;     // м — сколько защитник успевает отъехать спиной вперёд за то же окно (медленнее, чем лицом)
const ANGLE = 1.6;  // м — смещение форчекера к центру от владельца: заход «снаружи внутрь», к борту
const SLOT = 3.5;   // м — расстояние от линии ворот, где смыкается защита у пятака
const LANE = 2.2;   // м — дальше этого от линии паса соперник клюшку в неё не дотянет (≈ рука + клюшка + шаг)
const HIGH = 8;     // м — насколько страхующий третий игрок стоит ниже шайбы (к своей синей)
const SWITCH = 3;   // м — проезд нашего игрока на такое расстояние и ближе к сопернику запускает смену опеки
const GOALSIDE = 1.5; // м — где встаёт подхвативший опекун: на столько ближе к своим воротам, чем игрок
const BACKCHECK = 6; // м — сколько успевает вернуться игрок после потери шайбы (лицом вперёд, разгон)
/* Ближайшая к p точка отрезка a→b (линия передачи). */
const onSegment = (p, a, b) => {
  const vx = b.x - a.x, vy = b.y - a.y, L = vx * vx + vy * vy || 1;
  const t = Math.max(0.15, Math.min(0.85, ((p.x - a.x) * vx + (p.y - a.y) * vy) / L));
  return { x: a.x + vx * t, y: a.y + vy * t };
};
const clampIce = (p, m = 1) => {
  let x = Math.max(-W / 2 + m, Math.min(W / 2 - m, p.x)), y = Math.max(m, Math.min(L - m, p.y));
  const cx = x < -W / 2 + R ? -W / 2 + R : x > W / 2 - R ? W / 2 - R : null;
  const cy = y < R ? R : y > L - R ? L - R : null;
  if (cx != null && cy != null) {
    const k = Math.hypot(x - cx, y - cy);
    if (k > R - m) { x = cx + (x - cx) * (R - m) / k; y = cy + (y - cy) * (R - m) / k; }
  }
  return { x: +x.toFixed(1), y: +y.toFixed(1) };
};
/* Сдвиг от a к b: остановиться на расстоянии gap от b, но проехать не больше max. */
const approach = (a, b, gap, max = 7) => {
  const D = d(a, b);
  if (D <= gap) return null;
  const go = Math.min(D - gap, max), k = go / D;
  return clampIce({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
};

/* Расстановка после подводки, продолжения (read.reveal) и ходов выбранного варианта. */
export function positions(card, moveLists) {
  const pos = {}, team = {};
  for (const e of card.us || []) { pos[e.id] = { x: e.x, y: e.y }; team[e.id] = 'us'; }
  for (const e of card.them || []) { pos[e.id] = { x: e.x, y: e.y }; team[e.id] = 'them'; }
  if (card.puck) pos.puck = { x: card.puck.x, y: card.puck.y };
  let lastPuck = null;
  for (const list of moveLists) for (const mv of list || []) {
    if (!pos[mv.who]) continue;
    pos[mv.who] = { x: mv.to[0], y: mv.to[1] };
    if (mv.carry && pos.puck) pos.puck = { x: mv.to[0], y: mv.to[1] };
    if (mv.who === 'puck') lastPuck = mv.kind || 'pass';
  }
  return { pos, team, lastPuck };
}

/* Возвращает ходы реакции (все одновременно). Вердикт ответа не используется: последствия считаются
   только из расстановки после хода — правила одинаковы для любого варианта. */
export function respond(card, moveLists, verdict) {
  if (!card || !card.puck) return [];
  const { pos, team, lastPuck } = positions(card, moveLists);
  const meId = ((card.us || []).find(e => e.me) || {}).id;
  const moved = new Set(moveLists.slice(-1).flat().filter(Boolean).map(m => m.who)); // уже сходили в варианте — их не трогаем
  const role = {};
  for (const e of [...(card.us || []), ...(card.them || [])]) role[e.id] = e.role;
  const skaters = side => Object.keys(team).filter(id => team[id] === side && role[id] !== 'G');
  const free = id => id !== meId && !moved.has(id);
  const P = pos.puck;
  const out = [];
  const done = new Set(); // каждый игрок получает не больше одного хода реакции
  const push = (who, to, extra = {}) => { if (to && !done.has(who) && d(pos[who], to) > 0.6) { out.push({ who, to: [to.x, to.y], kind: 'skate', ...extra }); pos[who] = to; done.add(who); } };

  // кто владеет шайбой
  let carrier = null, cd = 1.6;
  for (const id of Object.keys(team)) { if (role[id] === 'G') continue; const k = d(pos[id], P); if (k < cd) { cd = k; carrier = id; } }

  // бросок: только вратарь и игрок на пятаке
  if (lastPuck === 'shot') {
    goalies(card, pos, role, team, P, push);
    return group(out);
  }

  const near = (from, ids) => ids.filter(free).sort((a, b) => d(pos[a], from) - d(pos[b], from));

  // Одинаковые правила для любого выбора: окно реакции ~1 с, за которое игрок проезжает не больше REACH.
  // Хороший выбор не «замедляет» соперника — он ставит шайбу и игроков так, что тот физически не успевает.
  const ourAll = skaters('us'); // включая «Я»: его новая позиция уже учтена
  if (carrier && team[carrier] === 'us') {
    const opp = near(P, skaters('them'));
    // 1. давление на шайбу: ближайший соперник едет к владельцу, сколько успеет
    if (opp[0]) push(opp[0], approach(pos[opp[0]], P, 0.9, REACH));
    // 2. поддержка: партнёр без шайбы (не «Я» и не владелец) уезжает в свободное место
    const mates = near(P, skaters('us')).filter(id => id !== carrier);
    const helper = mates[0];
    if (helper) push(helper, openSpot(pos, team, role, P, pos[helper], 'us'));
    // 3. перекрытие передачи: второй соперник едет к ближайшей точке линии паса на самого открытого из «Я» и помощника
    const targets = [helper, meId].filter(id => id && id !== carrier && pos[id]);
    const openness = id => Math.min(...skaters('them').map(o => d(pos[o], pos[id])));
    const target = targets.sort((a, b) => openness(b) - openness(a))[0];
    if (opp[1] && target) {
      const q = onSegment(pos[opp[1]], P, pos[target]);
      const to = approach(pos[opp[1]], q, 0.3, REACH) || pos[opp[1]];
      // успел к линии — крюк в неё (клюшкой, а не телом)
      const still = d(to, pos[opp[1]]) <= 0.6, inLane = d(to, q) < LANE;
      if (still && inLane) out.push({ who: opp[1], to: [to.x, to.y], kind: 'skate', stick: [q.x, q.y] }); // уже стоит — только клюшка
      else push(opp[1], to, inLane ? { stick: [q.x, q.y] } : {});
    }
    const goalThem = { x: 0, y: 56 }; // ворота соперника (мы атакуем вверх)
    const rest = opp.slice(2);
    // 4. гэп: соперник между владельцем и своими воротами отъезжает, держа дистанцию GAP
    const backer = rest.find(id => pos[id].y > P.y + 1 && d(pos[id], P) < GAP + BACK);
    if (backer) {
      const D = d(P, goalThem) || 1, k = Math.min(1, GAP / D);
      const want = clampIce({ x: P.x + (goalThem.x - P.x) * k, y: P.y + (goalThem.y - P.y) * k });
      push(backer, approach(pos[backer], want, 0.2, BACK));
    }
    // 5. форчек в нашей зоне: следующий соперник заходит со стороны центра, прижимая к борту
    const f2 = rest.find(id => id !== backer);
    if (P.y < 22.86 && f2) {
      const side = P.x >= 0 ? -1 : 1; // со стороны центра площадки
      push(f2, approach(pos[f2], clampIce({ x: P.x + side * ANGLE, y: P.y + 1 }), 0.4, REACH));
    } else if (P.y > 44 && f2) {
      // 6. у своих ворот: смыкание на пятак со стороны шайбы
      const slot = clampIce({ x: Math.sign(P.x) * 1.2, y: 56 - SLOT });
      push(f2, approach(pos[f2], slot, 0.3, REACH));
    }
    // 7. страховка: следующий свободный партнёр остаётся выше шайбы, ближе к центру (третий игрок «высоко»)
    const third = mates.find(id => id !== helper && !done.has(id));
    if (third && P.y > 26) push(third, approach(pos[third], clampIce({ x: P.x * 0.4, y: Math.max(24, P.y - HIGH) }), 0.5, REACH));
    // 8. смена опеки: наш игрок проехал вариантом рядом с соперником — тот (если свободен) подхватывает его
    for (const id of moved) {
      if (team[id] !== 'us' || id === carrier || role[id] === 'G') continue;
      const foe = skaters('them').filter(o => free(o) && !done.has(o)).sort((a, b) => d(pos[a], pos[id]) - d(pos[b], pos[id]))[0];
      if (!foe || d(pos[foe], pos[id]) > SWITCH + REACH) continue;
      const gs = clampIce({ x: pos[id].x * 0.9, y: pos[id].y + GOALSIDE }); // со стороны ворот соперника (они наверху)
      push(foe, approach(pos[foe], gs, 0.3, REACH));
    }
  } else if (carrier && team[carrier] === 'them') {
    // защита: наш ближайший свободный игрок прижимает владельца
    const ours = near(pos[carrier], skaters('us'));
    if (ours[0]) push(ours[0], approach(pos[ours[0]], pos[carrier], 1.2, REACH));
    // владелец едет на наши ворота: если рядом наш игрок (в том числе «Я»), продвинуться почти не может
    const goal = { x: 0, y: 4 };
    const press = Math.min(...ourAll.map(id => d(pos[id], pos[carrier])));
    if (free(carrier)) {
      const to = approach(pos[carrier], goal, 0, press < 2.5 ? 1.2 : REACH * 0.85);
      if (to) { push(carrier, to, { carry: true }); pos.puck = to; }
    }
    // его партнёр открывается в свободное место
    const theirs = near(pos[carrier], skaters('them')).filter(id => id !== carrier);
    if (theirs[0]) push(theirs[0], openSpot(pos, team, role, pos[carrier], pos[theirs[0]], 'them'));
    // потеря шайбы: наши свободные игроки выше шайбы возвращаются и встают между соперником без шайбы и своими воротами
    const back = skaters('us').filter(id => free(id) && !done.has(id) && pos[id].y > pos[carrier].y + 2).slice(0, 2);
    const marks = skaters('them').filter(id => id !== carrier);
    for (const id of back) {
      const m = marks.filter(o => !done.has('m:' + o)).sort((a, b) => d(pos[a], goal) - d(pos[b], goal))[0];
      const want = m ? clampIce({ x: pos[m].x * 0.85, y: Math.max(5, pos[m].y - GOALSIDE) }) : clampIce({ x: pos[id].x * 0.5, y: Math.max(8, pos[carrier].y - 4) });
      if (m) done.add('m:' + m);
      push(id, approach(pos[id], want, 0.4, BACKCHECK));
    }
  } else {
    // ничья шайба: кто ближе по времени, тот и успевает; второй останавливается рядом
    const tOurs = Math.min(...ourAll.map(id => d(pos[id], P)));
    const ours = near(P, skaters('us')), theirs = near(P, skaters('them'));
    const tThem = theirs[0] ? d(pos[theirs[0]], P) : Infinity;
    const weWin = tOurs <= tThem;
    if (ours[0]) push(ours[0], approach(pos[ours[0]], P, weWin ? 0.6 : 1.5, REACH));
    if (theirs[0]) push(theirs[0], approach(pos[theirs[0]], P, weWin ? 1.5 : 0.6, REACH));
  }
  goalies(card, pos, role, team, pos.puck, push);
  return group(out);
}

function goalies(card, pos, role, team, P, push) {
  for (const id of Object.keys(team)) {
    if (role[id] !== 'G') continue;
    const g = pos[id], top = g.y > 30;
    if (top ? P.y < 30 : P.y > 30) continue; // шайба в другой половине — вратарь на месте
    const x = Math.max(-0.9, Math.min(0.9, P.x * 0.12));
    push(id, { x: +x.toFixed(1), y: g.y });
  }
}

/* Свободное место для поддержки: точки вокруг шайбы на 5–7 м, подальше от соперников, не дальше 7 м от игрока. */
function openSpot(pos, team, role, P, from, side) {
  const foes = Object.keys(team).filter(id => team[id] !== side && role[id] !== 'G').map(id => pos[id]);
  const dir = side === 'us' ? 1 : -1; // куда атакует сторона
  let best = null, score = -Infinity;
  for (const r of [5, 6.5]) for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    const c = clampIce({ x: P.x + Math.cos(a) * r, y: P.y + Math.sin(a) * r }, 1.5);
    if (d(c, from) > 7.5) continue;
    const space = Math.min(...foes.map(f => d(f, c)), 9);
    const forward = (c.y - P.y) * dir; // чуть выше шайбы — лучше для атаки, но не обязательно
    const s = space * 1.4 + Math.max(-2, Math.min(2, forward * 0.25)) - d(c, from) * 0.15;
    if (s > score) { score = s; best = c; }
  }
  return best;
}

/* Все реакции одновременно: первый ход задаёт шаг, остальные «with». */
function group(moves) {
  return moves.map((m, i) => (i === 0 ? { ...m, with: undefined } : { ...m, with: true }));
}
