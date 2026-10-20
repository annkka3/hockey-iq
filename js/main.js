/* Точка входа: контент, облако (если подключено), каркас, маршруты. */
import { h, icon, ICONS, NAV_ICONS, svg, sheet } from './ui.js';
import { loadContent, syncMine, setExcluded } from './content.js';
import { state, setProfile, onChange } from './core/state.js';
import { attach, signedIn } from './core/sync.js';
import { summarize } from './engine/scoring.js';
import * as today from './modules/today.js';
import * as decks from './modules/decks.js';
import * as me from './modules/me.js';
import * as parent from './modules/parent.js';
import * as soon from './modules/soon.js';
import * as shot from './modules/shot.js';
import * as react from './modules/react.js';
import * as cards from './modules/cards.js';

const TABS = [
  ['today', 'Сегодня'], ['decks', 'Решения'], ['shot', 'Бросок'], ['react', 'Реакция'], ['me', 'Я'],
];

let cloud = null;
let lastTab = 0;
const app = document.getElementById('app');

function route() { return (location.hash.replace(/^#\/?/, '') || 'today').split('/')[0]; }

let lastRoute = null;
function render() {
  const r = route();
  if (lastRoute === 'parent' && r !== 'parent') parent.lock();
  lastRoute = r;
  const sum = summarize(state.sessions);
  app.innerHTML = '';
  app.append(h('header.topbar',
    h('div.brand', h('i'), 'HOCKEY', h('b', 'IQ')),
    h('div.chips',
      h('span.chip.streak', icon('fire'), sum.streak),
      h('span.chip.pts', icon('bolt'), sum.points))));
  const view = h('main.view');
  app.append(view);
  const rerender = () => { const y = window.scrollY; render(); window.scrollTo(0, y); };
  const f = window.HK_CONFIG.features;
  if (r === 'decks') decks.render(view, rerender);
  else if (r === 'shot') f.shot ? shot.render(view, rerender) : soon.render(view, 'shot');
  else if (r === 'react') f.react ? react.render(view, rerender) : soon.render(view, 'react');
  else if (r === 'me') me.render(view, rerender, cloud);
  else if (r === 'parent') parent.render(view, rerender);
  else today.render(view, rerender);

  // Плавающая панель: «пилюля» переезжает под активную вкладку из прежнего положения
  const nav = h('nav.tabs');
  const active = r === 'parent' ? 'me' : r;
  const idx = Math.max(0, TABS.findIndex(([id]) => id === active));
  const pill = h('i.nav-pill', { style: { '--i': lastTab } });
  nav.append(pill);
  for (const [id, label] of TABS) {
    const locked = (id === 'shot' && !f.shot) || (id === 'react' && !f.react);
    nav.append(h('button.tab', { class: id === active ? 'on' : '', 'aria-current': id === active ? 'page' : null,
      onclick: () => { if (location.hash !== '#/' + id) location.hash = '#/' + id; else window.scrollTo({ top: 0, behavior: 'smooth' }); } },
      h('span.tab-ico', svg(NAV_ICONS[id])), h('span.tab-lb', label), locked ? h('span.lock', icon('lock')) : null));
  }
  app.append(nav);
  if (lastTab !== idx) requestAnimationFrame(() => requestAnimationFrame(() => pill.style.setProperty('--i', idx)));
  lastTab = idx;
  if (state.meta.onboarded && !document.querySelector('.play, .reveal-back')) {
    const fresh = cards.checkAwards();
    if (fresh.length) cards.reveal(fresh, () => render());
  }
}

function onboarding() {
  if (state.meta.onboarded) return;
  sheet(close => {
    const nick = h('input.input', { placeholder: 'Имя или ник', maxlength: 20 });
    const done = () => { state.meta.onboarded = true; setProfile({ nick: nick.value.trim() }); close(); render(); };
    return [
      h('div.h1', { style: { marginTop: 0 } }, 'Hockey IQ'),
      h('p.lead', 'Ситуации на льду. У тебя пара секунд, чтобы решить, куда ехать и что делать с шайбой. После ответа — разбор: что произошло и почему.'),
      h('label.field', h('span', 'Как тебя подписать'), nick),
      h('button.btn.primary.block', { onclick: done }, 'Погнали'),
    ];
  });
}

async function boot() {
  try { await loadContent(); syncMine(state.cards || {}); setExcluded(state.parent.reviews); onChange(() => { syncMine(state.cards || {}); setExcluded(state.parent.reviews); }); }
  catch (e) { app.append(h('div.panel', { style: { margin: '20px' } }, 'Не загрузился контент. Проверь интернет и открой снова.')); return; }
  if (window.HK_CONFIG.firebase) {
    try {
      const mod = await import('../store.js');
      cloud = mod.cloud;
      if (cloud) {
        await attach(cloud);
        cloud.onAuth = async user => { await signedIn(user); render(); };
      }
    } catch (e) { console.error(e); }
  }
  window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });
  render();
  onboarding();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
}

boot();
