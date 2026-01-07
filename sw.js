const CACHE_NAME = "mazegen-v3.1";

const FILES_TO_CACHE = [
  "index.html",
  "gen.html",
  "scripts/main.js",
  "scripts/gen.js",
  "icons/icon-60.png",
  "icons/icon-76.png",
  "icons/icon-120.png",
  "icons/icon-152.png",
  "icons/icon-180.png"
];

// Install: cache everything
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(FILES_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Activate: remove old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      )
    )
  );
  self.clients.claim();
});

// Fetch: offline first
self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((res) => {
      return (
        res ||
        fetch(event.request).then((fetchRes) => {
          return fetchRes;
        })
      );
    })
  );
});
