import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

/**
 * Detecta slots com conflitos e devolve um Set com os seus IDs.
 *
 * Conflitos detectados:
 *  1. DJ duplicado — mesmo DJ em 2+ slots activos na mesma data
 *     (detectado por dj_id quando disponível, ou dj_nome como fallback)
 *  2. Indisponível — DJ marcou a data como indisponível
 *  3. Recusa/Exclusão — DJ recusa o Cliente OU Cliente excluiu o DJ
 *
 * Nota: slots com estado 'cancelado' ou 'sem_efeito' são excluídos
 * da deteção de duplicados (não contam como booking activo).
 *
 * @param {{ agenda: object[], dataInicio: string, dataFim: string }} opts
 * @returns {{ conflictsIdx: Set<string> }}
 */
export function useConflitos({ agenda, dataInicio, dataFim }) {
  const [indisponibilidades, setIndisponibilidades] = useState(new Set()) // "djId|data"
  const [recusas, setRecusas] = useState(new Set())                       // "djId|espacoId"

  const carregar = useCallback(async () => {
    if (!dataInicio || !dataFim) return
    try {
      const [dispRes, djPrefRes, espacoPrefRes] = await Promise.all([
        // DJs indisponíveis no intervalo visível
        supabase
          .from('disponibilidades')
          .select('dj_id, data')
          .eq('disponivel', false)
          .gte('data', dataInicio)
          .lte('data', dataFim),
        // DJs que recusam Clientes
        supabase
          .from('dj_preferencias_espaco')
          .select('dj_id, espaco_id')
          .eq('preferencia', 'recusa'),
        // Clientes que excluíram DJs
        supabase
          .from('espaco_dj_preferencias')
          .select('dj_id, espaco_id')
          .eq('tipo', 'excluido'),
      ])

      const indisp = new Set()
      ;(dispRes.data ?? []).forEach(r => indisp.add(`${r.dj_id}|${r.data}`))
      setIndisponibilidades(indisp)

      const rec = new Set()
      ;(djPrefRes.data ?? []).forEach(r => rec.add(`${r.dj_id}|${r.espaco_id}`))
      ;(espacoPrefRes.data ?? []).forEach(r => rec.add(`${r.dj_id}|${r.espaco_id}`))
      setRecusas(rec)
    } catch {
      /* ignora erros de rede — sem conflitos assinalados */
    }
  }, [dataInicio, dataFim])

  useEffect(() => { carregar() }, [carregar])

  const conflictsIdx = useMemo(() => {
    const bad = new Set()

    // Só considera slots activos para deteção de duplicados
    const ESTADOS_INACTIVOS = new Set(['cancelado', 'sem_efeito'])
    const activos = agenda.filter(s => !ESTADOS_INACTIVOS.has(s.estado))

    // 1. Duplicado: mesmo DJ em 2+ slots activos na mesma data
    //    Agrupa por dj_id (quando disponível) ou por dj_nome normalizado (fallback)
    const byDjData = {}
    activos.forEach(s => {
      // Chave de agrupamento: preferir dj_id; se nulo, usar dj_nome normalizado
      const chave = s.dj_id ?? (s.dj_nome ? `nome:${s.dj_nome.trim().toLowerCase()}` : null)
      if (!chave) return
      const k = `${chave}|${s.data}`
      if (!byDjData[k]) byDjData[k] = []
      byDjData[k].push(s.id)
    })
    Object.values(byDjData).forEach(ids => {
      if (ids.length > 1) ids.forEach(id => bad.add(id))
    })

    // 2. DJ indisponível nesta data
    activos.forEach(s => {
      if (s.dj_id && indisponibilidades.has(`${s.dj_id}|${s.data}`)) bad.add(s.id)
    })

    // 3. DJ recusa Cliente / Cliente excluiu DJ
    activos.forEach(s => {
      if (s.dj_id && s.espaco_id && recusas.has(`${s.dj_id}|${s.espaco_id}`)) bad.add(s.id)
    })

    return bad
  }, [agenda, indisponibilidades, recusas])

  return { conflictsIdx }
}
