import { createContext, useContext, useState, useCallback, useRef } from 'react'

/**
 * UndoContext — sistema global de desfazer.
 *
 * Uso numa página / modal:
 *   const { pushUndo } = useUndo()
 *
 *   // antes de apagar:
 *   const backup = { ...registo }
 *   await api.apagar(registo.id)
 *   pushUndo({
 *     label: `"${registo.nome}" apagado`,
 *     undo:  () => api.criar(backup),
 *   })
 *
 * Depois de `undo()` ser chamado, é boa prática chamar `recarregar()` na página.
 * Para isso, passa `onUndo` opcional:
 *   pushUndo({ label, undo: async () => { await api.criar(backup); recarregar() } })
 */

const UndoContext = createContext(null)

export function UndoProvider({ children }) {
  // entrada: { id, label, undo, duracao, addedAt } | null
  const [entrada, setEntrada] = useState(null)
  const [executando, setExecutando] = useState(false)
  const timerRef = useRef(null)

  const pushUndo = useCallback(({ label, undo, duracao = 5000 }) => {
    // Cancela o timer anterior (se existir)
    if (timerRef.current) clearTimeout(timerRef.current)

    const novaEntrada = { id: Date.now(), label, undo, duracao, addedAt: Date.now() }
    setEntrada(novaEntrada)
    setExecutando(false)

    timerRef.current = setTimeout(() => {
      setEntrada(prev => prev?.id === novaEntrada.id ? null : prev)
    }, duracao)
  }, [])

  const executarUndo = useCallback(async () => {
    if (!entrada || executando) return
    if (timerRef.current) clearTimeout(timerRef.current)

    const fn = entrada.undo
    setExecutando(true)
    setEntrada(null)

    try {
      await fn()
    } catch (e) {
      console.error('[Undo] falhou:', e)
    } finally {
      setExecutando(false)
    }
  }, [entrada, executando])

  const descartar = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setEntrada(null)
  }, [])

  return (
    <UndoContext.Provider value={{ pushUndo, entrada, executando, executarUndo, descartar }}>
      {children}
    </UndoContext.Provider>
  )
}

export function useUndo() {
  const ctx = useContext(UndoContext)
  if (!ctx) throw new Error('useUndo deve ser usado dentro de <UndoProvider>')
  return ctx
}
