/* Раздел для родителей (под PIN): активность, точность, застрявшие ситуации, сообщение, цель недели,
   ревью карточек. В командной версии тот же экран открывается по роли опекуна, без PIN. */
import { attentionPanel } from './react.js';
import { h, meter, toast, icon, fmtSec } from '../ui.js';
import { lib, parseKey, keysOf } from '../content.js';
import { state, setParent, resetAll } from '../core/state.js';
import { summarize, accuracyBy, medianTime, readRate } from '../engine/scoring.js';
import { isStuck, today, addDays } from '../engine/srs.js';
import { play } from './play.js';
import * as editor from './editor.js';
import * as onice from './onice.js';

let unlocked = false;
export const lock = () => { unlocked = false; };

const hash = async pin => {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('hk-parent:' + pin));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
};

export function render(view, rerender) {
  view.append(h('button.btn.ghost.small', { onclick: () => { location.hash = '#/me'; } }, icon('back'), 'Назад'));
  if (!unlocked) return pinGate(view, rerender);
  dashboard(view, rerender);
}

function pinGate(view, rerender) {
  const setup = !state.parent.pinHash;
  let first = null, cur = '';
  const title = h('div.h1', setup ? 'Придумайте PIN' : 'Для родителей');
  const lead = h('p.lead', setup ? 'Четыре цифры. Ребёнку их знать не нужно.' : 'Введите PIN.');
  const dots = h('div.pin');
  const draw = () => { dots.innerHTML = ''; for (let i = 0; i < 4; i++) dots.append(h('i', { class: i < cur.length ? 'f' : '' })); };
  const press = async d => {
    if (d === '⌫') { cur = cur.slice(0, -1); draw(); return; }
    if (cur.length >= 4) return;
    cur += d; draw();
    if (cur.length < 4) return;
    const hsh = await hash(cur);
    if (setup && !first) { first = hsh; cur = ''; lead.textContent = 'Повторите PIN.'; setTimeout(draw, 150); return; }
    if (setup) {
      if (hsh === first) { setParent({ pinHash: hsh }); unlocked = true; rerender(); }
      else { first = null; cur = ''; lead.textContent = 'Не совпало. Придумайте PIN заново.'; setTimeout(draw, 150); }
      return;
    }
    if (hsh === state.parent.pinHash) { unlocked = true; rerender(); }
    else { cur = ''; toast('Неверный PIN'); setTimeout(draw, 150); }
  };
  draw();
  view.append(title, lead, dots,
    h('div.keypad', ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map(d => d ? h('button', { onclick: () => press(d) }, d) : h('span'))));
}

