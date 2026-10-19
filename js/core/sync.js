/* Мост между состоянием на устройстве и облаком. Без облака — тихо ничего не делает. */
import { state, dirty, mergeRemote, onChange } from './state.js';
import { summarize } from '../engine/scoring.js';

let api = null, uid = null, timer = null, busy = false;
export const syncStatus = { on: false, user: null, last: 0, error: null };

export async function attach(cloud) {
  api = cloud;
  if (!api) return;
  syncStatus.on = true;
  onChange(() => { clearTimeout(timer); timer = setTimeout(flush, 2500); });
  window.addEventListener('online', flush);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
}

export async function signedIn(user) {
  syncStatus.user = user;
  uid = user ? user.uid : null;
  if (!uid) return;
  try {
    await api.ensureUser(uid, state.profile.nick);
    const remote = await api.load(uid);
    mergeRemote(remote);
    dirty.profile = true; dirty.parent = true;
    await flush();
  } catch (e) { syncStatus.error = e.code || String(e); console.error(e); }
}

export async function flush() {
  if (!api || !uid || busy) return;
  const progress = {}, sessions = [];
  dirty.progress.forEach(k => { if (state.progress[k]) progress[k] = state.progress[k]; });
  dirty.sessions.forEach(id => { const s = state.sessions.find(x => x.id === id); if (s) sessions.push(s); });
  const cards = {}; dirty.cards.forEach(id => { if (state.cards && state.cards[id]) cards[id] = state.cards[id]; });
  const removed = [...dirty.removed];
  if (!dirty.profile && !dirty.parent && !Object.keys(progress).length && !sessions.length && !Object.keys(cards).length && !removed.length) return;
  const sum = summarize(state.sessions);
  const payload = {
    profile: dirty.profile ? state.profile : null,
    parent: dirty.parent ? state.parent : null,
    summary: { points: sum.points, streak: sum.streak, rank: sum.rank.name, lastActive: Date.now() },
    progress, sessions, cards, removed,
  };
  const snap = { p: new Set(dirty.progress), s: new Set(dirty.sessions), c: new Set(dirty.cards), r: new Set(dirty.removed) };
  dirty.progress.clear(); dirty.sessions.clear(); dirty.cards.clear(); dirty.removed.clear(); dirty.profile = false; dirty.parent = false;
  busy = true;
  try {
    await api.push(uid, payload);
    syncStatus.last = Date.now(); syncStatus.error = null;
  } catch (e) {
    snap.p.forEach(k => dirty.progress.add(k)); snap.s.forEach(k => dirty.sessions.add(k)); snap.c.forEach(k => dirty.cards.add(k)); snap.r.forEach(k => dirty.removed.add(k));
    if (payload.profile) dirty.profile = true;
    if (payload.parent) dirty.parent = true;
    syncStatus.error = e.code || String(e);
  } finally { busy = false; }
}
