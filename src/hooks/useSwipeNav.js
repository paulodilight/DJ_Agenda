import { useEffect, useRef } from 'react'

/**
 * Swipe horizontal para navegar entre períodos.
 * Usa listeners nativos no document para contornar o scroll do overflow-auto
 * e o TouchSensor do dnd-kit.
 */
export function useSwipeNav(onAnterior, onProxima, { threshold = 60 } = {}) {
  const onAnteriorRef = useRef(onAnterior)
  const onProximaRef  = useRef(onProxima)
  onAnteriorRef.current = onAnterior
  onProximaRef.current  = onProxima

  useEffect(() => {
    let startX = null
    let startY = null

    const handleStart = (e) => {
      startX = e.touches[0].clientX
      startY = e.touches[0].clientY
    }

    const handleEnd = (e) => {
      if (startX === null) return
      const dx = e.changedTouches[0].clientX - startX
      const dy = e.changedTouches[0].clientY - startY
      startX = null
      startY = null

      // Gesto maioritariamente vertical → scroll normal, ignora
      if (Math.abs(dy) > Math.abs(dx) * 0.8) return
      if (Math.abs(dx) < threshold) return

      if (dx > 0) onAnteriorRef.current()
      else        onProximaRef.current()
    }

    document.addEventListener('touchstart', handleStart, { passive: true })
    document.addEventListener('touchend',   handleEnd,   { passive: true })

    return () => {
      document.removeEventListener('touchstart', handleStart)
      document.removeEventListener('touchend',   handleEnd)
    }
  }, [threshold])
}
