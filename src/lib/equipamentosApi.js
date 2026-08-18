import { supabase } from './supabase'

const TABLE = 'equipamentos'
const CATEGORIAS_DEFAULT = ['Som', 'Iluminação', 'DJ', 'Vídeo', 'Estrutura', 'Outros']

export const equipamentosApi = {

  async listar() {
    const [{ data: equip, error }, { data: emUso }] = await Promise.all([
      supabase.from(TABLE).select('*').eq('ativo', true).order('nome'),
      supabase.from('evento_equipamentos')
        .select('equipamento_id, evento_id, saida_at, registado_por, supa_eventos(evento, data_evento)')
        .not('saida_at', 'is', null)
        .is('retorno_at', null),
    ])
    if (error) throw error
    const emUsoMap = {}
    ;(emUso ?? []).forEach(r => {
      emUsoMap[r.equipamento_id] = { ...r.supa_eventos, registado_por: r.registado_por, saida_at: r.saida_at }
    })
    return (equip ?? []).map(e => ({
      ...e,
      em_uso: !!emUsoMap[e.id],
      evento_atual: emUsoMap[e.id] ?? null,
      registado_por: emUsoMap[e.id]?.registado_por ?? null,
      saida_at: emUsoMap[e.id]?.saida_at ?? null,
    }))
  },

  async criar(dados) {
    const { data, error } = await supabase
      .from(TABLE).insert(this._payload(dados)).select().single()
    if (error) throw error
    return data
  },

  async actualizar(id, dados) {
    const { data, error } = await supabase
      .from(TABLE).update(this._payload(dados)).eq('id', id).select().single()
    if (error) throw error
    return data
  },

  async apagar(id) {
    const { error } = await supabase
      .from(TABLE).update({ ativo: false }).eq('id', id)
    if (error) throw error
  },

  _payload(dados) {
    const COLS = ['nome', 'categoria', 'qr_code', 'valor_custo', 'valor_aluguer_dia', 'foto_url', 'notas', 'ativo']
    return Object.fromEntries(COLS.filter(k => k in dados).map(k => [k, dados[k]]))
  },

  async listarMovimentacoes({ limite = 30 } = {}) {
    const { data, error } = await supabase
      .from('evento_equipamentos')
      .select('*, equipamentos(nome, categoria), supa_eventos(evento, data_evento, espacos(nome))')
      .not('equipamento_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(limite)
    if (error) throw error
    return data ?? []
  },

  async porQrCode(qrCode) {
    const { data: equip, error } = await supabase
      .from('equipamentos')
      .select('*')
      .eq('qr_code', qrCode)
      .eq('ativo', true)
      .maybeSingle()
    if (error || !equip) return null
    const { data: mov } = await supabase
      .from('evento_equipamentos')
      .select('id, saida_at, evento_id, registado_por, supa_eventos(evento, data_evento)')
      .eq('equipamento_id', equip.id)
      .not('saida_at', 'is', null)
      .is('retorno_at', null)
      .order('saida_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    return { ...equip, movimentoAberto: mov ?? null }
  },

  async registarSaida(equipamentoId, nomeOperador = null) {
    const { data, error } = await supabase
      .from('evento_equipamentos')
      .insert({ equipamento_id: equipamentoId, tipo: 'proprio', saida_at: new Date().toISOString(), registado_por: nomeOperador })
      .select()
      .single()
    if (error) throw error
    return data
  },

  async registarEntrada(movimentoId) {
    const { data, error } = await supabase
      .from('evento_equipamentos')
      .update({ retorno_at: new Date().toISOString() })
      .eq('id', movimentoId)
      .select()
      .single()
    if (error) throw error
    return data
  },

  gerarQrCode(nome) {
    const slug = nome.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4)
    const rand = Math.random().toString(36).slice(2, 6).toUpperCase()
    return `EQ-${slug}-${rand}`
  },

  get categorias() {
    return CATEGORIAS_DEFAULT
  },
}
