import { supabase } from './supabase'

/** Formata um telefone para wa_id (mesma lógica da view v_agenda_lembretes). */
export function formatarWaId(telefone) {
  const dig = String(telefone ?? '').replace(/\D/g, '')
  if (!dig) return null
  return dig.length === 9 ? '351' + dig : dig
}

const hhmm = (s) => (s ?? '').slice(0, 5)

/** yyyy-mm-dd → dd/mm */
function dataCurta(iso) {
  if (!iso) return ''
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

/** Insere uma mensagem na outbox (mensagens_wpp). Ignora se não houver número. */
async function enfileirarWpp(wa_id, mensagem, contexto) {
  if (!wa_id) return
  const { error } = await supabase.from('mensagens_wpp').insert({ wa_id, mensagem, contexto })
  if (error) throw error
}

/** Regista uma entrada no histórico do slot. Não lança erro — é não-bloqueante. */
export async function registarHistorico(agendaId, tipo, descricao) {
  if (!agendaId) return
  try {
    await supabase.from('agenda_historico').insert({ agenda_id: agendaId, tipo, descricao })
  } catch {}
}

/**
 * Troca o DJ de uma atuação e notifica ambos por WhatsApp (via outbox).
 */
export async function trocarDJ({
  slot, espacoNome = '', djSai, djEntra,
  motivo = null, origem = 'admin', penalizacao = false, novoEstado = 'proposta',
}) {
  if (!slot?.id || !djEntra?.id) throw new Error('Troca inválida: slot ou DJ em falta.')

  const dataFmt = dataCurta(slot.data)
  const hora    = hhmm(slot.hora_inicio)

  // 1. Atualiza a atuação: novo DJ + estado
  const { error: e1 } = await supabase.from('agenda')
    .update({ dj_id: djEntra.id, dj_nome: null, estado: novoEstado })
    .eq('id', slot.id)
  if (e1) throw e1

  // 2. Regista a troca (auditoria + base para penalização)
  const { error: e2 } = await supabase.from('trocas_dj').insert({
    agenda_id: slot.id,
    data:      slot.data ?? null,
    espaco_id: slot.espaco_id ?? null,
    dj_saiu:   djSai?.id ?? null,
    dj_entrou: djEntra.id,
    motivo, origem, penalizacao,
  })
  if (e2) throw e2

  // 3. Histórico
  const nomeSai   = djSai?.nome_artistico || djSai?.nome || 'Sem DJ'
  const nomeEntra = djEntra.nome_artistico || djEntra.nome || 'DJ'
  await registarHistorico(slot.id, 'troca', `DJ: ${nomeSai} → ${nomeEntra}`)

  // 4. Enfileira as duas mensagens WhatsApp na outbox
  await enfileirarWpp(
    formatarWaId(djSai?.telefone),
    `Olá ${nomeSai}, a tua atuação de ${dataFmt}${espacoNome ? ` em ${espacoNome}` : ''} foi reatribuída a outro DJ. Obrigado pela compreensão.`,
    { tipo: 'troca_saida', agenda_id: slot.id, dj_id: djSai?.id ?? null },
  )
  await enfileirarWpp(
    formatarWaId(djEntra.telefone),
    `Olá ${nomeEntra}, foste escalado para uma nova atuação: ${dataFmt}${espacoNome ? ` em ${espacoNome}` : ''}${hora ? ` às ${hora}` : ''}. Confirma na tua app.`,
    { tipo: 'troca_entrada', agenda_id: slot.id, dj_id: djEntra.id },
  )
}

/**
 * Troca direta entre dois slots: DJ A vai para a data de DJ B e vice-versa.
 * Ambos os slots ficam em estado Proposta e recebem WhatsApp com a nova data.
 */
export async function trocarDJDireto({
  slotA, slotB, djA, djB,
  espacoNome = '', motivo = null,
}) {
  if (!slotA?.id || !slotB?.id || !djB?.id) throw new Error('Troca direta inválida: slots ou DJs em falta.')

  // 1. Swap DJs, ambos para proposta
  const { error: e1 } = await supabase.from('agenda')
    .update({ dj_id: djB.id, dj_nome: null, estado: 'proposta' })
    .eq('id', slotA.id)
  if (e1) throw e1

  const { error: e2 } = await supabase.from('agenda')
    .update({ dj_id: djA?.id ?? null, dj_nome: null, estado: 'proposta' })
    .eq('id', slotB.id)
  if (e2) throw e2

  // 2. Regista as duas trocas na auditoria
  const { error: e3 } = await supabase.from('trocas_dj').insert([
    {
      agenda_id: slotA.id, data: slotA.data ?? null, espaco_id: slotA.espaco_id ?? null,
      dj_saiu: djA?.id ?? null, dj_entrou: djB.id, motivo, origem: 'admin', penalizacao: false,
    },
    {
      agenda_id: slotB.id, data: slotB.data ?? null, espaco_id: slotB.espaco_id ?? null,
      dj_saiu: djB.id, dj_entrou: djA?.id ?? null, motivo, origem: 'admin', penalizacao: false,
    },
  ])
  if (e3) throw e3

  // 3. Histórico nos dois slots
  const nomeA  = djA?.nome_artistico  || djA?.nome  || 'Sem DJ'
  const nomeB  = djB.nome_artistico   || djB.nome   || 'DJ'
  const dataA  = dataCurta(slotA.data)
  const dataB  = dataCurta(slotB.data)
  const sufixo = espacoNome ? ` em ${espacoNome}` : ''

  await registarHistorico(slotA.id, 'troca', `Troca direta: ${nomeA} → ${nomeB} (↔ ${dataB}${sufixo})`)
  await registarHistorico(slotB.id, 'troca', `Troca direta: ${nomeB} → ${nomeA} (↔ ${dataA}${sufixo})`)

  // 4. WhatsApp para ambos
  await enfileirarWpp(
    formatarWaId(djA?.telefone),
    `Olá ${nomeA}, a tua atuação de ${dataA}${sufixo} foi trocada para ${dataB}. Confirma na tua app.`,
    { tipo: 'troca_direta', agenda_id: slotA.id, dj_id: djA?.id ?? null },
  )
  await enfileirarWpp(
    formatarWaId(djB.telefone),
    `Olá ${nomeB}, a tua atuação de ${dataB}${sufixo} foi trocada para ${dataA}. Confirma na tua app.`,
    { tipo: 'troca_direta', agenda_id: slotB.id, dj_id: djB.id },
  )
}
