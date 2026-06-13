/* ================================================================
   SCORE CEKIH — SERVICE WORKER
   Sadewa Corp
   ================================================================ */

const CACHE_NAME = 'score-cekih-v7';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  // Images
  './images/background.png',
  './images/joker.png',
  './images/joker.ico',
  './images/card_1.png',
  './images/card_2.png',
  './images/card_3.png',
  './images/card_4.png',
  './images/border_1.png',
  './images/border_2.png',
  './images/border_3.png',
  './images/border_4.png',
  // Audio
  './audio/casino_bg.mp3',
  './audio/mulai_dari_0_ya_bapak.wav',
  './audio/kok_minus_terus_sih_gamau_menang.wav',
  './audio/klik.wav',
  // Video
  './video/dragon.mp4',
  './video/tiger.mp4',
  './video/eagle.mp4',
  './video/qilin.mp4'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Cache assets one by one, ignore failures for missing files
      return Promise.allSettled(
        ASSETS.map(asset => cache.add(asset).catch(() => {}))
      );
    })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  // Only handle same-origin requests
  if (!event.request.url.startsWith(self.location.origin)) return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached || new Response('Offline', { status: 503 }));
    })
  );
});
