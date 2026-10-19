/* «Решения»: колоды и режим матча с контекстом (план игры, счёт). */
import { h, icon, meter } from '../ui.js';
import { lib, keysOf, cardsOfDeck } from '../content.js';
import { state } from '../core/state.js';
import { buildQueue, isLearned } from '../engine/srs.js';
import { play } from './play.js';
import * as film from './film.js';

const DECK_ICON = { 'no-puck': 'noPuck', 'with-puck': 'puck', faceoff: 'faceoff', special: 'shield', mine: 'stick' };

const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

export function render(view, rerender) {
  view.append(h('div.h1', 'Решения'), h('p.lead', 'Стоп-кадр — твой ход — разбор. Ошибки возвращаются чаще, выученное — реже.'));

  for (const d of lib.decks) {
    const keys = cardsOfDeck(d.id).flatMap(keysOf);
    const learned = keys.filter(k => isLearned(state.progress[k])).length;
    view.append(h('div.panel.deck', { onclick: () => play(buildQueue(keys, state.progress, { size: 10, maxNew: 10 }), { module: 'deck:' + d.id, onDone: rerender }) },
      h('div.ico', icon(DECK_ICON[d.id] || 'decks')),
      h('div.grow', h('div.nm', d.name), h('div.ln', d.line), meter(keys.length ? learned / keys.length : 0)),
      h('div.cnt', `${learned}/${keys.length}`)));
  }

  film.list(view, rerender, { title: 'Миссии', mission: true });
  film.list(view, rerender, { title: 'Разборы розыгрышей', kind: 'film' });
  film.list(view, rerender, { title: 'На два хода вперёд', kind: 'branch' });

  view.append(h('div.h2', 'Режим матча'),
    h('div.panel',
      h('div', h('b', 'Игра по плану'), h('div.muted.small', 'Тренер дал установку — те же кадры решаются по-разному. Выбери план на матч.')),
      h('div.seg',
        planBtn('Давим', 'соперник слабее', 'plan:press', rerender),
        planBtn('От обороны', 'соперник сильнее', 'plan:defend', rerender))));

  view.append(h('div.h2', 'Принципы'),
    h('div.panel.bars', lib.principles.map(p => {
      const cards = lib.cards.filter(c => c.principle === p.id);
      const keys = cards.flatMap(keysOf);
      const learned = keys.filter(k => isLearned(state.progress[k])).length;
      return h('div.bar-row', { style: { cursor: 'pointer' }, onclick: () => play(buildQueue(keys, state.progress, { size: 10, maxNew: 10 }), { module: 'principle:' + p.id, onDone: rerender }) },
        h('div.nm', p.name), h('div.pc', `${learned}/${keys.length}`), meter(keys.length ? learned / keys.length : 0));
    })));
}

function planBtn(name, sub, plan, rerender) {
  return h('button', { onclick: () => {
    const keys = lib.cards.flatMap(c => {
      const ks = keysOf(c);
      if (!c.variants) return ks;
      const planKeys = ks.filter(k => k.endsWith('|' + plan));
      if (planKeys.length) return planKeys;
      return ks.filter(k => !k.includes('|plan:'));
    });
    const planFirst = keys.filter(k => k.includes('|plan:'));
    const rest = shuffle(buildQueue(keys.filter(k => !planFirst.includes(k)), state.progress, { size: 9, maxNew: 9 }));
    const q = shuffle([...planFirst, ...rest]).slice(0, 10);
    play(q, { module: 'match:' + plan, onDone: rerender });
  } }, h('b', name), h('span', sub));
}
