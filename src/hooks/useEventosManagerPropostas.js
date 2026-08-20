import { useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

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
  tecnico_id: 'tecnico_id',
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
    if (!proposta.supa_evento_id) return false

    // Construir payload para supa_eventos a partir do payload da proposta
    const fonte = proposta.tipo === 'alteracao'
      ? proposta.campos?.payload ?? {}
      : proposta.campos ?? {}

    const supaPayload = {}
    for (const [campoManager, campoSupa] of Object.entries(MAPA_SUPA)) {
      if (campoManager in fonte) {
        supaPayload[campoSupa] = fonte[campoManager]
      }
    }

    const { error } = await supabase
      .from('supa_eventos')
      .update(supaPayload)
      .eq('id', proposta.supa_evento_id)

    if (error) return false

    await supabase
      .from('eventos_manager_propostas')
      .update({ estado: 'aprovado', processado_em: new Date().toISOString() })
      .eq('id', proposta.id)

    return true
  }, [])

  const rejeitar = useCallback(async (propostaId) => {
    await supabase
      .from('eventos_manager_propostas')
      .update({ estado: 'rejeitado', processado_em: new Date().toISOString() })
      .eq('id', propostaId)
  }, [])

  return { propostas, loading, aprovar, rejeitar }
}
