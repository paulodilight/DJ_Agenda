/**
 * API da área dos colaboradores (Apoio T).
 * - Eventos + folgas: projecto principal (cliente `supabase`).
 * - Tarefas: projecto iVO Assistant (cliente `supaEventos`), ligadas por 1.º nome.
 * Acesso anónimo (sem Supabase Auth) — login validado por RPC SECURITY DEFINER.
 */
import { supabase, supaEventos } from './supabase'

const hojeISO = () => {
  const d = new Date()
  const off = d.getTimezoneOffset()
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10)
}

const chaveOrdem = (e) => `${e.data_evento ?? '9999-99-99'}T${e.hora_inicio ?? '00:00'}`

export const colaboradorApi = {
  // ── Autenticação ────────────────────────────────────────────────────────────
  async login(nome, pin) {
    const { data, error } = await supabase.rpc('colaborador_login', {
      p_nome: nome,
      p_pin: String(pin),
    })
    if (error) throw error
    return data?.[0] ?? null
  },

  async listarColaboradores() {
    const { data, error } = await supabase
      .from('vw_colaboradores')
      .select('id, nome, foto_url')
      .order('nome')
    if (error) throw error
    return data ?? []
  },

  // ── Eventos ───────────────────────────────────────────────────────────────--
  // Devolve TODOS os eventos activos, marcando quais pertencem ao técnico (meu:true)
  async eventosDoTecnico(tecnicoId) {
    const { data: et } = await supabase
      .from('evento_tecnicos')
      .select('evento_id')
      .eq('tecnico_id', tecnicoId)
    const equipaIds = new Set((et ?? []).map((r) => r.evento_id))

    const COLS = 'id,evento,tipo,status,fase,assinatura_lmd_at,assinatura_in_at,assinatura_out_at,tecnico_id,todos_tecnicos,contacto_pelo_evento,morada,dia_instalacao,hora_instalacao,data_evento,hora_inicio,hora_fim,notas_operacionais,Equipamentos,notas_colaborador,espaco_id,responsavel,data_preparacao,notas_preparacao,espacos(nome,logo_url)'
    const { data, error } = await supabase
      .from('supa_eventos')
      .select(COLS)
      .neq('status', 'cancelado')
      .order('data_evento', { ascending: true })
    if (error) throw error

    // Carregar TODOS os evento_tecnicos para mostrar "outros técnicos" no modal
    const evIds = (data ?? []).map(e => e.id)
    let etIdx = {}
    if (evIds.length > 0) {
      const { data: allEt } = await supabase
        .from('evento_tecnicos').select('evento_id, tecnico_id').in('evento_id', evIds)
      ;(allEt ?? []).forEach(({ evento_id, tecnico_id }) => {
        if (!etIdx[evento_id]) etIdx[evento_id] = []
        etIdx[evento_id].push(tecnico_id)
      })
    }

    return (data ?? []).map((e) => {
      const isResp   = e.tecnico_id === tecnicoId || e.todos_tecnicos === true
      const isEquipa = equipaIds.has(e.id)
      const meu      = isResp || isEquipa
      const fonte    = isResp && isEquipa ? 'ambos' : isResp ? 'responsavel' : isEquipa ? 'equipa' : null
      return { ...e, meu, fonte, _tecnicosIds: etIdx[e.id] ?? [] }
    })
  },

  async proximoEvento(tecnicoId) {
    const evs = await this.eventosDoTecnico(tecnicoId)
    const hoje = hojeISO()
    return (
      evs
        .filter((e) => e.meu && e.data_evento && e.data_evento >= hoje)
        .sort((a, b) => chaveOrdem(a).localeCompare(chaveOrdem(b)))[0] ?? null
    )
  },

  // ── Eventos + folgas filtrados por mês (para a Agenda) ────────────────────
  async eventosDoTecnicoMes(tecnicoId, dataInicio, dataFim) {
    const { data: et } = await supabase
      .from('evento_tecnicos').select('evento_id').eq('tecnico_id', tecnicoId)
    const equipaIds = new Set((et ?? []).map(r => r.evento_id))

    const COLS = 'id,evento,tipo,status,tecnico_id,contacto_pelo_evento,morada,dia_instalacao,hora_instalacao,data_evento,hora_inicio,hora_fim,notas_operacionais,Equipamentos,notas_colaborador,espaco_id,responsavel,espacos(nome)'
    const { data, error } = await supabase
      .from('supa_eventos')
      .select(COLS)
      .gte('data_evento', dataInicio)
      .lte('data_evento', dataFim)
      .neq('status', 'cancelado')
      .order('data_evento', { ascending: true })
      .order('hora_inicio', { ascending: true })
    if (error) throw error
    return (data ?? []).filter(e => e.tecnico_id === tecnicoId || equipaIds.has(e.id))
  },

  async folgasDoTecnicoMes(tecnicoId, dataInicio, dataFim) {
    const { data, error } = await supabase
      .from('agendamentos_tecnicos')
      .select('data')
      .eq('tecnico_id', tecnicoId)
      .eq('folga', true)
      .gte('data', dataInicio)
      .lte('data', dataFim)
    if (error) throw error
    return new Set((data ?? []).map(f => f.data))
  },

  async guardarNotasColaborador(eventoId, notas) {
    const { error } = await supabase
      .from('supa_eventos')
      .update({ notas_colaborador: notas })
      .eq('id', eventoId)
    if (error) throw error
  },

  // ── Folgas ────────────────────────────────────────────────────────────────--
  async folgasDoTecnico(tecnicoId) {
    const { data, error } = await supabase
      .from('agendamentos_tecnicos')
      .select('id, data, folga')
      .eq('tecnico_id', tecnicoId)
      .eq('folga', true)
      .order('data', { ascending: true })
    if (error) throw error
    return data ?? []
  },

  // ── Tarefas (projecto iVO) ───────────────────────────────────────────────────
  async tarefasDoColaborador(nome) {
    const primeiro = (nome ?? '').trim().split(/\s+/)[0]
    if (!primeiro) return []
    const { data, error } = await supaEventos
      .from('supa_tarefas')
      .select('id, tarefa, responsavel, estado, confirmacao, data_conclusao, hora, tipo, notas_operacionais, criado_por, foto_url, concluida_em, recorrencia, motivo_validacao')
      .ilike('responsavel', `%${primeiro}%`)
      .order('data_conclusao', { ascending: true })
    if (error) throw error
    return data ?? []
  },

  async actualizarEstadoTarefa(id, estado, extra = {}) {
    const concluida = estado === 'concluída'
    const { error } = await supaEventos
      .from('supa_tarefas')
      .update({
        estado,
        confirmacao: concluida ? 'concluida' : 'nao_concluida',
        concluida_em: concluida ? new Date().toISOString() : null,
        ...extra,
      })
      .eq('id', id)
    if (error) throw error
    if (concluida) {
      fetch('https://i4dj.app.n8n.cloud/webhook/tarefa-concluida', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      }).catch(() => {})
    }
  },

  async actualizarFotoTarefa(id, fotoUrl) {
    const { error } = await supaEventos
      .from('supa_tarefas')
      .update({ foto_url: fotoUrl })
      .eq('id', id)
    if (error) throw error
  },

  // ── Alterar PIN ──────────────────────────────────────────────────────────--
  async alterarPin(id, pinActual, pinNovo) {
    const { data, error } = await supabase.rpc('colaborador_change_pin', {
      p_id: id, p_pin_atual: pinActual, p_pin_novo: pinNovo,
    })
    if (error) throw error
    return data // true = sucesso, false = PIN actual errado
  },

  // ── Foto de perfil ────────────────────────────────────────────────────────--
  async uploadFoto(tecnicoId, file) {
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
    const path = `${tecnicoId}/${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage
      .from('tecnico-fotos')
      .upload(path, file, { upsert: true, contentType: file.type })
    if (upErr) throw upErr
    const { data: pub } = supabase.storage.from('tecnico-fotos').getPublicUrl(path)
    const url = pub.publicUrl
    const { error } = await supabase.rpc('colaborador_set_foto', { p_id: tecnicoId, p_url: url })
    if (error) throw error
    return url
  },
}
