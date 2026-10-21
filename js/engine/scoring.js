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

/* Очки только за качество решения: лучшее 10, «можно» 5, ошибка 1 (за попытку).
   Скорость в очки не входит — быстрый, но случайный ответ не должен выглядеть успехом.
   Время считается отдельно (medianTime) и только по верным ответам. */
export function itemPoints(it) {
  return (it.verdict === 'best' ? 10 : it.verdict === 'ok' ? 5 : it.verdict === 'risky' ? 3 : 1) + (it.read === true ? 3 : 0) + (it.why === true ? 2 : 0); // +3 прогноз, +2 «почему»
}

/* Предугадывание: доля верных прогнозов в шаге «Предскажи» за 30 дней (вне контрольного среза). */
export function readRate(sessions, { since = 30, now = new Date() } = {}) {
  const from = addDays(today(now), -since);
  let n = 0, ok = 0;
  for (const s of sessions) {
    if ((s.day || '') < from || s.module === 'test') continue;
    for (const it of s.items || []) if (typeof it.read === 'boolean') { n++; if (it.read) ok++; }
  }
  return { n, ok, rate: n ? ok / n : null };
}

/* «Быстро и точно»: время показываем как достижение, только когда принцип уже освоен
   (не меньше 5 ответов за 30 дней и 80 % лучших решений). */
export function fastAndSure(sessions, principle, timeMs) {
  if (!principle || !timeMs || timeMs >= 4000) return false;
  const a = accuracyBy(sessions, 'principle')[principle];
  return !!a && a.n >= 5 && a.rate >= 0.8;
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
    rec.decisions = (rec.decisions || 0) + (s.module === 'test' ? 0 : (s.items || []).filter(it => it.cardId).length);
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
  return { points, streak, bestStreak: Math.max(best, streak), days, todayItems: days[t] ? days[t].items : 0, todayDecisions: days[t] ? days[t].decisions || 0 : 0, rank: rankOf(points) };
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
  for (const s of sessions) if ((s.day || '') >= from && !String(s.module).startsWith('react:faceoff')) for (const it of s.items || []) if (it.timeMs > 0 && it.verdict === 'best' && it.cardId) t.push(it.timeMs);
  if (!t.length) return null;
  t.sort((a, b) => a - b);
  return t[Math.floor(t.length / 2)];
}

/* ---------- Чтение игры: точность шагов «Предскажи» и «Почему» по неделям ----------
   Неделя — 7 дней назад от сегодняшнего (последняя неделя — индекс weeks-1). Контрольный срез не входит.
   trend — разница точности последних двух недель и двух предыдущих (в долях), null если данных мало. */
export function readingTrend(sessions, { weeks = 6, now = new Date() } = {}) {
  const t = today(now);
  const buckets = Array.from({ length: weeks }, (_, i) => ({ from: addDays(t, -7 * (weeks - i) + 1), to: addDays(t, -7 * (weeks - 1 - i)), n: 0, ok: 0, why: 0, whyOk: 0 }));
  for (const s of sessions) {
    if (s.module === 'test') continue;
    const d = s.day || today(new Date(s.startedAt));
    const b = buckets.find(x => d >= x.from && d <= x.to);
    if (!b) continue;
    for (const it of s.items || []) {
      if (typeof it.read === 'boolean') { b.n++; if (it.read) b.ok++; }
      if (typeof it.why === 'boolean') { b.why++; if (it.why) b.whyOk++; }
    }
  }
  for (const b of buckets) { b.rate = b.n ? b.ok / b.n : null; b.whyRate = b.why ? b.whyOk / b.why : null; }
  const pool = arr => { const n = arr.reduce((a, b) => a + b.n, 0), ok = arr.reduce((a, b) => a + b.ok, 0); return n >= 4 ? ok / n : null; };
  const last = pool(buckets.slice(-2)), prev = pool(buckets.slice(-4, -2));
  const all = buckets.reduce((a, b) => ({ n: a.n + b.n, ok: a.ok + b.ok, why: a.why + b.why, whyOk: a.whyOk + b.whyOk }), { n: 0, ok: 0, why: 0, whyOk: 0 });
  return { weeks: buckets, n: all.n, rate: all.n ? all.ok / all.n : null, whyN: all.why, whyRate: all.why ? all.whyOk / all.why : null,
    trend: last != null && prev != null ? last - prev : null };
}

/* ---------- Уверенность: совпадает ли скорость ответа с его качеством ----------
   Берутся решения в карточках (не тренажёры, не срез). «Быстро» — быстрее личной медианы времени за тот же период
   (не меньше 1,5 с и не больше 6 с, чтобы граница была разумной и при малом числе ответов).
   Четыре клетки: быстро и верно (уверенное знание), медленно и верно (знает, но сомневается),
   быстро и неверно (спешит), медленно и неверно (не знает). Верно — лучшее или «можно». */
export function confidence(sessions, { since = 30, now = new Date() } = {}) {
  const from = addDays(today(now), -since);
  const items = [];
  for (const s of sessions) {
    if ((s.day || '') < from || s.module === 'test' || String(s.module || '').startsWith('react')) continue;
    for (const it of s.items || []) if (it.cardId && it.timeMs > 0 && it.verdict) items.push(it);
  }
  const res = { n: items.length, fastRight: 0, slowRight: 0, fastWrong: 0, slowWrong: 0, cut: null, label: null, text: null };
  if (items.length < 8) return res;
  const ts = items.map(i => i.timeMs).sort((a, b) => a - b);
  const cut = Math.max(1500, Math.min(6000, ts[Math.floor(ts.length / 2)]));
  res.cut = cut;
  for (const it of items) {
    const right = it.verdict === 'best' || it.verdict === 'ok', fast = it.timeMs <= cut;
    res[(fast ? 'fast' : 'slow') + (right ? 'Right' : 'Wrong')]++;
  }
  const fast = res.fastRight + res.fastWrong, slow = res.slowRight + res.slowWrong;
  res.fastAcc = fast ? res.fastRight / fast : null;
  res.slowAcc = slow ? res.slowRight / slow : null;
  const share = k => res[k] / res.n;
  if (share('fastWrong') >= 0.25 && (res.fastAcc ?? 1) < (res.slowAcc ?? 0)) {
    res.label = 'Спешит'; res.text = 'Быстрые ответы чаще ошибочны, чем обдуманные. Полезно на секунду дольше смотреть перед решением.';
  } else if (share('slowRight') >= 0.35 && share('fastRight') < 0.3) {
    res.label = 'Знает, но сомневается'; res.text = 'Решает верно, но долго. Знание есть — нужна уверенность: повторять знакомые ситуации на скорость.';
  } else if (share('fastRight') >= 0.4 && share('fastWrong') < 0.15) {
    res.label = 'Уверенно'; res.text = 'Быстрые ответы в основном верные: скорость совпадает с пониманием.';
  } else {
    res.label = 'Ровно'; res.text = 'Скорость и точность примерно одинаковы в быстрых и медленных ответах — явного перекоса нет.';
  }
  return res;
}
