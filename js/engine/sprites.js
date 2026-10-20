/* Иллюстрированные спрайты (векторные, рисуются один раз в картинку и переиспользуются).
   Полевой игрок: три ракурса — лицом (front), боком (side, смотрит влево; вправо — зеркально), спиной (back).
   Холст 200 × 300, точка опоры — между коньками (100, 294). Клюшка в спрайт не входит: она рисуется в мировых
   координатах сцены, чтобы крюк стоял ровно там же, где на схеме, и на стороне хвата.
   Вратарь собирается из частей (маска, нагрудник, щитки, ловушка, блин, клюшка) — каждая встаёт в свой
   прямоугольник модели броска: что видно, то и считается. */

export const TEAMS = {
  us: { main: '#1B3F7A', dark: '#102A55', light: '#2C5BA3', trim: '#FFFFFF', pants: '#121A2B', glove: '#1B3F7A', helmet: '#1B3F7A' },
  them: { main: '#D42A3C', dark: '#9E1828', light: '#EA4A5B', trim: '#FFFFFF', pants: '#1A1418', glove: '#B91F31', helmet: '#D42A3C' },
};
const SKIN = '#F2C8A6', SKIN_D = '#D9A784', STEEL = '#C9D3DD', BOOT = '#16191E';

/* Точки перчаток в координатах спрайта (для клюшки): верхняя и нижняя рука. */
export const GLOVES = {
  front: [[64, 178], [138, 170]],
  side: [[66, 176], [52, 196]],
  back: [[62, 172], [138, 176]],
};

function cage(cx, cy, w, h, col = '#2A2F36') {
  let s = '';
  for (let i = -2; i <= 2; i++) s += `<line x1="${cx + i * w / 5}" y1="${cy - h / 2}" x2="${cx + i * w / 5}" y2="${cy + h / 2}" stroke="${col}" stroke-width="1.6"/>`;
  for (let j = -1; j <= 1; j++) s += `<line x1="${cx - w / 2}" y1="${cy + j * h / 3.2}" x2="${cx + w / 2}" y2="${cy + j * h / 3.2}" stroke="${col}" stroke-width="1.6"/>`;
  return s;
}

/* Ноги в игровой стойке: широко, колени согнуты, гетры с полосами, коньки с лезвием. */
function legsFront(t) {
  return `
  <path d="M44 276 q-4 12 4 14 h30 q6 0 6-6 v-10z" fill="${BOOT}"/>
  <path d="M120 274 v10 q0 6 6 6 h30 q8-2 4-16z" fill="${BOOT}"/>
  <path d="M44 293 h40 M118 293 h40" stroke="${STEEL}" stroke-width="3.5" stroke-linecap="round"/>
  <path d="M50 280 h30 M124 278 h30" stroke="#FFFFFF" stroke-width="1.6" opacity=".35"/>
  <path d="M66 206 h30 l-8 34 -6 38 h-30 l6-40z" fill="${t.main}"/>
  <path d="M104 206 h30 l10 34 6 38 h-30 l-6-38z" fill="${t.main}"/>
  <path d="M58 244 h32 l-1 7 h-32z M56 256 h32 l-1 4 h-32z M110 244 h32 l1 7 h-32z M112 256 h32 l1 4 h-32z" fill="${t.trim}"/>
  <path d="M84 206 h12 l-8 34 -6 38 h-8 l6-38z M116 206 h10 l10 34 6 38 h-8 l-6-38z" fill="${t.dark}" opacity=".35"/>
  <ellipse cx="80" cy="232" rx="10" ry="7" fill="${t.light}" opacity=".5"/><ellipse cx="122" cy="232" rx="10" ry="7" fill="${t.light}" opacity=".5"/>`;
}

