/* Коллекция карточек хоккеистов. Карточка открывается за достижение; чем реже карточка, тем серьёзнее достижение.
   Всё считается из журнала сессий и прогресса — открытые карточки не теряются при синхронизации,
   а время открытия хранится в state.awards. Картинки — из «Power Play» (с разрешения автора). */
import { h } from '../ui.js';
import { lib, keysOf } from '../content.js';
import { state, save } from '../core/state.js';
import { summarize } from '../engine/scoring.js';
import { isLearned } from '../engine/srs.js';

export const RARITY = {
  rising: { name: 'Восходящая звезда', order: 0 },
  rare: { name: 'Редкая', order: 1 },
  epic: { name: 'Эпическая', order: 2 },
  legend: { name: 'Легендарная', order: 3 },
  mythic: { name: 'Мифическая', order: 4 },
};

/* Факты — устойчивые (амплуа, страна, большие награды); клубы меняются, поэтому не называются. */
export const PLAYERS = [
  { id: 'michkov', ru: 'Матвей Мичков', num: 39, pos: 'Нападающий', rare: 'rising', facts: ['Родом из Перми.', 'Начал играть в НХЛ подростком.'],
    how: 'Первая тренировка дня', test: s => s.daysTrained >= 1 },
  { id: 'demidov', ru: 'Иван Демидов', num: 93, pos: 'Нападающий', rare: 'rising', facts: ['Родом из Сергиева Посада.', 'Знаменит быстрыми руками.'],
    how: 'Пройди первую миссию', test: s => s.missions >= 1 },
  { id: 'panarin', ru: 'Артемий Панарин', num: 10, pos: 'Нападающий', rare: 'rare', facts: ['Родом из Коркино.', 'Мастер паса: видит свободного партнёра раньше всех.'],
    how: '«Открытый игрок»: 6 из 8 за одну серию', test: s => s.scanBest >= 6, prog: s => [s.scanBest, 6] },
  { id: 'kaprizov', ru: 'Кирилл Капризов', num: 97, pos: 'Нападающий', rare: 'rare', facts: ['Родом из Новокузнецка.', 'Получил «Колдер Трофи» как лучший новичок НХЛ.'],
    how: '3 дня подряд', test: s => s.bestStreak >= 3, prog: s => [s.bestStreak, 3] },
  { id: 'bobrovsky', ru: 'Сергей Бобровский', num: 72, pos: 'Вратарь', rare: 'rare', facts: ['Родом из Новокузнецка.', 'Дважды лучший вратарь сезона НХЛ («Везина»).'],
    how: 'Вбрасывание: реакция быстрее 300 мс', test: s => s.foBest > 0 && s.foBest < 300, prog: s => s.foBest ? [`${s.foBest} мс`, '300 мс'] : null },
  { id: 'malkin', ru: 'Евгений Малкин', num: 71, pos: 'Центральный нападающий', rare: 'rare', facts: ['Родом из Магнитогорска.', 'Трижды выигрывал Кубок Стэнли.'],
    how: '25 выученных ситуаций', test: s => s.learned >= 25, prog: s => [s.learned, 25] },
  { id: 'shesterkin', ru: 'Игорь Шестёркин', num: 31, pos: 'Вратарь', rare: 'epic', facts: ['Родом из Москвы.', 'Получил «Везину» как лучший вратарь сезона.'],
    how: '7 дней подряд', test: s => s.bestStreak >= 7, prog: s => [s.bestStreak, 7] },
  { id: 'vasilevskiy', ru: 'Андрей Василевский', num: 88, pos: 'Вратарь', rare: 'epic', facts: ['Родом из Тюмени.', 'Дважды выигрывал Кубок Стэнли.'],
    how: 'Блиц: 10 из 10', test: s => s.blitzBest >= 10, prog: s => [s.blitzBest, 10] },
  { id: 'kucherov', ru: 'Никита Кучеров', num: 86, pos: 'Нападающий', rare: 'epic', facts: ['Родом из Майкопа.', 'Получил «Харт Трофи» как самый ценный игрок сезона.'],
    how: 'Пройди все 5 миссий', test: s => s.missions >= s.missionsTotal, prog: s => [s.missions, s.missionsTotal] },
  { id: 'draisaitl', ru: 'Леон Драйзайтль', num: 29, pos: 'Центральный нападающий', rare: 'epic', facts: ['Родом из Германии.', 'Получил «Харт Трофи» как самый ценный игрок сезона.'],
    how: 'Бросок: 7 голов из 10 в любом режиме', test: s => s.shotBest >= 7, prog: s => [s.shotBest, 7] },
  { id: 'matthews', ru: 'Остон Мэттьюс', num: 34, pos: 'Центральный нападающий', rare: 'epic', facts: ['Родом из США.', 'Один из лучших снайперов НХЛ.'],
    how: '«Обыграй вратаря»: 7 голов из 10 против уровня «Эксперт»', test: s => s.goalieNhlBest >= 7, prog: s => [s.goalieNhlBest, 7] },
  { id: 'mackinnon', ru: 'Натан Маккиннон', num: 29, pos: 'Центральный нападающий', rare: 'legend', facts: ['Родом из Канады.', 'Выигрывал Кубок Стэнли и «Харт Трофи».'],
    how: '75 выученных ситуаций', test: s => s.learned >= 75, prog: s => [s.learned, 75] },
  { id: 'ovechkin', ru: 'Александр Овечкин', num: 8, pos: 'Нападающий', rare: 'legend', facts: ['Родом из Москвы.', 'Забил больше всех голов в истории НХЛ.'],
    how: '100 голов в игре «Бросок»', test: s => s.goals >= 100, prog: s => [s.goals, 100] },
  { id: 'crosby', ru: 'Сидни Кросби', num: 87, pos: 'Центральный нападающий', rare: 'legend', facts: ['Родом из Канады.', 'Капитан, трижды выигрывал Кубок Стэнли.'],
    how: '21 день подряд', test: s => s.bestStreak >= 21, prog: s => [s.bestStreak, 21] },
  { id: 'mcdavid', ru: 'Коннор Макдэвид', num: 97, pos: 'Центральный нападающий', rare: 'mythic', facts: ['Родом из Канады.', 'Его называют самым быстрым игроком мира.'],
    how: 'Выучи все ситуации и пройди все разборы', test: s => s.learned >= s.totalKeys && s.films >= s.filmsTotal, prog: s => [s.learned + s.films, s.totalKeys + s.filmsTotal] },
];