function dashboard(view, rerender) {
  const sum = summarize(state.sessions);
  const t = today();
  const days = [];
  for (let k = 13; k >= 0; k--) { const d = addDays(t, -k); days.push([d, sum.days[d] ? sum.days[d].sec : 0]); }
  const max = Math.max(60, ...days.map(d => d[1]));
  const total14 = days.reduce((a, d) => a + d[1], 0);
  const activeDays = days.filter(d => d[1] > 0).length;
  const med = medianTime(state.sessions);

  view.append(h('div.h1', 'Для родителей'),
    h('div.panel',
      h('div.row', h('div.grow', h('b', 'Активность за 14 дней')), h('span.muted.small', `${fmtSec(total14)} · ${activeDays} дн.`)),
      h('div.chart-days', days.map(([d, s]) => h('div.d', h('i', { class: s ? '' : 'zero', style: { height: Math.max(2, Math.round(s / max * 90)) + 'px' } }), h('span', d.slice(8))))),
      h('div.kv',
        h('div', h('b', sum.points), h('span', 'очков')),
        h('div', h('b', sum.bestStreak), h('span', 'лучшая серия')),
        h('div', h('b', med ? (med / 1000).toFixed(1) + ' с' : '—'), h('span', 'на верное решение')))));


  {
    const rr = readRate(state.sessions);
    if (rr.n) view.append(h('div.panel', { style: { marginTop: '12px' } },
      h('div.row', h('div.grow', h('b', 'Предугадывание'), h('div.muted.small', 'Верные прогнозы в шаге «Предскажи» за 30 дней')),
        h('div', { style: { fontFamily: 'var(--display)', fontWeight: 800, fontSize: '22px', color: 'var(--cyan)' } }, Math.round(rr.rate * 100) + '%')),
      meter(rr.rate), h('div.muted.small', { style: { marginTop: '6px' } }, `${rr.ok} из ${rr.n}`)));
  }
  { const ap = attentionPanel(state.sessions); if (ap) view.append(ap); }
  const acc = accuracyBy(state.sessions, 'principle');
  const accRows = lib.principles.filter(p => acc[p.id]).sort((a, b) => acc[a.id].rate - acc[b.id].rate);
  view.append(h('div.h2', 'Принципы: слабые сверху'),
    h('div.panel.bars', accRows.length ? accRows.map(p => h('div.bar-row', h('div.nm', p.name), h('div.pc', `${Math.round(acc[p.id].rate * 100)}% · ${acc[p.id].n}`), meter(acc[p.id].rate))) : h('div.empty', 'Пока нет ответов.')));

  const stuck = Object.entries(state.progress).filter(([, r]) => isStuck(r)).map(([k]) => k);
  view.append(h('div.h2', 'Застрявшие ситуации'),
    h('div.panel', stuck.length
      ? h('div.list', stuck.map(k => { const { card, variant } = parseKey(k); return card ? h('div.li', h('span', card.title + (variant ? ` · ${variant.label}` : '')), h('span.r', (lib.principle[card.principle] || {}).name || '')) : null; }))
      : h('div.muted', 'Нет — ошибки исправляются.'),
      stuck.length ? h('button.btn.small', { style: { marginTop: '12px' }, onclick: () => play(stuck.slice(0, 10), { module: 'parent:stuck', onDone: rerender }) }, 'Пройти их вместе') : null));

  const recent = [];
  for (const s of [...state.sessions].reverse()) for (const it of [...(s.items || [])].reverse()) if (it.verdict === 'bad' && recent.length < 8) recent.push(it);
  if (recent.length) {
    view.append(h('div.h2', 'Последние ошибки'),
      h('div.panel.list', recent.map(it => { const c = lib.byId[it.cardId]; return c ? h('div.li', h('span', c.title), h('span.r', new Date(state.sessions.find(s => s.items.includes(it)).startedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }))) : null; })));
  }

  const msg = h('textarea.input', { placeholder: 'Например: «Молодец, что каждый день! В субботу разберём матч»' });
  msg.value = (state.parent.message && state.parent.message.text) || '';
  const target = h('input.input', { type: 'number', min: 1, max: 7, value: (state.parent.goal && state.parent.goal.target) || 4 });
  const reward = h('input.input', { placeholder: 'Награда (необязательно)', value: (state.parent.goal && state.parent.goal.reward) || '', style: { marginTop: '8px' } });
  view.append(h('div.h2', 'Сообщение и цель'),
    h('div.panel',
      h('label.field', h('span', 'Сообщение на экране «Сегодня»'), msg),
      h('label.field', h('span', 'Цель: дней с тренировкой в неделю'), target, reward),
      h('button.btn.primary.small', { onclick: () => {
        setParent({ message: msg.value.trim() ? { text: msg.value.trim(), at: Date.now() } : null,
                    goal: { target: Math.max(1, Math.min(7, +target.value || 4)), reward: reward.value.trim() } });
        toast('Сохранено');
      } }, 'Сохранить')));

  if (window.HK_CONFIG.features.editor) editor.list(view, rerender);

  const tests = state.sessions.filter(x => x.module === 'test' && x.items.length >= 4);
  if (tests.length) view.append(h('div.h2', 'Контрольные срезы'),
    h('div.panel', h('p.muted.small', { style: { marginTop: 0 } }, 'Незнакомые ситуации без подсказок, раз в 4 недели. Рост здесь — признак, что мышление переносится, а не ответы запоминаются.'),
      h('div.list', tests.map(x => { const ok = x.items.filter(i => i.verdict === 'best'); const t = ok.map(i => i.timeMs).sort((a, b) => a - b);
        return h('div.li', h('span', new Date(x.startedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })),
          h('span.r', `${Math.round(ok.length / x.items.length * 100)}% · ${t.length ? (t[Math.floor(t.length / 2)] / 1000).toFixed(1) + ' с' : '—'}`)); }))));

  onice.parentBlock(view, rerender);

  reviewBlock(view, rerender);

  view.append(h('div.h2', 'Прочее'),
    h('div.panel',
      h('button.btn.small', { onclick: () => { setParent({ pinHash: null }); unlocked = false; toast('PIN сброшен'); rerender(); } }, 'Сменить PIN'),
      h('button.btn.small.ghost', { style: { marginLeft: '8px', color: 'var(--bad)' }, onclick: () => { if (confirm('Стереть весь прогресс на этом устройстве?')) resetAll(); } }, 'Стереть прогресс')));
  unlocked = true;
}

