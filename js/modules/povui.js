/* Переключатель видов «Глазами / Сверху» для площадки со Scene (компоновка по референсу B):
   крупная сцена глазами, под ней — переключатель, кнопки поворота головы и мини-карта (та же схема, уменьшенная,
   с сектором обзора). Мини-карта — это сама Scene: один источник координат, поэтому игрок на карте и в виде
   глазами всегда в одной точке. Выбор вида запоминается в профиле. */
import { h } from '../ui.js';
import { Pov } from '../engine/pov.js';
import { state, setProfile } from '../core/state.js';

const EYE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const TOP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="4"/><path d="M12 5v14"/><circle cx="12" cy="12" r="2.5"/></svg>';

export function povSwitch(wrap, scene, { force = null } = {}) {
  if (!(scene.card.us || []).some(e => e.me)) return null;
  let pov = null;
  const bEye = h('button', { type: 'button', html: EYE + '<span>Глазами</span>' });
  const bTop = h('button', { type: 'button', html: TOP + '<span>Сверху</span>' });
  const seg = h('div.view-seg', bEye, bTop);
  const mini = h('div.pov-mini');
  const turn = h('div.pov-turn',
    h('button.btn', { type: 'button', onclick: e => { e.stopPropagation(); pov && pov.shoulder(-1); } }, h('span.arr', '‹'), 'Влево'),
    h('button.btn', { type: 'button', onclick: e => { e.stopPropagation(); pov && pov.shoulder(1); } }, 'Вправо', h('span.arr', '›')));
  const row = h('div.pov-row', turn, mini);
  const bar = h('div.view-bar', seg);
  const home = { parent: scene.svg.parentNode, next: scene.svg.nextSibling };

  const on = () => {
    if (pov) return;
    pov = new Pov(wrap, scene);
    wrap.classList.add('pov-on');
    mini.append(scene.svg);           // та же схема — мини-картой справа от кнопок
    bar.after(row);
    bEye.classList.add('on'); bTop.classList.remove('on');
  };
  const off = () => {
    if (pov) { pov.destroy(); pov = null; }
    wrap.classList.remove('pov-on');
    if (scene.svg.parentNode !== home.parent) home.parent.insertBefore(scene.svg, home.next && home.next.parentNode === home.parent ? home.next : home.parent.firstChild);
    row.remove();
    bTop.classList.add('on'); bEye.classList.remove('on');
  };
  bEye.addEventListener('click', e => { e.stopPropagation(); on(); setProfile({ pov: true }); });
  bTop.addEventListener('click', e => { e.stopPropagation(); off(); setProfile({ pov: false }); });
  wrap.after(bar);
  if (force ?? state.profile.pov) on(); else off();
  scene.onDestroy = () => { if (pov) { pov.destroy(); pov = null; } row.remove(); bar.remove(); };
  return { on, off, get pov() { return pov; } };
}
