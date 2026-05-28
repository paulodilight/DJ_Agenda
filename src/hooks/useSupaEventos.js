import { useState, useEffect, useCallback } from 'react'
import { supaEventosApi } from '@/lib/supaEventosApi'

export function useSupaEventos({ dataInicio, dataFim }) {
  const [eventos, setEventos] = useState([])
  const [loading, setLoading] = useState(false)

  const carregar = useCallback(async () => {
    if (!dataInicio || !dataFim) return
    setLoading(true)
    try {
      const data = await supaEventosApi.listar({ dataInicio, dataFim })
      // espaco_id já é um ID do DJ Schedule — expor como espaco_id_dj para compatibilidade
      const mapped = data.map(e => ({ ...e, espaco_id_dj: e.espaco_id ?? null }))
      setEventos(mapped)
    } catch (e) {
      console.error('useSupaEventos:', e.message)
    } finally {
      setLoading(false)
    }
  }, [dataInicio, dataFim])

  useEffect(() => { carregar() }, [carregar])

  return { eventos, loading, recarregar: carregar }
}
