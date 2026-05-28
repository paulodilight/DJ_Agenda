import { useState, useEffect, useCallback } from 'react'
import { supaEventosApi } from '@/lib/supaEventosApi'

export function useEventos(filtros = {}) {
  const [eventos, setEventos] = useState([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro]       = useState(null)

  const carregar = useCallback(async () => {
    setLoading(true)
    setErro(null)
    try {
      const data = await supaEventosApi.listar(filtros)
      setEventos(data)
    } catch (e) {
      setErro(e.message)
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtros.dataInicio, filtros.dataFim])

  useEffect(() => { carregar() }, [carregar])

  return { eventos, loading, erro, recarregar: carregar }
}