/* Ревью карточек (методическая проверка): родитель или тренер смотрит ситуацию и отмечает
   «Проверено», «Исправить» или «У нас иначе» с комментарием. «Исправить» и «У нас иначе» сразу убирают ситуацию
   из тренировок на этом устройстве. Отзывы выгружаются JSON-файлом для автора: tools/apply_reviews.py переносит
   их в исходники (status: reviewed / needs-fix и комментарий), и после сборки статус действует у всех.
   Статус из исходников показан у каждой ситуации: черновик, проверено, на исправлении. */
const SRC_STATUS = { draft: 'черновик', reviewed: 'проверено', 'needs-fix': 'на исправлении' };
let reviewFilter = 'todo';
function reviewBlock(view, rerender) {
  const rev = state.parent.reviews || {};
  const save = (id, patch) => { setParent({ reviews: { ...(state.parent.reviews || {}), [id]: { ...(state.parent.reviews || {})[id], ...patch, at: Date.now() } } }); };
  const cards = lib.cards.filter(c => c.pack === 'core');
  const marked = c => rev[c.id] && rev[c.id].v;
  const counts = {
    all: cards.length,
    todo: cards.filter(c => !marked(c) && c.status !== 'reviewed').length,
    fix: cards.filter(c => (rev[c.id] && (rev[c.id].v === 'no' || rev[c.id].v === 'other')) || c.status === 'needs-fix').length,
    ok: cards.filter(c => (rev[c.id] && rev[c.id].v === 'ok') || c.status === 'reviewed').length,
  };
  const pass = c => reviewFilter === 'all' ? true
    : reviewFilter === 'todo' ? !marked(c) && c.status !== 'reviewed'
    : reviewFilter === 'fix' ? (rev[c.id] && (rev[c.id].v === 'no' || rev[c.id].v === 'other')) || c.status === 'needs-fix'
    : (rev[c.id] && rev[c.id].v === 'ok') || c.status === 'reviewed';
  const box = h('div.list');
  const fill = () => {
    box.innerHTML = '';
    const list = cards.filter(pass);
    if (!list.length) box.append(h('p.muted.small', 'Здесь пусто.'));
    for (const c of list.slice(0, 60)) {
      const r = rev[c.id] || {};
      const tg = h('div.toggle', { style: { '--n': 3 } });
      for (const [v, t] of [['ok', 'Проверено'], ['no', 'Исправить'], ['other', 'У нас иначе']]) {
        tg.append(h('button', { type: 'button', class: r.v === v ? 'on' : '', onclick: e => { const off = (state.parent.reviews || {})[c.id]?.v === v; save(c.id, { v: off ? null : v }); tg.querySelectorAll('button').forEach(b => b.classList.remove('on')); if (!off) e.currentTarget.classList.add('on'); } }, t));
      }
      const note = h('input.input', { placeholder: 'Что не так или как у вас играют', value: r.note || '', onchange: e => save(c.id, { note: e.target.value.trim() }) });
      const st = c.status || 'draft';
      box.append(h('div.review-row',
        h('div.row', h('div.grow', h('div.t', c.title),
          h('div.muted.small', `${c.id} · ${(lib.phase[c.phase] || {}).name || ''} · ${(lib.principle[c.principle] || {}).name || ''} · `,
            h('span', { style: { color: st === 'reviewed' ? 'var(--good)' : st === 'needs-fix' ? 'var(--bad)' : 'var(--muted)', fontWeight: 700 } }, SRC_STATUS[st] || st))),
          h('button.btn.small', { onclick: () => play(keysOf(c), { preview: true }) }, 'Смотреть')),
        tg, note));
    }
    if (list.length > 60) box.append(h('p.muted.small', `Показаны первые 60 из ${list.length}. Отметьте их — список обновится.`));
  };
  const chips = h('div.toggle', { style: { '--n': 4, marginBottom: '10px' } });
  for (const [k, t] of [['todo', `Не проверены · ${counts.todo}`], ['fix', `Исправить · ${counts.fix}`], ['ok', `Проверено · ${counts.ok}`], ['all', `Все · ${counts.all}`]]) {
    chips.append(h('button', { type: 'button', class: reviewFilter === k ? 'on' : '', onclick: e => { reviewFilter = k; chips.querySelectorAll('button').forEach(b => b.classList.remove('on')); e.currentTarget.classList.add('on'); fill(); } }, t));
  }
  fill();
  const done = cards.filter(c => marked(c) || c.status === 'reviewed').length;
  view.append(h('div.h2', `Проверка ситуаций · ${done}/${cards.length}`),
    h('div.panel',
      h('p.muted.small', { style: { marginTop: 0 } }, 'Посмотрите ситуацию и отметьте, верно ли решение для его команды. «Исправить» и «У нас иначе» сразу убирают ситуацию из тренировок, пока её не исправят; повторное нажатие снимает отметку. Ответы в предпросмотре не идут в статистику. Готовые отзывы отправьте автору файлом — он перенесёт статусы в приложение для всех.'),
      h('details', h('summary.btn.small', { style: { listStyle: 'none' } }, 'Открыть список'), h('div', { style: { marginTop: '12px' } }, chips, box)),
      h('div.row', { style: { marginTop: '12px', gap: '8px', flexWrap: 'wrap' } },
        h('button.btn.primary.small', { onclick: () => exportReviews() }, 'Скачать отзывы (JSON)'),
        h('button.btn.small', { onclick: () => copyReviews() }, 'Скопировать текстом'))));
}

