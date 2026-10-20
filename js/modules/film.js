/* «Разборы»: анимированные розыгрыши с остановками «что дальше?».
   Один формат на два режима:
   — насмотренность: розыгрыш идёт по шагам, в паузах вопрос; неверный ответ объясняется, дальше показывается правильное продолжение;
   — «на два хода вперёд»: у варианта ответа есть своя ветка then — ситуация развивается по выбору игрока.
   Формат шага: { caption, moves: [...как в карточках] } или { pause: { question, options: [{ label, correct, explain, then?: [шаги] }] } }. */
import { h, icon, zoomable } from '../ui.js';
import { Scene } from '../engine/render.js';
import { cancelAll, wait, tween, lerp, setTimeScale } from '../engine/anim.js';
import { lib } from '../content.js';
import { state, startSession, logItem, finishSession } from '../core/state.js';
import { shuffle } from './play.js';
import { povSwitch } from './povui.js';

export function list(view, rerender, { title = 'Разборы розыгрышей', kind = null, mission = false } = {}) {
  const plays = (lib.plays || []).filter(p => (!kind || (p.kind || 'film') === kind) && !!p.mission === mission);
  if (!plays.length) return;
  const seen = new Set(state.sessions.filter(s => s.module.startsWith('film:')).map(s => s.module.slice(5)));
  view.append(h('div.h2', title),
    h('div.film-strip', plays.map(p => h('button.film-card', { onclick: () => watch(p, rerender) },
      h('div.film-thumb', icon(p.kind === 'branch' ? 'react' : 'match')),
      h('div.film-t', p.title), h('div.film-s', p.line),
      seen.has(p.id) ? h('span.badge', 'просмотрено') : null))));
}

/* Каталожная сетка (вкладки «Миссии» и «Разборы»): две колонки, всё видно без горизонтальной прокрутки. */
export function grid(view, rerender, { kind = null, mission = false, title = null, lead = null } = {}) {
  const plays = (lib.plays || []).filter(p => (!kind || (p.kind || 'film') === kind) && !!p.mission === mission);
  if (!plays.length) return;
  const seen = new Set(state.sessions.filter(s => s.module.startsWith('film:') && s.items.length).map(s => s.module.slice(5)));
  if (title) view.append(h('div.h2', title));
  if (lead) view.append(h('p.muted.small', { style: { margin: '0 0 10px' } }, lead));
  view.append(h('div.film-grid', plays.map(p => h('button.film-card', { onclick: () => watch(p, rerender) },
    h('div.film-thumb', icon(p.mission ? 'shield' : p.kind === 'branch' ? 'react' : 'match')),
    h('div.film-t', p.title), h('div.film-s', p.line),
    seen.has(p.id) ? h('span.badge', 'пройдено') : null))));
}

