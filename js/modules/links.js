/* Связка модулей: ошибка в ситуации → похожая ситуация на тот же принцип → разбор розыгрыша по теме →
   тренажёр, который качает нужный навык (бросок или внимание). Всё строится из уже размеченного содержания. */
import { lib, keysOf } from '../content.js';
import { state } from '../core/state.js';

/* Принцип → режим «Броска» или тренажёр внимания. */
export const SHOT_FOR = { 'royal-road': 'royal', 'change-angle': 'drag', 'shot-lane': 'drag', 'quick-release': 'move', 'shoot-rebound': 'rebound', 'net-front': 'screen' };
export const DRILL_FOR = { 'shoulder-check': 'shoulder', 'open-ice': 'open', 'give-go': 'open', 'support-triangle': 'mates', 'f2-support': 'mates',
  'puck-protect': 'pressure', 'safe-exit': 'pressure', 'weak-side': 'danger', 'cover-d': 'danger', 'low-center': 'danger', 'backcheck': 'danger', 'net-side': 'danger' };
export const DRILL_NAME = { shoulder: 'Плечевой осмотр', open: 'Кто откроется', mates: 'Где партнёры', pressure: 'Откуда давят', danger: 'Самый опасный' };
export const SHOT_NAME = { royal: 'Королевская дорога', drag: 'Протяжка', move: 'В движении', rebound: 'Добивание', screen: 'Заслон' };

const recent = () => {
  const s = new Set();
  const from = Date.now() - 864e5;
  for (const x of state.sessions) if (x.startedAt > from) for (const it of x.items || []) if (it.cardId) s.add(it.cardId);
  return s;
};

/* Похожая ситуация: тот же принцип, иначе тот же блок программы и фаза; не контрольная и не сегодняшняя. */
export function similar(card, exclude = new Set()) {
  const seen = recent();
  const ok = c => c.id !== card.id && !c.holdout && !exclude.has(c.id);
  const tiers = [
    lib.cards.filter(c => ok(c) && c.principle === card.principle),
    lib.cards.filter(c => ok(c) && c.track && c.track === card.track && c.phase === card.phase),
    lib.cards.filter(c => ok(c) && c.phase === card.phase),
  ];
  for (const t of tiers) {
    if (!t.length) continue;
    const fresh = t.filter(c => !seen.has(c.id));
    const pool = fresh.length ? fresh : t;
    const c = pool[Math.floor(Math.random() * pool.length)];
    return keysOf(c)[0];
  }
  return null;
}

export const filmFor = principle => (lib.plays || []).find(p => p.principle === principle && !p.mission) || null;
