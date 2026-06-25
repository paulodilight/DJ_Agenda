/* Service Worker — LMD DJ Schedule PWA
 * Estratégia:
 *  - Navegações (HTML): network-first com fallback para o app shell em cache (offline).
 *  - Assets estáticos (js/css/img/fontes): stale-while-revalidate.
 *  - Requests de API (Supabase / n8n) e não-GET: sempre rede, nunca cacheadas.
 */
const VERSION = 'v2'
const CACHE = `lmd-dj-${VERSION}`
const APP_SHELL = ['/', '/index.html', '/manifest.json', '/manifest-apoiot.json', '/favicon.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

// Permite forçar atualização imediata a partir da página
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Só lida com GET de mesma origem; deixa API/externos passarem direto
  if (request.method !== 'GET' || url.origin !== self.location.origin) return

  // Navegações (SPA): tenta a rede, cai para o app shell quando offline
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((cache) => cache.put('/index.html', copy))
          return res
        })
        .catch(() => caches.match('/index.html').then((r) => r || caches.match('/')))
    )
    return
  }

  // Assets estáticos: stale-while-revalidate
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone()
            caches.open(CACHE).then((cache) => cache.put(request, copy))
          }
          return res
        })
        .catch(() => cached)
      return cached || network
    })
  )
})
