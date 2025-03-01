// Generate a unique cache name based on the current timestamp 
const CACHE_VERSION = new Date().toISOString(); // e.g., "2025-02-03T00:00:00.000Z"
const CACHE_NAME = `mamaki-cache-${CACHE_VERSION}`;

const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/style.js',
  '/main.js',
  '/db.js',
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

// Fetch event: Serve cached content when available, fall back to network if not.
self.addEventListener('fetch', event => {
  if (event.request.mode === 'navigate') {
    event.respondWith(
      caches.match('/index.html').then(response => {
        return response || fetch(event.request);
      }).catch(() => {
        return new Response("You are offline. Please check your connection.", {
          status: 503,
          statusText: "Offline",
          headers: new Headers({ 'Content-Type': 'text/plain' })
        });
      })
    );
  } else {
    event.respondWith(
      caches.match(event.request).then(response => {
        return response || fetch(event.request).catch(() => {
          return new Response("You are offline. Please check your connection.", {
            status: 503,
            statusText: "Offline",
            headers: new Headers({ 'Content-Type': 'text/plain' })
          });
        });
      })
    );
  }
});
