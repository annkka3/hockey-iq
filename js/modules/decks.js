/* «Решения»: компактный каталог из вкладок — Колоды, Миссии, Разборы, Принципы.
   Сверху — «Над чем работать»: самые слабые принципы, одна кнопка до тренировки. */
import { h, icon, meter } from '../ui.js';
import { lib, keysOf, cardsOfDeck, trainCards } from '../content.js';
import { state } from '../core/state.js';
import { buildQueue, isLearned } from '../engine/srs.js';
import { accuracyBy } from '../engine/scoring.js';
import { play } from './play.js';
import * as film from './film.js';
import * as program from './program.js';

const DECK_ICON = { 'no-puck': 'noPuck', 'with-puck': 'puck', faceoff: 'faceoff', special: 'shield', mine: 'stick' };
const TABS = [['program', 'U15'], ['decks', 'Колоды'], ['missions', 'Миссии'], ['films', 'Разборы'], ['principles', 'Темы']];
let tab = 'program';

const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const keysFor = cards => cards.filter(c => !c.holdout).flatMap(keysOf);

export function render(view, rerender) {
  view.append(h('div.h1', 'Решения'));
  focus(view, rerender);

  const seg = h('div.toggle.cat-tabs', { style: { '--n': TABS.length } },
    TABS.map(([id, label]) => h('button', { class: tab === id ? 'on' : '', onclick: () => { tab = id; rerender(); } }, label)));
  view.append(seg);

  if (tab === 'program') program.render(view, rerender);
  else if (tab === 'decks') decks(view, rerender);
  else if (tab === 'missions') film.grid(view, rerender, { mission: true, lead: 'Три решения подряд: каждый выбор ведёт ситуацию в свою сторону.' });
  else if (tab === 'films') {
    film.grid(view, rerender, { kind: 'film', title: 'Разборы розыгрышей', lead: 'Розыгрыш по шагам: стоп — «что дальше?» — продолжение.' });
    film.grid(view, rerender, { kind: 'branch', mission: false, title: 'На два хода вперёд', lead: 'Твой выбор — и сразу видно последствие.' });
  } else principles(view, rerender);
}

/* «Над чем работать»: три принципа с наименьшей точностью за 30 дней (минимум 3 ответа). */
function focus(view, rerender) {
  const acc = accuracyBy(state.sessions, 'principle');
  const weak = lib.principles.filter(p => acc[p.id] && acc[p.id].n >= 3).sort((a, b) => acc[a.id].rate - acc[b.id].rate).slice(0, 3);
  if (!weak.length) return;
  view.append(h('div.panel.focus',
    h('div.kicker', 'Над чем работать'),
    h('div.focus-row', weak.map(p => h('button.focus-chip', { onclick: () => {
      const keys = keysFor(lib.cards.filter(c => c.principle === p.id));
      play(buildQueue(keys, state.progress, { size: 8, maxNew: 8 }), { module: 'principle:' + p.id, onDone: rerender });
    } }, h('b', p.name), h('span', `${Math.round(acc[p.id].rate * 100)}%`))))));
}

function decks(view, rerender) {
  for (const d of lib.decks) {
    const keys = keysFor(cardsOfDeck(d.id));
    const learned = keys.filter(k => isLearned(state.progress[k])).length;
    view.append(h('div.panel.deck', { onclick: () => play(buildQueue(keys, state.progress, { size: 10, maxNew: 10 }), { module: 'deck:' + d.id, onDone: rerender }) },
      h('div.ico', icon(DECK_ICON[d.id] || 'decks')),
      h('div.grow', h('div.nm', d.name), h('div.ln', d.line), meter(keys.length ? learned / keys.length : 0)),
      h('div.cnt', `${learned}/${keys.length}`)));
  }
  view.append(h('div.h2', 'Режим матча'),
    h('div.panel',
      h('div', h('b', 'Игра по плану'), h('div.muted.small', 'Тренер дал установку — те же кадры решаются по-разному. Выбери план на матч.')),
      h('div.seg',
        planBtn('Давим', 'соперник слабее', 'plan:press', rerender),
        planBtn('От обороны', 'соперник сильнее', 'plan:defend', rerender))));
}

function principles(view, rerender) {
  const acc = accuracyBy(state.sessions, 'principle');
  view.append(h('div.panel.bars', lib.principles.map(p => {
    const keys = keysFor(lib.cards.filter(c => c.principle === p.id));
    if (!keys.length) return null;
    const learned = keys.filter(k => isLearned(state.progress[k])).length;
    const a = acc[p.id];
    return h('div.bar-row', { style: { cursor: 'pointer' }, onclick: () => play(buildQueue(keys, state.progress, { size: 10, maxNew: 10 }), { module: 'principle:' + p.id, onDone: rerender }) },
      h('div.nm', p.name, a ? h('span.muted.small', ` · точность ${Math.round(a.rate * 100)}%`) : null),
      h('div.pc', `${learned}/${keys.length}`), meter(keys.length ? learned / keys.length : 0));
  })));
}

function planBtn(name, sub, plan, rerender) {
  return h('button', { onclick: () => {
    const keys = trainCards().flatMap(c => {
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
