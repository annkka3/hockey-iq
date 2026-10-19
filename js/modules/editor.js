/* Редактор «Мои моменты»: родитель (а потом тренер) собирает карточку из реального эпизода матча.
   Результат — карточка той же схемы, что и встроенные: движок её не отличает. */
import { h, icon, toast } from '../ui.js';
import { Scene } from '../engine/render.js';
import { lib, syncMine } from '../content.js';
import { state, saveCard, deleteCard } from '../core/state.js';
import { play } from './play.js';

const PALETTE = [
  { k: 'me', label: 'Я', team: 'us', role: 'C', me: true },
  { k: 'us', label: 'Свой', team: 'us', role: 'LW' },
  { k: 'them', label: 'Соперник', team: 'them', role: 'F' },
  { k: 'g', label: 'Вратарь', team: 'them', role: 'G' },
  { k: 'puck', label: 'Шайба' },
];
const OUR_ROLES = ['LW', 'RW', 'LD', 'RD', 'G'];

export function list(view, rerender) {
  const mine = Object.values(state.cards || {});
  view.append(h('div.h2', `Мои моменты · ${mine.length}`),
    h('div.panel',
      h('p.muted.small', { style: { marginTop: 0 } }, 'Эпизоды из его матчей: расставьте игроков, задайте вопрос и варианты. Карточки попадут в колоду «Мои моменты» и в тренировку дня.'),
      mine.length ? h('div.list', mine.map(c => h('div.li',
        h('span', c.title),
        h('span.row', { style: { gap: '6px' } },
          h('button.btn.small', { onclick: () => play([c.id], { preview: true }) }, 'Смотреть'),
          h('button.btn.small', { onclick: () => edit(c, rerender) }, 'Править'))))) : null,
      h('button.btn.primary.small', { style: { marginTop: '12px' }, onclick: () => edit(null, rerender) }, 'Новый момент')));
}

function blankCard() {
  return {
    id: 'm-' + Date.now().toString(36), version: 1, deck: 'mine', phase: 'oz', principle: lib.principles[0].id, difficulty: 2,
    title: '', view: 'oz', question: { kind: 'choice', text: '' },
    us: [{ id: 'C', role: 'C', me: true, x: 0, y: 46 }], them: [{ id: 'g', role: 'G', x: 0, y: 55.1 }], puck: { x: 1, y: 45.5 },
    options: [{ id: 'a', label: '', verdict: 'best', explain: '' }, { id: 'b', label: '', verdict: 'bad', explain: '' }],
    source: { basis: 'Эпизод из матча' }, status: 'mine', author: 'guardian',
  };
}

