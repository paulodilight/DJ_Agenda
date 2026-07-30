/**
 * Determina qual a próxima assinatura do técnico para hoje.
 *
 * Tipos: in_work · in_evento · out_work
 *
 * Fluxo:
 *  Evento normal  : in_work → in_evento → out_work
 *  Evento LMD     : in_work → out_work  (sem in_evento)
 *  Só LMD/fixo    : in_work → out_work
 */
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

function obterPosicao() {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve({ latitude: null, longitude: null })
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      ()    => resolve({ latitude: null, longitude: null }),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    )
  })
}

const LMD_ESPACO_ID = '299fc621-afe2-42c9-ba87-5c7080f2a32d'
const TIPOS_VALIDOS = ['in_work', 'in_evento', 'out_work']

const hojeISO = () => {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}
const inicioHoje = () => `${hojeISO()}T00:00:00.000Z`
const fimHoje   = () => `${hojeISO()}T23:59:59.999Z`

export function useAssinaturaDia(tecnicoId, eventoIdFixo = null) {
  const [proxima,     setProxima]     = useState(null)
  const [feitas,      setFeitas]      = useState([])
  const [tiposFeitos, setTiposFeitos] = useState([]) // in_work / out_work já assinados hoje
  const [loading,     setLoading]     = useState(true)
  const [versao,      setVersao]      = useState(0)

  const calcular = useCallback(async () => {
    if (!tecnicoId) { setLoading(false); return }
    setLoading(true)
    try {
      const hoje = hojeISO()

      // 1. Eventos de hoje deste técnico
      const [{ data: evDireto }, { data: evIds }] = await Promise.all([
        supabase.from('supa_eventos')
          .select('id, espaco_id')
          .eq('tecnico_id', tecnicoId)
          .eq('data_evento', hoje)
          .neq('status', 'cancelado'),
        supabase.from('evento_tecnicos').select('evento_id').eq('tecnico_id', tecnicoId),
      ])

      let evExtra = []
      const ids = (evIds ?? []).map(r => r.evento_id)
      if (ids.length > 0) {
        const { data: evHoje } = await supabase
          .from('supa_eventos').select('id, espaco_id')
          .in('id', ids).eq('data_evento', hoje).neq('status', 'cancelado')
        evExtra = evHoje ?? []
      }

      const todos = [...(evDireto ?? []), ...evExtra]
        .filter((e, i, arr) => arr.findIndex(x => x.id === e.id) === i)

      const eventosExterno = todos.filter(e => e.espaco_id !== LMD_ESPACO_ID)
      const mainEventoId   = todos[0]?.id ?? null

      // Determina se deve mostrar assinaturas hoje:
      // tem eventos OU é técnico fixo sem folga
      let temTrabalho = todos.length > 0
      if (!temTrabalho) {
        const [{ data: tec }, { data: folga }] = await Promise.all([
          supabase.from('vw_colaboradores').select('tipo').eq('id', tecnicoId).maybeSingle(),
          supabase.from('agendamentos_tecnicos').select('id')
            .eq('tecnico_id', tecnicoId).eq('data', hoje).eq('folga', true).maybeSingle(),
        ])
        temTrabalho = tec?.tipo === 'fixo' && !folga
      }

      // 2. Assinaturas já feitas hoje — só tipos válidos do novo sistema
      const { data: assin } = await supabase
        .from('assinaturas_tecnico')
        .select('tipo, evento_id, registado_em')
        .eq('tecnico_id', tecnicoId)
        .in('tipo', TIPOS_VALIDOS)
        .gte('registado_em', inicioHoje())
        .lte('registado_em', fimHoje())

      // feitas: para EventoModal (eventoIdFixo passado) → in_evento desse evento
      const assinFeitas = eventoIdFixo
        ? (assin ?? []).filter(a => a.evento_id === eventoIdFixo && a.tipo === 'in_evento')
        : []
      setFeitas(assinFeitas.map(a => ({ tipo: a.tipo, registado_em: a.registado_em })))

      // tiposFeitos: todos os tipos assinados hoje (para badges no Dashboard)
      const feitos = (assin ?? []).filter(a => TIPOS_VALIDOS.includes(a.tipo))
      setTiposFeitos(feitos.map(a => ({ tipo: a.tipo, registado_em: a.registado_em })))

      if (!temTrabalho) { setProxima(null); return }

      const tiposGeral = new Set((assin ?? []).map(a => a.tipo))

      // Eventos externos sem in_evento ainda
      const semInEvento = eventosExterno.filter(e =>
        !(assin ?? []).some(a => a.tipo === 'in_evento' && a.evento_id === e.id)
      )
      const todoInEventoFeito = eventosExterno.length === 0
        || eventosExterno.every(e => (assin ?? []).some(a => a.tipo === 'in_evento' && a.evento_id === e.id))

      // 3. Próxima acção
      let proxima = null
      if (!tiposGeral.has('in_work')) {
        proxima = { tipo: 'in_work', eventoId: mainEventoId }
      } else if (semInEvento.length > 0) {
        proxima = { tipo: 'in_evento', eventoId: semInEvento[0].id }
      } else if (!tiposGeral.has('out_work') && todoInEventoFeito) {
        proxima = { tipo: 'out_work', eventoId: mainEventoId }
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
    const { latitude, longitude } = await obterPosicao()
    await supabase.from('assinaturas_tecnico').insert({
      tecnico_id: tecnicoId, evento_id: eventoId, agendamento_id: agendamentoId, tipo,
      latitude, longitude,
    })
    setVersao(v => v + 1)
  }, [tecnicoId])

  return { proxima, registar, loading, feitas, tiposFeitos }
}
