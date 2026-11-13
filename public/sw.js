/* Orbit Lifting service worker — minimal offline shell.
   Workout data lives in IndexedDB, not in this cache. */
const CACHE = 'orbit-shell-v1'

self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(['./', './index.html', './404.html', './manifest.webmanifest']).catch(() => {}))
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      await self.clients.claim()
    })()
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  // Navigations: network first, fall back to cached shell (offline PWA open).
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put('./index.html', copy))
          return res
        })
        .catch(() => caches.match('./index.html').then((r) => r || Response.error()))
    )
    return
  }

  // Assets: cache first, revalidate in background.
  event.respondWith(
    caches.match(req).then(
      (cached) =>
        cached ||
        fetch(req).then((res) => {
          const copy = res.clone()
          if (res.ok) caches.open(CACHE).then((c) => c.put(req, copy))
          return res
        })
    )
  )
})
