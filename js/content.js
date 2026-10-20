/* Библиотека контента: загрузка, поиск, ключи повторения.
   Встроенный пакет core лежит в data/content.json; пакеты команды и «мои моменты» потом
   добавляются в тот же список через addPack — движок не различает их по происхождению. */

export const lib = { plays: [], cards: [], byId: {}, decks: [], phases: [], principles: [], principle: {}, phase: {}, built: '' };

export async function loadContent() {
  const data = window.__HK_CONTENT || await (await fetch('data/content.json', { cache: 'no-cache' })).json();
  lib.decks = data.decks;
  lib.phases = data.phases;
  lib.principles = data.principles;
  lib.built = data.built;
  lib.plays = data.plays || [];
  lib.scans = data.scans || [];
  lib.program = data.program || null;
  for (const p of data.principles) lib.principle[p.id] = p;
  for (const p of data.phases) lib.phase[p.id] = p;
  addPack(data.cards, 'core');
  markHoldout();
}

/* Контрольный набор: примерно каждая шестая встроенная ситуация не попадает в тренировки.
   На ней раз в 4 недели проверяется перенос — решение незнакомых эпизодов без подсказок.
   Выбор детерминированный (по id), поэтому одинаков на всех устройствах. */
const hash = s => { let x = 2166136261; for (const ch of s) { x ^= ch.charCodeAt(0); x = Math.imul(x, 16777619); } return x >>> 0; };
function markHoldout() {
  // три независимых контрольных набора (A, B, C) — срезы идут по кругу, поэтому ни один набор не успевает примелькаться
  for (const c of lib.cards) {
    if (c.pack !== 'core' || c.variants) continue;
    const k = hash(c.id) % 12; // ~четверть встроенных ситуаций, по 10–12 в наборе
    if (k < 3) { c.holdout = true; c.hset = k; }
  }
}
/* Редакторский статус: ситуации, которые родитель или тренер отметил «Не так» / «У нас иначе», не выдаются в тренировки,
   пока их не исправят (отметку можно снять). Контрольные — тоже не в тренировках. */
lib.excluded = new Set();
export function setExcluded(reviews = {}) { lib.excluded = new Set(Object.keys(reviews).filter(id => reviews[id] && (reviews[id].v === 'no' || reviews[id].v === 'other'))); }
export const inTraining = c => !c.holdout && !lib.excluded.has(c.id);
export const trainCards = () => lib.cards.filter(inTraining);
export const holdoutCards = () => lib.cards.filter(c => c.holdout);
export const holdoutSet = k => lib.cards.filter(c => c.holdout && c.hset === k % 3);

export function addPack(cards, pack) {
  for (const c of cards) {
    c.pack = pack;
    if (!lib.byId[c.id]) lib.cards.push(c);
    lib.byId[c.id] = c;
  }
}

/* Ключ повторения: карточка без контекста — её id; с контекстом — id|контекст.
   Один и тот же кадр в двух планах игры учится как две разные задачи. */
export const keysOf = c => (c.variants && c.variants.length ? c.variants.map(v => `${c.id}|${v.key}`) : [c.id]);
export const parseKey = k => { const [id, vkey] = k.split('|'); const card = lib.byId[id]; return { card, variant: card && vkey ? card.variants.find(v => v.key === vkey) : null }; };

export const cardsOfDeck = deckId => lib.cards.filter(c => c.deck === deckId);

export function removeCard(id) { lib.cards = lib.cards.filter(c => c.id !== id); delete lib.byId[id]; }

/* Колода «Мои моменты» появляется, когда в ней есть хоть одна карточка. */
export function syncMine(cards) {
  for (const c of lib.cards.filter(c => c.pack === 'mine')) if (!cards[c.id]) removeCard(c.id);
  addPack(Object.values(cards), 'mine');
  const has = lib.decks.some(d => d.id === 'mine');
  if (Object.keys(cards).length && !has) lib.decks.push({ id: 'mine', name: 'Мои моменты', line: 'Эпизоды из твоих матчей' });
  if (!Object.keys(cards).length && has) lib.decks = lib.decks.filter(d => d.id !== 'mine');
}

export function verdictOf(card, variant, opt) {
  return variant ? variant.verdicts[opt.id] : opt.verdict;
}
export function explainOf(card, variant, opt) {
  return (variant && variant.explain && variant.explain[opt.id]) || opt.explain;
}
export const bestOf = (card, variant) => card.options.find(o => verdictOf(card, variant, o) === 'best');