/* Отзывы для автора: { "<id>": { "status": "reviewed" | "needs-fix", "verdict": "ok" | "no" | "other", "note": "…", "title": "…" } }.
   tools/apply_reviews.py читает этот файл и проставляет статус в исходниках. */
function reviewsJson() {
  const rev = state.parent.reviews || {};
  const out = {};
  for (const c of lib.cards) {
    const r = rev[c.id];
    if (!r || (!r.v && !r.note)) continue;
    out[c.twin || c.id] = { status: r.v === 'ok' ? 'reviewed' : r.v ? 'needs-fix' : 'draft', verdict: r.v || null, note: r.note || '', title: c.title, at: r.at || null };
  }
  return out;
}
function exportReviews() {
  const data = reviewsJson();
  const n = Object.keys(data).length;
  if (!n) { toast('Пока нет отметок'); return; }
  const blob = new Blob([JSON.stringify({ app: 'hockey-iq', kind: 'reviews', built: lib.built, reviews: data }, null, 1)], { type: 'application/json' });
  const a = h('a', { href: URL.createObjectURL(blob), download: `hockey-iq-reviews-${today()}.json` });
  document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  toast(`Отзывов: ${n} — файл сохранён`);
}

function copyReviews() {
  const rev = state.parent.reviews || {};
  const lines = lib.cards.filter(c => rev[c.id] && (rev[c.id].v || rev[c.id].note))
    .map(c => `${c.id} «${c.title}»: ${{ ok: 'проверено', no: 'исправить', other: 'у нас иначе' }[rev[c.id].v] || '—'}${rev[c.id].note ? ' — ' + rev[c.id].note : ''}`);
  const text = `Ревью карточек Hockey IQ (${lines.length}):\n` + lines.join('\n') + '\n\nJSON:\n' + JSON.stringify(reviewsJson());
  (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(() => toast('Скопировано — вставьте в чат'), () => {
    const ta = h('textarea.input', { style: { height: '200px' } }); ta.value = text;
    document.body.append(ta); ta.select(); document.execCommand('copy'); ta.remove(); toast('Скопировано');
  });
}
