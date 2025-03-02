// Generate a unique cache name based on the current timestamp 
const CACHE_VERSION = new Date().toISOString().replace(/:/g, '-');
const CACHE_NAME = `mamaki-cache-${CACHE_VERSION}`;

const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/style.js',
  '/main.js',
  '/db.js',
  '/theme.js',
  '/default-sites.json',  // your default sites list
  '/favicon.ico',     
  '/icon-192x192.png',
  '/icon-512x512.png'
];

// Install event: Cache essential assets
self.addEventListener('install', event => {
  console.log('[Service Worker] Installing and caching static assets');
  // Force the waiting service worker to become active immediately.
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
  );
});

// Activate event: Clean up old caches and notify clients to reload.
self.addEventListener('activate', event => {
  console.log('[Service Worker] Activating Service Worker');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      // Delete all caches that do not match the current CACHE_NAME
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Deleting old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    })
    .then(() => {
      // Claim clients immediately so that the new service worker takes effect.
      return self.clients.claim();
    })
    .then(() => {
      // Notify all clients to reload with the new version.
      return self.clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({ action: 'reload' });
        });
      });
    })
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request).catch(() => {
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
        // Always return a fallback Response.
        return new Response('Network error occurred', {
          status: 408,
          statusText: 'Network error'
        });
      });
    })
  );
});


function clearCaches() {
  return caches.keys().then(cacheNames => {
    return Promise.all(cacheNames.map(name => caches.delete(name)));
  });
}
