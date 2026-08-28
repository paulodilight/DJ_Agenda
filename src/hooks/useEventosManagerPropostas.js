import { useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

/** Mapeamento label do diff → campo em eventos_manager (para alterações) */
const LABEL_TO_CAMPO = {
  'Nome': 'nome',
  'Data': 'data',
  'Hora início': 'hora_inicio',
  'Hora fim': 'hora_fim',
  'Data instalação': 'data_instalacao',
  'Hora instalação': 'hora_instalacao',
  'Tipo': 'tipo',
  'Descrição': 'descricao',
  'Micros mão': 'req_micros_mao',
  'Qtd micros mão': 'req_micros_mao_qtd',
  'Headset': 'req_micros_headset',
  'Qtd headset': 'req_micros_headset_qtd',
  'TV 65"': 'req_tv65',
  'Led Wall': 'req_led_wall',
  'Apresentação media': 'req_apresentacao_media',
  'Formato media': 'req_media_formato',
  'Notas técnicas': 'req_extras',
  'Apoio DJ': 'req_apoio_dj',
  'Apoio Banda': 'req_apoio_banda',
  'Técnico': 'tecnico_id',
}

/** Mapeamento campos eventos_manager → supa_eventos */
const MAPA_SUPA = {
  nome: 'evento',
  data: 'data_evento',
  hora_inicio: 'hora_inicio',
  hora_fim: 'hora_fim',
  data_instalacao: 'dia_instalacao',
  hora_instalacao: 'hora_instalacao',
  tipo: 'tipo',
  descricao: 'descricao',
  req_micros_mao: 'req_micros_mao',
  req_micros_mao_qtd: 'req_micros_mao_qtd',
  req_micros_headset: 'req_micros_headset',
  req_micros_headset_qtd: 'req_micros_headset_qtd',
  req_tv65: 'req_tv65',
  req_led_wall: 'req_led_wall',
  req_apresentacao_media: 'req_apresentacao_media',
  req_media_formato: 'req_media_formato',
  req_extras: 'req_extras',
  req_apoio_dj: 'req_apoio_dj',
  req_apoio_banda: 'req_apoio_banda',
  // tecnico_id não sincroniza: o manager não gere técnicos
}

function tocarSom() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.setValueAtTime(880, ctx.currentTime)
    osc.frequency.setValueAtTime(660, ctx.currentTime + 0.12)
    gain.gain.setValueAtTime(0.4, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.5)
  } catch { /* silencioso se bloqueado */ }
}

