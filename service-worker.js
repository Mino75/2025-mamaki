// Generate cache
const LIVE_CACHE = 'mamaki-v1';
const TEMP_CACHE = 'mamaki-temp-v1';
const ASSETS = [
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

// Install: Download all assets into a temporary cache.
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(TEMP_CACHE).then(tempCache => {
      // Fetch and cache every asset.
      return Promise.all(
        ASSETS.map(url => {
          return fetch(url).then(response => {
            if (!response.ok) {
              throw new Error(`Failed to fetch ${url}`);
            }
            return tempCache.put(url, response.clone());
          });
        })
      );
    })
  );
});

// Activate: If staging is complete, replace the live cache.
self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      const tempCache = await caches.open(TEMP_CACHE);
      const cachedRequests = await tempCache.keys();
      if (cachedRequests.length === ASSETS.length) {
        // New version is fully staged. Delete the old live cache.
        await caches.delete(LIVE_CACHE);
        const liveCache = await caches.open(LIVE_CACHE);
        // Copy everything from the temporary cache to the live cache.
        for (const request of cachedRequests) {
          const response = await tempCache.match(request);
          await liveCache.put(request, response);
        }
        // Delete the temporary cache.
        await caches.delete(TEMP_CACHE);
        // Optionally, notify clients to reload.
        const clients = await self.clients.matchAll();
        clients.forEach(client => client.postMessage({ action: 'reload' }));
      } else {
        // If staging failed, delete the temporary cache and keep the old live cache.
        console.error('Staging failed. Keeping the old cache.');
        await caches.delete(TEMP_CACHE);
      }
      await self.clients.claim();
    })()
  );
});

// Fetch: Always try the network first, but fall back to live cache if offline.
self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request)
      .then(networkResponse => {
        // Update the live cache with the fresh response.
        const responseClone = networkResponse.clone();
        caches.open(LIVE_CACHE).then(cache => {
          cache.put(event.request, responseClone);
        });
        return networkResponse;
      })
      .catch(() => {
        // If network fails, try to serve from the live cache.
        return caches.match(event.request).then(cachedResponse => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // Optionally, return a fallback for unmatched requests.
          return new Response('Network error occurred', {
            status: 408,
            statusText: 'Network error'
          });
        });
      })
  );
});