function skaterFront(t, num) {
  return `
  ${legsFront(t)}
  <!-- трусы -->
  <path d="M56 160 h88 l6 54 q-20 6-40 0 l-10-18 -10 18 q-20 6-40 0z" fill="${t.pants}"/>
  <path d="M58 168 l-4 44 h7 l4-44z M142 168 l4 44 h-7 l-4-44z" fill="${t.main}"/>
  <!-- свитер -->
  <path d="M46 92 q54-22 108 0 l8 40 -12 4 -4 30 q-46 10-92 0 l-4-30 -12-4z" fill="${t.main}"/>
  <path d="M100 76 q30 4 54 16 l3 12 q-28-12-57-12 q-29 0-57 12 l3-12 q24-12 54-16z" fill="${t.trim}"/>
  <path d="M54 146 q46 10 92 0 v8 q-46 10-92 0z" fill="${t.trim}"/>
  <path d="M54 156 q46 10 92 0 v6 q-46 10-92 0z" fill="${t.dark}"/>
  <path d="M120 98 q24 6 34 0 l8 34 -12 4 -4 30 q-14 4-26 4z" fill="${t.dark}" opacity=".35"/>
  <!-- рукава к перчаткам -->
  <path d="M46 92 q-12 30-4 62 q4 18 18 24 l10-8 q-10-22-6-50z" fill="${t.main}"/>
  <path d="M154 92 q14 28 6 58 q-4 16-18 22 l-8-10 q8-20 4-46z" fill="${t.main}"/>
  <path d="M42 140 l20-4 2 8 -20 4z M158 136 l-20-2 -2 8 20 2z" fill="${t.trim}"/>
  <!-- перчатки -->
  <rect x="50" y="166" width="28" height="24" rx="8" fill="${t.glove}" stroke="#0B0F14" stroke-width="2"/>
  <rect x="124" y="158" width="28" height="24" rx="8" fill="${t.glove}" stroke="#0B0F14" stroke-width="2"/>
  <path d="M54 172 h20 M128 164 h20" stroke="#0B0F14" stroke-width="1.5" opacity=".5"/>
  <!-- эмблема -->
  <circle cx="100" cy="120" r="13" fill="${t.trim}"/><circle cx="100" cy="120" r="9" fill="${t.dark}"/>
  <text x="100" y="125" font-family="Arial Black, Arial" font-weight="900" font-size="12" fill="${t.trim}" text-anchor="middle">${num}</text>
  <!-- шея, голова, шлем с решёткой -->
  <rect x="88" y="70" width="24" height="12" rx="4" fill="#20262E"/>
  <ellipse cx="100" cy="52" rx="23" ry="26" fill="${SKIN}"/>
  <path d="M78 48 q-2-30 22-32 q24 2 22 32 l-4 2 q-2-12-18-12 q-16 0-18 12z" fill="${t.helmet}"/>
  <path d="M77 46 h46 v6 h-46z" fill="${t.dark}"/>
  <path d="M86 26 q10-6 22-2" stroke="#FFFFFF" stroke-width="3" opacity=".45" fill="none" stroke-linecap="round"/>
  <circle cx="91" cy="56" r="2.4" fill="#2A2F36"/><circle cx="109" cy="56" r="2.4" fill="#2A2F36"/>
  <path d="M93 67 q7 4 14 0" stroke="${SKIN_D}" stroke-width="2" fill="none"/>
  ${cage(100, 61, 40, 30)}
  <path d="M80 48 q20 30 40 0" stroke="#2A2F36" stroke-width="2.2" fill="none"/>`;
}