export function useEventosManagerPropostas() {
  const [propostas, setPropostas] = useState([])
  const [loading, setLoading] = useState(true)
  const contadorRef = useRef(0)

  const carregar = useCallback(async () => {
    const { data } = await supabase
      .from('eventos_manager_propostas')
      .select('*')
      .eq('estado', 'pendente')
      .order('criado_em', { ascending: false })
    setPropostas(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    carregar()

    const canal = supabase
      .channel('propostas-manager')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'eventos_manager_propostas',
      }, (payload) => {
        if (payload.new?.estado === 'pendente') {
          setPropostas((prev) => [payload.new, ...prev])
          tocarSom()
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'eventos_manager_propostas',
      }, (payload) => {
        if (payload.new?.estado !== 'pendente') {
          setPropostas((prev) => prev.filter((p) => p.id !== payload.new.id))
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(canal) }
  }, [carregar])

  // Som ao abrir se já há propostas pendentes
  useEffect(() => {
    if (!loading && propostas.length > 0 && contadorRef.current === 0) {
      tocarSom()
    }
    contadorRef.current++
  }, [loading, propostas.length])

  const aprovar = useCallback(async (proposta) => {
    const fonte = proposta.tipo === 'alteracao'
      ? proposta.campos?.payload ?? {}
      : proposta.campos ?? {}

    const supaPayload = {}
    if (proposta.tipo === 'alteracao') {
      // Para alterações: só sincronizar campos que realmente mudaram (estão no diff)
      // Isso evita que campos como tecnico_id (null no manager) apaguem dados do DJ Schedule
      const diff = proposta.campos?.diff ?? []
      const camposMudaram = new Set(diff.map((d) => LABEL_TO_CAMPO[d.campo]).filter(Boolean))
      for (const [campoManager, campoSupa] of Object.entries(MAPA_SUPA)) {
        if (camposMudaram.has(campoManager) && campoManager in fonte) {
          supaPayload[campoSupa] = fonte[campoManager]
        }
      }
    } else {
      for (const [campoManager, campoSupa] of Object.entries(MAPA_SUPA)) {
        if (campoManager in fonte) {
          supaPayload[campoSupa] = fonte[campoManager]
        }
      }
    }
    // Mapear estado → status (só quando o estado realmente mudou na alteração)
    const estadoMudou = proposta.tipo !== 'alteracao' ||
      (proposta.campos?.diff ?? []).some((d) => d.campo === 'Estado')
    if (estadoMudou && 'estado' in fonte) {
      const e = fonte.estado
      supaPayload.status = e === 'Confirmado' ? 'confirmado' : e === 'Cancelado' ? 'cancelado' : 'proposta'
    }

    if (proposta.supa_evento_id) {
      // Alteração a evento existente — update normal
      const { error } = await supabase
        .from('supa_eventos')
        .update(supaPayload)
        .eq('id', proposta.supa_evento_id)
      if (error) return false
    } else if (proposta.tipo === 'criacao') {
      // Evento novo criado pelo manager — INSERT em supa_eventos
      const estadoManager = fonte.estado ?? 'Aberto'
      const statusSupa =
        estadoManager === 'Confirmado' ? 'confirmado'
        : estadoManager === 'Cancelado' ? 'cancelado'
        : 'proposta'

      const { data: novo, error } = await supabase
        .from('supa_eventos')
        .insert({ ...supaPayload, espaco_id: proposta.espaco_id, status: statusSupa })
        .select('id')
        .single()
      if (error) return false

      // Ligar eventos_manager ao novo supa_evento
      await supabase
        .from('eventos_manager')
        .update({ supa_evento_id: novo.id })
        .eq('id', proposta.evento_id)
    } else if (proposta.tipo === 'alteracao') {
      // Alteração criada antes da criação ser aprovada — buscar supa_evento_id do eventos_manager
      const { data: em } = await supabase
        .from('eventos_manager')
        .select('supa_evento_id')
        .eq('id', proposta.evento_id)
        .maybeSingle()
      if (em?.supa_evento_id) {
        const { error } = await supabase
          .from('supa_eventos')
          .update(supaPayload)
          .eq('id', em.supa_evento_id)
        if (error) return false
      } else if (fonte.estado === 'Confirmado') {
        // Evento órfão a ser confirmado → criar supa_evento e ligar
        const { data: novo, error } = await supabase
          .from('supa_eventos')
          .insert({ ...supaPayload, espaco_id: proposta.espaco_id, status: 'confirmado' })
          .select('id')
          .single()
        if (error) return false
        await supabase
          .from('eventos_manager')
          .update({ supa_evento_id: novo.id })
          .eq('id', proposta.evento_id)
      }
      // Orphan sem confirmação → aprovar sem sync (só limpa a proposta pendente)
    } else {
      return false
    }

    await supabase
      .from('eventos_manager_propostas')
      .update({ estado: 'aprovado', processado_em: new Date().toISOString() })
      .eq('id', proposta.id)

    setPropostas((prev) => prev.filter((p) => p.id !== proposta.id))
    return true
  }, [])

  const rejeitar = useCallback(async (propostaId) => {
    await supabase
      .from('eventos_manager_propostas')
      .update({ estado: 'rejeitado', processado_em: new Date().toISOString() })
      .eq('id', propostaId)
    setPropostas((prev) => prev.filter((p) => p.id !== propostaId))
  }, [])

  return { propostas, loading, aprovar, rejeitar }
}
