/* Service worker: приложение живёт на телефоне и открывается без интернета.
   Страница, скрипты, стили и контент — сначала сеть (обновления приходят сразу), без сети — из кэша.
   Шрифты, иконки, библиотеки — сначала кэш. Трафик Firebase не трогаем.
   Префикс кэша свой (hk-): на домене annkka3.github.io живут и другие приложения, их кэши не задеваем. */
const VERSION = 'v29';
const PREFIX = 'hk-shell-';
const CACHE = PREFIX + VERSION;
const CORE = [
  './', 'index.html', 'config.js', 'store.js', 'manifest.webmanifest', 'css/style.css',
  'js/main.js', 'js/ui.js', 'js/content.js',
  'js/core/state.js', 'js/core/sync.js',
  'js/engine/rink.js', 'js/engine/render.js', 'js/engine/anim.js', 'js/engine/srs.js', 'js/engine/scoring.js', 'js/engine/shot.js', 'js/engine/sim.js', 'js/engine/pov.js', 'js/engine/sprites.js', 'js/engine/stick.js',
  'js/modules/today.js', 'js/modules/decks.js', 'js/modules/play.js', 'js/modules/me.js', 'js/modules/parent.js', 'js/modules/soon.js', 'js/modules/shot.js', 'js/modules/react.js', 'js/modules/editor.js', 'js/modules/film.js', 'js/modules/cards.js', 'js/modules/links.js', 'js/modules/povui.js', 'js/modules/program.js', 'js/modules/onice.js',
  'data/content.json', 'fonts/Unbounded.woff2', 'fonts/Manrope.woff2',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
  'img/sprites/arena-back.webp', 'img/sprites/goalie-pose-blocker.webp', 'img/sprites/goalie-pose-butterfly.webp', 'img/sprites/goalie-pose-glove.webp', 'img/sprites/goalie-pose-padL.webp', 'img/sprites/goalie-pose-padR.webp', 'img/sprites/goalie-pose-pushL.webp', 'img/sprites/goalie-pose-pushR.webp', 'img/sprites/goalie-pose-q3r.webp', 'img/sprites/goalie-pose-q3r2.webp', 'img/sprites/goalie-pose-stand.webp', 'img/sprites/goalie-them-back.webp', 'img/sprites/goalie-them-front.webp', 'img/sprites/goalie-us-back.webp', 'img/sprites/goalie-us-front.webp', 'img/sprites/own-stick-left.webp', 'img/sprites/own-stick-right.webp', 'img/sprites/skater-them-back-gL.webp', 'img/sprites/skater-them-back.webp', 'img/sprites/skater-them-front-gL.webp', 'img/sprites/skater-them-front-receive-gL.webp', 'img/sprites/skater-them-front.webp', 'img/sprites/skater-them-q3back-gL.webp', 'img/sprites/skater-them-q3back-gR.webp', 'img/sprites/skater-them-q3back.webp', 'img/sprites/skater-them-q3front-gL.webp', 'img/sprites/skater-them-q3front-gR.webp', 'img/sprites/skater-them-q3front.webp', 'img/sprites/skater-them-side-gL.webp', 'img/sprites/skater-them-side-gR.webp', 'img/sprites/skater-them-side-receive-gL.webp', 'img/sprites/skater-them-side-receive-gR.webp', 'img/sprites/skater-them-side.webp', 'img/sprites/skater-them-stride-gL.webp', 'img/sprites/skater-them-stride-gR.webp', 'img/sprites/skater-them-stride.webp', 'img/sprites/skater-us-back-gL.webp', 'img/sprites/skater-us-back.webp', 'img/sprites/skater-us-front-gL.webp', 'img/sprites/skater-us-front-receive-gL.webp', 'img/sprites/skater-us-front.webp', 'img/sprites/skater-us-q3back-gL.webp', 'img/sprites/skater-us-q3back-gR.webp', 'img/sprites/skater-us-q3back.webp', 'img/sprites/skater-us-q3front-gL.webp', 'img/sprites/skater-us-q3front-gR.webp', 'img/sprites/skater-us-q3front.webp', 'img/sprites/skater-us-side-gL.webp', 'img/sprites/skater-us-side-gR.webp', 'img/sprites/skater-us-side-receive-gL.webp', 'img/sprites/skater-us-side-receive-gR.webp', 'img/sprites/skater-us-side.webp', 'img/sprites/skater-us-stride-gL.webp', 'img/sprites/skater-us-stride-gR.webp', 'img/sprites/skater-us-stride.webp',
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
