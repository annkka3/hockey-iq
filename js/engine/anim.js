/* Мини-движок анимации: твины на requestAnimationFrame, отмена, глобальная скорость.
   Ничего не знает о хоккее — только время и прогресс 0..1. */

export const ease = {
  linear: t => t,
  inOut: t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  out: t => 1 - Math.pow(1 - t, 3),
};

let token = 0;
let scale = 1;

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
      el += Math.max(0, now - last) * scale; last = now;
      const t = Math.min(1, el / ms);
      onFrame(curve(t));
      if (t < 1) requestAnimationFrame(step); else resolve(true);
    };
    requestAnimationFrame(step);
  });
}

export const wait = ms => new Promise(r => setTimeout(r, ms));

export const lerp = (a, b, t) => a + (b - a) * t;
