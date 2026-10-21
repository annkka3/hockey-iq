/* Состояние приложения на устройстве. Структура повторяет облачную (players/{uid}/…),
   поэтому синхронизация — это перенос записей один к одному, без преобразований.
   Ключи хранения начинаются с hk_ и не пересекаются с языковыми приложениями на том же домене. */
import { review, today, rebuildH2 } from '../engine/srs.js';

const KEY = 'hk_state_v1';
const MAX_SESSIONS = 400;

const blank = () => ({
  v: 1,
  profile: { nick: '', position: 'C', hand: 'L', rink: 'iihf', anim: true, sound: true, haptics: true, favs: [] },
  progress: {},          // ключ карточки → запись повторения
  sessions: [],          // журнал: { id, day, module, startedAt, durationSec, items: [...] }
  parent: { pinHash: null, message: null, goal: null },
  cards: {},             // «мои моменты»: id → карточка той же схемы
  meta: { created: Date.now(), updated: 0, onboarded: false },
});

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      const b = blank();
      return { ...b, ...s, profile: { ...b.profile, ...s.profile }, parent: { ...b.parent, ...s.parent }, meta: { ...b.meta, ...s.meta } };
    }
  } catch (e) { console.warn('Состояние не прочиталось, начинаем заново', e); }
  return blank();
}

export const state = load();

/* Миграция один раз: история ответов (h2) для старых записей прогресса — из журнала сессий,
   чтобы «застрявшие» ситуации определялись и для карточек, начатых до появления h2. */
if ((state.meta.h2v || 0) < 1) {
  try { rebuildH2(state.progress || {}, state.sessions || []); } catch (e) { /* не критично */ }
  state.meta.h2v = 1;
}

/* Что изменилось с последней отправки в облако. */
export const dirty = { progress: new Set(), sessions: new Set(), cards: new Set(), removed: new Set(), profile: false, parent: false };

const listeners = new Set();
export const onChange = fn => { listeners.add(fn); return () => listeners.delete(fn); };

let timer = null;
export function save() {
  state.meta.updated = Date.now();
  clearTimeout(timer);
  timer = setTimeout(() => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { console.warn('Не удалось сохранить', e); }
  }, 150);
  listeners.forEach(fn => fn(state));
}

export function setProfile(patch) {
  Object.assign(state.profile, patch);
  dirty.profile = true;
  save();
}

/* Избранные карточки (id) — в профиле, поэтому синхронизируются вместе с ним. */
export const isFav = id => (state.profile.favs || []).includes(id);
export function toggleFav(id) {
  const f = new Set(state.profile.favs || []);
  if (f.has(id)) f.delete(id); else f.add(id);
  setProfile({ favs: [...f] });
  return f.has(id);
}

export function setParent(patch) {
  Object.assign(state.parent, patch);
  dirty.parent = true;
  save();
}

export function saveCard(card) {
  state.cards = state.cards || {};
  state.cards[card.id] = card;
  dirty.cards.add(card.id);
  save();
}

export function deleteCard(id) {
  if (state.cards) delete state.cards[id];
  dirty.removed.add(id);
  save();
}

export function answer(key, verdict) {
  state.progress[key] = review(state.progress[key], verdict);
  dirty.progress.add(key);
}

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/* Сессия пишется в журнал по мере ответов, а не в конце: закрытое приложение не теряет работу. */
export function startSession(module) {
  const s = { id: newId(), day: today(), module, startedAt: Date.now(), durationSec: 0, items: [] };
  state.sessions.push(s);
  if (state.sessions.length > MAX_SESSIONS) state.sessions.splice(0, state.sessions.length - MAX_SESSIONS);
  return s;
}

/* Дописали поле в последний ответ (например, «Почему?») — сохранить и отметить к синхронизации. */
export function logTouch(s) {
  dirty.sessions.add(s.id);
  save();
}

export function logItem(s, item) {
  s.items.push(item);
  s.durationSec = Math.round((Date.now() - s.startedAt) / 1000);
  dirty.sessions.add(s.id);
  save();
}

export function finishSession(s) {
  s.durationSec = Math.round((Date.now() - s.startedAt) / 1000);
  if (!s.items.length) state.sessions = state.sessions.filter(x => x !== s);
  else dirty.sessions.add(s.id);
  save();
}

/* Слияние с облаком: прогресс — более поздняя запись выигрывает; сессии — объединение по id. */
export function mergeRemote(remote) {
  if (!remote) return;
  if (remote.profile) Object.assign(state.profile, remote.profile);
  if (remote.parent) Object.assign(state.parent, remote.parent);
  for (const [id, c] of Object.entries(remote.cards || {})) {
    const mine = (state.cards || {})[id];
    if (!mine || (c.version || 0) > (mine.version || 0)) { state.cards = state.cards || {}; state.cards[id] = c; }
    else if ((mine.version || 0) > (c.version || 0)) dirty.cards.add(id);
  }
  for (const id of Object.keys(state.cards || {})) if (!(remote.cards || {})[id]) dirty.cards.add(id);
  for (const [k, r] of Object.entries(remote.progress || {})) {
    const mine = state.progress[k];
    if (!mine || (r.last || 0) > (mine.last || 0)) state.progress[k] = r;
    else if ((mine.last || 0) > (r.last || 0)) dirty.progress.add(k);
  }
  const have = new Map(state.sessions.map(s => [s.id, s]));
  for (const s of remote.sessions || []) {
    const mine = have.get(s.id);
    if (!mine || (s.items || []).length > (mine.items || []).length) have.set(s.id, s);
  }
  const remoteIds = new Set((remote.sessions || []).map(s => s.id));
  for (const s of state.sessions) if (!remoteIds.has(s.id)) dirty.sessions.add(s.id);
  state.sessions = [...have.values()].sort((a, b) => a.startedAt - b.startedAt).slice(-MAX_SESSIONS);
  save();
}

export function resetAll() {
  localStorage.removeItem(KEY);
  location.reload();
}