function skaterBack(t, num) {
  return `
  ${legsFront(t)}
  <path d="M56 160 h88 l6 54 q-20 6-40 0 l-10-18 -10 18 q-20 6-40 0z" fill="${t.pants}"/>
  <path d="M58 168 l-4 44 h7 l4-44z M142 168 l4 44 h-7 l-4-44z" fill="${t.main}"/>
  <path d="M46 92 q54-18 108 0 l8 40 -12 4 -4 30 q-46 10-92 0 l-4-30 -12-4z" fill="${t.main}"/>
  <path d="M54 146 q46 10 92 0 v8 q-46 10-92 0z" fill="${t.trim}"/>
  <path d="M54 156 q46 10 92 0 v6 q-46 10-92 0z" fill="${t.dark}"/>
  <path d="M46 92 q54-18 108 0 l2 10 q-56-16-112 0z" fill="${t.trim}"/>
  <path d="M46 92 q-12 30-4 62 q4 18 18 24 l10-8 q-10-22-6-50z" fill="${t.main}"/>
  <path d="M154 92 q14 28 6 58 q-4 16-18 22 l-8-10 q8-20 4-46z" fill="${t.main}"/>
  <path d="M42 140 l20-4 2 8 -20 4z M158 136 l-20-2 -2 8 20 2z" fill="${t.trim}"/>
  <rect x="48" y="160" width="28" height="24" rx="8" fill="${t.glove}" stroke="#0B0F14" stroke-width="2"/>
  <rect x="124" y="164" width="28" height="24" rx="8" fill="${t.glove}" stroke="#0B0F14" stroke-width="2"/>
  <text x="100" y="140" font-family="Arial Black, Arial" font-weight="900" font-size="38" fill="${t.trim}" stroke="${t.dark}" stroke-width="2" text-anchor="middle">${num}</text>
  <rect x="88" y="72" width="24" height="10" rx="4" fill="#20262E"/>
  <path d="M77 56 q-2-40 23-40 q25 0 23 40 q-2 18-23 20 q-21-2-23-20z" fill="${t.helmet}"/>
  <path d="M80 40 q20-12 40 0" stroke="${t.dark}" stroke-width="3" fill="none"/>
  <path d="M86 26 q10-6 22-2" stroke="#FFFFFF" stroke-width="3" opacity=".45" fill="none" stroke-linecap="round"/>
  <path d="M77 52 h46" stroke="${t.dark}" stroke-width="4"/>
  <path d="M76 58 q-2 8 4 14 M124 58 q2 8-4 14" stroke="#2A2F36" stroke-width="2" fill="none"/>`;
}

function skaterSide(t, num) {
  // в профиль, смотрит влево, глубокая игровая стойка: корпус наклонён вперёд, колени согнуты
  return `
  <path d="M38 280 q-4 8 4 10 h40 q6 0 6-6 v-8z" fill="${BOOT}"/>
  <path d="M118 278 q-2 8 6 10 h36 q6 0 4-8 l-4-6z" fill="${BOOT}"/>
  <path d="M36 292 h50 M120 291 h44" stroke="${STEEL}" stroke-width="3" stroke-linecap="round"/>
  <!-- передняя нога: бедро вперёд-вниз, голень назад к коньку -->
  <path d="M88 196 l-38 30 l8 54 h26 l-6-48 30-24z" fill="${t.main}"/>
  <path d="M58 240 h22 v6 h-22z M60 252 h22 v4 h-22z" fill="${t.trim}"/>
  <!-- задняя нога, толчковая -->
  <path d="M108 192 l32 36 -8 52 h-24 l4-46 -26-30z" fill="${t.dark}"/>
  <path d="M112 240 h20 v6 h-20z" fill="${t.trim}" opacity=".9"/>
  <!-- трусы -->
  <path d="M74 160 q30-10 50 4 l4 38 q-24 10-54 0z" fill="${t.pants}"/>
  <path d="M120 164 l6 38 h-6 l-6-38z" fill="${t.main}"/>
  <!-- корпус с наклоном -->
  <path d="M64 98 q30-22 62-6 l10 40 q2 22-8 36 q-30 8-56-2 q-12-26-8-68z" fill="${t.main}"/>
  <path d="M70 154 q28 10 58 2 l2 8 q-30 10-60 0z" fill="${t.trim}"/>
  <path d="M64 98 q30-22 62-6 l2 8 q-34-14-62 8z" fill="${t.trim}"/>
  <text x="104" y="136" font-family="Arial Black, Arial" font-weight="900" font-size="20" fill="${t.trim}" text-anchor="middle" opacity=".95">${num}</text>
  <!-- рука вперёд к клюшке -->
  <path d="M78 108 q-24 30-20 66 l14 2 q-2-30 18-58z" fill="${t.main}"/>
  <path d="M60 154 l14 2 -1 8 -14-2z" fill="${t.trim}"/>
  <rect x="54" y="166" width="26" height="22" rx="8" fill="${t.glove}" stroke="#0B0F14" stroke-width="2"/>
  <rect x="40" y="186" width="24" height="20" rx="7" fill="${t.glove}" stroke="#0B0F14" stroke-width="2"/>
  <!-- голова в профиль: шлем, решётка, подбородок -->
  <rect x="70" y="80" width="18" height="14" rx="4" fill="#20262E"/>
  <path d="M58 70 q-4-30 22-34 q26 0 28 26 q0 18-14 24 q-20 6-32-4z" fill="${SKIN}"/>
  <path d="M60 58 q2-30 28-28 q22 4 22 30 l-8 2 q-4-16-20-16 q-14 0-18 14z" fill="${t.helmet}"/>
  <path d="M58 56 h50" stroke="${t.dark}" stroke-width="4"/>
  ${cage(58, 70, 18, 28)}
  <path d="M48 58 q-4 20 8 30" stroke="#2A2F36" stroke-width="2.4" fill="none"/>`;
}

