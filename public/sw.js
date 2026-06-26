/* Service Worker — Xclusive TS (Apoio Técnico)
 *
 * Responsável apenas por Web Push + App Badge no ícone da PWA.
 * NÃO faz cache de assets, por isso não interfere com o funcionamento normal
 * da app (admin ou apoiot) — é seguro mesmo controlando todo o scope "/".
 *
 * Fluxo:
 *   1. O servidor (Edge Function send-push) envia um push quando há um evento
 *      ou ocorrência nova/alterada.
 *   2. Este SW mostra uma notificação e incrementa um contador guardado em
 *      IndexedDB, escrevendo esse número no ícone via navigator.setAppBadge().
 *   3. Quando o técnico abre a app, esta envia a mensagem CLEAR_BADGE e o
 *      contador é reposto a zero (navigator.clearAppBadge()).
 */

const DB_NAME = 'xts-badge'
const STORE = 'kv'
const KEY = 'count'

// ── IndexedDB mínimo (contador persistente entre pushes) ──────────────────────
function idb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function getCount() {
  const db = await idb()
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY)
    tx.onsuccess = () => resolve(Number(tx.result) || 0)
    tx.onerror = () => resolve(0)
  })
}

async function setCount(n) {
  const db = await idb()
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readwrite').objectStore(STORE).put(n, KEY)
    tx.onsuccess = () => resolve()
    tx.onerror = () => resolve()
  })
}

async function aplicarBadge(n) {
  try {
    if (n > 0 && self.navigator.setAppBadge) await self.navigator.setAppBadge(n)
    else if (self.navigator.clearAppBadge) await self.navigator.clearAppBadge()
  } catch {
    /* setAppBadge pode não existir (browser/SO sem suporte) — ignora */
  }
}

// ── Ciclo de vida ─────────────────────────────────────────────────────────────
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

// ── Push recebido ─────────────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    let payload = {}
    try { payload = event.data ? event.data.json() : {} } catch { payload = {} }

    const titulo = payload.title || 'Xclusive TS'
    const corpo  = payload.body || 'Há novidades na agenda.'
    const url    = payload.url || '/apoiot'
    const tag    = payload.tag || 'xts'

    // Incrementa o contador e escreve o número no ícone
    const novo = (await getCount()) + 1
    await setCount(novo)
    await aplicarBadge(novo)

    await self.registration.showNotification(titulo, {
      body: corpo,
      icon: '/logo-apoiot.png',
      badge: '/logo-apoiot.png',
      tag,
      renotify: true,
      data: { url },
    })
  })())
})

// ── Clique na notificação → abre/foca a app ───────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/apoiot'
  event.waitUntil((async () => {
    await setCount(0)
    await aplicarBadge(0)
    const lista = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const c of lista) {
      if (c.url.includes('/apoiot') && 'focus' in c) return c.focus()
    }
    if (self.clients.openWindow) return self.clients.openWindow(url)
  })())
})

// ── Mensagens da app (limpar badge ao abrir) ──────────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data?.type === 'CLEAR_BADGE') {
    event.waitUntil((async () => {
      await setCount(0)
      await aplicarBadge(0)
    })())
  }
})
