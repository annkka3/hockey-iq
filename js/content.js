/* Библиотека контента: загрузка, поиск, ключи повторения.
   Встроенный пакет core лежит в data/content.json; пакеты команды и «мои моменты» потом
   добавляются в тот же список через addPack — движок не различает их по происхождению. */

export const lib = { cards: [], byId: {}, decks: [], phases: [], principles: [], principle: {}, phase: {}, built: '' };

export async function loadContent() {
  const data = window.__HK_CONTENT || await (await fetch('data/content.json', { cache: 'no-cache' })).json();
  lib.decks = data.decks;
  lib.phases = data.phases;
  lib.principles = data.principles;
  lib.built = data.built;
  for (const p of data.principles) lib.principle[p.id] = p;
  for (const p of data.phases) lib.phase[p.id] = p;
  addPack(data.cards, 'core');
}

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
