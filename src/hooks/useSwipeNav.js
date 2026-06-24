import { useRef, useCallback } from 'react'

/**
 * Swipe horizontal para navegar entre períodos.
 * Threshold de 60px; ignora gestos com componente vertical dominante.
 */
export function useSwipeNav(onAnterior, onProxima, { threshold = 60 } = {}) {
  const startX = useRef(null)
  const startY = useRef(null)

  const onTouchStart = useCallback((e) => {
    startX.current = e.touches[0].clientX
    startY.current = e.touches[0].clientY
  }, [])

  const onTouchEnd = useCallback((e) => {
    if (startX.current === null) return
    const dx = e.changedTouches[0].clientX - startX.current
    const dy = e.changedTouches[0].clientY - startY.current
    startX.current = null
    startY.current = null

    // Se o gesto é mais vertical do que horizontal, ignora
    if (Math.abs(dy) > Math.abs(dx)) return
    if (Math.abs(dx) < threshold) return

    if (dx > 0) onAnterior()
    else onProxima()
  }, [onAnterior, onProxima, threshold])

  return { onTouchStart, onTouchEnd }
}
