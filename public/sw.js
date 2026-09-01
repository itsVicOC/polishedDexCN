const CACHE = 'polisheddex-cn-v6'
const CORE = ['', 'index.html', 'data/manifest.json', 'data/app-manifest.json', 'data/map-tiles.json', 'data/api-index.json', 'data/app-data.json', 'data/guides.json', 'data/tools/headbutt.json', 'data/tools/encounters-by-pokemon.json', 'data/tools/compatibility.json', 'data/tools/egg-move-paths.json']
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(async cache => { await Promise.all(CORE.map(async path => { try { await cache.add(new URL(path, self.registration.scope)) } catch {} })) }).then(() => self.skipWaiting()))
})
self.addEventListener('activate', event => event.waitUntil(
  caches.keys()
    .then(keys => Promise.all(keys.filter(key => key.startsWith('polisheddex-cn-') && key !== CACHE).map(key => caches.delete(key))))
    .then(() => self.clients.claim())
))
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return
  const url = new URL(event.request.url)
  const dataPrefix = new URL('data/', self.registration.scope).pathname
  const networkFirst = event.request.mode === 'navigate' || url.pathname.startsWith(dataPrefix)
  if (networkFirst) {
    event.respondWith(fetch(event.request).then(response => {
      const copy = response.clone()
      caches.open(CACHE).then(cache => cache.put(event.request, copy))
      return response
    }).catch(() => caches.match(event.request).then(cached => cached || caches.match(new URL('index.html', self.registration.scope)))))
    return
  }
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    const copy = response.clone()
    caches.open(CACHE).then(cache => cache.put(event.request, copy))
    return response
  })))
})
