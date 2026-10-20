/* Программа «Центр U15»: пять блоков с целевыми долями (предложение ревью, не норма Hockey Canada).
   Тренировка дня собирается по этим долям; экран программы показывает баланс и слабые места. */
import { h, meter } from '../ui.js';
import { lib, keysOf, trainCards } from '../content.js';
import { state } from '../core/state.js';
import { buildQueue, isLearned } from '../engine/srs.js';
import { accuracyBy } from '../engine/scoring.js';
import { play } from './play.js';

export const tracks = () => (lib.program && lib.program.tracks) || [];
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

/* Очередь по долям: каждому блоку — своя квота, внутри блока работает интервальное повторение.
   Не хватило в блоке — добираем из общего пула. */
export function programQueue({ size = 10, maxNew = 5 } = {}) {
  const T = tracks();
  const all = trainCards();
  if (!T.length) return buildQueue(all.flatMap(keysOf), state.progress, { size, maxNew });
  // квоты: целая часть доли, а оставшиеся места — блокам, которым за 7 дней досталось меньше всего относительно цели.
  // Так 25/25/20/20/10 выдерживаются на неделе, а не округляются каждый день одинаково.
  const from = Date.now() - 7 * 864e5, done = {};
  let N = 0;
  for (const s of state.sessions) if (s.startedAt > from) for (const it of s.items || []) if (it.track) { done[it.track] = (done[it.track] || 0) + 1; N++; }
  const quota = T.map(t => Math.floor(t.share * size));
  let left = size - quota.reduce((a, b) => a + b, 0);
  const deficit = i => T[i].share * (N + size) - (done[T[i].id] || 0) - quota[i];
  while (left-- > 0) { let bi = 0; for (let i = 1; i < T.length; i++) if (deficit(i) > deficit(bi)) bi = i; quota[bi]++; }
  const q = [];
  // свой эпизод из матча («Мои моменты») — одно место в смене, если он есть к повторению
  const mine = all.filter(c => c.deck === 'mine');
  if (mine.length) {
    const mk = buildQueue(mine.flatMap(keysOf), state.progress, { size: 1, maxNew: 1 });
    if (mk.length) { q.push(mk[0]); const ti = T.findIndex(t => t.id === (lib.byId[mk[0].split('|')[0]] || {}).track); if (ti >= 0 && quota[ti] > 0) quota[ti]--; else { const bi = quota.indexOf(Math.max(...quota)); quota[bi]--; } }
  }
  T.forEach((t, i) => {
    if (!quota[i]) return;
    const keys = all.filter(c => c.track === t.id && c.deck !== 'mine').flatMap(keysOf);
    q.push(...buildQueue(keys, state.progress, { size: quota[i], maxNew: Math.max(1, Math.round(maxNew * t.share * 2)) }));
  });
  if (q.length < size) for (const k of buildQueue(all.flatMap(keysOf), state.progress, { size: size * 2, maxNew: size })) { if (q.length >= size) break; if (!q.includes(k)) q.push(k); }
  return shuffle(q).slice(0, size);
}

export function render(view, rerender) {
  const T = tracks();
  if (!T.length) { view.append(h('p.muted', 'Программа появится после обновления содержания.')); return; }
  const acc = accuracyBy(state.sessions, 'track');
  // баланс за 30 дней: какая доля ответов пришлась на каждый блок
  const from = Date.now() - 30 * 864e5, done = {};
  let total = 0;
  for (const s of state.sessions) if (s.startedAt > from) for (const it of s.items || []) if (it.track) { done[it.track] = (done[it.track] || 0) + 1; total++; }
  view.append(h('div.panel.prog-head',
    h('div.kicker', 'Центр U15'),
    h('p.small', { style: { margin: '4px 0 0' } }, 'Тренировка дня собирается по этим долям. Это наше распределение для центрального нападающего 14 лет, а не официальная норма. Навыки и индивидуальная тактика важнее заученных схем.')));
  for (const t of T) {
    const cards = trainCards().filter(c => c.track === t.id);
    const keys = cards.flatMap(keysOf);
    const learned = keys.filter(k => isLearned(state.progress[k])).length;
    const a = acc[t.id], share = total ? done[t.id] / total || 0 : null;
    view.append(h('div.panel.prog-track', { onclick: () => play(buildQueue(keys, state.progress, { size: 10, maxNew: 10 }), { module: 'track:' + t.id, onDone: rerender }) },
      h('div.row', h('div.grow', h('div.nm', t.name), h('div.ln', t.line)), h('div.prog-pc', Math.round(t.share * 100) + '%')),
      meter(keys.length ? learned / keys.length : 0),
      h('div.prog-meta',
        h('span', `${learned}/${keys.length} выучено`),
        h('span', a ? `точность ${Math.round(a.rate * 100)}%` : 'ещё не решал'),
        share != null ? h('span', { class: Math.abs(share - t.share) > 0.08 ? 'off' : '' }, `за месяц ${Math.round(share * 100)}%`) : null)));
  }
}
