/* Hockey Vision — эпизоды из настоящих матчей.
   Видео идёт до момента решения и замирает: вопрос, варианты, ответ. Потом эпизод доигрывается — видно, что было
   на самом деле, — и разбор: почему лучшее решение лучшее, принцип, куда смотреть (отметки на стоп-кадре).
   Видео хранится только на устройстве (js/core/media.js, IndexedDB); в состоянии — только описание эпизода.
   Тот же проигрыватель открывает «Мои моменты», к которым прикреплено видео матча и отмечена ключевая секунда.

   Эпизод: { id, title, mediaId | url, start, stop, end?, question, options: [{ id, label, verdict, explain }],
             principle?, cue?, marks: [{ t: 'circle', x, y, r } | { t: 'arrow', x, y, x2, y2 }], marksBefore?,
             version, created }
   Координаты отметок — 0…100 по ширине и высоте кадра (не экрана), поэтому они на месте на любом телефоне. */
import { h, icon, toast } from '../ui.js';
import { lib } from '../content.js';
import { state, save, answer, startSession, logItem, finishSession } from '../core/state.js';
import { putMedia, getMedia, deleteMedia, usage, available, keep, fmtBytes } from '../core/media.js';
import { fx } from '../core/fx.js';

const LETTERS = ['А', 'Б', 'В', 'Г', 'Д'];
const VERDICTS = [['best', 'Лучшее'], ['ok', 'Можно'], ['risky', 'Риск'], ['bad', 'Ошибка']];
const TAG = { best: 'Лучшее решение', ok: 'Можно', risky: 'Рискованно', bad: 'Ошибка' };
const FRAME = 1 / 30;
const NS = 'http://www.w3.org/2000/svg';

/* ---------- хранилище эпизодов ---------- */
const store = () => { state.vision = state.vision || { episodes: {} }; state.vision.episodes = state.vision.episodes || {}; return state.vision.episodes; };
export const episodes = () => Object.values(store()).sort((a, b) => (b.created || 0) - (a.created || 0));
const saveEp = ep => { store()[ep.id] = ep; save(); };
const momentsWithVideo = () => Object.values(state.cards || {}).filter(c => c.video && (c.video.mediaId || c.video.url) && c.video.at != null);

/* Эпизод из «Моего момента» с видео: та же карточка, только вместо схемы — кадр матча. */
export function fromMoment(c) {
  const v = c.video || {};
  return {
    id: 'm:' + c.id, moment: c.id, title: c.title, mediaId: v.mediaId || null, url: v.url || null,
    start: v.start != null ? v.start : Math.max(0, v.at - 8), stop: v.at, end: v.end != null ? v.end : null,
    question: (c.question && c.question.text) || '', options: (c.options || []).map(o => ({ id: o.id, label: o.label, verdict: o.verdict, explain: o.explain })),
    principle: c.principle || null, track: c.track || 'read', phase: c.phase || null, cue: c.cue || '', marks: v.marks || [], marksBefore: false,
  };
}
const resolve = idOrEp => {
  if (idOrEp && typeof idOrEp === 'object') return idOrEp;
  const id = String(idOrEp || '');
  if (id.startsWith('m:')) { const c = (state.cards || {})[id.slice(2)]; return c && c.video ? fromMoment(c) : null; }
  return store()[id] || null;
};

/* Используется ли видео ещё где-то (другим эпизодом или моментом) — перед удалением файла. */
function mediaInUse(mediaId, exceptEp = null, exceptCard = null) {
  if (!mediaId) return false;
  if (episodes().some(e => e.id !== exceptEp && e.mediaId === mediaId)) return true;
  return Object.values(state.cards || {}).some(c => c.id !== exceptCard && c.video && c.video.mediaId === mediaId);
}
export async function releaseMedia(mediaId, exceptEp = null, exceptCard = null) {
  if (mediaId && !mediaInUse(mediaId, exceptEp, exceptCard)) await deleteMedia(mediaId);
}

