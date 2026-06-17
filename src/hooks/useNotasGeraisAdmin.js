import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

export function useNotasGeraisAdmin(espacoId, anoMes) {
  const [notas, setNotas] = useState([])
  const [loading, setLoading] = useState(false)

  const carregar = useCallback(async () => {
    if (!espacoId || !anoMes) return
    setLoading(true)
    const { data } = await supabase
      .from('notas_espaco_generais')
      .select('*')
      .eq('espaco_id', espacoId)
      .eq('ano_mes', anoMes)
      .order('created_at', { ascending: true })
    setNotas(data ?? [])
    setLoading(false)
  }, [espacoId, anoMes])

  useEffect(() => { carregar() }, [carregar])

  useEffect(() => {
    if (!espacoId || !anoMes) return
    const channel = supabase
      .channel(`notas-admin-${espacoId}-${anoMes}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'notas_espaco_generais',
      }, () => { carregar() })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [espacoId, anoMes, carregar])

  async function enviar(texto) {
    await supabase.from('notas_espaco_generais').insert({
      espaco_id: espacoId,
      ano_mes: anoMes,
      texto,
      autor: 'admin',
      lido_admin: true,
      lido_manager: false,
    })
  }

  async function marcarLidas() {
    await supabase
      .from('notas_espaco_generais')
      .update({ lido_admin: true })
      .eq('espaco_id', espacoId)
      .eq('ano_mes', anoMes)
      .eq('autor', 'manager')
      .eq('lido_admin', false)
  }

  return { notas, loading, enviar, marcarLidas }
}

// Contagens globais de não lidas (para o badge no ícone)
export function useNotasNaoLidasAdmin(anoMes) {
  const [naoLidasPorEspaco, setNaoLidasPorEspaco] = useState({})

  const carregar = useCallback(async () => {
    if (!anoMes) return
    const { data } = await supabase
      .from('notas_espaco_generais')
      .select('espaco_id')
      .eq('ano_mes', anoMes)
      .eq('autor', 'manager')
      .eq('lido_admin', false)
    const counts = {}
    ;(data ?? []).forEach(({ espaco_id }) => {
      counts[espaco_id] = (counts[espaco_id] ?? 0) + 1
    })
    setNaoLidasPorEspaco(counts)
  }, [anoMes])

  useEffect(() => { carregar() }, [carregar])

  useEffect(() => {
    if (!anoMes) return
    const channel = supabase
      .channel(`notas-admin-global-${anoMes}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'notas_espaco_generais',
      }, () => { carregar() })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [anoMes, carregar])

  const totalNaoLidas = Object.values(naoLidasPorEspaco).reduce((a, b) => a + b, 0)

  return { naoLidasPorEspaco, totalNaoLidas }
}
