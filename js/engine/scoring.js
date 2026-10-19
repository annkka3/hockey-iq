/* Очки, звания, серия и метрики. Всё считается из журнала сессий — одного источника правды,
   поэтому на двух устройствах и у родителя (а потом у тренера) цифры совпадают без слияния счётчиков. */
import { today, addDays } from './srs.js';

export const RANKS = [
  { pts: 0, name: 'Новичок' },
  { pts: 100, name: 'Юниор' },
  { pts: 250, name: 'Запасной' },
  { pts: 500, name: 'Четвёртое звено' },
  { pts: 800, name: 'Третье звено' },
  { pts: 1200, name: 'Второе звено' },
  { pts: 1700, name: 'Первое звено' },
  { pts: 2300, name: 'Ассистент' },
  { pts: 3000, name: 'Капитан' },
  { pts: 4000, name: 'Лидер лиги' },
  { pts: 5500, name: 'Сборная' },
  { pts: 7500, name: 'Легенда' },
];

/* Очки за ответ: лучшее 10, «можно» 5, ошибка 1 (за попытку). Быстрое лучшее решение (до 4 с) +3. */
export function itemPoints(it) {
  const base = it.verdict === 'best' ? 10 : it.verdict === 'ok' ? 5 : 1;
  return base + (it.verdict === 'best' && it.timeMs > 0 && it.timeMs < 4000 ? 3 : 0);
}

export function rankOf(points) {
  let i = 0;
  while (i + 1 < RANKS.length && points >= RANKS[i + 1].pts) i++;
  const cur = RANKS[i], next = RANKS[i + 1];
  return { index: i, name: cur.name, next: next ? next.name : null, toNext: next ? next.pts - points : 0,
           frac: next ? (points - cur.pts) / (next.pts - cur.pts) : 1 };
}

/* День засчитывается в серию, если за него дано 5 и больше ответов. */
const DAY_MIN_ITEMS = 5;

export function summarize(sessions, now = new Date()) {
  let points = 0;
  const days = {};       // день → { sec, items }
  for (const s of sessions) {
    const d = s.day || today(new Date(s.startedAt));
    const rec = days[d] || (days[d] = { sec: 0, items: 0 });
    rec.sec += s.durationSec || 0;
    rec.items += (s.items || []).length;
    for (const it of s.items || []) points += itemPoints(it);
  }
  const counted = d => days[d] && days[d].items >= DAY_MIN_ITEMS;
  const t = today(now);
  let streak = 0;
  let d = counted(t) ? t : addDays(t, -1);
  while (counted(d)) { streak++; d = addDays(d, -1); }
  let best = 0, run = 0;
  const all = Object.keys(days).sort();
  let prev = null;
  for (const x of all) {
    if (!counted(x)) { run = 0; prev = x; continue; }
    run = prev && addDays(prev, 1) === x && counted(prev) ? run + 1 : 1;
    best = Math.max(best, run);
    prev = x;
  }
  return { points, streak, bestStreak: Math.max(best, streak), days, todayItems: days[t] ? days[t].items : 0, rank: rankOf(points) };
}

/* Точность по полю (principle, phase): доля лучших решений, окно — последние 30 дней. */
export function accuracyBy(sessions, field, { since = 30, now = new Date() } = {}) {
  const from = addDays(today(now), -since);
  const acc = {};
  for (const s of sessions) {
    if ((s.day || '') < from) continue;
    for (const it of s.items || []) {
      const k = it[field];
      if (!k) continue;
      const a = acc[k] || (acc[k] = { n: 0, best: 0, ok: 0 });
      a.n++;
      if (it.verdict === 'best') a.best++;
      if (it.verdict === 'ok') a.ok++;
    }
  }
  for (const k in acc) acc[k].rate = acc[k].best / acc[k].n;
  return acc;
}

export function medianTime(sessions, { since = 14, now = new Date() } = {}) {
  const from = addDays(today(now), -since);
  const t = [];
  for (const s of sessions) if ((s.day || '') >= from) for (const it of s.items || []) if (it.timeMs > 0) t.push(it.timeMs);
  if (!t.length) return null;
  t.sort((a, b) => a - b);
  return t[Math.floor(t.length / 2)];
}