/* --- вратарь по частям (вид спереди), каждая часть вписывается в свой прямоугольник --- */
export function goaliePart(id, t, stance) {
  if (id === 'head') return { w: 100, h: 110, svg: `
    <path d="M14 60 q-6-56 36-58 q42 2 36 58 q-2 30-36 46 q-34-16-36-46z" fill="#F4F7FA" stroke="#1B2430" stroke-width="3"/>
    <path d="M18 40 q32-30 64 0 l-2 10 q-30-20-60 0z" fill="${t.main}"/>
    <path d="M26 30 q24-14 48 0" stroke="${t.trim}" stroke-width="4" fill="none"/>
    <ellipse cx="50" cy="66" rx="24" ry="26" fill="${SKIN}"/>
    <circle cx="41" cy="62" r="3" fill="#2A2F36"/><circle cx="59" cy="62" r="3" fill="#2A2F36"/>
    ${cage(50, 70, 50, 46, '#3A4450')}
    <path d="M26 94 q24 20 48 0" stroke="#1B2430" stroke-width="3" fill="#E6ECF2"/>` };
  if (id === 'body') return { w: 200, h: 170, svg: `
    <path d="M18 34 q82-40 164 0 l14 70 -26 6 -4 56 q-66 16-132 0 l-4-56 -26-6z" fill="${t.main}" stroke="${t.dark}" stroke-width="3"/>
    <path d="M18 34 q82-40 164 0 l4 16 q-86-34-172 0z" fill="${t.trim}"/>
    <path d="M28 112 q72 20 144 0 v12 q-72 20-144 0z" fill="${t.trim}"/>
    <path d="M28 126 q72 20 144 0 v8 q-72 20-144 0z" fill="#1B2A4A"/>
    <path d="M70 18 l30 30 30-30" stroke="${t.trim}" stroke-width="6" fill="none"/>
    <path d="M140 40 q34 8 42 0 l14 64 -26 6 -4 56 q-14 4-26 4z" fill="${t.dark}" opacity=".3"/>` };
  if (id === 'glove') return { w: 120, h: 120, svg: `
    <path d="M14 70 q-8-56 46-62 q54 2 52 54 q-2 46-46 54 q-46-2-52-46z" fill="#F4F7FA" stroke="#1B2430" stroke-width="3"/>
    <path d="M34 44 q26-24 54 0 q6 26-26 40 q-34-10-28-40z" fill="#DDE4EB"/>
    <path d="M40 40 l44 36 M52 32 l32 50 M36 58 l36 26" stroke="#9AA6B2" stroke-width="2"/>
    <path d="M24 92 q36 20 72 0 l2 12 q-38 22-76 0z" fill="${t.main}"/>` };
  if (id === 'blocker') return { w: 100, h: 120, svg: `
    <rect x="6" y="6" width="88" height="108" rx="12" fill="#F4F7FA" stroke="#1B2430" stroke-width="3"/>
    <rect x="18" y="20" width="64" height="78" rx="6" fill="none" stroke="${t.main}" stroke-width="7"/>
    <path d="M22 108 h56" stroke="${t.main}" stroke-width="6"/>` };
  if (id === 'stick') return { w: 200, h: 60, svg: `
    <path d="M70 6 h60 v30 h56 q10 0 10 10 v6 q0 6-8 6 h-176 q-8 0-8-6 v-6 q0-10 10-10 h56z" fill="#1B1E23"/>
    <path d="M86 6 h28 v30 h-28z" fill="#C9A26A"/>
    <path d="M20 44 h160" stroke="#FFFFFF" stroke-width="5" opacity=".85"/>` };
  // щитки: в стойке — два вертикальных, в бабочке — лежат на льду носками наружу
  if (id === 'legL' || id === 'legR' || id === 'pad') return { w: 90, h: 200, svg: `
    <rect x="6" y="4" width="78" height="188" rx="18" fill="#F4F7FA" stroke="#1B2430" stroke-width="3"/>
    <path d="M14 50 h62 M14 90 h62 M14 130 h62" stroke="#C3CDD7" stroke-width="3"/>
    <path d="M10 70 l70 -30 v20 l-70 30z" fill="${t.main}"/>
    <path d="M10 150 l70 -26 v14 l-70 26z" fill="#1B2A4A"/>
    <rect x="16" y="176" width="58" height="14" rx="6" fill="#1B2430"/>` };
  if (id === 'pads') return { w: 300, h: 90, svg: `
    <path d="M8 40 q0-30 30-30 h104 q8 0 8 10 v54 q0 10-10 10 h-108 q-24 0-24-20z" fill="#F4F7FA" stroke="#1B2430" stroke-width="3"/>
    <path d="M292 40 q0-30-30-30 h-104 q-8 0-8 10 v54 q0 10 10 10 h108 q24 0 24-20z" fill="#F4F7FA" stroke="#1B2430" stroke-width="3"/>
    <path d="M50 12 v70 M90 12 v70 M210 12 v70 M250 12 v70" stroke="#C3CDD7" stroke-width="3"/>
    <path d="M60 14 l40 66 h18 l-40-66z M240 14 l-40 66 h-18 l40-66z" fill="${t.main}"/>
    <path d="M8 66 h30 M262 66 h30" stroke="#1B2A4A" stroke-width="8"/>` };
  return null;
}

