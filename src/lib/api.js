import { supabase } from './supabase'

// ─── DJs ────────────────────────────────────────────────────────────────────

export const djsApi = {
  async listar() {
    const { data, error } = await supabase.from('djs').select('*').order('nome_artistico')
    if (error) throw error
    return data
  },

  async buscar(id) {
    const { data, error } = await supabase.from('djs').select('*').eq('id', id).single()
    if (error) throw error
    return data
  },

  async criar(dj) {
    // eslint-disable-next-line no-unused-vars
    const { tier_ids, id, criado_em, actualizado_em, telefone, dj_tiers, tiers, categoria_id, ...djData } = dj
    const { data, error } = await supabase
      .from('djs')
      .insert(djData)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async actualizar(id, alteracoes) {
    // eslint-disable-next-line no-unused-vars
    const { tier_ids, id: _id, criado_em, actualizado_em, telefone, dj_tiers, tiers, categoria_id, ...djData } = alteracoes
    const { data, error } = await supabase
      .from('djs')
      .update({ ...djData, actualizado_em: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async apagar(id) {
    const { error } = await supabase.from('djs').delete().eq('id', id)
    if (error) throw error
  },

  async actualizarMeta(id, { meta_datas_mes, orcamento_max }) {
    const { error } = await supabase
      .from('djs')
      .update({ meta_datas_mes, orcamento_max, actualizado_em: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error
  },
}

// ─── Clientes ─────────────────────────────────────────────────────────────────

export const espacosApi = {
  async listar({ incluirInactivos = false } = {}) {
    let query = supabase
      .from('espacos')
      .select('*, turnos_espaco!turnos_espaco_espaco_id_fkey(id, nome, ordem, dias_semana, hora_inicio, hora_fim, valor)')
      .order('nome')
    if (!incluirInactivos) query = query.eq('activo', true)
    const { data, error } = await query
    if (error) throw error
    return data ?? []
  },

  // Conta slots de agenda e eventos por Cliente num intervalo de datas
  async atividadeMes(dataInicio, dataFim) {
    const [agendaRes, eventosRes] = await Promise.all([
      supabase.from('agenda')
        .select('espaco_id')
        .gte('data', dataInicio)
        .lte('data', dataFim)
        .neq('estado', 'cancelado'),
      supabase.from('supa_eventos')
        .select('espaco_id')
        .gte('data_evento', dataInicio)
        .lte('data_evento', dataFim)
        .neq('status', 'cancelado'),
    ])
    const mapa = {}
    ;(agendaRes.data ?? []).forEach(r => {
      if (!mapa[r.espaco_id]) mapa[r.espaco_id] = { agenda: 0, eventos: 0 }
      mapa[r.espaco_id].agenda++
    })
    ;(eventosRes.data ?? []).forEach(r => {
      if (!mapa[r.espaco_id]) mapa[r.espaco_id] = { agenda: 0, eventos: 0 }
      mapa[r.espaco_id].eventos++
    })
    return mapa // { [espacoId]: { agenda: N, eventos: N } }
  },

  async activar(id) {
    const { error } = await supabase.from('espacos').update({ activo: true }).eq('id', id)
    if (error) throw error
  },

  async desactivar(id) {
    const { error } = await supabase.from('espacos').update({ activo: false }).eq('id', id)
    if (error) throw error
  },

  async buscar(id) {
    const { data, error } = await supabase
      .from('espacos')
      .select('*')
      .eq('id', id)
      .single()
    if (error) throw error
    return data
  },

  async criar(espaco) {
    const { data, error } = await supabase
      .from('espacos')
      .insert(espaco)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async actualizar(id, alteracoes) {
    // eslint-disable-next-line no-unused-vars
    const { turnos_espaco, id: _id, criado_em, actualizado_em, ...dados } = alteracoes
    const { data, error } = await supabase
      .from('espacos')
      .update(dados)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async buscarCompleto(id) {
    const [espaco, turnos, djsFixos] = await Promise.all([
      supabase.from('espacos').select('*').eq('id', id).single(),
      supabase.from('turnos_espaco').select('*').eq('espaco_id', id).order('ordem'),
      supabase.from('djs_fixos_espaco').select('turno_id, dia_semana, dj_id').eq('espaco_id', id),
    ])
    if (espaco.error) throw espaco.error
    if (turnos.error) throw turnos.error
    if (djsFixos.error) throw djsFixos.error
    return { ...espaco.data, turnos: turnos.data, djs_fixos: djsFixos.data }
  },
}

// ─── Turnos por Cliente ────────────────────────────────────────────────────────

export const turnosApi = {
  async guardar(espacoId, turnos) {
    // Apaga todos os turnos existentes e recria (upsert simples)
    const { error: delErr } = await supabase
      .from('turnos_espaco')
      .delete()
      .eq('espaco_id', espacoId)
    if (delErr) throw delErr

    if (turnos.length === 0) return []

    const { data, error } = await supabase
      .from('turnos_espaco')
      .insert(turnos.map((t, i) => ({
        espaco_id: espacoId,
        nome: t.nome,
        dias_semana: t.dias_semana ?? [],
        ordem: i,
      })))
      .select()
    if (error) throw error
    return data
  },
}

// ─── DJs fixos por dia da semana ─────────────────────────────────────────────

export const djsFixosApi = {
  // djsFixos = [{ turno_id, dia_semana, dj_id }]
  async guardar(espacoId, djsFixos) {
    const { error: delErr } = await supabase
      .from('djs_fixos_espaco')
      .delete()
      .eq('espaco_id', espacoId)
    if (delErr) throw delErr

    const registos = djsFixos.map((d) => ({
      espaco_id: espacoId,
      turno_id: d.turno_id,
      dia_semana: d.dia_semana,
      dj_id: d.dj_id || null,
    }))

    if (registos.length === 0) return []
    const { data, error } = await supabase
      .from('djs_fixos_espaco')
      .insert(registos)
      .select()
    if (error) throw error
    return data
  },
}

// ─── Agenda ──────────────────────────────────────────────────────────────────

export const agendaApi = {
  async listar({ dataInicio, dataFim, espacoId, djId } = {}) {
    let query = supabase
      .from('agenda')
      .select(`
        *,
        djs!agenda_dj_id_fkey ( nome_artistico, tier_id, presskit_url, instagram_url ),
        espacos!agenda_espaco_id_fkey ( nome, tipo )
      `)
      .order('data')
      .order('hora_inicio')

    if (dataInicio) query = query.gte('data', dataInicio)
    if (dataFim) query = query.lte('data', dataFim)
    if (espacoId) query = query.eq('espaco_id', espacoId)
    if (djId) query = query.eq('dj_id', djId)

    const { data, error } = await query
    if (error) throw error

    return data.map((s) => ({
      ...s,
      // Prefere o nome do DJ da base; fallback para dj_nome guardado (DJs externos/convidados)
      dj_nome: s.djs?.nome_artistico ?? s.dj_nome ?? null,
      dj_tier: s.djs?.tier_id ?? null,
      dj_presskit: s.djs?.presskit_url ?? null,
      dj_instagram: s.djs?.instagram_url ?? null,
      espaco_nome: s.espacos?.nome ?? null,
      espaco_tipo: s.espacos?.tipo ?? null,
    }))
  },

  async criar(slot) {
    // eslint-disable-next-line no-unused-vars
    const { djs, espacos, dj_nome: _djNomeDisplay, dj_tier, dj_presskit, dj_instagram,
            espaco_nome, espaco_tipo, dj_externo,
            id: _id, criado_em, actualizado_em, ...dados } = slot
    // Converte strings vazias para null em campos UUID
    dados.dj_id     = dados.dj_id     || null
    dados.espaco_id = dados.espaco_id || null
    // Se não há dj_id, guarda o nome livre (DJ convidado/externo) em dj_nome
    dados.dj_nome = dados.dj_id ? null : (dj_externo?.trim() || null)
    const { data, error } = await supabase
      .from('agenda')
      .insert(dados)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async actualizar(id, alteracoes) {
    // eslint-disable-next-line no-unused-vars
    const { djs, espacos, dj_nome: _djNomeDisplay, dj_tier, dj_presskit, dj_instagram,
            espaco_nome, espaco_tipo, dj_externo,
            id: _id, criado_em, actualizado_em, ...dados } = alteracoes
    // Converte strings vazias para null em campos UUID
    dados.dj_id     = dados.dj_id     || null
    dados.espaco_id = dados.espaco_id || null
    // Se não há dj_id, guarda o nome livre (DJ convidado/externo) em dj_nome
    dados.dj_nome = dados.dj_id ? null : (dj_externo?.trim() || null)
    const { data, error } = await supabase
      .from('agenda')
      .update({ ...dados, actualizado_em: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },

  // Muda apenas a confirmação WPP sem tocar nos restantes campos
  async mudarConfirmacaoWpp(id, confirmacao_wpp) {
    const { error } = await supabase
      .from('agenda')
      .update({ confirmacao_wpp, actualizado_em: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error
  },

  // Muda apenas o estado sem tocar nos restantes campos (evita limpar dj_nome)
  async mudarEstado(id, estado) {
    const { error } = await supabase
      .from('agenda')
      .update({ estado, actualizado_em: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error
  },

  // Move-only: só actualiza data / turno_id / espaco_id sem tocar no DJ
  async moverSlot(id, { data, turno_id, espaco_id }) {
    const updates = { actualizado_em: new Date().toISOString() }
    if (data       !== undefined) updates.data       = data
    if (turno_id   !== undefined) updates.turno_id   = turno_id
    if (espaco_id  !== undefined) updates.espaco_id  = espaco_id
    const { error } = await supabase.from('agenda').update(updates).eq('id', id)
    if (error) throw error
  },

  // Atribui apenas o DJ a um slot (sem tocar nos restantes campos)
  async atribuirDJ(id, djId, djNome) {
    const { error } = await supabase
      .from('agenda')
      .update({ dj_id: djId, dj_nome: djNome, actualizado_em: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error
  },

  async apagar(id) {
    const { error } = await supabase.from('agenda').delete().eq('id', id)
    if (error) throw error
  },

  async contarPorDJ(mesFiltro) {
    const { data, error } = await supabase
      .from('agenda')
      .select('dj_id, data, valor')
      .not('dj_id', 'is', null)
    if (error) throw error
    const agora = new Date()
    const mes = mesFiltro ?? `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`
    const counts = {}
    data.forEach((s) => {
      if (!counts[s.dj_id]) counts[s.dj_id] = { total: 0, mesCorrente: 0, valorCorrente: 0 }
      counts[s.dj_id].total++
      if (s.data?.startsWith(mes)) { counts[s.dj_id].mesCorrente++; counts[s.dj_id].valorCorrente += s.valor ?? 0 }
    })
    return counts
  },

  async confirmarProposta(ids) {
    const { error } = await supabase
      .from('agenda')
      .update({ estado: 'confirmado', actualizado_em: new Date().toISOString() })
      .in('id', ids)
    if (error) throw error
  },

  async inserirProposta(slots) {
    const { data, error } = await supabase
      .from('agenda')
      .insert(slots)
      .select()
    if (error) throw error
    return data
  },
}

// ─── Disponibilidades ────────────────────────────────────────────────────────

export const disponibilidadesApi = {
  async listarPorDJ(djId) {
    const { data, error } = await supabase
      .from('disponibilidades')
      .select('*')
      .eq('dj_id', djId)
      .order('data', { ascending: false })
    if (error) throw error
    return data
  },

  async listarPorPeriodo(dataInicio, dataFim) {
    const { data, error } = await supabase
      .from('v_djs_disponiveis')
      .select('*')
      .gte('data', dataInicio)
      .lte('data', dataFim)
    if (error) throw error
    return data
  },

  async apagar(djId, data) {
    const { error } = await supabase
      .from('disponibilidades')
      .delete()
      .eq('dj_id', djId)
      .eq('data', data)
    if (error) throw error
  },

  async registar(djId, data, disponivel = true, notas = '') {
    const { data: result, error } = await supabase
      .from('disponibilidades')
      .upsert({ dj_id: djId, data, disponivel, notas }, { onConflict: 'dj_id,data' })
      .select()
      .single()
    if (error) throw error
    return result
  },

  // Devolve o registo se o DJ marcou a data como indisponível (disponivel=false), ou null
  async verificarIndisponivel(djId, data) {
    if (!djId) return null
    const { data: result } = await supabase
      .from('disponibilidades')
      .select('disponivel, notas')
      .eq('dj_id', djId)
      .eq('data', data)
      .eq('disponivel', false)
      .maybeSingle()
    return result ?? null
  },
}

// ─── Bloqueios ───────────────────────────────────────────────────────────────

export const bloqueiosApi = {
  async listar() {
    const { data, error } = await supabase
      .from('bloqueios')
      .select(`
        *,
        dj:djs!bloqueios_dj_id_fkey(id, nome_artistico),
        dj_swap:djs!bloqueios_dj_swap_id_fkey(id, nome_artistico),
        espaco:espacos(id, nome)
      `)
      .eq('activo', true)
      .order('criado_em', { ascending: false })
    if (error) throw error
    return data
  },

  async criar(bloqueio) {
    const { data, error } = await supabase
      .from('bloqueios')
      .insert(bloqueio)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async desactivar(id) {
    const { error } = await supabase
      .from('bloqueios')
      .update({ activo: false })
      .eq('id', id)
    if (error) throw error
  },

  async reactivar(id) {
    const { error } = await supabase
      .from('bloqueios')
      .update({ activo: true })
      .eq('id', id)
    if (error) throw error
  },
}

// ─── Categorias permitidas por turno ─────────────────────────────────────────

export const turnoCategoriaApi = {
  // Retorna { turno_id: [categoria_id, ...] } para todos os turnos do Cliente
  async listarPorEspaco(espacoId) {
    const turnosIds = (
      await supabase.from('turnos_espaco').select('id').eq('espaco_id', espacoId)
    ).data?.map(t => t.id) ?? []
    if (!turnosIds.length) return {}
    const { data, error } = await supabase
      .from('turno_categorias')
      .select('turno_id, categoria_id')
      .in('turno_id', turnosIds)
    if (error) throw error
    const map = {}
    ;(data ?? []).forEach(({ turno_id, categoria_id }) => {
      if (!map[turno_id]) map[turno_id] = []
      map[turno_id].push(categoria_id)
    })
    return map
  },

  // categoriaIds = [id, ...]
  async guardar(turnoId, categoriaIds) {
    const { error: delErr } = await supabase
      .from('turno_categorias').delete().eq('turno_id', turnoId)
    if (delErr) throw delErr
    if (!categoriaIds.length) return []
    const { data, error } = await supabase
      .from('turno_categorias')
      .insert(categoriaIds.map(cid => ({ turno_id: turnoId, categoria_id: cid })))
      .select()
    if (error) throw error
    return data
  },
}

// ─── Valores por dia por turno ───────────────────────────────────────────────

export const turnoValoresDiaApi = {
  async listarPorEspaco(espacoId) {
    // Busca todos os valores de todos os turnos do Cliente de uma vez
    const { data, error } = await supabase
      .from('turno_valores_dia')
      .select('turno_id, dia_semana, valor, hora_inicio, hora_fim')
      .in('turno_id',
        (await supabase.from('turnos_espaco').select('id').eq('espaco_id', espacoId))
          .data?.map(t => t.id) ?? []
      )
    if (error) throw error
    return data ?? []
  },

  async buscarConfigDia(turnoId, diaSemana) {
    // Retorna { hora_inicio, hora_fim, valor } para turno+dia, ou null se não existir
    const { data } = await supabase
      .from('turno_valores_dia')
      .select('hora_inicio, hora_fim, valor')
      .eq('turno_id', turnoId)
      .eq('dia_semana', diaSemana)
      .maybeSingle()
    return data ?? null
  },

  async guardar(turnoId, configDia) {
    // configDia = { [diaIdx]: { valor: string, hora_inicio: string, hora_fim: string } }
    const { error: delErr } = await supabase
      .from('turno_valores_dia')
      .delete()
      .eq('turno_id', turnoId)
    if (delErr) throw delErr

    const linhas = Object.entries(configDia)
      .filter(([, cfg]) => cfg && (cfg.valor !== '' || cfg.hora_inicio || cfg.hora_fim))
      .map(([dia, cfg]) => ({
        turno_id:    turnoId,
        dia_semana:  Number(dia),
        valor:       cfg.valor !== '' && cfg.valor != null ? Number(cfg.valor) : null,
        hora_inicio: cfg.hora_inicio || null,
        hora_fim:    cfg.hora_fim    || null,
      }))

    if (!linhas.length) return []
    const { data, error } = await supabase
      .from('turno_valores_dia')
      .insert(linhas)
      .select()
    if (error) throw error
    return data
  },
}

// ─── Categorias DJ ───────────────────────────────────────────────────────────

export const categoriasDjApi = {
  async listar() {
    const { data, error } = await supabase
      .from('categorias_dj')
      .select('*')
      .order('ordem')
    if (error) throw error
    return data
  },
}

// ─── DJ ↔ Categorias (junction) ──────────────────────────────────────────────

export const djCategoriasApi = {
  // Retorna array de categoria_id ordenado por posicao [id1, id2, id3]
  async listar(djId) {
    const { data, error } = await supabase
      .from('dj_categorias')
      .select('categoria_id, posicao')
      .eq('dj_id', djId)
      .order('posicao')
    if (error) throw error
    return (data ?? []).map(r => r.categoria_id)
  },

  // categoriaIds = [id|null, id|null, id|null] (posições 1, 2, 3)
  async guardar(djId, categoriaIds) {
    // Apagar todas as entradas existentes
    const { error: delErr } = await supabase
      .from('dj_categorias')
      .delete()
      .eq('dj_id', djId)
    if (delErr) throw delErr

    const novas = categoriaIds
      .map((cid, i) => ({ dj_id: djId, categoria_id: cid, posicao: i + 1 }))
      .filter(r => r.categoria_id != null)

    if (!novas.length) return []
    const { data, error } = await supabase
      .from('dj_categorias')
      .insert(novas)
      .select()
    if (error) throw error
    return data
  },
}

// ─── Configurações ───────────────────────────────────────────────────────────

export const configuracoesApi = {
  async listar() {
    const { data, error } = await supabase.from('configuracoes').select('*')
    if (error) throw error
    return Object.fromEntries(data.map((c) => [c.chave, c.valor]))
  },

  async actualizar(chave, valor) {
    const { error } = await supabase
      .from('configuracoes')
      .update({ valor: String(valor) })
      .eq('chave', chave)
    if (error) throw error
  },
}

// ─── Regras de atuação (mostradas aos DJs no modal de cada data) ──────────────

export const regrasAtuacaoApi = {
  async obter() {
    const { data, error } = await supabase
      .from('regras_atuacao')
      .select('conteudo')
      .eq('id', 1)
      .maybeSingle()
    if (error) throw error
    return data?.conteudo ?? ''
  },

  async guardar(conteudo) {
    const { error } = await supabase
      .from('regras_atuacao')
      .upsert(
        { id: 1, conteudo: conteudo ?? '', atualizado_em: new Date().toISOString() },
        { onConflict: 'id' }
      )
    if (error) throw error
  },
}

// ─── Preferências DJ por Cliente ──────────────────────────────────────────────

export const djPreferenciasEspacoApi = {
  async listar(djId) {
    const { data, error } = await supabase
      .from('dj_preferencias_espaco')
      .select('*, espacos(nome)')
      .eq('dj_id', djId)
    if (error) throw error
    return data
  },

  async guardar(djId, prefs) {
    // prefs = [{ espaco_id, preferencia, notas }]
    // Delete existing and re-insert
    const { error: delErr } = await supabase
      .from('dj_preferencias_espaco')
      .delete()
      .eq('dj_id', djId)
    if (delErr) throw delErr
    if (!prefs.length) return []
    const { data, error } = await supabase
      .from('dj_preferencias_espaco')
      .insert(prefs.map((p) => ({ ...p, dj_id: djId })))
      .select()
    if (error) throw error
    return data
  },
}

// ─── Preferências do Cliente por DJ ───────────────────────────────────────────

export const espacoDjPreferenciasApi = {
  async listar(espacoId) {
    const { data, error } = await supabase
      .from('espaco_dj_preferencias')
      .select('*')
      .eq('espaco_id', espacoId)
    if (error) throw error
    return data
  },

  async guardar(espacoId, prefs) {
    // prefs = [{ dj_id, tipo }] — só entradas 'preferido' e 'excluido'
    const { error: delErr } = await supabase
      .from('espaco_dj_preferencias')
      .delete()
      .eq('espaco_id', espacoId)
      .in('tipo', ['preferido', 'excluido'])
    if (delErr) throw delErr
    if (!prefs.length) return []
    const { data, error } = await supabase
      .from('espaco_dj_preferencias')
      .insert(prefs.map((p) => ({ espaco_id: espacoId, dj_id: p.dj_id, tipo: p.tipo })))
      .select()
    if (error) throw error
    return data
  },

  // Sentido inverso: gerir as preferências dos espaços a partir do perfil do DJ
  async listarPorDj(djId) {
    const { data, error } = await supabase
      .from('espaco_dj_preferencias')
      .select('espaco_id, tipo, espacos(nome)')
      .eq('dj_id', djId)
    if (error) throw error
    return data
  },

  async guardarPorDj(djId, prefs) {
    // prefs = [{ espaco_id, tipo }] — só entradas 'preferido' e 'excluido'
    const { error: delErr } = await supabase
      .from('espaco_dj_preferencias')
      .delete()
      .eq('dj_id', djId)
      .in('tipo', ['preferido', 'excluido'])
    if (delErr) throw delErr
    if (!prefs.length) return []
    const { data, error } = await supabase
      .from('espaco_dj_preferencias')
      .insert(prefs.map((p) => ({ espaco_id: p.espaco_id, dj_id: djId, tipo: p.tipo })))
      .select()
    if (error) throw error
    return data
  },
}

// ─── Meta por DJ por Cliente ──────────────────────────────────────────────────

export const djMetaEspacoApi = {
  // Retorna { [espaco_id]: max_datas_mes } para um DJ
  async listarPorDJ(djId) {
    const { data, error } = await supabase
      .from('dj_meta_espaco')
      .select('espaco_id, max_datas_mes')
      .eq('dj_id', djId)
    if (error) throw error
    const map = {}
    ;(data ?? []).forEach(({ espaco_id, max_datas_mes }) => { map[espaco_id] = max_datas_mes })
    return map
  },

  // Guarda todas as metas por Cliente para um DJ (substitui as anteriores)
  async guardar(djId, metas) {
    // metas = { [espaco_id]: max_datas_mes | null }
    const { error: delErr } = await supabase
      .from('dj_meta_espaco')
      .delete()
      .eq('dj_id', djId)
    if (delErr) throw delErr
    const linhas = Object.entries(metas)
      .filter(([, v]) => v != null)
      .map(([espaco_id, max_datas_mes]) => ({ dj_id: djId, espaco_id, max_datas_mes: Number(max_datas_mes) }))
    if (!linhas.length) return []
    const { data, error } = await supabase
      .from('dj_meta_espaco')
      .insert(linhas)
      .select()
    if (error) throw error
    return data
  },

  // Guarda um único valor para um DJ num Cliente (upsert)
  async guardarUm(djId, espacoId, maxDatasMes) {
    if (maxDatasMes == null) {
      const { error } = await supabase
        .from('dj_meta_espaco')
        .delete()
        .eq('dj_id', djId)
        .eq('espaco_id', espacoId)
      if (error) throw error
    } else {
      const { error } = await supabase
        .from('dj_meta_espaco')
        .upsert({ dj_id: djId, espaco_id: espacoId, max_datas_mes: Number(maxDatasMes) })
      if (error) throw error
    }
  },
}

// ─── Técnicos ────────────────────────────────────────────────────────────────

export const tecnicosApi = {
  async listar() {
    const { data, error } = await supabase
      .from('tecnicos')
      .select('id, nome, telefone, ativo, tipo')
      .eq('ativo', true)
      .order('nome')
    if (error) throw error
    return data
  },

  async alterarTipo(id, tipo) {
    const { error } = await supabase.from('tecnicos').update({ tipo }).eq('id', id)
    if (error) throw error
  },

  async criar(tecnico) {
    const { id: _id, criado_em, ...dados } = tecnico
    const { data, error } = await supabase
      .from('tecnicos')
      .insert(dados)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async actualizar(id, alteracoes) {
    const { id: _id, criado_em, ...dados } = alteracoes
    const { data, error } = await supabase
      .from('tecnicos')
      .update(dados)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async apagar(id) {
    const { error } = await supabase.from('tecnicos').delete().eq('id', id)
    if (error) throw error
  },
}

// ─── Eventos ─────────────────────────────────────────────────────────────────

export const eventosApi = {
  async listar({ dataInicio, dataFim, espacoId } = {}) {
    let query = supabase
      .from('eventos')
      .select(`
        *,
        espacos!eventos_espaco_id_fkey ( nome ),
        tecnicos!eventos_tecnico_id_fkey ( nome, telefone )
      `)
      .order('data')
      .order('hora_inicio')

    if (dataInicio) query = query.gte('data', dataInicio)
    if (dataFim)    query = query.lte('data', dataFim)
    if (espacoId)   query = query.eq('espaco_id', espacoId)

    const { data, error } = await query
    if (error) throw error

    return data.map((e) => ({
      ...e,
      espaco_nome:  e.espacos?.nome ?? null,
      tecnico_nome: e.tecnicos?.nome ?? null,
      tecnico_tel:  e.tecnicos?.telefone ?? null,
    }))
  },

  async criar(evento) {
    const { id: _id, criado_em, actualizado_em, espacos, tecnicos,
            espaco_nome, tecnico_nome, tecnico_tel, ...dados } = evento
    const { data, error } = await supabase
      .from('eventos')
      .insert(dados)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async actualizar(id, alteracoes) {
    const { id: _id, criado_em, actualizado_em, espacos, tecnicos,
            espaco_nome, tecnico_nome, tecnico_tel, tecnico_email, ...dados } = alteracoes
    const { data, error } = await supabase
      .from('eventos')
      .update({ ...dados, actualizado_em: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async apagar(id) {
    const { error } = await supabase.from('eventos').delete().eq('id', id)
    if (error) throw error
  },
}

// ─── Artistas ────────────────────────────────────────────────────────────────

export const artistasApi = {
  async listar() {
    const { data, error } = await supabase.from('artistas').select('*').order('nome')
    if (error) throw error
    return data ?? []
  },

  async buscar(id) {
    const { data, error } = await supabase.from('artistas').select('*').eq('id', id).single()
    if (error) throw error
    return data
  },

  async criar(artista) {
    const { id: _id, criado_em, actualizado_em, ...dados } = artista
    const { data, error } = await supabase.from('artistas').insert(dados).select().single()
    if (error) throw error
    return data
  },

  async actualizar(id, alteracoes) {
    const { id: _id, criado_em, actualizado_em, ...dados } = alteracoes
    const { data, error } = await supabase
      .from('artistas')
      .update({ ...dados, actualizado_em: new Date().toISOString() })
      .eq('id', id).select().single()
    if (error) throw error
    return data
  },

  async apagar(id) {
    const { error } = await supabase.from('artistas').delete().eq('id', id)
    if (error) throw error
  },
}

// ─── Distribuição (n8n webhook) ──────────────────────────────────────────────

export const distribuicaoApi = {
  async correr({ periodo, espacosIds, modo = 'automatico' }) {
    const url = import.meta.env.VITE_N8N_WEBHOOK_URL
    const token = import.meta.env.VITE_N8N_WEBHOOK_TOKEN

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ periodo, espacos_ids: espacosIds, modo }),
    })

    if (!res.ok) {
      const msg = await res.text()
      throw new Error(`Erro no webhook n8n (${res.status}): ${msg}`)
    }

    return res.json()
  },
}
