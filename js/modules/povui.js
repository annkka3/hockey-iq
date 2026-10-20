/* Переключатель «Вид от игрока» для любой площадки со Scene: кнопка-глаз, плечевой осмотр влево/вправо.
   Выбор запоминается в профиле, поэтому включённый вид остаётся от ситуации к ситуации. */
import { h } from '../ui.js';
import { Pov } from '../engine/pov.js';
import { state, setProfile } from '../core/state.js';

const EYE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';

export function povSwitch(wrap, scene, { force = null } = {}) {
  if (!(scene.card.us || []).some(e => e.me)) return null;
  let pov = null;
  const btn = h('button.pov-btn', { type: 'button', 'aria-label': 'Вид от игрока', html: EYE + '<span>Глазами</span>' });
  const bar = h('div.pov-bar',
    h('button.btn.small', { type: 'button', onclick: e => { e.stopPropagation(); pov && pov.shoulder(-1); } }, '↶ Через левое плечо'),
    h('button.btn.small', { type: 'button', onclick: e => { e.stopPropagation(); pov && pov.shoulder(1); } }, 'Через правое ↷'));
  const on = () => {
    if (pov) return;
    pov = new Pov(wrap, scene);
    wrap.classList.add('pov-on'); btn.classList.add('on');
    wrap.after(bar);
  };
  const off = () => {
    if (!pov) return;
    pov.destroy(); pov = null;
    wrap.classList.remove('pov-on'); btn.classList.remove('on'); bar.remove();
  };
  btn.addEventListener('click', e => {
    e.stopPropagation();
    if (pov) { off(); setProfile({ pov: false }); } else { on(); setProfile({ pov: true }); }
  });
  wrap.append(btn);
  if (force ?? state.profile.pov) on();
  scene.onDestroy = () => { off(); bar.remove(); };
  return { on, off, get pov() { return pov; } };
}
