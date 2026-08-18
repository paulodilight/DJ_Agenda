/**
 * API dedicada à tabela supa_eventos — agora no projecto DJ Schedule.
 * Usa exclusivamente o cliente `supabase` principal.
 */
import { supabase } from './supabase'

const TABLE = 'supa_eventos'

export const supaEventosApi = {

  // ── Listar ────────────────────────────────────────────────────────────────
  async listar({ dataInicio, dataFim } = {}) {
    let query = supabase
      .from(TABLE)
      .select('*, data_preparacao, notas_preparacao, espacos(id, nome), tecnico:tecnicos!tecnico_id(nome, foto_url), tecnico2:tecnicos!tecnico2_id(nome, foto_url)')
      .order('data_evento', { ascending: true })
      .order('hora_inicio', { ascending: true })

    if (dataInicio) query = query.gte('data_evento', dataInicio)
    if (dataFim)    query = query.lte('data_evento', dataFim)

    const { data, error } = await query
    if (error) throw error

    return (data ?? []).map((e) => ({
      ...e,
      espaco_nome: e.espacos?.nome ?? null,
      tecnico:  e.tecnico  ?? null,
      tecnico2: e.tecnico2 ?? null,
    }))
  },

  // ── Sincronizar tecnico(s) em evento_tecnicos ────────────────────────────
  async _syncTecnicos(eventoId, tecnicoId, tecnico2Id) {
    const ids = [tecnicoId, tecnico2Id].filter(Boolean)
    for (const tid of ids) {
      await supabase
        .from('evento_tecnicos')
        .upsert({ evento_id: eventoId, tecnico_id: tid }, { onConflict: 'evento_id,tecnico_id' })
    }
  },

  // Colunas válidas para write — garante que joins/campos calculados nunca chegam ao payload
  _payload(dados) {
    const COLS = [
      'evento', 'data_evento', 'hora_inicio', 'hora_fim', 'hora_instalacao', 'dia_instalacao',
      'status', 'espaco_id', 'tecnico_id', 'tecnico2_id', 'todos_tecnicos', 'tipo', 'notas_operacionais', 'Equipamentos',
      'contacto_pelo_evento', 'morada', 'responsavel', 'artista_id', 'xclusive', 'rider_url', 'fotos_urls',
      'valor', 'valor_artistico', 'valor_apoio_tecnico', 'notas_faturacao',
      'margem', 'transporte', 'extras_contas',
      'estado_pagamento', 'forma_pagamento', 'notas_contas',
      'data_preparacao', 'hora_preparacao', 'notas_preparacao', 'fase', 'valor_alimentacao', 'valor_apoio_tecnico_2',
    ]
    return Object.fromEntries(COLS.filter(k => k in dados).map(k => [k, dados[k]]))
  },

  // ── Criar ─────────────────────────────────────────────────────────────────
  async criar(dados) {
    const { data, error } = await supabase
      .from(TABLE)
      .insert(this._payload(dados))
      .select('id, evento, data_evento, hora_inicio, hora_fim, hora_instalacao, dia_instalacao, status, espaco_id, tecnico_id, tecnico2_id, tipo, notas_operacionais, Equipamentos, contacto_pelo_evento, morada, artista_id, xclusive, rider_url, fotos_urls, data_preparacao, hora_preparacao, notas_preparacao')
      .single()
    if (error) throw error
    await this._syncTecnicos(data.id, data.tecnico_id, data.tecnico2_id)
    return data
  },

  // ── Actualizar ────────────────────────────────────────────────────────────
  async actualizar(id, dados) {
    const { data, error } = await supabase
      .from(TABLE)
      .update(this._payload(dados))
      .eq('id', id)
      .select('id, evento, data_evento, hora_inicio, hora_fim, hora_instalacao, dia_instalacao, status, espaco_id, tecnico_id, tecnico2_id, tipo, notas_operacionais, Equipamentos, contacto_pelo_evento, morada, artista_id, xclusive, rider_url, fotos_urls, data_preparacao, hora_preparacao, notas_preparacao')
      .single()
    if (error) throw error
    await this._syncTecnicos(data.id, data.tecnico_id, data.tecnico2_id)
    return data
  },

  // ── Apagar ────────────────────────────────────────────────────────────────
  async apagar(id) {
    const { error } = await supabase.from(TABLE).delete().eq('id', id)
    if (error) throw error
  },

  // ── Clientes ───────────────────────────────────────────────────────────────
  async listarEspacos() {
    const { data, error } = await supabase
      .from('espacos')
      .select('id, nome')
      .eq('activo', true)
      .order('nome')
    if (error) throw error
    return data ?? []
  },

  // ── Tipos de evento ───────────────────────────────────────────────────────
  async listarTipos() {
    const { data, error } = await supabase
      .from('tipo_eventos')
      .select('id, nome')
      .order('nome')
    if (error) throw error
    return data ?? []
  },
}
