/* Мелкие помощники интерфейса: сборка DOM, иконки, тост, нижний лист. */

export function h(tag, attrs, ...kids) {
  const [name, ...cls] = tag.split('.');
  const n = document.createElement(name || 'div');
  if (cls.length) n.className = cls.join(' ');
  if (attrs != null && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) { kids.unshift(attrs); attrs = null; }
  for (const k in attrs || {}) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (k === 'html') n.innerHTML = v;
    else if (k === 'class') n.className += (n.className ? ' ' : '') + v;
    else if (k === 'style' && typeof v === 'object') for (const s in v) s.startsWith('--') ? n.style.setProperty(s, v[s]) : (n.style[s] = v[s]);
    else n.setAttribute(k, v === true ? '' : v);
  }
  const add = k => {
    if (k == null || k === false) return;
    if (Array.isArray(k)) k.forEach(add);
    else n.appendChild(k instanceof Node ? k : document.createTextNode(String(k)));
  };
  kids.forEach(add);
  return n;
}

export const svg = (markup, cls = '') => {
  const t = document.createElement('template');
  t.innerHTML = markup.trim();
  const n = t.content.firstChild;
  if (cls) n.setAttribute('class', cls);
  return n;
};

const I = (d, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;

export const ICONS = {
  today: I('<path d="M12 3v3M12 18v3M3 12h3M18 12h3"/><circle cx="12" cy="12" r="5"/>'),
  decks: I('<rect x="4" y="5" width="12" height="15" rx="2"/><path d="M8 3h10a2 2 0 0 1 2 2v13"/><path d="M7 10h6M7 14h4"/>'),
  shot: I('<path d="M4 20 14 10"/><path d="m14 10 3-1 1-3"/><circle cx="19" cy="5" r="1.6" fill="currentColor"/><path d="M3 21h4"/>'),
  react: I('<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z"/>'),
  me: I('<path d="M6 21v-2a6 6 0 0 1 12 0v2"/><path d="M8 3h8l2 5-3 1v3H9V9L6 8z"/>'),
  close: I('<path d="M6 6l12 12M18 6 6 18"/>'),
  fire: I('<path d="M12 22c4 0 7-3 7-7 0-4-3-6-4-9-1 2-2 3-4 3 0-2-1-4-3-6 0 4-3 6-3 11 0 4 3 8 7 8z"/>'),
  bolt: I('<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z"/>'),
  lock: I('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
  stick: I('<path d="M6 3l7 14h6"/><circle cx="8" cy="19" r="2" fill="currentColor"/>'),
  noPuck: I('<path d="M12 4l7 4v8l-7 4-7-4V8z"/><circle cx="12" cy="12" r="2"/>'),
  puck: I('<ellipse cx="12" cy="9" rx="8" ry="3"/><path d="M4 9v5c0 1.7 3.6 3 8 3s8-1.3 8-3V9"/>'),
  faceoff: I('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><path d="M12 2v4M12 18v4"/>'),
  match: I('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M12 5v14"/><circle cx="12" cy="12" r="2.5"/>'),
  shield: I('<path d="M12 3 5 6v6c0 4 3 7 7 9 4-2 7-5 7-9V6z"/>'),
  back: I('<path d="M15 6l-6 6 6 6"/>'),
};

export const icon = name => svg(ICONS[name]);

let toastTimer;
export function toast(text) {
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const t = h('div.toast', text);
  document.body.appendChild(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), 2400);
}

export function sheet(build) {
  const back = h('div.sheet-back');
  const box = h('div.sheet');
  const close = () => back.remove();
  back.addEventListener('click', e => { if (e.target === back) close(); });
  box.append(...[].concat(build(close)));
  back.appendChild(box);
  document.body.appendChild(back);
  return close;
}

export function ring(value, total, label) {
  const r = 42, c = 2 * Math.PI * r, f = total ? Math.min(1, value / total) : 0;
  return svg(`<svg class="ring" viewBox="0 0 100 100">
    <circle class="track" cx="50" cy="50" r="${r}" fill="none" stroke-width="8"/>
    <circle class="bar" cx="50" cy="50" r="${r}" fill="none" stroke-width="8" stroke-linecap="round"
      stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - f)}" transform="rotate(-90 50 50)"/>
    <text x="50" y="52" text-anchor="middle" font-size="24">${value}</text>
    <text class="sub" x="50" y="70" text-anchor="middle" font-size="10">${label}</text>
  </svg>`);
}

export const meter = (frac, gold) => h('div.meter' + (gold ? '.gold' : ''), h('i', { style: { width: Math.round(Math.max(0, Math.min(1, frac)) * 100) + '%' } }));

export const plural = (n, one, few, many) => {
  const a = Math.abs(n) % 100, b = a % 10;
  return a > 10 && a < 20 ? many : b > 1 && b < 5 ? few : b === 1 ? one : many;
};

export const fmtSec = s => s < 60 ? `${s} с` : `${Math.round(s / 60)} мин`;