export function stats() {
  const sum = summarize(state.sessions);
  const by = m => state.sessions.filter(x => x.module === m || x.module.startsWith(m));
  const goodIn = x => x.items.filter(i => i.verdict === 'best').length;
  const maxGood = list => Math.max(0, ...list.map(goodIn));
  // в «Броске» verdict — это качество решения; голы считаются по исходу (goal), старые записи — по result
  const goalsIn = x => x.items.filter(i => i.goal === true || (i.goal == null && i.result === 'goal')).length;
  const maxGoals = list => Math.max(0, ...list.map(goalsIn));
  const missionsAll = (lib.plays || []).filter(p => p.mission);
  const filmsAll = (lib.plays || []).filter(p => !p.mission);
  const doneFilm = p => state.sessions.some(x => x.module === 'film:' + p.id && x.items.length);
  const allKeys = lib.cards.filter(c => c.pack === 'core').flatMap(keysOf);
  return {
    daysTrained: Object.values(sum.days).filter(d => d.items >= 5).length,
    bestStreak: sum.bestStreak,
    learned: allKeys.filter(k => isLearned(state.progress[k])).length,
    totalKeys: allKeys.length,
    missions: missionsAll.filter(doneFilm).length, missionsTotal: missionsAll.length,
    films: filmsAll.filter(doneFilm).length, filmsTotal: filmsAll.length,
    scanBest: maxGood(by('react:scan')),
    blitzBest: maxGood(by('react:blitz')),
    foBest: (t => t.length ? Math.min(...t) : 0)(by('react:faceoff').flatMap(x => x.items.filter(i => i.verdict === 'best').map(i => i.timeMs))),
    shotBest: maxGoals(by('shot:')),
    goalieNhlBest: maxGoals(by('shot:goalie').filter(x => x.items.some(i => i.level === 'nhl'))),
    goals: by('shot:').reduce((a, x) => a + goalsIn(x), 0),
  };
}

/* Проверка: возвращает карточки, открытые только что. */
export function checkAwards() {
  state.awards = state.awards || {};
  const s = stats();
  const fresh = [];
  for (const p of PLAYERS) if (!state.awards[p.id] && p.test(s)) { state.awards[p.id] = Date.now(); fresh.push(p); }
  if (fresh.length) save();
  return fresh;
}

const img = p => `img/players/${p.id}.webp`;

export function cardEl(p, open, { big = false } = {}) {
  return h('div.pcard.r-' + p.rare + (open ? '' : '.locked') + (big ? '.big' : ''),
    h('div.pc-rar', RARITY[p.rare].name),
    h('div.pc-num', p.num),
    h('img.pc-img', { src: img(p), alt: open ? p.ru : 'Закрытая карточка', loading: 'lazy', draggable: 'false' }),
    h('div.pc-foot', h('div.pc-name', open ? p.ru : '???'), h('div.pc-pos', open ? p.pos : p.how)));
}

export function collection(view) {
  state.awards = state.awards || {};
  const s = stats();
  const open = PLAYERS.filter(p => state.awards[p.id]).length;
  const sorted = [...PLAYERS].sort((a, b) => RARITY[b.rare].order - RARITY[a.rare].order);
  view.append(h('div.h2', `Коллекция · ${open}/${PLAYERS.length}`),
    h('div.pgrid', sorted.map(p => {
      const el = cardEl(p, !!state.awards[p.id]);
      el.addEventListener('click', () => detail(p, s));
      return el;
    })));
}

function detail(p, s) {
  const open = !!state.awards[p.id];
  const pr = p.prog ? p.prog(s) : null;
  const back = h('div.sheet-back.reveal-back');
  const close = () => back.remove();
  back.addEventListener('click', e => { if (e.target === back) close(); });
  back.append(h('div.reveal',
    cardEl(p, open, { big: true }),
    h('div.reveal-txt',
      open ? h('div', p.facts.map(f => h('p', f))) : h('p', h('b', 'Как открыть: '), p.how),
      !open && pr ? h('p.muted', `Прогресс: ${pr[0]} из ${pr[1]}`) : null,
      open ? h('p.muted.small', 'Открыта ' + new Date(state.awards[p.id]).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })) : null,
      h('button.btn.primary.block', { onclick: close }, 'Закрыть'))));
  document.body.appendChild(back);
}

/* Торжественное открытие новых карточек — по одной. */
export function reveal(list, done) {
  if (!list.length) { if (done) done(); return; }
  const [p, ...rest] = list;
  const back = h('div.sheet-back.reveal-back.fresh');
  const next = () => { back.remove(); reveal(rest, done); };
  back.append(h('div.reveal',
    h('div.q-meta', { style: { textAlign: 'center' } }, 'Новая карточка'),
    cardEl(p, true, { big: true }),
    h('div.reveal-txt', h('p', h('b', p.how)), p.facts.map(f => h('p.muted', f)),
      h('button.btn.primary.block', { onclick: next }, rest.length ? 'Следующая' : 'В коллекцию'))));
  document.body.appendChild(back);
}

