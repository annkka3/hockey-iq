/* «Решения»: компактный каталог из вкладок — U15, Колоды, Миссии, Разборы, Темы, Избранное, Видео.
   Сверху — «Над чем работать»: самые слабые принципы, одна кнопка до тренировки; поиск по всем ситуациям. */
import { h, icon, meter } from '../ui.js';
import { lib, keysOf, cardsOfDeck, trainCards, inTraining } from '../content.js';
import { state, isFav, toggleFav } from '../core/state.js';
import { buildQueue, isLearned } from '../engine/srs.js';
import { accuracyBy } from '../engine/scoring.js';
import { play } from './play.js';
import * as film from './film.js';
import * as program from './program.js';

const DECK_ICON = { 'no-puck': 'noPuck', 'with-puck': 'puck', faceoff: 'faceoff', special: 'shield', mine: 'stick' };
const TABS = [['program', 'U15'], ['decks', 'Колоды'], ['missions', 'Миссии'], ['films', 'Разборы'], ['principles', 'Темы'], ['favs', '★ Избранное'], ['video', 'Видео']];
let tab = 'program', query = '';

const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const keysFor = cards => cards.filter(inTraining).flatMap(keysOf);

export function render(view, rerender) {
  view.append(h('div.h1', 'Решения'));
  focus(view, rerender);

  // поиск: пока строка не пустая, вместо вкладки — найденные ситуации (обновляются на лету, фокус не теряется)
  const results = h('div.search-results');
  const body = h('div.cat-body');
  const input = h('input.input.cat-search', { type: 'search', placeholder: 'Поиск: ситуация, принцип, ЛН, вбрасывание…', value: query, 'aria-label': 'Поиск по ситуациям',
    oninput: e => { query = e.target.value; showSearch(); } });
  const showSearch = () => {
    results.innerHTML = '';
    const on = norm(query).length >= 2;
    body.hidden = on; seg.hidden = on; clear.hidden = !query;
    if (on) results.append(...searchList(query, rerender));
  };
  const clear = h('button.cat-clear', { type: 'button', 'aria-label': 'Очистить', onclick: () => { query = ''; rerender(); } }, '×');
  view.append(h('div.cat-search-wrap', input, clear));
  const seg = h('div.toggle.cat-tabs.cat-scroll', { style: { '--n': TABS.length } },
    TABS.map(([id, label]) => h('button', { class: tab === id ? 'on' : '', onclick: () => { tab = id; rerender(); } }, label)));
  view.append(seg, results, body);
  showSearch();
  view = body;

  if (tab === 'program') program.render(view, rerender);
  else if (tab === 'decks') decks(view, rerender);
  else if (tab === 'missions') film.grid(view, rerender, { mission: true, lead: 'Три решения подряд: каждый выбор ведёт ситуацию в свою сторону.' });
  else if (tab === 'films') {
    film.grid(view, rerender, { kind: 'film', title: 'Разборы розыгрышей', lead: 'Розыгрыш по шагам: стоп — «что дальше?» — продолжение.' });
    film.grid(view, rerender, { kind: 'branch', mission: false, title: 'На два хода вперёд', lead: 'Твой выбор — и сразу видно последствие.' });
  } else if (tab === 'favs') favs(view, rerender);
  else if (tab === 'video') video(view, rerender);
  else principles(view, rerender);
}

/* ---------- поиск и избранное ---------- */
const norm = t => String(t || '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
/* Текст карточки для поиска: заголовок, подводка, вопрос, принцип, фаза, варианты, подписи игроков. */
function hay(c) {
  if (c._hay) return c._hay;
  const pr = lib.principle && lib.principle[c.principle], ph = lib.phase && lib.phase[c.phase];
  const labels = [...(c.us || []), ...(c.them || [])].map(e => e.label || '').join(' ');
  const parts = [c.title, c.story, c.question && c.question.text, pr && pr.name, ph && ph.name, labels,
    ...(c.options || []).map(o => o.label), c.read && c.read.text, c.best_when];
  return (c._hay = norm(parts.filter(Boolean).join(' · ')));
}
export function searchCards(q, cards = lib.cards.filter(inTraining)) {
  const words = norm(q).split(' ').filter(w => w.length >= 2);
  if (!words.length) return [];
  return cards.filter(c => { const t = hay(c); return words.every(w => t.includes(w)); });
}

function cardRow(c, rerender) {
  const pr = lib.principle && lib.principle[c.principle];
  const star = h('button.fav-star', { type: 'button', class: isFav(c.id) ? 'on' : '', 'aria-label': 'В избранное', 'aria-pressed': String(isFav(c.id)),
    onclick: e => { e.stopPropagation(); const on = toggleFav(c.id); star.classList.toggle('on', on); star.setAttribute('aria-pressed', String(on)); star.textContent = on ? '★' : '☆'; } }, isFav(c.id) ? '★' : '☆');
  const q = c.question && c.question.text;
  return h('div.panel.card-row', { onclick: () => play(keysOf(c), { module: 'card:' + c.id, onDone: rerender }) },
    h('div.grow', h('div.nm', c.title || q || c.id), h('div.ln', [pr && pr.name, q && c.title ? q : null].filter(Boolean).join(' · '))),
    star);
}

function searchList(q, rerender) {
  const found = searchCards(q);
  if (!found.length) return [h('div.empty', 'Ничего не нашлось. Попробуй другое слово: «пас», «пятак», «вбрасывание», «ЛН».')];
  const keys = found.flatMap(keysOf);
  return [h('div.row.cat-found', h('div.grow.muted.small', `Найдено: ${found.length}`),
      h('button.btn.small.primary', { onclick: () => play(buildQueue(keys, state.progress, { size: Math.min(10, keys.length), maxNew: 10 }), { module: 'search', onDone: rerender }) }, 'Играть найденное')),
    ...found.slice(0, 40).map(c => cardRow(c, rerender)),
    found.length > 40 ? h('div.muted.small', { style: { textAlign: 'center', margin: '8px 0' } }, `Показаны первые 40 из ${found.length} — уточни запрос.`) : null].filter(Boolean);
}

function favs(view, rerender) {
  const list = (state.profile.favs || []).map(id => lib.byId[id]).filter(c => c && inTraining(c));
  if (!list.length) {
    view.append(h('div.panel', h('div.empty', 'Здесь будут ситуации, отмеченные звёздочкой ☆ — в поиске или после разбора. Удобно собрать свой набор перед матчем.')));
    return;
  }
  const keys = list.flatMap(keysOf);
  view.append(h('div.panel.row',
    h('div.grow', h('b', `Избранное · ${list.length}`), h('div.muted.small', 'Свой набор: сыграть все подряд в случайном порядке.')),
    h('button.btn.small.primary', { onclick: () => play(shuffle(keys.slice()).slice(0, 20), { module: 'favs', onDone: rerender }) }, 'Играть')));
  for (const c of list) view.append(cardRow(c, rerender));
}

/* «Видео»: раздел другого модуля (vision.js). Если его ещё нет — аккуратная заглушка. */
function video(view, rerender) {
  const box = h('div.video-tab');
  view.append(box);
  import('./vision.js').then(m => {
    if (m && typeof m.renderVisionTab === 'function') m.renderVisionTab(box, rerender);
    else box.append(h('div.panel', h('div.empty', 'Видеоэпизоды скоро появятся.')));
  }).catch(() => box.append(h('div.panel', h('div.empty', 'Видеоэпизоды скоро появятся.'))));
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
