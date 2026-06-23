/**
 * Determina qual a próxima assinatura do técnico para hoje.
 *
 * Fluxos:
 *  LMD → Evento → LMD : lmd_entrada → evento_entrada → evento_saida → lmd_saida
 *  Só LMD             : lmd_entrada → lmd_saida
 *  Direto a evento    : evento_entrada → evento_saida
 *
 * temLmd = técnico tem agendamento LMD hoje (espaco_id=LMD) OU é tipo 'fixo' e não tem folga
 */
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

const LMD_ESPACO_ID = '299fc621-afe2-42c9-ba87-5c7080f2a32d'

const hojeISO = () => {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}
const inicioHoje = () => `${hojeISO()}T00:00:00.000Z`
const fimHoje   = () => `${hojeISO()}T23:59:59.999Z`

export function useAssinaturaDia(tecnicoId) {
  const [proxima, setProxima] = useState(null)
  const [loading, setLoading] = useState(true)
  const [versao,  setVersao]  = useState(0)

  const calcular = useCallback(async () => {
    if (!tecnicoId) { setLoading(false); return }
    setLoading(true)
    try {
      const hoje = hojeISO()

      // 1. Tem LMD hoje? — agendamento explícito com espaco_id LMD
      const { data: agendLmd } = await supabase
        .from('agendamentos_tecnicos')
        .select('id')
        .eq('tecnico_id', tecnicoId)
        .eq('espaco_id', LMD_ESPACO_ID)
        .eq('data', hoje)
        .maybeSingle()

      // Fallback: técnico é fixo e não tem folga hoje
      let temLmd = !!agendLmd
      let agendamentoId = agendLmd?.id ?? null

      if (!temLmd) {
        const [{ data: tec }, { data: folga }] = await Promise.all([
          supabase.from('vw_colaboradores').select('tipo').eq('id', tecnicoId).maybeSingle(),
          supabase.from('agendamentos_tecnicos').select('id')
            .eq('tecnico_id', tecnicoId).eq('data', hoje).eq('folga', true).maybeSingle(),
        ])
        temLmd = tec?.tipo === 'fixo' && !folga
      }

      // 2. Tem evento hoje?
      const { data: evResp } = await supabase
        .from('supa_eventos')
        .select('id')
        .eq('tecnico_id', tecnicoId)
        .eq('data_evento', hoje)
        .neq('status', 'cancelado')
        .limit(1)

      let eventoId = evResp?.[0]?.id ?? null

      if (!eventoId) {
        const { data: evIds } = await supabase
          .from('evento_tecnicos').select('evento_id').eq('tecnico_id', tecnicoId)
        const ids = (evIds ?? []).map(r => r.evento_id)
        if (ids.length > 0) {
          const { data: evHoje } = await supabase
            .from('supa_eventos').select('id').in('id', ids)
            .eq('data_evento', hoje).neq('status', 'cancelado').limit(1)
          eventoId = evHoje?.[0]?.id ?? null
        }
      }

      const temEvento = !!eventoId

      // 3. Assinaturas já feitas hoje
      const { data: assin } = await supabase
        .from('assinaturas_tecnico')
        .select('tipo')
        .eq('tecnico_id', tecnicoId)
        .gte('registado_em', inicioHoje())
        .lte('registado_em', fimHoje())

      const tipos = new Set((assin ?? []).map(a => a.tipo))

      // 4. Próxima acção
      let proxima = null
      if (temLmd && !tipos.has('lmd_entrada')) {
        proxima = { tipo: 'lmd_entrada', agendamentoId }
      } else if (temEvento && !tipos.has('evento_entrada')) {
        proxima = { tipo: 'evento_entrada', eventoId }
      } else if (temEvento && tipos.has('evento_entrada') && !tipos.has('evento_saida')) {
        proxima = { tipo: 'evento_saida', eventoId }
      } else if (temLmd && tipos.has('lmd_entrada') && !tipos.has('lmd_saida')) {
        proxima = { tipo: 'lmd_saida', agendamentoId }
      }

      setProxima(proxima)
    } catch (e) {
      console.error('useAssinaturaDia', e)
    } finally {
      setLoading(false)
    }
  }, [tecnicoId, versao])

  useEffect(() => { calcular() }, [calcular])

  const registar = useCallback(async (tipo, { eventoId = null, agendamentoId = null } = {}) => {
    if (!tecnicoId) return
    await supabase.from('assinaturas_tecnico').insert({
      tecnico_id: tecnicoId, evento_id: eventoId, agendamento_id: agendamentoId, tipo,
    })
    setVersao(v => v + 1)
  }, [tecnicoId])

  return { proxima, registar, loading }
}
