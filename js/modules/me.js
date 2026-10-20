/* «Я»: звание, статистика по принципам и фазам, настройки, аккаунт, вход для родителей. */
import { h, meter, svg, toast } from '../ui.js';
import { lib } from '../content.js';
import { state, setProfile } from '../core/state.js';
import { summarize, accuracyBy, medianTime, readRate } from '../engine/scoring.js';
import { RINKS } from '../engine/rink.js';
import { syncStatus } from '../core/sync.js';
import * as cards from './cards.js';
import { holdoutCards, holdoutSet, keysOf } from '../content.js';
import { play } from './play.js';
import * as onice from './onice.js';

export function render(view, rerender, cloud) {
  const sum = summarize(state.sessions);
  const p = state.profile;
  const med = medianTime(state.sessions);

  view.append(h('div.h1', 'Профиль'),
    h('div.panel.glow',
      h('div.me-card', jersey(p.nick),
        h('div', h('div', { style: { fontFamily: 'var(--display)', fontWeight: 800, fontSize: '20px' } }, p.nick || 'Игрок'),
          h('div.muted.small', `Центральный · хват ${p.hand === 'L' ? 'левый' : 'правый'}`),
          h('span.badge.gold', { style: { marginTop: '8px' } }, sum.rank.name))),
      h('div.kv',
        h('div', h('b', sum.points), h('span', 'очков')),
        h('div', h('b', sum.streak), h('span', 'серия')),
        h('div', h('b', med ? (med / 1000).toFixed(1) + ' с' : '—'), h('span', 'на верное решение')))));


  {
    const rr = readRate(state.sessions);
    if (rr.n) view.append(h('div.panel', { style: { marginTop: '12px' } },
      h('div.row', h('div.grow', h('b', 'Предугадывание'), h('div.muted.small', 'Верные прогнозы в шаге «Предскажи» за 30 дней')),
        h('div', { style: { fontFamily: 'var(--display)', fontWeight: 800, fontSize: '22px', color: 'var(--cyan)' } }, Math.round(rr.rate * 100) + '%')),
      meter(rr.rate), h('div.muted.small', { style: { marginTop: '6px' } }, `${rr.ok} из ${rr.n}`)));
  }
  onice.playerPanel(view, rerender);

  // Контрольный срез: незнакомые ситуации без подсказок раз в 4 недели
  {
    const tests = state.sessions.filter(s => s.module === 'test' && s.items.length >= 4);
    const last = tests[tests.length - 1];
    const days = last ? Math.floor((Date.now() - last.startedAt) / 864e5) : null;
    const ready = !last || days >= 28;
    const pct = s => Math.round(s.items.filter(i => i.verdict === 'best').length / s.items.length * 100);
    view.append(h('div.h2', 'Контрольный срез'),
      h('div.panel',
        h('p.muted.small', { style: { marginTop: 0 } }, `${holdoutCards().length} ситуаций, которых нет в тренировках, в трёх наборах. Срезы идут по кругу: А, Б, В — каждый раз незнакомые эпизоды. Без подсказок и разборов — проверка, переносится ли мышление на новые ситуации.`),
        tests.length ? h('div.list', tests.slice(-4).map(s => h('div.li', h('span', new Date(s.startedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) + (s.hset != null ? ` · набор ${'АБВ'[s.hset]}` : '')), h('span.r', pct(s) + '%')))) : null,
        h('button.btn.small' + (ready ? '.primary' : ''), { style: { marginTop: '12px' }, disabled: !ready,
          onclick: () => { const k = tests.length % 3; play(holdoutSet(k).flatMap(keysOf), { module: 'test', test: true, hset: k, onDone: rerender }); } },
          ready ? 'Пройти срез' : `Следующий — через ${28 - days} дн.`)));
  }

  cards.collection(view);

  const acc = accuracyBy(state.sessions, 'principle');
  view.append(h('div.h2', 'Точность по принципам · 30 дней'), bars(lib.principles, acc));
  const accP = accuracyBy(state.sessions, 'phase');
  view.append(h('div.h2', 'По фазам игры'), bars(lib.phases, accP));

  view.append(h('div.h2', 'Настройки'),
    h('div.panel',
      field('Имя или ник', h('input.input', { value: p.nick, maxlength: 20, placeholder: 'Как подписать', onchange: e => { setProfile({ nick: e.target.value.trim() }); rerender(); } })),
      field('Хват', toggle([['L', 'Левый'], ['R', 'Правый']], p.hand, v => setProfile({ hand: v }), rerender)),
      field('Площадка', toggle(Object.values(RINKS).map(r => [r.id, r.name]), p.rink, v => setProfile({ rink: v }), rerender)),
      field('Анимации', toggle([[true, 'Вкл'], [false, 'Выкл']], p.anim, v => setProfile({ anim: v }), rerender))));

  view.append(h('div.h2', 'Аккаунт'), account(cloud, rerender));

  view.append(h('div', { style: { marginTop: '22px' } },
    h('button.btn.block', { onclick: () => { location.hash = '#/parent'; } }, 'Для родителей')));
  view.append(h('p.muted.small', { style: { textAlign: 'center', marginTop: '18px' } }, `Hockey IQ v0.1 · контент ${lib.built}`));
}

