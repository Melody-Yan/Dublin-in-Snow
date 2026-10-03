/* 都柏林的雪 · Service Worker
   自己的文件走 cache-first（秒开、离线可用），外部 CDN 只在联网时顺手缓存一份。
   任何一条缓存失败都不影响安装——否则手机在没有网的时候会连 app 都装不上。 */
const CACHE = 'dublin-snow-v2';

const SHELL = [
  './',
  './index.html',
  './app.js',
  './vendor/marked.min.js',
  './style.css',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

// 背景图是另一个域名，能缓存就缓存，缓存不上也不影响使用
const EXTERNAL = [
  'https://resource-17v.pages.dev/auc.jpg',
  'https://resource-17v.pages.dev/books.png',
  'https://resource-17v.pages.dev/movies.png',
  'https://resource-17v.pages.dev/journal.png'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all([...SHELL, ...EXTERNAL].map(u => cache.add(u).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
      return res;
    } catch (err) {
      // 断网且没缓存过：页面本身给首页兜底，其他资源让它自然失败（app.js 都有降级分支）
      if (req.mode === 'navigate') {
        const shell = await cache.match('./');
        if (shell) return shell;
      }
      throw err;
    }
  })());
});
