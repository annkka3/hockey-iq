/* Service worker: приложение живёт на телефоне и открывается без интернета.
   Страница, скрипты, стили и контент — сначала сеть (обновления приходят сразу), без сети — из кэша.
   Шрифты, иконки, библиотеки — сначала кэш. Трафик Firebase не трогаем.
   Префикс кэша свой (hk-): на домене annkka3.github.io живут и другие приложения, их кэши не задеваем. */
const VERSION = 'v21';
const PREFIX = 'hk-shell-';
const CACHE = PREFIX + VERSION;
const CORE = [
  './', 'index.html', 'config.js', 'store.js', 'manifest.webmanifest', 'css/style.css',
  'js/main.js', 'js/ui.js', 'js/content.js',
  'js/core/state.js', 'js/core/sync.js',
  'js/engine/rink.js', 'js/engine/render.js', 'js/engine/anim.js', 'js/engine/srs.js', 'js/engine/scoring.js', 'js/engine/shot.js', 'js/engine/sim.js', 'js/engine/pov.js', 'js/engine/sprites.js',
  'js/modules/today.js', 'js/modules/decks.js', 'js/modules/play.js', 'js/modules/me.js', 'js/modules/parent.js', 'js/modules/soon.js', 'js/modules/shot.js', 'js/modules/react.js', 'js/modules/editor.js', 'js/modules/film.js', 'js/modules/cards.js', 'js/modules/links.js', 'js/modules/povui.js', 'js/modules/program.js', 'js/modules/onice.js',
  'data/content.json', 'fonts/Unbounded.woff2', 'fonts/Manrope.woff2',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
  'img/sprites/arena-back.webp', 'img/sprites/g-blocker.webp', 'img/sprites/g-body.webp', 'img/sprites/g-glove.webp', 'img/sprites/g-head.webp', 'img/sprites/g-pad.webp', 'img/sprites/g-pads.webp', 'img/sprites/g-stick.webp', 'img/sprites/goalie-them-back.webp', 'img/sprites/goalie-them-butterfly.webp', 'img/sprites/goalie-them-front.webp', 'img/sprites/goalie-us-back.webp', 'img/sprites/goalie-us-front.webp', 'img/sprites/own-stick-left.webp', 'img/sprites/own-stick-right.webp', 'img/sprites/skater-them-back.webp', 'img/sprites/skater-them-front.webp', 'img/sprites/skater-them-side.webp', 'img/sprites/skater-us-back.webp', 'img/sprites/skater-us-front.webp', 'img/sprites/skater-us-side.webp',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith(PREFIX) && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const put = (req, res) => {
  if (res && res.ok && (res.type === 'basic' || res.type === 'cors')) {
    const copy = res.clone();
    caches.open(CACHE).then(c => c.put(req, copy));
  }
  return res;
};

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // Firebase и всё внешнее — мимо кэша
  const cacheFirst = /\/(icons|vendor|fonts|img)\//.test(url.pathname);
  if (cacheFirst) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => put(req, res))));
    return;
  }
  e.respondWith(
    Promise.race([
      fetch(req).then(res => put(req, res)),
      new Promise((_, rej) => setTimeout(() => rej(new Error('slow')), 4000)),
    ]).catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit || caches.match('index.html')))
  );
});
