/* Переключатель видов «Глазами / Сверху» для площадки со Scene (компоновка по референсу B):
   крупная сцена глазами, под ней — переключатель, кнопки поворота головы и мини-карта (та же схема, уменьшенная,
   с сектором обзора). Мини-карта — это сама Scene: один источник координат, поэтому игрок на карте и в виде
   глазами всегда в одной точке. Выбор вида запоминается в профиле.
   Во время решения (scene.phase: watch / pause / choose) мини-карта скрыта — иначе она показывает ответ без осмотра:
   на её месте кнопка «Карта», которая открывает схему крупно (это записывается как подсказка — scene.mapPeeks).
   После ответа (result / review) мини-карта на месте и по нажатию открывается крупно. */
import { h } from '../ui.js';
import { Pov } from '../engine/pov.js';
import { state, setProfile } from '../core/state.js';

const EYE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const TOP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="4"/><path d="M12 5v14"/><circle cx="12" cy="12" r="2.5"/></svg>';
const MAP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="4"/><path d="M4 12h16"/><circle cx="12" cy="12" r="2.5"/></svg>';
const AHEAD = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="M6 11l6-6 6 6"/></svg>';

const DECIDING = new Set(['watch', 'pause', 'choose']);

export function povSwitch(wrap, scene, { force = null } = {}) {
  if (!(scene.card.us || []).some(e => e.me)) return null;
  let pov = null;
  const bEye = h('button', { type: 'button', html: EYE + '<span>Глазами</span>' });
  const bTop = h('button', { type: 'button', html: TOP + '<span>Сверху</span>' });
  const seg = h('div.view-seg', bEye, bTop);
  const mini = h('div.pov-mini');
  const mapBtn = h('button.btn.pov-mapbtn', { type: 'button', html: MAP + '<span>Карта</span>', onclick: e => { e.stopPropagation(); openMap(); } });
  const turn = h('div.pov-turn',
    h('button.btn', { type: 'button', onclick: e => { e.stopPropagation(); pov && pov.shoulder(-1); } }, h('span.arr', '‹'), 'Влево'),
    h('button.btn.pov-ahead', { type: 'button', 'aria-label': 'Вернуть взгляд вперёд', html: AHEAD + '<span>Вперёд</span>', onclick: e => { e.stopPropagation(); pov && pov.lookAhead(); } }),
    h('button.btn', { type: 'button', onclick: e => { e.stopPropagation(); pov && pov.shoulder(1); } }, 'Вправо', h('span.arr', '›')));
  const row = h('div.pov-row', turn, mini);
  const bar = h('div.view-bar', seg);
  const home = { parent: scene.svg.parentNode, next: scene.svg.nextSibling };
  scene.mapPeeks = 0;

  // крупная карта поверх экрана: та же схема переносится в окно и обратно
  let full = null;
  const closeMap = () => { if (!full) return; full.remove(); full = null; document.removeEventListener('keydown', esc); placeMap(); };
  const esc = e => { if (e.key === 'Escape') closeMap(); };
  function openMap() {
    if (full || !pov) return;
    if (DECIDING.has(scene.phase)) scene.mapPeeks++;
    full = h('div.map-full', { onclick: e => { if (e.target === full) closeMap(); } },
      h('div.map-box', h('button.map-x', { type: 'button', 'aria-label': 'Закрыть карту', onclick: e => { e.stopPropagation(); closeMap(); } }, '✕'), scene.svg));
    document.body.append(full);
    document.addEventListener('keydown', esc);
  }
  // мини-карта: во время решения скрыта (кнопка «Карта»), после ответа — на месте
  function placeMap() {
    if (!pov || full) return;
    const hide = DECIDING.has(scene.phase);
    mini.classList.toggle('hidden-map', hide);
    if (hide) { scene.svg.remove(); mini.replaceChildren(mapBtn); }
    else { mini.replaceChildren(scene.svg); }
  }
  mini.addEventListener('click', e => { if (!mini.classList.contains('hidden-map') && pov) { e.stopPropagation(); openMap(); } });
  const prevPhase = scene.onPhase;
  scene.onPhase = ph => { if (prevPhase) prevPhase(ph); if (full && !DECIDING.has(ph)) { /* уже ответил — карта может остаться открытой */ } placeMap(); };

  const on = () => {
    if (pov) return;
    pov = new Pov(wrap, scene);
    window.__hkPov = pov; // для автопроверок
    wrap.classList.add('pov-on');
    bar.after(row);
    placeMap();
    bEye.classList.add('on'); bTop.classList.remove('on');
  };
  const off = () => {
    closeMap();
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
  scene.onDestroy = () => { closeMap(); if (pov) { pov.destroy(); pov = null; } row.remove(); bar.remove(); };
  return { on, off, get pov() { return pov; } };
}
