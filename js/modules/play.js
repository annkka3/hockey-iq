/* Экран решения: подводка → стоп-кадр → ответ → проигрыш последствий → разбор.
   Один и тот же экран для тренировки дня, колод, режима матча и предпросмотра при ревью. */
import { h, icon, toast } from '../ui.js';
import { Scene } from '../engine/render.js';
import { cancelAll, tween } from '../engine/anim.js';
import { lib, parseKey, verdictOf, explainOf, bestOf } from '../content.js';
import { state, answer, startSession, logItem, finishSession } from '../core/state.js';
import { itemPoints, summarize } from '../engine/scoring.js';

const LETTERS = ['А', 'Б', 'В', 'Г'];
const TAG = { best: 'Лучшее решение', ok: 'Можно', bad: 'Ошибка' };

export function play(keys, { module = 'decks', preview = false, onDone, timer = 0 } = {}) {
  if (!keys.length) { toast('Пока нечего повторять — загляни завтра'); return; }
  const root = h('div.play');
  const inner = h('div.play-in');
  root.appendChild(inner);
  document.body.appendChild(root);
  document.body.style.overflow = 'hidden';

  const session = preview ? null : startSession(module);
  const rankBefore = summarize(state.sessions).rank.index;
  const results = [];
  let i = 0, scene = null, ended = false;
  const end = () => { if (session && !ended) { ended = true; finishSession(session); } };

  const close = () => {
    cancelAll();
    if (scene) scene.destroy();
    end();
    root.remove();
    document.body.style.overflow = '';
    if (onDone) onDone();
  };

  const dots = () => h('div.dots', keys.map((_, k) => h('i', { class: k < results.length ? results[k] : k === i ? 'now' : '' })));

  async function show() {
    cancelAll();
    if (scene) { scene.destroy(); scene = null; }
    inner.innerHTML = '';
    root.scrollTop = 0;
    const { card, variant } = parseKey(keys[i]);
    if (!card) { i++; return i < keys.length ? show() : finish(); }

    inner.append(h('div.play-top', h('button.x', { onclick: close, 'aria-label': 'Закрыть' }, icon('close')), dots()));
    if (variant) inner.append(h('div.ctx', h('b', variant.label), variant.sub ? h('span', variant.sub) : null));
    inner.append(h('div.q-meta', (lib.phase[card.phase] || {}).name || ''));
    inner.append(h('div.q', card.question.text));

    const wrap = h('div.rink-wrap');
    inner.append(wrap);
    scene = new Scene(wrap, card, { rink: state.profile.rink, anim: state.profile.anim && !timer });
    window.__hkScene = scene; // для автопроверок
    const skip = h('button.skip', { onclick: () => cancelAll() }, 'Пропустить');
    wrap.append(skip);
    const zone = h('div');
    inner.append(zone);
    await scene.intro();
    skip.remove();
    const t0 = performance.now();
    let decided = false, clock = null;
    if (timer) {
      const bar = h('div.meter.timer', h('i', { style: { width: '100%' } }));
      inner.querySelector('.q').after(bar);
      const myI = i;
      tween(timer * 1000, k => { if (!decided && i === myI) bar.firstChild.style.width = (100 - k * 100) + '%'; }, t => t);
      clock = setTimeout(() => {
        if (decided || i !== myI) return;
        inner.querySelectorAll('.opts').forEach(b => b.classList.add('locked'));
        scene.offTap();
        decide({ id: 'timeout', moves: [] });
      }, timer * 1000);
    }

    const decide = async (opt, extra) => {
      if (decided) return;
      decided = true; clearTimeout(clock);
      const timeMs = Math.round(performance.now() - t0);
      const v = opt.id === 'timeout' ? 'bad' : verdictOf(card, variant, opt);
      results.push(v);
      inner.querySelector('.dots').replaceWith(dots());
      if (!preview) {
        answer(keys[i], v);
        logItem(session, { cardId: card.id, key: keys[i], variant: variant ? variant.key : null, deck: card.deck, phase: card.phase,
                           principle: card.principle, answer: opt.id, verdict: v, timeMs, ...extra });
      }
      if (card.question.kind === 'tap') scene.showZones(card.options, opt.id, o => verdictOf(card, variant, o));
      await scene.play(opt.moves || []);
      result(card, variant, opt, v, timeMs);
    };

    if (card.question.kind === 'choice') {
      const box = h('div.opts');
      card.options.forEach((o, k) => {
        const b = h('button.opt', { 'data-k': LETTERS[k], onclick: () => {
          box.classList.add('locked');
          box.querySelectorAll('.opt').forEach(x => x.classList.add('dim'));
          b.classList.remove('dim');
          b.classList.add('v-' + verdictOf(card, variant, o));
          decide(o);
        } }, o.label);
        box.append(b);
      });
      zone.append(box);
    } else {
      const hint = h('div.tap-hint', 'Нажми, куда поедешь');
      wrap.append(hint);
      let done = false;
      scene.onTap(p => {
        if (done) return;
        let o = scene.pickZone(p, card.options);
        if (!o) {
          let bd = Infinity;
          for (const x of card.options) {
            const d = Math.hypot(p.x - x.zone.x, p.y - x.zone.y);
            if (d < bd && d < 6) { bd = d; o = x; }
          }
        }
        if (!o) { toast('Выбери место ближе к игре'); scene.lFx.innerHTML = ''; return; }
        done = true;
        hint.remove();
        scene.offTap();
        decide(o, { tap: [Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10] });
      });
    }
  }

  function result(card, variant, opt, v, timeMs) {
    const pts = itemPoints({ verdict: v, timeMs });
    const pr = lib.principle[card.principle];
    const best = bestOf(card, variant);
    const next = h('button.btn.primary', { onclick: () => { i++; i < keys.length ? show() : finish(); } }, i + 1 < keys.length ? 'Дальше' : 'Итоги');
    const actions = h('div.actions');
    if (v !== 'best' && best) {
      actions.append(h('button.btn', { onclick: async e => {
        e.currentTarget.disabled = true;
        scene.reset();
        if (card.question.kind === 'tap') scene.showZones(card.options, opt.id, o => verdictOf(card, variant, o));
        await scene.play(best.moves || [], 'best');
        bestText.hidden = false;
      } }, 'Показать лучший'), next);
    } else { next.classList.add('only'); actions.append(next); }
    const bestText = h('p.explain', { hidden: true }, h('b', 'Лучше: '), best ? (best.label ? best.label + '. ' : '') + explainOf(card, variant, best) : '');
    const box = h('div.result',
      h('div.verdict', h('span.tag.' + v, TAG[v]), preview ? null : h('span.plus', `+${pts}`)),
      h('p.explain', opt.id === 'timeout' ? 'Время вышло. На льду у тебя тоже нет лишней секунды — решай по первому взгляду.' : explainOf(card, variant, opt)),
      bestText,
      pr ? h('div.principle', h('b', pr.name), h('span', pr.line)) : null,
      actions);
    if (timeMs && v === 'best' && timeMs < 4000 && !preview) box.querySelector('.plus').textContent += ' · быстро';
    inner.append(box);
    setTimeout(() => box.scrollIntoView({ behavior: 'smooth', block: 'end' }), 60);
  }

  function finish() {
    if (scene) { scene.destroy(); scene = null; }
    end();
    const n = k => results.filter(r => r === k).length;
    const sum = summarize(state.sessions);
    const gained = session ? session.items.reduce((a, it) => a + itemPoints(it), 0) : 0;
    inner.innerHTML = '';
    inner.append(h('div.play-top', h('button.x', { onclick: close, 'aria-label': 'Закрыть' }, icon('close'))),
      h('div.final',
        h('div.q-meta', preview ? 'Предпросмотр' : 'Смена окончена'),
        h('div.big', preview ? `${n('best')}/${results.length}` : `+${gained}`),
        h('div.muted', preview ? 'лучших решений' : 'очков за смену'),
        h('div.tri', h('div.g', h('b', n('best')), h('span', 'лучших')), h('div.o', h('b', n('ok')), h('span', 'можно')), h('div.r', h('b', n('bad')), h('span', 'ошибок'))),
        !preview && sum.rank.index > rankBefore ? h('div.rankup', `Новое звание: ${sum.rank.name}`) : null,
        !preview && sum.streak ? h('p.muted', `Серия: ${sum.streak} ${sum.streak === 1 ? 'день' : sum.streak < 5 ? 'дня' : 'дней'} подряд`) : null,
        h('div', { style: { marginTop: '28px' } }, h('button.btn.primary.block', { onclick: close }, 'Готово'))));
  }

  show();
}
