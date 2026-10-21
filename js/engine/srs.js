/* Интервальное повторение. Ключ — карточка или карточка+вариант контекста ("c-nz-01|score:lead").
   Ящики 0..6 → интервалы в днях. Лучшее решение — ящик вверх, «можно» — интервал держится,
   ошибка — карточка завтра снова и счётчик срывов растёт. */

export const INTERVALS = [0, 1, 2, 4, 7, 14, 30];

export const today = (d = new Date()) => {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
};
export const addDays = (day, n) => {
  const d = new Date(day + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return today(d);
};

export function review(rec, verdict, now = Date.now()) {
  const r = { box: 0, due: today(), seen: 0, best: 0, ok: 0, bad: 0, lapses: 0, hist: '', ...rec };
  r.seen++;
  r[verdict] = (r[verdict] || 0) + 1;
  // история ответов: + лучшее, ~ можно, x ошибка (раньше best и bad оба писались «b» — поле hist больше не используется)
  r.h2 = ((r.h2 || '') + (verdict === 'best' ? '+' : verdict === 'bad' ? 'x' : '~')).slice(-8);
  if (verdict === 'best') r.box = Math.min(r.box + 1, INTERVALS.length - 1);
  else if (verdict === 'ok' || verdict === 'risky') r.box = Math.max(r.box, 1); // рискованное — как «можно»: держим, но не продвигаем
  else { r.box = 1; r.lapses++; }
  r.due = addDays(today(new Date(now)), INTERVALS[r.box]);
  r.last = now;
  return r;
}

/* «Застрявшая»: две ошибки среди трёх последних ответов или три срыва. */
export const isStuck = r => !!r && (((r.h2 || '').slice(-3).match(/x/g) || []).length >= 2 || r.lapses >= 3);
export const isLearned = r => !!r && r.box >= 3;

/* Восстановление истории ответов (h2) для старых записей прогресса по журналу сессий — один раз при обновлении.
   Берутся только ответы, которые меняли интервалы: не контрольный срез, не зеркальные варианты, не тренажёры
   и не бросок. Записи, у которых h2 уже есть, не трогаются. Возвращает число восстановленных записей. */
export function rebuildH2(progress, sessions) {
  const hist = {};
  const list = [...(sessions || [])].sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0));
  for (const s of list) {
    if (!s || s.module === 'test' || /^(react|shot|film|vision)/.test(s.module || '')) continue;
    for (const it of s.items || []) {
      if (!it || !it.key || it.mirrored || !it.verdict) continue;
      hist[it.key] = (hist[it.key] || '') + (it.verdict === 'best' ? '+' : it.verdict === 'bad' ? 'x' : '~');
    }
  }
  let n = 0;
  for (const k in progress) {
    const r = progress[k];
    if (!r || r.h2 || !hist[k]) continue;
    r.h2 = hist[k].slice(-8); n++;
  }
  return n;
}

/* Набор на сессию: сначала просроченные, затем новые (не больше maxNew), добивка — самые слабые, потом снова новые. */
export function buildQueue(keys, progress, { size = 10, maxNew = 5, day = today() } = {}) {
  const due = [], fresh = [], rest = [];
  for (const k of keys) {
    const r = progress[k];
    if (!r) fresh.push(k);
    else if (r.due <= day) due.push(k);
    else rest.push(k);
  }
  due.sort((a, b) => (progress[a].due < progress[b].due ? -1 : 1));
  rest.sort((a, b) => (progress[a].box - progress[b].box) || (progress[a].due < progress[b].due ? -1 : 1));
  const q = due.slice(0, size);
  for (const k of fresh) { if (q.length >= size || q.length - Math.min(due.length, size) >= maxNew) break; q.push(k); }
  for (const k of rest) { if (q.length >= size) break; q.push(k); }
  for (const k of fresh) { if (q.length >= size) break; if (!q.includes(k)) q.push(k); } // первые дни: добиваем новыми
  return q;
}
