import { supabase } from './supabase'

const ALUGUERES   = 'alugueres'
const ITENS       = 'aluguer_itens'
const CLIENTES    = 'aluguer_clientes'
const EV_EQUIP    = 'evento_equipamentos'

export const alugueresApi = {

  async listar() {
    const { data, error } = await supabase
      .from(ALUGUERES)
      .select(`*, aluguer_clientes(id, nome, telefone, email, morada),
               aluguer_itens(id, quantidade, preco_aplicado, equipamento_id, evento_equipamento_id, equipamentos(nome, valor_aluguer_dia))`)
      .order('created_at', { ascending: false })
    if (error) throw error
    return data ?? []
  },

  async listarClientes(busca = '') {
    let q = supabase.from(CLIENTES).select('*').order('nome')
    if (busca.trim()) q = q.ilike('nome', `%${busca.trim()}%`)
    const { data, error } = await q.limit(30)
    if (error) throw error
    return data ?? []
  },

  async listarColaboradores() {
    const { data, error } = await supabase
      .from('tecnicos')
      .select('id, nome, telefone, foto_url, tipo')
      .eq('ativo', true)
      .order('nome')
    if (error) throw error
    return data ?? []
  },

  async gerarNumero() {
    const hoje = new Date()
    const dd   = String(hoje.getDate()).padStart(2, '0')
    const mm   = String(hoje.getMonth() + 1).padStart(2, '0')
    const yyyy = String(hoje.getFullYear())
    const prefixo = `AL${dd}${mm}${yyyy}`
    const { data } = await supabase
      .from(ALUGUERES)
      .select('numero')
      .like('numero', `${prefixo}%`)
    const seq = String((data?.length ?? 0) + 1).padStart(2, '0')
    return `${prefixo}${seq}`
  },

  async criar(dados) {
    const { data, error } = await supabase
      .from(ALUGUERES)
      .insert(dados)
      .select(`*, aluguer_clientes(id, nome, telefone, email, morada)`)
      .single()
    if (error) throw error
    return data
  },

  async actualizar(id, dados) {
    const { data, error } = await supabase
      .from(ALUGUERES)
      .update(dados)
      .eq('id', id)
      .select(`*, aluguer_clientes(id, nome, telefone, email, morada)`)
      .single()
    if (error) throw error
    return data
  },

  async adicionarItem(aluguerID, equipamentoId, quantidade, precoAplicado) {
    const { data, error } = await supabase
      .from(ITENS)
      .insert({ aluguer_id: aluguerID, equipamento_id: equipamentoId, quantidade: Number(quantidade) || 1, preco_aplicado: parseFloat(precoAplicado) || 0 })
      .select('*, equipamentos(nome, valor_aluguer_dia)')
      .single()
    if (error) throw error
    return data
  },

  async actualizarItem(itemId, dados) {
    const { data, error } = await supabase
      .from(ITENS)
      .update(dados)
      .eq('id', itemId)
      .select('*, equipamentos(nome, valor_aluguer_dia)')
      .single()
    if (error) throw error
    return data
  },

  async removerItem(itemId) {
    const { error } = await supabase.from(ITENS).delete().eq('id', itemId)
    if (error) throw error
  },

  async buscarEquip(busca = '') {
    const { data, error } = await supabase
      .from('equipamentos')
      .select('id, nome, categoria, qr_code, valor_aluguer_dia')
      .eq('ativo', true)
      .ilike('nome', `%${busca.trim()}%`)
      .order('nome')
      .limit(20)
    if (error) throw error
    return data ?? []
  },

  async buscarEquipPorQr(qrCode) {
    const { data, error } = await supabase
      .from('equipamentos')
      .select('id, nome, categoria, qr_code, valor_aluguer_dia')
      .eq('qr_code', qrCode)
      .eq('ativo', true)
      .maybeSingle()
    if (error) throw error
    return data
  },

  async confirmarSaida(id, operador = null) {
    const { data: itens, error: errItens } = await supabase
      .from(ITENS)
      .select('id, equipamento_id, quantidade')
      .eq('aluguer_id', id)
      .is('evento_equipamento_id', null)
    if (errItens) throw errItens

    const agora = new Date().toISOString()
    for (const item of itens ?? []) {
      const { data: mov, error: errMov } = await supabase
        .from(EV_EQUIP)
        .insert({ equipamento_id: item.equipamento_id, tipo: 'alugado', saida_at: agora, registado_por: operador, quantidade: item.quantidade })
        .select('id')
        .single()
      if (errMov) throw errMov
      await supabase.from(ITENS).update({ evento_equipamento_id: mov.id }).eq('id', item.id)
    }

    const { data, error } = await supabase
      .from(ALUGUERES)
      .update({ estado: 'em_curso', data_saida_real: agora })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async registarEntrada(id, operador = null) {
    const { data: itens, error: errItens } = await supabase
      .from(ITENS)
      .select('evento_equipamento_id')
      .eq('aluguer_id', id)
      .not('evento_equipamento_id', 'is', null)
    if (errItens) throw errItens

    const agora = new Date().toISOString()
    for (const item of itens ?? []) {
      await supabase
        .from(EV_EQUIP)
        .update({ retorno_at: agora, retorno_por: operador })
        .eq('id', item.evento_equipamento_id)
        .is('retorno_at', null)
    }

    const { data, error } = await supabase
      .from(ALUGUERES)
      .update({ estado: 'concluido', data_entrada_real: agora })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async cancelar(id) {
    const { data, error } = await supabase
      .from(ALUGUERES)
      .update({ estado: 'cancelado' })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async criarCliente(dados) {
    const { data, error } = await supabase.from(CLIENTES).insert(dados).select().single()
    if (error) throw error
    return data
  },

  async actualizarCliente(id, dados) {
    const { data, error } = await supabase.from(CLIENTES).update(dados).eq('id', id).select().single()
    if (error) throw error
    return data
  },
}
