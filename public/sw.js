const CACHE = 'lambung-sehat-v4';
// Cloudflare Pages 308-redirects /index.html -> /, and caching a redirected
// Response makes Safari refuse to render it later, so only cache the clean
// root URL (not './index.html') as the HTML entry.
const ASSETS = ['./', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Safari refuses to render a service-worker response for a navigation if it
// went through a redirect (response.redirected), so strip that by rebuilding
// a clean Response — needed for both cached entries and live fetches.
function stripRedirect(response) {
  if (!response.redirected) return response;
  return response.blob().then(
    (body) =>
      new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
      })
  );
}

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return stripRedirect(cached);
      return fetch(e.request).then(stripRedirect);
    })
  );
});

self.addEventListener('push', (e) => {
  const data = e.data ? e.data.json() : { title: 'Reminder Lambung', body: 'Waktunya!' };
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: './icon-192.png',
      badge: './icon-192.png'
    })
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('./');
    })
  );
});
