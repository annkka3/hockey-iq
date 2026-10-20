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
  const raw = T.map(t => t.share * size), quota = raw.map(Math.floor);
  let left = size - quota.reduce((a, b) => a + b, 0);
  raw.map((r, i) => [r - Math.floor(r), i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (left-- > 0) quota[i]++; });
  const q = [];
  T.forEach((t, i) => {
    if (!quota[i]) return;
    const keys = all.filter(c => c.track === t.id).flatMap(keysOf);
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
