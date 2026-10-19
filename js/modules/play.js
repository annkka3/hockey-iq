/* Экран решения: подводка → стоп-кадр → ответ → проигрыш последствий → разбор.
   Один и тот же экран для тренировки дня, колод, режима матча и предпросмотра при ревью. */
import { h, icon, toast, zoomable } from '../ui.js';
import { Scene } from '../engine/render.js';
import { cancelAll, tween } from '../engine/anim.js';
import { lib, parseKey, verdictOf, explainOf, bestOf } from '../content.js';
import { state, answer, startSession, logItem, finishSession } from '../core/state.js';
import { itemPoints, summarize, fastAndSure } from '../engine/scoring.js';
import { respond } from '../engine/sim.js';

const LETTERS = ['А', 'Б', 'В', 'Г'];
export const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const TAG = { best: 'Лучшее решение', ok: 'Можно', bad: 'Ошибка' };

export function play(keys, { module = 'decks', preview = false, onDone, timer = 0, test = false } = {}) {
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
    const fragment = (card.us || []).length + (card.them || []).length < 10;
    inner.append(h('div.q-meta', ((lib.phase[card.phase] || {}).name || '') + (test ? ' · контроль' : '') + (fragment ? ' · фрагмент: показаны ключевые игроки' : '')));
    if (card.story) inner.append(h('p.story', card.story));
    const rd = card.read && !timer ? card.read : null;
    const spd = rd ? h('div.spd', h('span.on', 'Смотри'), h('span', 'Предскажи'), h('span', 'Действуй')) : null;
    const stage = k => { if (!spd) return; [...spd.children].forEach((s, j) => { s.className = j < k ? 'done' : j === k ? 'on' : ''; }); };
    if (spd) inner.append(spd);
    const qEl = h('div.q', rd ? 'Смотри внимательно…' : card.question.text);
    inner.append(qEl);

    const wrap = h('div.rink-wrap');
    inner.append(wrap);
    scene = new Scene(wrap, card, { rink: state.profile.rink, anim: state.profile.anim && !timer });
    window.__hkScene = scene; // для автопроверок
    zoomable(wrap);
    const skip = h('button.skip', { onclick: () => cancelAll() }, 'Пропустить');
    wrap.append(skip);
    const zone = h('div');
    inner.append(zone);
    await scene.intro();
    skip.remove();

    // Предскажи: вопрос на чтение игры → показ, что произошло на самом деле → новый стоп-кадр
    let readOk = null, readMs = null, reveal = [];
    if (rd) {
      stage(1);
      qEl.textContent = rd.text;
      const r0 = performance.now();
      const pick = await new Promise(res => {
        const box = h('div.opts');
        shuffle([...rd.options]).forEach((o, k) => {
          const b = h('button.opt', { 'data-k': LETTERS[k], onclick: () => {
            box.classList.add('locked');
            box.querySelectorAll('.opt').forEach(x => x.classList.add('dim'));
            b.classList.remove('dim');
            b.classList.add(test ? 'read-pick' : o.correct ? 'v-best' : 'v-bad');
            res(o);
          } }, o.label);
          box.append(b);
        });
        zone.append(box);
      });
      readMs = Math.round(performance.now() - r0);
      readOk = !!pick.correct;
      if (!test) {
        const right = rd.options.find(o => o.correct);
        zone.append(h('p.read-fb.' + (readOk ? 'yes' : 'no'), h('b', readOk ? 'Прочитал верно.' : 'Не так.'),
          readOk ? pick.explain : `${right.label}. ${right.explain}`));
      }
      reveal = rd.reveal || [];
      await scene.play(reveal);
      if (rd.caption && !test) wrap.append(h('div.read-cap', rd.caption));
      await new Promise(res => setTimeout(res, test ? 300 : 700));
      scene.commit();
      // прогноз и подпись остаются на экране, пока он решает: варианты прогноза убираем
      zone.querySelector('.opts').remove();
      stage(2);
      qEl.textContent = card.question.text;
    }
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
        if (!test) answer(keys[i], v); // контрольный срез не меняет интервалы повторения
        logItem(session, { cardId: card.id, key: keys[i], variant: variant ? variant.key : null, deck: card.deck, phase: card.phase,
                           principle: card.principle, answer: opt.id, verdict: v, timeMs,
                           ...(rd ? { read: readOk, readMs } : {}), ...extra });
      }
      if (card.question.kind === 'tap') scene.showZones(card.options, opt.id, o => verdictOf(card, variant, o));
      wrap.querySelectorAll('.read-cap').forEach(n => n.remove());
      await scene.play(opt.moves || []);
      // последствия: соперники и партнёры реагируют на решение (в контрольном срезе — без подсказок)
      if (!test) await scene.play(respond(card, [reveal, opt.moves || []], v), 'sim');
      result(card, variant, opt, v, timeMs);
    };

    if (card.question.kind === 'choice') {
      const box = h('div.opts');
      // порядок вариантов каждый раз новый: нельзя выучить «первая кнопка — правильная»
      shuffle([...card.options]).forEach((o, k) => {
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
    if (test) {
      // контроль: без разбора и без правильного ответа — чтобы срез можно было повторить честно
      inner.append(h('div.result', h('p.muted', 'Ответ принят.'),
        h('button.btn.primary.block', { onclick: () => { i++; i < keys.length ? show() : finish(); } }, i + 1 < keys.length ? 'Дальше' : 'Итоги')));
      return;
    }
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
        await scene.play(respond(card, [card.read ? card.read.reveal : [], best.moves || []], 'best'), 'sim');
        bestText.hidden = false;
      } }, 'Показать лучший'), next);
    } else { next.classList.add('only'); actions.append(next); }
    const bestText = h('p.explain', { hidden: true }, h('b', 'Лучше: '), best ? (best.label ? best.label + '. ' : '') + explainOf(card, variant, best) : '');
    const box = h('div.result',
      h('div.verdict', h('span.tag.' + v, TAG[v]), preview ? null : h('span.plus', `+${pts}`)),
      h('p.explain', opt.id === 'timeout' ? 'Время вышло. На льду у тебя тоже нет лишней секунды — решай по первому взгляду.' : explainOf(card, variant, opt)),
      bestText,
      pr ? h('div.principle', h('b', pr.name), h('span', pr.line)) : null,
      card.cue ? h('p.cue', h('b', 'Куда смотреть: '), card.cue) : null,
      card.ice ? h('p.ice', h('b', 'На льду: '), card.ice) : null,
      actions);
    if (v === 'best' && !preview && fastAndSure(state.sessions, card.principle, timeMs)) box.querySelector('.plus').textContent += ' · быстро и точно';
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
    if (test) {
      const t = session.items.filter(x => x.verdict === 'best').map(x => x.timeMs).sort((a, b) => a - b);
      inner.append(h('div.play-top', h('button.x', { onclick: close, 'aria-label': 'Закрыть' }, icon('close'))),
        h('div.final', h('div.q-meta', 'Контрольный срез'),
          h('div.big', `${Math.round(n('best') / results.length * 100)}%`), h('div.muted', `лучших решений в незнакомых ситуациях (${n('best')} из ${results.length})`),
          t.length ? h('p.muted', `Время верного решения: ${(t[Math.floor(t.length / 2)] / 1000).toFixed(1)} с (медиана)`) : null,
          h('p.small.muted', 'Правильные ответы не показываются: эти ситуации не входят в тренировки, поэтому через 4 недели срез можно пройти снова и сравнить.'),
          h('div', { style: { marginTop: '28px' } }, h('button.btn.primary.block', { onclick: close }, 'Готово'))));
      return;
    }
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