export function watch(play, rerender) {
  const root = h('div.play'), inner = h('div.play-in');
  root.appendChild(inner); document.body.appendChild(root); document.body.style.overflow = 'hidden';
  const session = startSession('film:' + play.id);
  let alive = true, ended = false, speed = 1;
  const close = () => { alive = false; cancelAll(); if (!ended) { ended = true; finishSession(session); } try { scene.destroy(); } catch (e) {} root.remove(); document.body.style.overflow = ''; if (rerender) rerender(); };

  const cap = h('div.film-cap');
  const panel = h('div');
  const pr = lib.principle[play.principle];
  const speedBtn = h('button.btn.small', { onclick: () => { speed = speed === 1 ? 0.5 : 1; speedBtn.textContent = speed === 1 ? 'Скорость 1×' : 'Замедленно ½×'; } }, 'Скорость 1×');
  const wrap = h('div.rink-wrap');
  inner.append(h('div.play-top', h('button.x', { onclick: close }, icon('close')), h('div.q-meta', { style: { margin: 0 } }, play.mission ? 'Миссия' : play.kind === 'branch' ? 'На два хода вперёд' : 'Разбор')),
    h('div.q', play.title), wrap, cap, panel,
    h('div.row', { style: { marginTop: '12px' } }, speedBtn, h('button.btn.small', { onclick: () => { close(); watch(play, rerender); } }, 'С начала')));

  const scene = new Scene(wrap, play, { rink: state.profile.rink, anim: true });
  zoomable(wrap);
  povSwitch(wrap, scene); // вид «Глазами» и в разборах/миссиях

  async function runSteps(steps) {
    for (const st of steps) {
      if (!alive) return false;
      if (st.pause) { const go = await ask(st.pause); if (!go) return false; continue; }
      if (st.frame) { scene.clearArrows(); await frameTo(st.frame); }
      if (st.caption) { cap.textContent = st.caption; cap.classList.remove('in'); void cap.offsetWidth; cap.classList.add('in'); }
      scene.clearArrows();
      if (speed !== 1) await slow(() => scene.play(st.moves || []));
      else await scene.play(st.moves || []);
      await wait((st.hold || 0.6) * 1000 / speed);
    }
    return true;
  }

  /* новый кадр миссии: все игроки и шайба плавно переезжают на свои места */
  async function frameTo(f) {
    const to = {};
    for (const e of [...(f.us || []), ...(f.them || [])]) if (scene.ents[e.id]) to[e.id] = scene.pt(e);
    if (f.puck && scene.ents.puck) to.puck = scene.pt(f.puck);
    const from = {};
    for (const id in to) from[id] = { ...scene.ents[id].pos };
    await tween(750 / speed, k => { for (const id in to) scene.place(id, { x: lerp(from[id].x, to[id].x, k), y: lerp(from[id].y, to[id].y, k) }); });
  }

  /* замедление: общий масштаб времени анимаций, без подмены системных часов */
  async function slow(fn) {
    setTimeScale(speed);
    try { await fn(); } finally { setTimeScale(1); }
  }

  function ask(p) {
    return new Promise(resolve => {
      panel.innerHTML = '';
      const box = h('div.opts');
      panel.append(h('div.film-q', p.question));
      if (p.cue) { const c = h('p.cue', { hidden: true }, h('b', 'Куда смотреть: '), p.cue); panel.append(h('button.btn.small.ghost', { onclick: e => { c.hidden = false; e.currentTarget.remove(); } }, 'Подсказка'), c); }
      panel.append(box);
      const t0 = performance.now();
      shuffle([...p.options]).forEach((o, k) => box.append(h('button.opt', { 'data-k': 'АБВГ'[k], onclick: async () => {
        box.classList.add('locked');
        box.querySelectorAll('.opt').forEach(x => x.classList.add('dim'));
        const btn = box.children[k]; btn.classList.remove('dim'); btn.classList.add(o.correct ? 'v-best' : 'v-bad');
        logItem(session, { play: play.id, principle: play.principle, verdict: o.correct ? 'best' : 'bad', answer: o.label.slice(0, 60), timeMs: Math.round(performance.now() - t0) });
        panel.append(h('p.explain', o.explain));
        if (p.ice && o.correct) panel.append(h('p.ice', h('b', 'На льду: '), p.ice));
        if (!o.correct && !o.then) { const right = p.options.find(x => x.correct); if (right) panel.append(h('p.explain.muted', 'Смотри, как правильно: ' + right.label.toLowerCase())); }
        await wait(1200);
        if (o.then) {
          const ok = await runSteps(o.then);
          if (ok && !o.rejoin) { finish(); resolve(false); return; }
        }
        panel.innerHTML = '';
        resolve(true);
      } }, o.label)));
    });
  }

  function finish() {
    if (!alive) return;
    if (!ended) { ended = true; finishSession(session); }
    const good = session.items.filter(i => i.verdict === 'best').length, n = session.items.length;
    panel.innerHTML = '';
    panel.append(h('div.result',
      n ? h('div.verdict', h('span.tag.' + (good === n ? 'best' : good ? 'ok' : 'bad'), `${good} из ${n}`)) : null,
      pr ? h('div.principle', h('b', pr.name), h('span', pr.line)) : null,
      play.takeaway ? h('p.explain', play.takeaway) : null,
      h('div.actions', h('button.btn', { onclick: () => { close(); watch(play, rerender); } }, 'Ещё раз'), h('button.btn.primary', { onclick: close }, 'Готово'))));
  }

  (async () => {
    await scene.intro();
    const ok = await runSteps(play.steps);
    if (ok) finish();
  })();
}