const fmtT = t => {
  if (t == null || !isFinite(t)) return '—';
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(2)}`;
};
const shuffle = a => { const r = [...a]; for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; };

/* ---------- сцена с видео и слоем отметок ---------- */
async function srcOf(ep) {
  if (ep.mediaId) { const b = await getMedia(ep.mediaId); return b ? { url: URL.createObjectURL(b), own: true } : null; }
  if (ep.url) return { url: ep.url, own: false };
  return null;
}

/* Видео + SVG поверх кадра. Слой подгоняется под реальную картинку (object-fit: contain), а не под рамку. */
export function stage() {
  const video = h('video.vis-video', { playsinline: true, 'webkit-playsinline': true, preload: 'auto', muted: true });
  video.muted = true;
  const overlay = document.createElementNS(NS, 'svg');
  overlay.setAttribute('viewBox', '0 0 100 56.25'); overlay.setAttribute('preserveAspectRatio', 'none'); overlay.setAttribute('class', 'vis-marks');
  const wrap = h('div.vis-stage', video, overlay);
  const fit = () => {
    const w = video.clientWidth, hh = video.clientHeight, vw = video.videoWidth, vh = video.videoHeight;
    if (!w || !hh || !vw || !vh) return;
    const k = Math.min(w / vw, hh / vh), cw = vw * k, ch = vh * k;
    Object.assign(overlay.style, { left: video.offsetLeft + (w - cw) / 2 + 'px', top: video.offsetTop + (hh - ch) / 2 + 'px', width: cw + 'px', height: ch + 'px' });
    overlay.setAttribute('viewBox', `0 0 100 ${(100 * vh / vw).toFixed(3)}`);
  };
  video.addEventListener('loadedmetadata', fit);
  video.addEventListener('loadeddata', fit);
  let ro = null;
  if ('ResizeObserver' in window) { ro = new ResizeObserver(fit); ro.observe(video); } else window.addEventListener('resize', fit);
  // отметки хранятся в долях кадра 0…100 по обеим осям; на экране — в масштабе кадра (без искажения круга)
  const draw = (marks = [], { faint = false } = {}) => {
    overlay.innerHTML = '';
    const K = (video.videoWidth && video.videoHeight ? video.videoHeight / video.videoWidth : 0.5625), Y = y => y * K;
    const defs = document.createElementNS(NS, 'defs');
    defs.innerHTML = '<marker id="vis-arr" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#33C8EA"/></marker>';
    overlay.append(defs);
    for (const m of marks) {
      let n;
      if (m.t === 'circle') { n = document.createElementNS(NS, 'circle'); n.setAttribute('cx', m.x); n.setAttribute('cy', Y(m.y)); n.setAttribute('r', m.r || 6); }
      else { n = document.createElementNS(NS, 'line'); n.setAttribute('x1', m.x); n.setAttribute('y1', Y(m.y)); n.setAttribute('x2', m.x2); n.setAttribute('y2', Y(m.y2)); n.setAttribute('marker-end', 'url(#vis-arr)'); }
      n.setAttribute('class', 'vis-mark' + (faint ? ' faint' : ''));
      overlay.append(n);
    }
  };
  const destroy = () => { if (ro) ro.disconnect(); try { video.pause(); } catch (e) { /* уже */ } };
  return { wrap, video, overlay, draw, fit, destroy };
}

const seek = (video, t) => new Promise(res => {
  const target = Math.max(0, Math.min(t, (video.duration || t) - 0.001));
  if (Math.abs(video.currentTime - target) < 0.004) return res();
  const done = () => { video.removeEventListener('seeked', done); clearTimeout(to); res(); };
  const to = setTimeout(done, 1500);
  video.addEventListener('seeked', done);
  video.currentTime = target;
});
const ready = video => new Promise(res => {
  if (video.readyState >= 2) return res(true);
  const ok = () => { clean(); res(true); }, bad = () => { clean(); res(false); };
  const clean = () => { video.removeEventListener('loadeddata', ok); video.removeEventListener('error', bad); };
  video.addEventListener('loadeddata', ok); video.addEventListener('error', bad);
});

/* Довести видео до момента t и остановить точно на нём. requestVideoFrameCallback — по кадрам (время кадра в
   метаданных), в запасе — опрос currentTime каждый кадр отрисовки и событие ended. Возвращает отмену. */
export function runTo(video, t, onStop) {
  let done = false, raf = 0;
  const finish = async () => {
    if (done) return; done = true; cancelAnimationFrame(raf); video.removeEventListener('ended', finish);
    video.pause();
    if (isFinite(t) && Math.abs(video.currentTime - t) > 0.02) await seek(video, t);
    onStop && onStop();
  };
  const near = x => x >= t - FRAME / 2;
  if (video.requestVideoFrameCallback) {
    const cb = (now, meta) => { if (done) return; if (near(meta.mediaTime)) finish(); else video.requestVideoFrameCallback(cb); };
    video.requestVideoFrameCallback(cb);
  }
  const poll = () => { if (done) return; if (near(video.currentTime) || video.ended) finish(); else raf = requestAnimationFrame(poll); };
  raf = requestAnimationFrame(poll);
  video.addEventListener('ended', finish);
  return () => { done = true; cancelAnimationFrame(raf); video.removeEventListener('ended', finish); };
}

/* Воспроизвести; если браузер не дал (автозапуск со звуком) — кнопка «Смотреть» поверх кадра. */
async function playOrAsk(st, wrapBtnText = 'Смотреть') {
  try { await st.video.play(); return true; }
  catch (e) {
    return new Promise(res => {
      const b = h('button.vis-big-play', { type: 'button', onclick: async () => { b.remove(); try { await st.video.play(); } catch (e2) { /* нет */ } res(true); } }, '▶ ' + wrapBtnText);
      st.wrap.append(b);
    });
  }
}

/* Скраббер: большой ползунок, шаг ±1 кадр и ±1 с, время. onTime(t) — после любого сдвига. */
export function scrubber(video, onTime = () => {}) {
  const range = h('input.vis-range', { type: 'range', min: 0, max: 1, step: FRAME, value: 0, 'aria-label': 'Время в видео' });
  const label = h('span.vis-time', '0:00.00');
  const playBtn = h('button.btn.small.vis-pp', { type: 'button', 'aria-label': 'Пуск или пауза' }, '▶');
  const sync = () => { range.max = video.duration || 1; range.value = video.currentTime; label.textContent = `${fmtT(video.currentTime)} / ${fmtT(video.duration)}`; playBtn.textContent = video.paused ? '▶' : '❚❚'; };
  const step = d => { video.pause(); video.currentTime = Math.max(0, Math.min((video.duration || 0) - 0.001, video.currentTime + d)); };
  range.addEventListener('input', () => { video.pause(); video.currentTime = +range.value; });
  playBtn.addEventListener('click', () => { if (video.paused) video.play().catch(() => {}); else video.pause(); });
  for (const ev of ['timeupdate', 'seeked', 'loadedmetadata', 'play', 'pause', 'durationchange']) video.addEventListener(ev, () => { sync(); if (ev === 'seeked' || ev === 'pause') onTime(video.currentTime); });
  const B = (t, d, al) => h('button.btn.small.ghost', { type: 'button', 'aria-label': al, onclick: () => step(d) }, t);
  return h('div.vis-scrub', range,
    h('div.vis-ctrl', B('−1 с', -1, 'Назад на секунду'), B('◂ кадр', -FRAME, 'Назад на кадр'), playBtn, B('кадр ▸', FRAME, 'Вперёд на кадр'), B('+1 с', 1, 'Вперёд на секунду')),
    label);
}

/* ---------- проигрыватель эпизода ---------- */
export async function openEpisode(idOrEp, { preview = false, onClose = null } = {}) {
  const ep = resolve(idOrEp);
  if (!ep) { toast('Эпизод не найден'); return; }
  const src = await srcOf(ep);
  if (!src) { toast('Видео этого эпизода нет на этом устройстве'); return; }
  const root = h('div.play.vis-player'), inner = h('div.play-in');
  root.append(inner); document.body.append(root); document.body.style.overflow = 'hidden';
  const st = stage();
  const session = preview ? null : startSession('vision');
  let closed = false, cancel = null;
  const close = () => {
    if (closed) return; closed = true;
    if (cancel) cancel();
    st.destroy();
    if (src.own) URL.revokeObjectURL(src.url);
    if (session) finishSession(session);
    root.remove(); document.body.style.overflow = '';
    if (location.hash.startsWith('#/vision/')) history.replaceState(null, '', '#/vision');
    onClose && onClose();
  };
  const phaseLb = h('div.vis-phase', 'Смотри');
  const sound = h('button.btn.small.ghost.vis-sound', { type: 'button', onclick: () => { st.video.muted = !st.video.muted; sound.textContent = st.video.muted ? '🔇' : '🔊'; }, 'aria-label': 'Звук' }, '🔇');
  const panel = h('div.vis-panel');
  inner.append(
    h('div.play-top', h('button.x', { onclick: close, 'aria-label': 'Закрыть' }, icon('close')), h('div.q-meta', { style: { margin: 0, flex: 1 } }, 'Видео · ' + (ep.title || 'эпизод')), sound),
    h('div.vis-frame', st.wrap, phaseLb), panel);

  st.video.src = src.url;
  const ok = await ready(st.video);
  if (!ok) { panel.append(h('p.explain', 'Видео не открылось. Если это ссылка — нужен интернет и разрешение сайта на показ.')); return; }
  st.fit();
  const start = Math.max(0, Math.min(ep.start || 0, ep.stop - 0.05));
  const end = ep.end != null ? Math.min(ep.end, st.video.duration || ep.end) : st.video.duration;

  const watch = async () => {
    panel.innerHTML = ''; st.draw([]); phaseLb.textContent = 'Смотри'; phaseLb.className = 'vis-phase';
    panel.append(h('p.muted.small', 'Видео остановится в момент решения.'),
      h('button.btn.small.ghost', { type: 'button', onclick: () => { if (cancel) cancel(); seek(st.video, ep.stop).then(freeze); } }, 'Сразу к моменту'));
    await seek(st.video, start);
    if (closed) return;
    cancel = runTo(st.video, ep.stop, freeze);
    await playOrAsk(st);
  };

  let t0 = 0, frozen = false;
  const freeze = () => {
    if (closed || frozen) return; frozen = true; cancel = null;
    st.video.pause();
    phaseLb.textContent = 'Стоп-кадр · решай'; phaseLb.className = 'vis-phase stop';
    fx('start');
    if (ep.marksBefore) st.draw(ep.marks || []);
    panel.innerHTML = '';
    const cue = ep.cue ? h('p.cue', { hidden: true }, h('b', 'Куда смотреть: '), ep.cue) : null;
    const box = h('div.opts');
    shuffle(ep.options).forEach((o, k) => {
      box.append(h('button.opt', { 'data-k': LETTERS[k], 'data-id': o.id, onclick: () => decide(o, box) }, o.label));
    });
    panel.append(h('div.q', ep.question), box);
    if (cue) panel.append(h('button.btn.small.ghost', { type: 'button', style: { marginTop: '10px' }, onclick: e => { cue.hidden = false; e.currentTarget.remove(); } }, 'Подсказка'), cue);
    t0 = performance.now();
  };

  const decide = async (o, box) => {
    if (box.classList.contains('locked')) return;
    box.classList.add('locked');
    const timeMs = Math.round(performance.now() - t0), v = o.verdict;
    fx('tap'); fx(v === 'best' ? 'best' : v === 'bad' ? 'bad' : 'ok');
    box.querySelectorAll('.opt').forEach(b => {
      const opt = ep.options.find(x => x.id === b.dataset.id);
      if (b.dataset.id === o.id) b.classList.add('v-' + v);
      else if (opt && opt.verdict === 'best') b.classList.add('v-best');
      else b.classList.add('dim');
    });
    if (session) {
      const key = 'vision:' + ep.id;
      answer(key, v);
      logItem(session, { cardId: key, key, variant: null, deck: 'vision', phase: ep.phase || null, principle: ep.principle || null,
        track: ep.track || 'read', answer: o.id, verdict: v, timeMs, video: true });
    }
    // доиграть эпизод: что было на самом деле
    phaseLb.textContent = 'Что было дальше'; phaseLb.className = 'vis-phase after';
    st.draw([]);
    const afterBox = h('p.muted.small', 'Смотри, чем закончилось…');
    panel.append(afterBox);
    if (end > ep.stop + 0.1) {
      await new Promise(res => { cancel = runTo(st.video, end, res); playOrAsk(st, 'Дальше'); });
    }
    if (closed) return;
    cancel = null; afterBox.remove();
    review(o, v);
  };

  const review = (o, v) => {
    phaseLb.textContent = 'Разбор'; phaseLb.className = 'vis-phase review';
    const best = ep.options.find(x => x.verdict === 'best');
    const pr = ep.principle && lib.principle ? lib.principle[ep.principle] : null;
    const marksBtn = (ep.marks || []).length ? h('button.btn.small', { type: 'button', onclick: async () => { await seek(st.video, ep.stop); st.draw(ep.marks); phaseLb.textContent = 'Стоп-кадр · куда смотреть'; } }, 'Стоп-кадр с отметками') : null;
    panel.append(h('div.result',
      h('div.verdict', h('span.tag.' + (v === 'best' ? 'best' : v === 'bad' ? 'bad' : 'ok'), TAG[v] || v)),
      h('p.explain', o.explain),
      v !== 'best' && best ? h('p.explain.muted', `Лучше: ${best.label.toLowerCase()}. ${best.explain}`) : null,
      ep.cue ? h('p.cue', h('b', 'Куда смотреть: '), ep.cue) : null,
      pr ? h('div.principle', h('b', pr.name), h('span', pr.line || '')) : null,
      h('div.row.wrap', { style: { marginTop: '12px' } }, marksBtn,
        h('button.btn.small.ghost', { type: 'button', onclick: async () => { st.draw([]); await seek(st.video, start); playOrAsk(st); } }, 'Пересмотреть')),
      h('div.actions',
        h('button.btn', { type: 'button', onclick: () => { close(); openEpisode(ep, { preview, onClose }); } }, 'Ещё раз'),
        h('button.btn.primary', { type: 'button', onclick: close }, 'Готово'))));
  };

  watch();
  return { close };
}

/* ---------- редактор эпизода ---------- */
const blankEp = () => ({
  id: 'e' + Date.now().toString(36), title: '', mediaId: null, url: null, start: 0, stop: null, end: null,
  question: '', options: [{ id: 'a', label: '', verdict: 'best', explain: '' }, { id: 'b', label: '', verdict: 'bad', explain: '' }],
  principle: null, cue: '', marks: [], marksBefore: false, version: 0, created: Date.now(),
});

export function editEpisode(epIn, rerender = () => {}) {
  const orig = epIn ? store()[epIn.id] : null;
  const ep = epIn ? JSON.parse(JSON.stringify(epIn)) : blankEp();
  const root = h('div.play.vis-editor'), inner = h('div.play-in');
  root.append(inner); document.body.append(root); document.body.style.overflow = 'hidden';
  const st = stage();
  let objUrl = null, newMedia = null, tool = null;
  const close = (saved = false) => {
    st.destroy(); if (objUrl) URL.revokeObjectURL(objUrl);
    if (!saved && newMedia) releaseMedia(newMedia, orig ? orig.id : null);
    root.remove(); document.body.style.overflow = ''; rerender();
  };

  const status = h('p.muted.small');
  const times = h('div.vis-times');
  const videoBox = h('div.vis-edit-video', { hidden: true }, st.wrap);
  const scrub = scrubber(st.video, () => {});
  videoBox.append(scrub);

  const setSrc = async () => {
    if (objUrl) { URL.revokeObjectURL(objUrl); objUrl = null; }
    const s = await srcOf(ep);
    if (!s) { videoBox.hidden = true; status.textContent = 'Видео не выбрано.'; return; }
    if (s.own) objUrl = s.url;
    st.video.src = s.url; videoBox.hidden = false;
    const ok = await ready(st.video);
    status.textContent = ok ? (ep.url ? 'Видео по ссылке — для просмотра нужен интернет.' : 'Видео сохранено на этом устройстве.') : 'Видео не открылось — попробуйте другой файл.';
    st.fit();
    if (ok && ep.stop != null) { await seek(st.video, ep.stop); st.draw(ep.marks); }
    drawTimes();
  };

  const file = h('input', { type: 'file', accept: 'video/*', hidden: true, onchange: async e => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    status.textContent = 'Сохраняю видео на устройство…';
    if (newMedia) await releaseMedia(newMedia, orig ? orig.id : null);
    const id = await putMedia(f, { name: f.name });
    newMedia = id; ep.mediaId = id; ep.url = null;
    keep();
    if (!ep.title) { ep.title = f.name.replace(/\.[^.]+$/, ''); title.value = ep.title; }
    await setSrc();
  } });
  const urlIn = h('input.input', { type: 'url', placeholder: 'или ссылка на видеофайл (mp4/webm)', value: ep.url || '' });
  const srcRow = h('div.row.wrap',
    h('button.btn.small.primary', { type: 'button', onclick: () => file.click() }, ep.mediaId ? 'Заменить видео' : 'Выбрать видео'),
    h('button.btn.small.ghost', { type: 'button', onclick: async () => { const u = urlIn.value.trim(); if (!u) return toast('Вставьте ссылку'); ep.url = u; ep.mediaId = null; await setSrc(); } }, 'По ссылке'),
    file);

  const mark = (k, label) => h('div.vis-tm',
    h('span', label),
    h('button.vis-tm-v', { type: 'button', onclick: () => { if (ep[k] != null) seek(st.video, ep[k]).then(() => { if (k === 'stop') st.draw(ep.marks); }); } }, fmtT(ep[k])),
    h('button.btn.small', { type: 'button', onclick: () => { st.video.pause(); ep[k] = Math.round(st.video.currentTime * 1000) / 1000; if (k === 'stop') { if (ep.start >= ep.stop) ep.start = Math.max(0, ep.stop - 8); st.draw(ep.marks); } drawTimes(); } }, 'здесь'),
    k === 'end' && ep.end != null ? h('button.btn.small.ghost', { type: 'button', onclick: () => { ep.end = null; drawTimes(); } }, 'до конца') : null);
  const drawTimes = () => {
    times.innerHTML = '';
    times.append(mark('start', 'Начало показа'), mark('stop', 'Стоп-кадр (решение)'), mark('end', 'Конец показа'));
  };

  // отметки на стоп-кадре: круг — касание, стрелка — провести пальцем
  const toolT = h('div.toggle', { style: { '--n': 3 } }, [[null, 'Без отметок'], ['circle', 'Круг'], ['arrow', 'Стрелка']].map(([k, t]) => h('button', { type: 'button', class: k === tool ? 'on' : '', onclick: async e => {
    tool = k; toolT.querySelectorAll('button').forEach(b => b.classList.remove('on')); e.currentTarget.classList.add('on');
    st.overlay.classList.toggle('drawing', !!k);
    if (k && ep.stop != null) { await seek(st.video, ep.stop); st.draw(ep.marks); }
    if (k && ep.stop == null) toast('Сначала отметьте стоп-кадр');
  } }, t)));
  const norm = e => { const r = st.overlay.getBoundingClientRect(); return { x: Math.max(0, Math.min(100, (e.clientX - r.left) / r.width * 100)), y: Math.max(0, Math.min(100, (e.clientY - r.top) / r.height * 100)) }; };
  st.overlay.addEventListener('pointerdown', e => {
    if (!tool || ep.stop == null) return;
    e.preventDefault(); st.overlay.setPointerCapture(e.pointerId);
    const a = norm(e);
    let last = a;
    const mv = e2 => { last = norm(e2); };
    const up = e2 => {
      st.overlay.removeEventListener('pointerup', up); st.overlay.removeEventListener('pointermove', mv);
      const b2 = norm(e2), b = Math.hypot(b2.x - a.x, b2.y - a.y) > Math.hypot(last.x - a.x, last.y - a.y) ? b2 : last;
      if (tool === 'arrow' && Math.hypot(b.x - a.x, b.y - a.y) > 4) ep.marks.push({ t: 'arrow', x: +a.x.toFixed(1), y: +a.y.toFixed(1), x2: +b.x.toFixed(1), y2: +b.y.toFixed(1) });
      else ep.marks.push({ t: 'circle', x: +a.x.toFixed(1), y: +a.y.toFixed(1), r: 6 });
      st.draw(ep.marks);
    };
    st.overlay.addEventListener('pointermove', mv);
    st.overlay.addEventListener('pointerup', up);
  });
  const before = h('label.vis-check', h('input', { type: 'checkbox', checked: ep.marksBefore || null, onchange: e => { ep.marksBefore = e.target.checked; } }),
    h('span', 'Показывать отметки до ответа (подсказка). Обычно — только в разборе.'));

  const title = h('input.input', { placeholder: 'Название: «Матч с Динамо, 2-й период, 14:20»', value: ep.title, oninput: e => { ep.title = e.target.value; } });
  const q = h('textarea.input', { placeholder: 'Вопрос в момент стоп-кадра: «Шайба у тебя. Что делаешь?»', oninput: e => { ep.question = e.target.value; } }); q.value = ep.question;
  const cue = h('input.input', { placeholder: 'Куда смотреть (необязательно): «на их защитника у синей»', value: ep.cue || '', oninput: e => { ep.cue = e.target.value; } });
  const princ = h('select.input', { onchange: e => { ep.principle = e.target.value || null; } },
    h('option', { value: '' }, '— без принципа —'), (lib.principles || []).map(p => h('option', { value: p.id, selected: p.id === ep.principle || null }, p.name)));

  const optsBox = h('div.list');
  const drawOpts = () => {
    optsBox.innerHTML = '';
    ep.options.forEach((o, i) => {
      const vt = h('div.toggle', { style: { '--n': 4 } }, VERDICTS.map(([v, t]) => h('button', { type: 'button', class: o.verdict === v ? 'on' : '', onclick: () => {
        if (v === 'best') ep.options.forEach(x => { if (x.verdict === 'best') x.verdict = 'ok'; });
        o.verdict = v; drawOpts();
      } }, t)));
      optsBox.append(h('div.review-row',
        h('input.input', { placeholder: `Вариант ${LETTERS[i]}: что делаешь`, value: o.label, oninput: e => { o.label = e.target.value; } }),
        vt,
        h('input.input', { placeholder: 'Почему так (разбор)', value: o.explain, oninput: e => { o.explain = e.target.value; } }),
        ep.options.length > 2 ? h('button.btn.small.ghost', { type: 'button', onclick: () => { ep.options.splice(i, 1); ep.options.forEach((x, k) => { x.id = 'abcde'[k]; }); drawOpts(); } }, 'Убрать вариант') : null));
    });
    if (ep.options.length < 5) optsBox.append(h('button.btn.small', { type: 'button', onclick: () => { ep.options.push({ id: 'abcde'[ep.options.length], label: '', verdict: 'bad', explain: '' }); drawOpts(); } }, 'Добавить вариант'));
  };

  const doSave = () => {
    const errs = [];
    if (!ep.mediaId && !ep.url) errs.push('видео');
    if (ep.stop == null) errs.push('стоп-кадр');
    else if (st.video.duration && ep.stop > st.video.duration) errs.push('стоп-кадр внутри видео');
    if (ep.stop != null && ep.start >= ep.stop) errs.push('начало раньше стоп-кадра');
    if (ep.end != null && ep.stop != null && ep.end <= ep.stop) errs.push('конец позже стоп-кадра');
    if (!ep.title.trim()) errs.push('название');
    if (!ep.question.trim()) errs.push('вопрос');
    if (ep.options.some(o => !o.label.trim() || !o.explain.trim())) errs.push('тексты вариантов и разборы');
    if (ep.options.filter(o => o.verdict === 'best').length !== 1) errs.push('одно лучшее решение');
    if (errs.length) { toast('Заполните: ' + errs.join(', ')); return; }
    const oldMedia = orig && orig.mediaId;
    ep.version = (orig ? orig.version || 0 : 0) + 1;
    saveEp(ep);
    if (oldMedia && oldMedia !== ep.mediaId) releaseMedia(oldMedia, ep.id);
    newMedia = null;
    toast('Эпизод сохранён'); close(true);
  };
  const doDelete = async () => {
    if (!orig) return close();
    delete store()[orig.id]; save();
    await releaseMedia(orig.mediaId, orig.id);
    if (newMedia && newMedia !== orig.mediaId) await releaseMedia(newMedia, orig.id);
    newMedia = null;
    toast('Удалено'); close(true);
  };

  const use = h('p.muted.small.vis-usage');
  usage().then(u => { use.textContent = `Видео на устройстве: ${u.count} · ${fmtBytes(u.bytes)}${u.quota ? ` из доступных ${fmtBytes(u.quota)}` : ''}${u.persistent ? '' : ' · хранилище недоступно: видео пропадут после закрытия'}`; });

  inner.append(
    h('div.play-top', h('button.x', { onclick: () => close(false), 'aria-label': 'Закрыть' }, icon('close')), h('div.q-meta', { style: { margin: 0 } }, orig ? 'Правка эпизода' : 'Новый эпизод')),
    h('label.field', { style: { marginTop: '12px' } }, h('span', 'Видео'), srcRow, urlIn), status,
    videoBox,
    h('label.field', h('span', 'Отрезок'), times),
    h('label.field', h('span', 'Отметки на стоп-кадре'), toolT,
      h('div.row.wrap', { style: { marginTop: '8px' } }, h('button.btn.small.ghost', { type: 'button', onclick: () => { ep.marks = []; st.draw([]); } }, 'Стереть отметки'), before)),
    h('label.field', h('span', 'Название'), title),
    h('label.field', h('span', 'Вопрос'), q),
    h('label.field', h('span', 'Принцип'), princ),
    h('label.field', h('span', 'Куда смотреть'), cue),
    h('div.h2', 'Варианты'), optsBox,
    use,
    h('div.row', { style: { marginTop: '16px' } },
      orig ? h('button.btn.ghost.small', { type: 'button', style: { color: 'var(--bad)' }, onclick: doDelete }, 'Удалить') : null,
      h('button.btn.small', { type: 'button', onclick: () => { if (ep.stop == null || (!ep.mediaId && !ep.url)) return toast('Нужны видео и стоп-кадр'); if (!ep.question.trim() || ep.options.some(o => !o.label.trim())) return toast('Заполните вопрос и варианты'); openEpisode(ep, { preview: true }); } }, 'Проверить'),
      h('button.btn.primary.grow', { type: 'button', onclick: doSave }, 'Сохранить')));
  drawTimes(); drawOpts(); setSrc();
}

/* ---------- ключевая секунда для «Моего момента» (editor.js) ---------- */
/* Блок «Видео матча» внутри редактора момента. card.video = { mediaId, name, at, start }. onChange — после правок. */
export function momentVideo(card, onChange = () => {}) {
  const box = h('div.vis-moment');
  const st = stage();
  let objUrl = null;
  const fresh = new Set(); // видео, прикреплённые в этой правке
  const status = h('p.muted.small');
  const vbox = h('div.vis-edit-video', { hidden: true }, st.wrap, scrubber(st.video));
  const at = h('div.vis-times');
  const draw = () => {
    at.innerHTML = '';
    const v = card.video || {};
    const row = (k, label) => h('div.vis-tm', h('span', label),
      h('button.vis-tm-v', { type: 'button', onclick: () => { if (v[k] != null) seek(st.video, v[k]); } }, fmtT(v[k])),
      h('button.btn.small', { type: 'button', onclick: () => { st.video.pause(); v[k] = Math.round(st.video.currentTime * 1000) / 1000; if (k === 'at' && (v.start == null || v.start >= v.at)) v.start = Math.max(0, v.at - 8); draw(); onChange(); } }, 'здесь'));
    if (card.video && card.video.mediaId) at.append(row('at', 'Ключевая секунда'), row('start', 'Начало показа'));
  };
  const load = async () => {
    if (objUrl) { URL.revokeObjectURL(objUrl); objUrl = null; }
    const v = card.video;
    if (!v || !v.mediaId) { vbox.hidden = true; status.textContent = 'К моменту можно прикрепить видео матча и отметить ключевую секунду — тогда эпизод можно смотреть как видео.'; draw(); return; }
    const b = await getMedia(v.mediaId);
    if (!b) { vbox.hidden = true; status.textContent = 'Видео этого момента нет на этом устройстве.'; draw(); return; }
    objUrl = URL.createObjectURL(b); st.video.src = objUrl; vbox.hidden = false;
    await ready(st.video); st.fit();
    if (v.at != null) await seek(st.video, v.at);
    status.textContent = `${v.name || 'Видео'} · ключевая секунда ${fmtT(v.at)}`;
    draw();
  };
  const file = h('input', { type: 'file', accept: 'video/*', hidden: true, onchange: async e => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    status.textContent = 'Сохраняю видео на устройство…';
    const old = card.video && card.video.mediaId;
    const id = await putMedia(f, { name: f.name }); keep();
    card.video = { mediaId: id, name: f.name, at: null, start: null };
    // промежуточное видео этой правки (ещё не сохранённое) — сразу убрать; сохранённое прежнее убирает редактор при сохранении
    if (old && fresh.has(old)) { fresh.delete(old); releaseMedia(old, null, card.id); }
    fresh.add(id);
    await load(); onChange();
  } });
  box.append(status,
    h('div.row.wrap', h('button.btn.small', { type: 'button', onclick: () => file.click() }, card.video && card.video.mediaId ? 'Заменить видео' : 'Прикрепить видео'),
      h('button.btn.small.ghost', { type: 'button', onclick: async () => { const old = card.video && card.video.mediaId; delete card.video; if (old && fresh.has(old)) { fresh.delete(old); await releaseMedia(old, null, card.id); } load(); onChange(); } }, 'Убрать видео'), file),
    vbox, at);
  load();
  box.destroy = () => { st.destroy(); if (objUrl) URL.revokeObjectURL(objUrl); };
  return box;
}

/* ---------- вкладка «Видео» ---------- */
export function renderVisionTab(container, rerender = () => {}) {
  const eps = episodes(), moms = momentsWithVideo();
  const results = lastResults();
  const item = (ep, own) => h('div.li.vis-li',
    h('span.vis-li-t', h('b', ep.title || 'Эпизод'), h('small', `стоп ${fmtT(ep.stop)}${results[ep.id] ? ' · ' + TAG[results[ep.id]].toLowerCase() : ''}`)),
    h('span.row', { style: { gap: '6px' } },
      h('button.btn.small', { type: 'button', onclick: () => openEpisode(ep.id, { onClose: rerender }) }, 'Смотреть'),
      own ? h('button.btn.small.ghost', { type: 'button', onclick: () => editEpisode(ep, rerender) }, 'Править') : null));
  const use = h('p.muted.small.vis-usage');
  usage().then(u => { use.textContent = u.count ? `На устройстве ${u.count} видео · ${fmtBytes(u.bytes)}${u.persistent ? '' : ' · хранилище недоступно, видео пропадут после закрытия'}` : ''; });
  container.append(
    h('div.h2', `Видео · ${eps.length + moms.length}`),
    h('div.panel.vis-tab',
      h('p.muted.small', { style: { marginTop: 0 } }, 'Эпизоды из настоящих матчей. Видео останавливается в момент решения — выбираешь, что делать, потом смотришь, что было на самом деле, и разбор. Видео хранится только на этом телефоне.'),
      eps.length ? h('div.list', eps.map(e => item(e, true))) : h('p.muted.small', 'Эпизодов пока нет. Добавьте отрывок матча: отметьте секунду, где нужно принять решение, и варианты.'),
      moms.length ? [h('div.h2', { style: { marginTop: '16px' } }, 'Из «Моих моментов»'), h('div.list', moms.map(c => item(fromMoment(c), false)))] : null,
      h('button.btn.primary.small', { type: 'button', style: { marginTop: '12px' }, onclick: () => editEpisode(null, rerender) }, 'Новый эпизод'),
      use));
}

/* Последний результат по каждому эпизоду — из журнала сессий. */
function lastResults() {
  const out = {};
  for (const s of state.sessions || []) for (const it of s.items || []) if (it.deck === 'vision' && it.key) out[it.key.replace(/^vision:/, '')] = it.verdict;
  return out;
}

/* Маршрут #/vision и #/vision/<id>: вкладка, а эпизод открывается поверх. */
export function renderRoute(view, rerender, sub = null) {
  renderVisionTab(view, rerender);
  if (sub && !document.querySelector('.vis-player')) openEpisode(decodeURIComponent(sub), { onClose: rerender });
}
