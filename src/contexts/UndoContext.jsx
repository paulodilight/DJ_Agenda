/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useCallback, useRef } from 'react'

/**
 * UndoContext — pilha global de desfazer (stack).
 *
 * Cada ação que altera dados regista o seu inverso:
 *   const { pushUndo } = useUndo()
 *   const backup = { ...registo }
 *   await api.apagar(registo.id)
 *   pushUndo({ label: `"${registo.nome}" apagado`, undo: async () => { await api.criar(backup); recarregar() } })
 *
 * - `pushUndo` empurra para a pilha e mostra um toast transitório (5s).
 * - `executarUndo` desfaz a ÚLTIMA ação (toast OU botão Undo), mesmo após o toast desaparecer.
 * - `podeDesfazer` indica se há algo na pilha.
 */

const UndoContext = createContext(null)
const MAX = 50

export function UndoProvider({ children }) {
  const [pilha, setPilhaState] = useState([])
  const pilhaRef = useRef([])
  const setPilha = (updater) => {
    pilhaRef.current = typeof updater === 'function' ? updater(pilhaRef.current) : updater
    setPilhaState(pilhaRef.current)
  }

  const [toast, setToast]           = useState(null)   // entrada visível (transitória)
  const [executando, setExecutando] = useState(false)
  const timerRef = useRef(null)

  const pushUndo = useCallback(({ label, undo, duracao = 5000 }) => {
    const entrada = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      label, undo, duracao,
    }
    setPilha(prev => [...prev, entrada].slice(-MAX))
    setToast(entrada)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      setToast(prev => (prev?.id === entrada.id ? null : prev))
    }, duracao)
  }, [])

  const executarUndo = useCallback(async () => {
    if (executando) return
    const lista = pilhaRef.current
    if (lista.length === 0) return
    const alvo = lista[lista.length - 1]
    setPilha(prev => prev.slice(0, -1))
    setToast(prev => (prev?.id === alvo.id ? null : prev))
    setExecutando(true)
    try {
      await alvo.undo()
    } catch (e) {
      console.error('[Undo] falhou:', e)
    } finally {
      setExecutando(false)
    }
  }, [executando])

  // Esconde só o toast — a entrada permanece na pilha (continua desfazível pelo botão Undo)
  const descartar = useCallback(() => setToast(null), [])

  const limpar = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setPilha([]); setToast(null)
  }, [])

  return (
    <UndoContext.Provider value={{
      pushUndo, executarUndo, descartar, limpar,
      entrada: toast, executando,
      pilha, podeDesfazer: pilha.length > 0,
    }}>
      {children}
    </UndoContext.Provider>
  )
}

export function useUndo() {
  const ctx = useContext(UndoContext)
  if (!ctx) throw new Error('useUndo deve ser usado dentro de <UndoProvider>')
  return ctx
}
