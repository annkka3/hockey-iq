/* Звук и вибрация — короткие сигналы на ключевые события. Без файлов: тоны синтезируются WebAudio.
   Включаются в профиле: state.profile.sound (по умолчанию true), state.profile.haptics (по умолчанию true).
   Вызов: fx('best' | 'ok' | 'bad' | 'tap' | 'goal' | 'save' | 'post' | 'release' | 'start' | 'false'). Ошибки молча глотаются. */
import { state } from './state.js';

let ac = null;
const ctx = () => {
  if (!ac) { const A = window.AudioContext || window.webkitAudioContext; if (!A) return null; ac = new A(); }
  if (ac.state === 'suspended') ac.resume().catch(() => {});
  return ac;
};

/* Нота: частота, длительность, громкость, тип волны, задержка от начала. */
function tone(f, dur, vol = 0.12, type = 'sine', at = 0, slide = 0) {
  const a = ctx(); if (!a) return;
  const t = a.currentTime + at, o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, f + slide), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
}
/* Шум (удар шайбы, сетка). */
function noise(dur, vol = 0.15, hp = 800, at = 0) {
  const a = ctx(); if (!a) return;
  const t = a.currentTime + at, n = Math.floor(a.sampleRate * dur), buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  s.buffer = buf; f.type = 'highpass'; f.frequency.value = hp; g.gain.value = vol;
  s.connect(f).connect(g).connect(a.destination); s.start(t);
}

const SOUNDS = {
  tap: () => tone(880, 0.05, 0.05, 'triangle'),
  start: () => tone(660, 0.08, 0.06, 'triangle'),
  best: () => { tone(660, 0.1, 0.1, 'triangle'); tone(990, 0.16, 0.1, 'triangle', 0.08); },
  ok: () => tone(740, 0.14, 0.08, 'triangle'),
  bad: () => tone(220, 0.22, 0.09, 'sawtooth', 0, -60),
  false: () => tone(180, 0.12, 0.08, 'square'),
  release: () => noise(0.06, 0.25, 1800),
  goal: () => { noise(0.25, 0.12, 400); tone(523, 0.15, 0.1, 'triangle', 0.05); tone(784, 0.25, 0.1, 'triangle', 0.18); },
  save: () => noise(0.09, 0.22, 600),
  post: () => { tone(1950, 0.35, 0.09, 'sine'); tone(2600, 0.25, 0.04, 'sine'); },
};
const BUZZ = { tap: 8, best: [12, 40, 18], ok: 15, bad: [40, 30, 40], false: 60, release: 12, goal: [20, 40, 60], save: 30, post: [10, 20, 10], start: 8 };

export function fx(kind) {
  try {
    const p = state.profile || {};
    if (p.sound !== false && SOUNDS[kind]) SOUNDS[kind]();
    if (p.haptics !== false && BUZZ[kind] && navigator.vibrate) navigator.vibrate(BUZZ[kind]);
  } catch (e) { /* звук — не критичная часть */ }
}