function edit(card, rerender) {
  const c = card ? JSON.parse(JSON.stringify(card)) : blankCard();
  const root = h('div.play'), inner = h('div.play-in');
  root.appendChild(inner); document.body.appendChild(root); document.body.style.overflow = 'hidden';
  const close = () => { root.remove(); document.body.style.overflow = ''; rerender(); };
  let tool = 'me', setMove = null, sel = null;

  const rinkBox = h('div.rink-wrap');
  let scene = null;
  const redraw = () => {
    if (scene) scene.destroy();
    scene = new Scene(rinkBox, c, { anim: false });
    // показать ход «Я» для каждого варианта стрелкой
    for (const o of c.options) for (const mv of o.moves || []) {
      const a = scene.ents[mv.who]; if (!a) continue;
      const b = scene.pt({ x: mv.to[0], y: mv.to[1] });
      const ln = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      Object.entries({ x1: a.pos.x, y1: a.pos.y, x2: b.x, y2: b.y, class: 'arrow a-skate' + (o.verdict === 'best' ? ' best' : '') }).forEach(([k, v]) => ln.setAttribute(k, v));
      scene.lArrows.appendChild(ln);
    }
    scene.svg.style.touchAction = 'none';
    scene.svg.addEventListener('pointerdown', onDown);
  };
  const toWorld = ev => {
    const m = scene.svg.getScreenCTM(); const q = scene.svg.createSVGPoint(); q.x = ev.clientX; q.y = ev.clientY;
    const s = q.matrixTransform(m.inverse()); return { x: +Math.max(-14.4, Math.min(14.4, s.x)).toFixed(1), y: +Math.max(0.6, Math.min(59.4, 60 - s.y)).toFixed(1) };
  };
  const all = () => [...c.us, ...c.them];
  function onDown(ev) {
    const p = toWorld(ev);
    if (setMove) {
      setMove.moves = [{ who: 'C', to: [p.x, p.y] }];
      setMove = null; hint.textContent = ''; redraw(); return;
    }
    // попали в существующего — тащим
    let hit = null, bd = 1.6;
    for (const e of all()) { const d = Math.hypot(e.x - p.x, e.y - p.y); if (d < bd) { bd = d; hit = e; } }
    if (c.puck && Math.hypot(c.puck.x - p.x, c.puck.y - p.y) < 1) hit = c.puck;
    if (!hit) {
      if (tool === 'puck') { c.puck = { x: p.x, y: p.y }; redraw(); return; }
      if (tool === 'me') { const me = c.us.find(e => e.me); me.x = p.x; me.y = p.y; redraw(); return; }
      const pal = PALETTE.find(x => x.k === tool);
      const list = pal.team === 'us' ? c.us : c.them;
      const role = pal.team === 'us' ? (OUR_ROLES.find(r => !c.us.some(e => e.role === r)) || 'LW') : pal.role;
      list.push({ id: (pal.team === 'us' ? role : 'o') + Math.random().toString(36).slice(2, 5), role, x: p.x, y: p.y });
      redraw(); return;
    }
    sel = hit;
    const svg = scene.svg;
    svg.setPointerCapture(ev.pointerId);
    const move = e2 => { const q = toWorld(e2); sel.x = q.x; sel.y = q.y; const id = sel === c.puck ? 'puck' : sel.id; scene.place(id, scene.pt(q)); };
    const up = () => { svg.removeEventListener('pointermove', move); svg.removeEventListener('pointerup', up); redraw(); };
    svg.addEventListener('pointermove', move); svg.addEventListener('pointerup', up);
  }

  const hint = h('p.muted.small');
  const pal = h('div.toggle', { style: { '--n': PALETTE.length } }, PALETTE.map(p => h('button', { class: p.k === tool ? 'on' : '', onclick: e => { tool = p.k; pal.querySelectorAll('button').forEach(b => b.classList.remove('on')); e.currentTarget.classList.add('on'); } }, p.label)));
  const viewT = h('div.toggle', { style: { '--n': 3 } }, [['dz', 'Своя зона'], ['nz', 'Средняя'], ['oz', 'Чужая']].map(([v, t]) => h('button', { class: c.view === v ? 'on' : '', onclick: e => { c.view = v; viewT.querySelectorAll('button').forEach(b => b.classList.remove('on')); e.currentTarget.classList.add('on'); redraw(); } }, t)));
  const title = h('input.input', { placeholder: 'Название: «Матч с Динамо, 2-й период»', value: c.title, oninput: e => { c.title = e.target.value; } });
  const q = h('textarea.input', { placeholder: 'Вопрос: «Шайба у ЛП в углу. Куда ты?»', oninput: e => { c.question.text = e.target.value; } }); q.value = c.question.text;
  const phase = h('select.input', { onchange: e => { c.phase = e.target.value; } }, lib.phases.map(p => h('option', { value: p.id, selected: p.id === c.phase }, p.name)));
  const princ = h('select.input', { onchange: e => { c.principle = e.target.value; } }, lib.principles.map(p => h('option', { value: p.id, selected: p.id === c.principle }, p.name)));
  const optsBox = h('div.list');
  const drawOpts = () => {
    optsBox.innerHTML = '';
    c.options.forEach((o, i) => {
      const vt = h('div.toggle', { style: { '--n': 3 } }, [['best', 'Лучшее'], ['ok', 'Можно'], ['bad', 'Ошибка']].map(([v, t]) => h('button', { class: o.verdict === v ? 'on' : '', onclick: () => {
        if (v === 'best') c.options.forEach(x => { if (x.verdict === 'best') x.verdict = 'ok'; });
        o.verdict = v; drawOpts(); redraw();
      } }, t)));
      optsBox.append(h('div.review-row',
        h('input.input', { placeholder: `Вариант ${'АБВ'[i]}: что делаешь`, value: o.label, oninput: e => { o.label = e.target.value; } }),
        vt,
        h('input.input', { placeholder: 'Почему так (разбор)', value: o.explain, oninput: e => { o.explain = e.target.value; } }),
        h('div.row', h('button.btn.small.grow', { onclick: () => { setMove = o; hint.textContent = `Нажмите на льду, куда «Я» едет в варианте ${'АБВ'[i]}`; } }, o.moves && o.moves.length ? 'Изменить ход «Я»' : 'Ход «Я» на льду'),
          c.options.length > 2 ? h('button.btn.small.ghost', { onclick: () => { c.options.splice(i, 1); c.options.forEach((x, k) => x.id = 'abc'[k]); drawOpts(); redraw(); } }, 'Убрать') : null)));
    });
    if (c.options.length < 3) optsBox.append(h('button.btn.small', { onclick: () => { c.options.push({ id: 'abc'[c.options.length], label: '', verdict: 'bad', explain: '' }); drawOpts(); } }, 'Добавить вариант'));
  };

  const save = () => {
    const errs = [];
    if (!c.title.trim()) errs.push('название');
    if (!c.question.text.trim()) errs.push('вопрос');
    if (c.options.some(o => !o.label.trim() || !o.explain.trim())) errs.push('тексты вариантов и разборы');
    if (c.options.filter(o => o.verdict === 'best').length !== 1) errs.push('одно лучшее решение');
    if (errs.length) { toast('Заполните: ' + errs.join(', ')); return; }
    c.version = (card ? card.version : 0) + 1;
    saveCard(c);
    syncMine(state.cards);
    toast('Сохранено'); close();
  };

  inner.append(h('div.play-top', h('button.x', { onclick: close }, icon('close')), h('div.q-meta', { style: { margin: 0 } }, card ? 'Правка момента' : 'Новый момент')),
    h('label.field', { style: { marginTop: '12px' } }, h('span', 'Зона'), viewT),
    h('label.field', h('span', 'Что ставим на лёд (нажмите на площадку; фишку можно тащить)'), pal),
    rinkBox, hint,
    h('label.field', { style: { marginTop: '12px' } }, h('span', 'Название'), title),
    h('label.field', h('span', 'Вопрос'), q),
    h('div.row', h('label.field.grow', h('span', 'Фаза'), phase), h('label.field.grow', h('span', 'Принцип'), princ)),
    h('div.h2', 'Варианты'), optsBox,
    h('div.row', { style: { marginTop: '16px' } },
      card ? h('button.btn.ghost.small', { style: { color: 'var(--bad)' }, onclick: () => { deleteCard(c.id); syncMine(state.cards); toast('Удалено'); close(); } }, 'Удалить') : null,
      h('button.btn.primary.grow', { onclick: save }, 'Сохранить')));
  redraw(); drawOpts();
}
