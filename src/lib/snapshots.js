import { supabase } from './supabase'

/** Intervalo ISO (yyyy-mm-dd) do mês a partir de 'yyyy-MM'. */
function intervaloMes(anoMes) {
  const [ano, mes] = anoMes.split('-').map(Number)
  const ini = new Date(ano, mes - 1, 1)
  const fim = new Date(ano, mes, 0)
  const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return { dataInicio: fmt(ini), dataFim: fmt(fim) }
}

/**
 * Cria um checkpoint do mês: agenda + disponibilidades.
 * @param {{ anoMes: string, label?: string, tipo?: 'manual'|'auto' }} p
 * @returns {Promise<object>} o snapshot criado
 */
export async function gravarSnapshot({ anoMes, label = null, tipo = 'manual' }) {
  const { dataInicio, dataFim } = intervaloMes(anoMes)

  const [agendaRes, dispRes] = await Promise.all([
    supabase.from('agenda').select('*').gte('data', dataInicio).lte('data', dataFim),
    supabase.from('disponibilidades').select('*').gte('data', dataInicio).lte('data', dataFim),
  ])
  if (agendaRes.error) throw agendaRes.error
  if (dispRes.error)   throw dispRes.error

  const dados = { agenda: agendaRes.data ?? [], disponibilidades: dispRes.data ?? [] }

  const { data, error } = await supabase
    .from('snapshots')
    .insert({ ano_mes: anoMes, label, tipo, dados })
    .select()
    .single()
  if (error) throw error
  return data
}

/** Lista checkpoints de um mês (mais recentes primeiro). */
export async function listarSnapshots(anoMes, { tipo = null } = {}) {
  let q = supabase.from('snapshots').select('id, label, ano_mes, tipo, criado_em')
    .eq('ano_mes', anoMes).order('criado_em', { ascending: false })
  if (tipo) q = q.eq('tipo', tipo)
  const { data, error } = await q
  if (error) throw error
  return data ?? []
}

/** Restaura uma tabela: upsert das linhas do snapshot + apaga as que já não existiam. */
async function restaurarTabela(tabela, linhas, dataInicio, dataFim) {
  const ids = linhas.map(r => r.id).filter(Boolean)

  // Apagar linhas do mês que NÃO estavam no snapshot
  let del = supabase.from(tabela).delete().gte('data', dataInicio).lte('data', dataFim)
  if (ids.length > 0) del = del.not('id', 'in', `(${ids.join(',')})`)
  const { error: eDel } = await del
  if (eDel) throw eDel

  // Repor as linhas do snapshot (insert/update por id)
  if (linhas.length > 0) {
    const { error: eUp } = await supabase.from(tabela).upsert(linhas, { onConflict: 'id' })
    if (eUp) throw eUp
  }
}

/**
 * Restaura o estado do mês a partir de um checkpoint.
 * Substitui agenda + disponibilidades desse mês pelo conteúdo do snapshot.
 */
export async function restaurarSnapshot(id) {
  const { data: snap, error } = await supabase.from('snapshots').select('*').eq('id', id).single()
  if (error) throw error

  const { dataInicio, dataFim } = intervaloMes(snap.ano_mes)
  const dados = snap.dados ?? {}

  await restaurarTabela('agenda',           dados.agenda ?? [],           dataInicio, dataFim)
  await restaurarTabela('disponibilidades', dados.disponibilidades ?? [], dataInicio, dataFim)

  return snap
}

/** Apaga um checkpoint. */
export async function apagarSnapshot(id) {
  const { error } = await supabase.from('snapshots').delete().eq('id', id)
  if (error) throw error
}
