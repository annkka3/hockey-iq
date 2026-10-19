/* «Разборы»: анимированные розыгрыши с остановками «что дальше?».
   Один формат на два режима:
   — насмотренность: розыгрыш идёт по шагам, в паузах вопрос; неверный ответ объясняется, дальше показывается правильное продолжение;
   — «на два хода вперёд»: у варианта ответа есть своя ветка then — ситуация развивается по выбору игрока.
   Формат шага: { caption, moves: [...как в карточках] } или { pause: { question, options: [{ label, correct, explain, then?: [шаги] }] } }. */
import { h, icon } from '../ui.js';
import { Scene } from '../engine/render.js';
import { cancelAll, wait } from '../engine/anim.js';
import { lib } from '../content.js';
import { state, startSession, logItem, finishSession } from '../core/state.js';

export function list(view, rerender, { title = 'Разборы розыгрышей', kind = null } = {}) {
  const plays = (lib.plays || []).filter(p => !kind || (p.kind || 'film') === kind);
  if (!plays.length) return;
  const seen = new Set(state.sessions.filter(s => s.module.startsWith('film:')).map(s => s.module.slice(5)));
  view.append(h('div.h2', title),
    h('div.film-strip', plays.map(p => h('button.film-card', { onclick: () => watch(p, rerender) },
      h('div.film-thumb', icon(p.kind === 'branch' ? 'react' : 'match')),
      h('div.film-t', p.title), h('div.film-s', p.line),
      seen.has(p.id) ? h('span.badge', 'просмотрено') : null))));
}

export function watch(play, rerender) {
  const root = h('div.play'), inner = h('div.play-in');
  root.appendChild(inner); document.body.appendChild(root); document.body.style.overflow = 'hidden';
  const session = startSession('film:' + play.id);
  let alive = true, ended = false, speed = 1;
  const close = () => { alive = false; cancelAll(); if (!ended) { ended = true; finishSession(session); } root.remove(); document.body.style.overflow = ''; if (rerender) rerender(); };

  const cap = h('div.film-cap');
  const panel = h('div');
  const pr = lib.principle[play.principle];
  const speedBtn = h('button.btn.small', { onclick: () => { speed = speed === 1 ? 0.5 : 1; speedBtn.textContent = speed === 1 ? 'Скорость 1×' : 'Замедленно ½×'; } }, 'Скорость 1×');
  const wrap = h('div.rink-wrap');
  inner.append(h('div.play-top', h('button.x', { onclick: close }, icon('close')), h('div.q-meta', { style: { margin: 0 } }, play.kind === 'branch' ? 'На два хода вперёд' : 'Разбор')),
    h('div.q', play.title), wrap, cap, panel,
    h('div.row', { style: { marginTop: '12px' } }, speedBtn, h('button.btn.small', { onclick: () => { close(); watch(play, rerender); } }, 'С начала')));

  const scene = new Scene(wrap, play, { rink: state.profile.rink, anim: true });

  async function runSteps(steps) {
    for (const st of steps) {
      if (!alive) return false;
      if (st.pause) { const go = await ask(st.pause); if (!go) return false; continue; }
      if (st.caption) { cap.textContent = st.caption; cap.classList.remove('in'); void cap.offsetWidth; cap.classList.add('in'); }
      scene.clearArrows();
      if (speed !== 1) await slow(() => scene.play(st.moves || []));
      else await scene.play(st.moves || []);
      await wait((st.hold || 0.6) * 1000 / speed);
    }
    return true;
  }

  /* замедление: растягиваем твины, подменяя performance.now на время игры */
  async function slow(fn) {
    const real = performance.now.bind(performance), t0 = real();
    performance.now = () => t0 + (real() - t0) * speed;
    try { await fn(); } finally { performance.now = real; }
  }

  function ask(p) {
    return new Promise(resolve => {
      panel.innerHTML = '';
      const box = h('div.opts');
      panel.append(h('div.film-q', p.question), box);
      const t0 = performance.now();
      p.options.forEach((o, k) => box.append(h('button.opt', { 'data-k': 'АБВГ'[k], onclick: async () => {
        box.classList.add('locked');
        box.querySelectorAll('.opt').forEach(x => x.classList.add('dim'));
        const btn = box.children[k]; btn.classList.remove('dim'); btn.classList.add(o.correct ? 'v-best' : 'v-bad');
        logItem(session, { play: play.id, principle: play.principle, verdict: o.correct ? 'best' : 'bad', answer: k, timeMs: Math.round(performance.now() - t0) });
        panel.append(h('p.explain', o.explain));
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
