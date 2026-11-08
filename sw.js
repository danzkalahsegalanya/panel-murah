// Service Worker Kitzune Store - PWA
const CACHE_NAME = 'kitzune-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json'
];

// Install: cache aset utama
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
  );
  self.skipWaiting();
});

// Activate: hapus cache lama
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => Promise.all(
      names.filter(name => name !== CACHE_NAME).map(name => caches.delete(name))
    ))
  );
  self.clients.claim();
});

// Fetch: cache-first, fallback network
self.addEventListener('fetch', (event) => {
  // Skip request non-GET
  if (event.request.method !== 'GET') return;
  
  // Skip Firebase / API eksternal
  if (event.request.url.includes('firebase') || 
      event.request.url.includes('googleapis.com') ||
      event.request.url.includes('/api/')) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request).then((response) => {
        // Cache response baru
        return caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, response.clone());
          return response;
        });
      });
    }).catch(() => caches.match('/index.html'))
  );
});