function jersey(nick) {
  const n = (nick || 'IQ').slice(0, 2).toUpperCase();
  return svg(`<svg class="jersey" viewBox="0 0 72 72"><defs><linearGradient id="jg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3FD7FF"/><stop offset="1" stop-color="#00739E"/></linearGradient></defs>
    <path d="M20 8h32l14 12-8 10-6-4v38H20V26l-6 4-8-10z" fill="url(#jg)" stroke="#EAF6FF" stroke-opacity=".4"/>
    <path d="M20 46h32" stroke="#04080E" stroke-width="4" stroke-opacity=".5"/>
    <text x="36" y="40" text-anchor="middle" font-size="16" fill="#031222">${n.replace(/[<&>"]/g, '')}</text></svg>`);
}

function bars(items, acc) {
  const rows = items.filter(i => acc[i.id]).map(i => {
    const a = acc[i.id];
    return h('div.bar-row', h('div.nm', i.name), h('div.pc', Math.round(a.rate * 100) + '%'), meter(a.rate));
  });
  return h('div.panel.bars', rows.length ? rows : h('div.empty', 'Появится после первых тренировок.'));
}

const field = (label, ctrl) => h('label.field', h('span', label), ctrl);

function toggle(opts, cur, set, rerender) {
  const box = h('div.toggle', { style: { '--n': opts.length } });
  for (const [v, t] of opts) box.append(h('button', { class: v === cur ? 'on' : '', type: 'button', onclick: () => { set(v); rerender(); } }, t));
  return box;
}

function account(cloud, rerender) {
  if (!cloud) return h('div.panel', h('p', { style: { margin: 0 } }, 'Прогресс хранится на этом телефоне.'),
    h('p.muted.small', { style: { marginBottom: 0 } }, 'Синхронизация между устройствами включится, когда подключим облако.'));
  if (cloud.user) {
    return h('div.panel',
      h('div', h('b', cloud.user.email)),
      h('div.muted.small', syncStatus.error ? `Ошибка синхронизации: ${syncStatus.error}` : syncStatus.last ? `Синхронизировано ${new Date(syncStatus.last).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}` : 'Синхронизация…'),
      h('button.btn.small', { style: { marginTop: '12px' }, onclick: async () => { await cloud.signOut(); rerender(); } }, 'Выйти'));
  }
  const email = h('input.input', { type: 'email', placeholder: 'Почта', autocomplete: 'email' });
  const pass = h('input.input', { type: 'password', placeholder: 'Пароль (от 6 символов)', autocomplete: 'current-password', style: { marginTop: '8px' } });
  const go = async fn => {
    try { await fn(email.value.trim(), pass.value); toast('Готово'); }
    catch (e) { toast(errText(e.code)); }
  };
  return h('div.panel',
    h('p.muted.small', { style: { marginTop: 0 } }, 'Вход сохраняет прогресс в облаке: можно продолжить на другом телефоне, а родитель увидит статистику.'),
    email, pass,
    h('div.row', { style: { marginTop: '12px' } },
      h('button.btn.primary.small.grow', { onclick: () => go(cloud.signIn) }, 'Войти'),
      h('button.btn.small.grow', { onclick: () => go(cloud.signUp) }, 'Создать')),
    h('button.btn.ghost.small', { style: { marginTop: '6px' }, onclick: () => email.value ? cloud.reset(email.value.trim()).then(() => toast('Письмо отправлено')).catch(e => toast(errText(e.code))) : toast('Впиши почту') }, 'Забыл пароль'));
}

const errText = c => ({
  'auth/invalid-credential': 'Почта или пароль не подходят',
  'auth/wrong-password': 'Неверный пароль',
  'auth/user-not-found': 'Такого аккаунта нет',
  'auth/email-already-in-use': 'Аккаунт с этой почтой уже есть — войди',
  'auth/weak-password': 'Пароль короче 6 символов',
  'auth/invalid-email': 'Проверь почту',
  'auth/network-request-failed': 'Нет интернета',
}[c] || 'Не получилось: ' + (c || 'ошибка'));
