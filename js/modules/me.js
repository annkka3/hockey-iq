/* «Я»: звание, статистика по принципам и фазам, настройки, аккаунт, вход для родителей. */
import { attentionPanel } from './react.js';
import { h, meter, svg, toast } from '../ui.js';
import { lib } from '../content.js';
import { state, setProfile } from '../core/state.js';
import { summarize, accuracyBy, medianTime, readingTrend, confidence } from '../engine/scoring.js';
import { fx } from '../core/fx.js';
import { RINKS } from '../engine/rink.js';
import { syncStatus } from '../core/sync.js';
import * as cards from './cards.js';
import { holdoutCards, holdoutSet, keysOf, trainCards } from '../content.js';
import { play, mirrorKey } from './play.js';
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


  { const rp = readingPanel(state.sessions); if (rp) view.append(rp); }
  { const cp = confidencePanel(state.sessions); if (cp) view.append(cp); }
  { const ap = attentionPanel(state.sessions); if (ap) view.append(ap); }
  onice.playerPanel(view, rerender);

  // Контрольный срез: незнакомые ситуации без подсказок раз в 4 недели
  {
    const tests = state.sessions.filter(s => s.module === 'test' && s.items.length >= 4);
    const last = tests[tests.length - 1];
    const days = last ? Math.floor((Date.now() - last.startedAt) / 864e5) : null;
    const ready = !last || days >= 28;
    const isM = i => i.mirrored || String(i.key || i.cardId || '').endsWith('~m');
    const pctOf = its => its.length ? Math.round(its.filter(i => i.verdict === 'best').length / its.length * 100) : null;
    const pct = s => pctOf(s.items.filter(i => !isM(i))) ?? pctOf(s.items);
    const mir = s => { const m = s.items.filter(isM); return m.length ? ` · зеркало ${m.filter(i => i.verdict === 'best').length}/${m.length}` : ''; };
    view.append(h('div.h2', 'Контрольный срез'),
      h('div.panel',
        h('p.muted.small', { style: { marginTop: 0 } }, `${holdoutCards().length} ситуаций, которых нет в тренировках, в трёх наборах. Срезы идут по кругу: А, Б, В — каждый раз незнакомые эпизоды. Без подсказок и разборов — проверка, переносится ли мышление на новые ситуации. Плюс 4 знакомые ситуации в зеркальной расстановке (лево ↔ право): узнаёт ли он принцип, а не картинку.`),
        tests.length ? h('div.list', tests.slice(-4).map(s => h('div.li', h('span', new Date(s.startedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) + (s.hset != null ? ` · набор ${'АБВ'[s.hset]}` : '')), h('span.r', pct(s) + '%' + mir(s))))) : null,
        h('button.btn.small' + (ready ? '.primary' : ''), { style: { marginTop: '12px' }, disabled: !ready,
          onclick: () => {
            const k = tests.length % 3;
            // перенос навыка: к незнакомым ситуациям — 4 знакомые, но в зеркальной расстановке (лево ↔ право)
            const known = trainCards().filter(c => !c.variants && c.options && c.options.length > 1 && !c.me_hand);
            for (let i = known.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [known[i], known[j]] = [known[j], known[i]]; }
            const keys = [...holdoutSet(k).flatMap(keysOf), ...known.slice(0, 4).map(c => mirrorKey(c.id))];
            for (let i = keys.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [keys[i], keys[j]] = [keys[j], keys[i]]; }
            play(keys, { module: 'test', test: true, hset: k, onDone: rerender });
          } },
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
      field('Анимации', toggle([[true, 'Вкл'], [false, 'Выкл']], p.anim, v => setProfile({ anim: v }), rerender)),
      field('Звук', toggle([[true, 'Вкл'], [false, 'Выкл']], p.sound !== false, v => { setProfile({ sound: v }); if (v) fx('best'); }, rerender)),
      field('Вибрация', toggle([[true, 'Вкл'], [false, 'Выкл']], p.haptics !== false, v => { setProfile({ haptics: v }); if (v) fx('tap'); }, rerender))));

  view.append(h('div.h2', 'Аккаунт'), account(cloud, rerender));

  view.append(h('div', { style: { marginTop: '22px' } },
    h('button.btn.block', { onclick: () => { location.hash = '#/parent'; } }, 'Для родителей')));
  view.append(h('p.muted.small', { style: { textAlign: 'center', marginTop: '18px' } }, `Hockey IQ · сборка контента ${lib.built}`));
}

const pct = x => Math.round(x * 100) + '%';
const big = (text, color = 'var(--cyan)') => h('div', { style: { fontFamily: 'var(--display)', fontWeight: 800, fontSize: '22px', color } }, text);

/* «Чтение игры»: доля верных прогнозов («Предскажи») по неделям + «Почему». Экспортируется — им пользуется и экран родителя. */
export function readingPanel(sessions) {
  const r = readingTrend(sessions);
  if (!r.n) return null;
  const max = 1;
  const trendTxt = r.trend == null ? 'Мало данных для тренда — нужно по 4 прогноза за две недели.'
    : r.trend > 0.04 ? `Растёт: +${Math.round(r.trend * 100)} п. п. за последние две недели.`
    : r.trend < -0.04 ? `Просело: ${Math.round(r.trend * 100)} п. п. за последние две недели.` : 'Держится на одном уровне.';
  return h('div.panel.metric', { style: { marginTop: '12px' } },
    h('div.row', h('div.grow', h('b', 'Чтение игры'), h('div.muted.small', 'Верные прогнозы в шаге «Предскажи» — видит ли, что будет дальше')), big(pct(r.rate))),
    h('div.wk-bars', r.weeks.map((w, i) => h('div.wk', { title: w.n ? `${w.ok} из ${w.n}` : 'нет ответов' },
      h('div.wk-col', h('div.wk-fill', { style: { height: w.rate == null ? '0' : Math.max(4, w.rate / max * 100) + '%' }, class: w.rate == null ? 'empty' : '' })),
      h('span', i === r.weeks.length - 1 ? 'эта' : `−${r.weeks.length - 1 - i}`)))),
    h('div.muted.small', { style: { marginTop: '6px' } }, `${r.weeks.reduce((a, w) => a + w.ok, 0)} из ${r.n} за 6 недель. ${trendTxt}`),
    r.whyN ? h('div.muted.small', `«Почему?» — верно ${pct(r.whyRate)} (${r.whyN})`) : null);
}

/* «Уверенность»: совпадает ли скорость ответа с качеством. Четыре клетки и вывод простыми словами. */
export function confidencePanel(sessions) {
  const c = confidence(sessions);
  if (!c.label) return c.n ? h('div.panel.metric', { style: { marginTop: '12px' } }, h('b', 'Уверенность'), h('div.muted.small', `Появится после 8 решений с замером времени (сейчас ${c.n}).`)) : null;
  const cell = (n, title, cls) => h('div.cf-cell.' + cls, h('b', n), h('span', title));
  return h('div.panel.metric', { style: { marginTop: '12px' } },
    h('div.row', h('div.grow', h('b', 'Уверенность'), h('div.muted.small', `Быстро — быстрее ${(c.cut / 1000).toFixed(1)} с, его обычного времени`)), big(c.label, 'var(--text)')),
    h('div.cf-grid',
      cell(c.fastRight, 'быстро и верно', 'good'), cell(c.slowRight, 'долго, но верно', 'mid'),
      cell(c.fastWrong, 'быстро и неверно', 'warn'), cell(c.slowWrong, 'долго и неверно', 'bad')),
    h('div.muted.small', { style: { marginTop: '8px' } }, c.text));
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
