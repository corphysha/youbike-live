const CACHE_PREFIX = "youbike-live-shell-";
const CACHE_NAME = `${CACHE_PREFIX}v2`;
const scopeUrl = (path = "") => new URL(path, self.registration.scope).toString();
const offlineUrl = scopeUrl("offline.html");
const preloadUrls = [
  offlineUrl,
  scopeUrl("manifest.webmanifest"),
  scopeUrl("icons/icon-192.png"),
  scopeUrl("icons/icon-512.png"),
  scopeUrl("icons/apple-touch-icon.png"),
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(preloadUrls);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  const scopePath = new URL(self.registration.scope).pathname;

  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    !url.pathname.startsWith(scopePath)
  ) {
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);

      // Build hashes identify immutable assets. HTML and live feeds stay fresh.
      if (url.pathname.startsWith(`${scopePath}_next/static/`)) {
        const cached = await cache.match(request);
        if (cached) return cached;
      }

      try {
        const response = await fetch(request);
        if (response.ok) {
          await cache.put(request, response.clone());
          if (request.mode === "navigate") {
            await cache.put(scopeUrl(""), response.clone());
          }
        }
        return response;
      } catch {
        const cached = await cache.match(request);
        if (cached) return cached;

        if (request.mode === "navigate") {
          return (
            (await cache.match(scopeUrl(""))) ?? (await cache.match(offlineUrl)) ?? Response.error()
          );
        }

        return Response.error();
      }
    })(),
  );
});

// Arrival alerts: tapping a notification focuses an open app window, or opens one.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = scopeUrl("");
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const existing = windows.find((client) => client.url.startsWith(targetUrl));
      if (existing) return existing.focus();
      return self.clients.openWindow(targetUrl);
    })(),
  );
});
