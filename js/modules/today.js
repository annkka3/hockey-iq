/* «Сегодня»: тренировка дня, серия, звание, сообщение от родителя, что дальше. */
import { h, icon, ring, meter, svg } from '../ui.js';
import { lib, keysOf } from '../content.js';
import { state } from '../core/state.js';
import { summarize } from '../engine/scoring.js';
import { buildQueue, today } from '../engine/srs.js';
import { play } from './play.js';

const cfg = () => (window.HK_CONFIG && window.HK_CONFIG.session) || { size: 10, maxNew: 5 };

export const allKeys = () => lib.cards.flatMap(keysOf);

export function render(view, rerender) {
  const sum = summarize(state.sessions);
  const size = cfg().size;
  const done = sum.todayItems;
  const nick = state.profile.nick;
  const start = () => play(buildQueue(allKeys(), state.progress, cfg()), { module: 'today', onDone: rerender });

  view.append(
    h('div.h1', nick ? `На лёд, ${nick}` : 'На лёд'),
    h('p.lead', done >= size ? 'Норма дня выполнена. Можно добавить смену.' : `${size} ситуаций — около пяти минут.`));

  const hero = h('div.panel.glow.hero',
    h('div.kicker', 'Тренировка дня'),
    h('div.hero-row',
      ring(Math.min(done, size), size, 'из ' + size),
      h('div', { style: { display: 'grid', gap: '14px' } },
        h('div.stat', { style: { color: 'var(--gold)' } }, sum.streak, h('small', 'дней подряд')),
        h('div.stat', sum.points, h('small', 'очков')))),
    h('button.btn.primary.block', { onclick: start }, done >= size ? 'Ещё смена' : done ? 'Продолжить' : 'Выйти на лёд'),
    h('div.rankbar',
      h('div.meta', h('span', 'Звание ', h('b', sum.rank.name)), h('span', sum.rank.next ? `до «${sum.rank.next}» ${sum.rank.toNext}` : 'высшее')),
      meter(sum.rank.frac, true)));
  view.append(hero);

  const msg = state.parent.message;
  if (msg && msg.text) {
    view.append(h('div.panel.note', { style: { marginTop: '12px' } }, h('div.who', 'Сообщение'), h('p', { style: { margin: '6px 0 0' } }, msg.text)));
  }
  const goal = state.parent.goal;
  if (goal && goal.target) {
    const week = weekDays(sum);
    view.append(h('div.panel', { style: { marginTop: '12px' } },
      h('div.row', h('div.grow', h('b', 'Цель недели'), h('div.muted.small', `${goal.target} ${goal.target < 5 ? 'дня' : 'дней'} с тренировкой${goal.reward ? ' · награда: ' + goal.reward : ''}`)),
        h('div.stat', { style: { fontSize: '22px' } }, `${week}/${goal.target}`)),
      h('div', { style: { marginTop: '10px' } }, meter(week / goal.target, true))));
  }

  const pr = lib.principles[dayIndex() % lib.principles.length];
  if (pr) {
    view.append(h('div.h2', 'Принцип дня'),
      h('div.panel', h('div.principle', { style: { margin: 0 } }, h('b', pr.name), h('span', pr.line))));
  }

  const f = window.HK_CONFIG.features;
  view.append(h('div.h2', f.shot && f.react ? 'Ещё тренировки' : 'Скоро'),
    h('div.tiles',
      tile('Бросок', 'Геометрия и игра свайпом', f.shot ? null : 'v0.2', shotArt(), () => { location.hash = '#/shot'; }),
      tile('Реакция', 'Память, скорость, внимание', f.react ? null : 'v0.3', reactArt(), () => { location.hash = '#/react'; })));
}

const dayIndex = () => Math.floor(new Date(today() + 'T12:00:00').getTime() / 864e5);

function weekDays(sum) {
  const d = new Date(), wd = (d.getDay() + 6) % 7;
  let n = 0;
  for (let k = 0; k <= wd; k++) {
    const x = new Date(d); x.setDate(d.getDate() - k);
    const rec = sum.days[today(x)];
    if (rec && rec.items >= 5) n++;
  }
  return n;
}

function tile(t, s, ver, art, onclick) {
  return h('div.panel.tile' + (ver ? '.locked' : ''), { onclick },
    art, ver ? h('span.badge', { style: { position: 'absolute', left: '14px', top: '14px' } }, ver) : null,
    h('div.t', t), h('div.s', s));
}

const shotArt = () => svg(`<svg class="art" viewBox="0 0 84 84"><defs><linearGradient id="sa" x1="0" x2="1"><stop offset="0" stop-color="#3FD7FF" stop-opacity="0"/><stop offset="1" stop-color="#3FD7FF"/></linearGradient></defs>
  <rect x="44" y="12" width="28" height="18" rx="2" fill="none" stroke="#FF3D57" stroke-width="2"/><path d="M10 74 Q30 40 58 22" stroke="url(#sa)" stroke-width="3" fill="none"/><circle cx="58" cy="22" r="4" fill="#EAF6FF"/></svg>`);
const reactArt = () => svg(`<svg class="art" viewBox="0 0 84 84"><circle cx="54" cy="30" r="22" fill="none" stroke="#3FD7FF" stroke-opacity=".35" stroke-width="2"/><circle cx="54" cy="30" r="12" fill="none" stroke="#3FD7FF" stroke-width="2"/><circle cx="54" cy="30" r="3" fill="#3FD7FF"/><path d="M54 2v10M54 48v10M26 30h10M72 30h10" stroke="#3FD7FF" stroke-width="2"/></svg>`);