/* Целый вратарь для вида «Глазами» (издалека): спереди или со спины. */
function goalieWhole(t, back) {
  if (back) return `
    <rect x="52" y="196" width="40" height="96" rx="10" fill="#F4F7FA" stroke="#1B2430" stroke-width="3"/>
    <rect x="108" y="196" width="40" height="96" rx="10" fill="#F4F7FA" stroke="#1B2430" stroke-width="3"/>
    <path d="M40 104 q60-24 120 0 l8 66 q-68 18-136 0z" fill="${t.main}" stroke="${t.dark}" stroke-width="3"/>
    <path d="M36 150 q64 16 128 0 v10 q-64 16-128 0z" fill="${t.trim}"/>
    <text x="100" y="146" font-family="Arial Black, Arial" font-weight="900" font-size="30" fill="${t.trim}" text-anchor="middle">1</text>
    <path d="M60 172 h80 v28 h-80z" fill="${t.pants}"/>
    <path d="M70 92 q-4-44 30-46 q34 2 30 46 q-4 16-30 18 q-26-2-30-18z" fill="#F4F7FA" stroke="#1B2430" stroke-width="3"/>
    <path d="M74 70 q26-20 52 0" stroke="${t.main}" stroke-width="8" fill="none"/>`;
  return `
    <rect x="44" y="196" width="48" height="96" rx="12" fill="#F4F7FA" stroke="#1B2430" stroke-width="3"/>
    <rect x="108" y="196" width="48" height="96" rx="12" fill="#F4F7FA" stroke="#1B2430" stroke-width="3"/>
    <path d="M48 230 l40-16 v10 l-40 16z M112 230 l40-16 v10 l-40 16z" fill="${t.main}"/>
    <path d="M36 104 q64-26 128 0 l8 70 q-72 18-144 0z" fill="${t.main}" stroke="${t.dark}" stroke-width="3"/>
    <path d="M36 104 q64-26 128 0 l2 10 q-66-24-132 0z" fill="${t.trim}"/>
    <path d="M32 154 q68 16 136 0 v10 q-68 16-136 0z" fill="${t.trim}"/>
    <path d="M60 174 h80 v26 h-80z" fill="${t.pants}"/>
    <path d="M150 140 q20-24 40-6 q10 26-14 40 q-28-4-26-34z" fill="#F4F7FA" stroke="#1B2430" stroke-width="3"/>
    <rect x="12" y="132" width="32" height="40" rx="6" fill="#F4F7FA" stroke="#1B2430" stroke-width="3"/>
    <path d="M30 172 l36 110 h40" stroke="#1B1E23" stroke-width="8" fill="none" stroke-linecap="round"/>
    <path d="M70 92 q-4-44 30-46 q34 2 30 46 q-4 16-30 18 q-26-2-30-18z" fill="#F4F7FA" stroke="#1B2430" stroke-width="3"/>
    <path d="M74 66 q26-18 52 0" stroke="${t.main}" stroke-width="8" fill="none"/>
    <ellipse cx="100" cy="82" rx="18" ry="20" fill="${SKIN}"/>
    ${cage(100, 86, 36, 34, '#3A4450')}`;
}

