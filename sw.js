/* Minoa — service worker
   - Met en cache l'application (page, icônes, écrans de démarrage) pour qu'elle s'ouvre hors connexion.
   - La page est d'abord demandée au réseau (pour recevoir les mises à jour), puis au cache si Internet ne répond pas.
   - Les recherches de stations, d'adresses et les cartes (sites extérieurs) ne sont JAMAIS mises en cache :
     elles ont besoin d'Internet et l'application affiche un message clair hors ligne.
   - Tes données ne sont pas ici : elles restent dans la base locale de l'appareil (IndexedDB). */
const VERSION = 'minoa-v18';
const CORE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-64.png'
];
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(CORE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('minoa-') && k !== VERSION && k !== 'minoa-fonts').map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then((r) => { clearTimeout(t); resolve(r); }, (e) => { clearTimeout(t); reject(e); });
  });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Polices Google : servies depuis le cache, rafraîchies en arrière-plan.
  if (FONT_HOSTS.includes(url.hostname)) {
    event.respondWith(
      caches.open('minoa-fonts').then(async (cache) => {
        const hit = await cache.match(req);
        const net = fetch(req).then((res) => { if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()); return res; }).catch(() => hit);
        return hit || net;
      })
    );
    return;
  }

  // Tout autre site extérieur (prix des carburants, adresses, cartes) : jamais intercepté.
  if (url.origin !== self.location.origin) return;

  // Ouverture de l'application : réseau d'abord (3,5 s max), sinon la version en cache.
  if (req.mode === 'navigate') {
    event.respondWith(
      withTimeout(fetch(req), 3500)
        .then((res) => {
          if (res && res.ok) caches.open(VERSION).then((c) => c.put('./index.html', res.clone()));
          return res;
        })
        .catch(async () => (await caches.match('./index.html')) || (await caches.match('./')) || Response.error())
    );
    return;
  }

  // Fichiers de l'application (icônes, manifeste, écrans de démarrage) : cache d'abord.
  event.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res && res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
      return res;
    }))
  );
});
