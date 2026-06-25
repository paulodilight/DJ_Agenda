// Regista o service worker da PWA (apenas em produção).
// Em dev o SW fica desativado para não interferir no HMR do Vite.
export function registerSW() {
  if (!('serviceWorker' in navigator)) return
  if (!import.meta.env.PROD) return

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        // Quando uma nova versão fica disponível, ativa-a assim que possível.
        reg.addEventListener('updatefound', () => {
          const sw = reg.installing
          if (!sw) return
          sw.addEventListener('statechange', () => {
            if (sw.state === 'installed' && navigator.serviceWorker.controller) {
              reg.waiting?.postMessage('SKIP_WAITING')
            }
          })
        })
      })
      .catch((err) => console.error('Falha ao registar o service worker:', err))
  })

  // Recarrega a página quando o novo SW assume o controlo.
  let refreshing = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return
    refreshing = true
    window.location.reload()
  })
}
