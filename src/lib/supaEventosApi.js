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
      .select('*, espacos(id, nome), tecnicos(nome, foto_url)')
      .order('data_evento', { ascending: true })
      .order('hora_inicio', { ascending: true })

    if (dataInicio) query = query.gte('data_evento', dataInicio)
    if (dataFim)    query = query.lte('data_evento', dataFim)

    const { data, error } = await query
    if (error) throw error

    return (data ?? []).map((e) => {
      const tec = e.tecnicos
      return {
        ...e,
        espaco_nome: e.espacos?.nome ?? null,
        tecnico: Array.isArray(tec) ? (tec[0] ?? null) : (tec ?? null),
      }
    })
  },

  // ── Sincronizar tecnico_id em evento_tecnicos ─────────────────────────────
  async _syncTecnico(eventoId, tecnicoId) {
    if (!tecnicoId) return
    await supabase
      .from('evento_tecnicos')
      .upsert({ evento_id: eventoId, tecnico_id: tecnicoId }, { onConflict: 'evento_id,tecnico_id' })
  },

  // Colunas válidas para write — garante que joins/campos calculados nunca chegam ao payload
  _payload(dados) {
    const COLS = [
      'evento', 'data_evento', 'hora_inicio', 'hora_fim', 'hora_instalacao', 'dia_instalacao',
      'status', 'espaco_id', 'tecnico_id', 'tipo', 'notas_operacionais', 'Equipamentos',
      'contacto_pelo_evento', 'morada', 'artista_id', 'xclusive',
      'valor', 'valor_artistico', 'valor_apoio_tecnico', 'notas_faturacao',
    ]
    return Object.fromEntries(COLS.filter(k => k in dados).map(k => [k, dados[k]]))
  },

  // ── Criar ─────────────────────────────────────────────────────────────────
  async criar(dados) {
    const { data, error } = await supabase
      .from(TABLE)
      .insert(this._payload(dados))
      .select('id, evento, data_evento, hora_inicio, hora_fim, hora_instalacao, dia_instalacao, status, espaco_id, tecnico_id, tipo, notas_operacionais, Equipamentos, contacto_pelo_evento, morada, artista_id, xclusive')
      .single()
    if (error) throw error
    await this._syncTecnico(data.id, data.tecnico_id)
    return data
  },

  // ── Actualizar ────────────────────────────────────────────────────────────
  async actualizar(id, dados) {
    const { data, error } = await supabase
      .from(TABLE)
      .update(this._payload(dados))
      .eq('id', id)
      .select('id, evento, data_evento, hora_inicio, hora_fim, hora_instalacao, dia_instalacao, status, espaco_id, tecnico_id, tipo, notas_operacionais, Equipamentos, contacto_pelo_evento, morada, artista_id, xclusive')
      .single()
    if (error) throw error
    await this._syncTecnico(data.id, data.tecnico_id)
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
