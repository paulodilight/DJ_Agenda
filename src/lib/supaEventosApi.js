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
      .select('*, espacos(id, nome), artistas(id, nome, foto_url, bio, instagram_url, rede_social_url, presskit_url)')
      .order('data_evento', { ascending: true })
      .order('hora_inicio', { ascending: true })

    if (dataInicio) query = query.gte('data_evento', dataInicio)
    if (dataFim)    query = query.lte('data_evento', dataFim)

    const { data, error } = await query
    if (error) throw error

    return (data ?? []).map((e) => ({
      ...e,
      espaco_nome: e.espacos?.nome ?? null,
    }))
  },

  // ── Criar ─────────────────────────────────────────────────────────────────
  async criar(dados) {
    const { id: _id, created_at, espacos: _e, espaco_nome: _en, espaco_id_dj: _eidj, ...payload } = dados
    const { data, error } = await supabase
      .from(TABLE)
      .insert(payload)
      .select()
      .single()
    if (error) throw error
    return data
  },

  // ── Actualizar ────────────────────────────────────────────────────────────
  async actualizar(id, dados) {
    const { id: _id, created_at, espacos: _e, espaco_nome: _en, espaco_id_dj: _eidj, ...payload } = dados
    const { data, error } = await supabase
      .from(TABLE)
      .update(payload)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
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