/* ---------- сборка в картинки, кэш ---------- */
const cache = new Map();
function toImage(svg, w, h) {
  const img = new Image();
  img.decoding = 'async';
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w * 2}" height="${h * 2}">${svg}</svg>`);
  return img;
}
export function skaterImage(team, view, num) {
  const k = `s|${team}|${view}|${view === 'back' || view === 'side' ? num : ''}`;
  if (!cache.has(k)) {
    const t = TEAMS[team] || TEAMS.us;
    const body = view === 'back' ? skaterBack(t, num) : view === 'side' ? skaterSide(t, num) : skaterFront(t, view === 'front' ? '' : num);
    cache.set(k, toImage(body, 200, 300));
  }
  return cache.get(k);
}
export function goalieImage(team, back) {
  const k = `g|${team}|${back ? 1 : 0}`;
  if (!cache.has(k)) cache.set(k, toImage(goalieWhole(TEAMS[team] || TEAMS.them, back), 200, 300));
  return cache.get(k);
}
export function goaliePartImage(id, team = 'them') {
  const k = `gp|${team}|${id}`;
  if (!cache.has(k)) {
    const p = goaliePart(id, TEAMS[team] || TEAMS.them);
    cache.set(k, p ? toImage(p.svg, p.w, p.h) : null);
  }
  return cache.get(k);
}
/* Заранее подготовить всё, что понадобится, — чтобы картинки не появлялись с задержкой посреди сцены. */
export function preload() {
  for (const team of ['us', 'them']) {
    for (const v of ['front', 'side']) skaterImage(team, v, '');
    goalieImage(team, false); goalieImage(team, true);
  }
  for (const id of ['head', 'body', 'glove', 'blocker', 'stick', 'legL', 'pads']) goaliePartImage(id);
}
export const ready = img => img && img.complete && img.naturalWidth > 0;
