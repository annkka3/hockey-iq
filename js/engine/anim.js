/* Мини-движок анимации: твины на requestAnimationFrame, отмена, глобальная скорость.
   Ничего не знает о хоккее — только время и прогресс 0..1. */

export const ease = {
  linear: t => t,
  inOut: t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  out: t => 1 - Math.pow(1 - t, 3),
};

let token = 0;
let scale = 1;

/* Вкладка скрыта — время сцены стоит. Шаг кадра не больше MAX_DT: после паузы или возврата во вкладку
   ничего не перескакивает вперёд (requestAnimationFrame в фоне не идёт, а потом даёт огромный dt). */
export const MAX_DT = 50;
let hidden = typeof document !== 'undefined' && document.hidden;
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { hidden = document.hidden; });
export const isHidden = () => hidden;
/* Безопасный шаг времени между кадрами, мс. */
export const frameDt = (now, last) => (hidden ? 0 : Math.min(MAX_DT, Math.max(0, now - last)));

/* Глобальная скорость анимации (замедленный просмотр в разборах): 0,5 — вдвое медленнее. */
export function setTimeScale(k) { scale = k > 0 ? k : 1; }

/* Отменяет все идущие твины (например, игрок свайпнул «пропустить»). */
export function cancelAll() { token++; }

export function tween(ms, onFrame, curve = ease.inOut) {
  const my = token;
  return new Promise(resolve => {
    if (ms <= 0) { onFrame(1); resolve(true); return; }
    let last = performance.now(), el = 0;
    const step = now => {
      if (my !== token) { onFrame(1); resolve(false); return; }
      el += frameDt(now, last) * scale; last = now;
      const t = Math.min(1, el / ms);
      onFrame(curve(t));
      if (t < 1) requestAnimationFrame(step); else resolve(true);
    };
    requestAnimationFrame(step);
  });
}

/* Пауза по времени сцены: пока вкладка скрыта, не идёт. */
export const wait = ms => new Promise(r => {
  let left = ms, last = performance.now();
  const tick = () => { const now = performance.now(); left -= frameDt(now, last) * (hidden ? 0 : 1); last = now; if (left <= 0) r(); else setTimeout(tick, Math.min(50, Math.max(4, left))); };
  setTimeout(tick, Math.min(50, ms));
});

export const lerp = (a, b, t) => a + (b - a) * t;
