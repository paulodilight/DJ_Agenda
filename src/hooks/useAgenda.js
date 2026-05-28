import { useState, useEffect, useCallback } from 'react'
import { agendaApi } from '@/lib/api'

export function useAgenda(filtros = {}) {
  const [agenda, setAgenda] = useState([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState(null)

  const carregar = useCallback(async () => {
    setLoading(true)
    setErro(null)
    try {
      const data = await agendaApi.listar(filtros)
      setAgenda(data)
    } catch (e) {
      setErro(e.message)
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtros.dataInicio, filtros.dataFim, filtros.espacoId, filtros.djId])

  // Refresca sem spinner — preserva scroll e estado visual (ideal após drag-and-drop)
  const recarregarSilencioso = useCallback(async () => {
    try {
      const data = await agendaApi.listar(filtros)
      setAgenda(data)
    } catch {
      // falha silenciosa: o conteúdo antigo permanece visível
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtros.dataInicio, filtros.dataFim, filtros.espacoId, filtros.djId])

  useEffect(() => { carregar() }, [carregar])

  return { agenda, loading, erro, recarregar: carregar, recarregarSilencioso }
}
