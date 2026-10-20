/* «Игра на льду»: перенос из приложения в матч.
   Родитель (или тренер) выбирает три навыка, над которыми работаем сейчас, и после каждого матча
   отмечает, проявился ли каждый: да / частично / нет. Так видно, переходит ли тренировка на лёд.
   Цепочка: ошибка в матче → навык в фокусе → похожие ситуации в приложении → следующий матч. */
import { h, meter } from '../ui.js';
import { lib, keysOf, trainCards } from '../content.js';
import { state, setParent } from '../core/state.js';
import { accuracyBy } from '../engine/scoring.js';
import { buildQueue, today } from '../engine/srs.js';
import { play } from './play.js';

const MARK = { yes: ['Да', 1], part: ['Частично', 0.5], no: ['Нет', 0] };

/* Три навыка в фокусе: выбранные родителем, иначе — три самых слабых принципа за месяц. */
export function focusSkills() {
  const chosen = (state.parent.focus || []).filter(id => lib.principle[id]);
  if (chosen.length) return chosen.slice(0, 3);
  const acc = accuracyBy(state.sessions, 'principle');
  return lib.principles.filter(p => acc[p.id] && acc[p.id].n >= 3).sort((a, b) => acc[a.id].rate - acc[b.id].rate).slice(0, 3).map(p => p.id);
}

export function trainFocus(rerender) {
  const ids = focusSkills();
  const keys = trainCards().filter(c => ids.includes(c.principle)).flatMap(keysOf);
  play(buildQueue(keys, state.progress, { size: 9, maxNew: 9 }), { module: 'focus', onDone: rerender });
}

/* Карточка для игрока: «Сейчас работаем над». */
export function playerPanel(view, rerender) {
  const ids = focusSkills();
  if (!ids.length) return;
  const games = state.parent.games || [];
  view.append(h('div.h2', 'Сейчас работаем над'),
    h('div.panel',
      h('div.list', ids.map(id => {
        const marks = games.slice(-3).map(g => g.marks && g.marks[id]).filter(Boolean);
        return h('div.li', h('span', lib.principle[id].name), h('span.r.small', marks.length ? marks.map(m => ({ yes: '●', part: '◐', no: '○' })[m]).join(' ') : '—'));
      })),
      h('p.muted.small', { style: { margin: '8px 0 0' } }, '● — в матче получилось, ◐ — частично, ○ — нет. Отмечает родитель после игры.'),
      h('button.btn.primary.small', { style: { marginTop: '10px' }, onclick: () => trainFocus(rerender) }, 'Тренировать эти навыки')));
}

/* Блок для родителя: выбор навыков и отметки после матча. */
export function parentBlock(view, rerender) {
  const ids = focusSkills();
  const games = state.parent.games || [];
  const pick = h('select.input', { onchange: e => {
    const id = e.target.value; if (!id) return;
    const cur = (state.parent.focus && state.parent.focus.length ? state.parent.focus : ids).filter(x => x !== id);
    setParent({ focus: [id, ...cur].slice(0, 3) }); rerender();
  } }, h('option', { value: '' }, 'Заменить навык…'), lib.principles.map(p => h('option', { value: p.id }, p.name)));

  const draft = { date: today(), opp: '', marks: {}, note: '' };
  const rows = ids.map(id => {
    const tg = h('div.toggle', { style: { '--n': 3 } }, Object.entries(MARK).map(([k, [t]]) => h('button', { type: 'button', onclick: e => {
      draft.marks[id] = k; tg.querySelectorAll('button').forEach(b => b.classList.remove('on')); e.currentTarget.classList.add('on');
    } }, t)));
    return h('div.review-row', h('div.t', lib.principle[id].name), h('div.muted.small', lib.principle[id].line), tg);
  });
  const opp = h('input.input', { placeholder: 'Соперник или турнир', oninput: e => { draft.opp = e.target.value.trim(); } });
  const note = h('input.input', { placeholder: 'Эпизод для разбора (необязательно)', oninput: e => { draft.note = e.target.value.trim(); } });
  const save = () => {
    if (!Object.keys(draft.marks).length) return;
    setParent({ games: [...games, { ...draft, skills: ids }].slice(-40) }); rerender();
  };

  // динамика по навыку: доля «да» (частично — половина) за последние 5 матчей
  const trend = id => {
    const m = games.filter(g => g.marks && g.marks[id]).slice(-5).map(g => MARK[g.marks[id]][1]);
    return m.length ? m.reduce((a, b) => a + b, 0) / m.length : null;
  };
  view.append(h('div.h2', 'Игра на льду'),
    h('div.panel',
      h('p.muted.small', { style: { marginTop: 0 } }, 'Три навыка в фокусе. После матча отметьте, проявился ли каждый. Рост здесь важнее очков в приложении: он показывает, что тренировка переходит на лёд.'),
      h('div.list', ids.map(id => { const t = trend(id); return h('div', { style: { margin: '6px 0' } }, h('div.row', h('span.grow', lib.principle[id].name), h('span.small.muted', t == null ? 'ещё нет отметок' : Math.round(t * 100) + '% за 5 матчей')), meter(t || 0)); })),
      pick,
      h('details', { style: { marginTop: '12px' } }, h('summary.btn.small', { style: { listStyle: 'none' } }, 'Отметить матч'),
        h('div', { style: { marginTop: '10px' } }, opp, h('div.list', rows), note, h('button.btn.primary.small', { style: { marginTop: '10px' }, onclick: save }, 'Сохранить матч'))),
      games.length ? h('div.list', { style: { marginTop: '12px' } }, games.slice(-5).reverse().map(g => h('div.li',
        h('span', `${new Date(g.date + 'T12:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}${g.opp ? ' · ' + g.opp : ''}`),
        h('span.r', (g.skills || []).map(id => ({ yes: '●', part: '◐', no: '○' })[g.marks[id]] || '·').join(' '))))) : null));
}
