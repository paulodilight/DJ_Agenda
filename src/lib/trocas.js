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

/**
 * Troca o DJ de uma atuação e notifica ambos por WhatsApp (via outbox).
 *
 * @param {object}  p
 * @param {object}  p.slot         atuação da agenda (id, data, espaco_id, hora_inicio, dj_id)
 * @param {string}  p.espacoNome   nome do Cliente (para as mensagens)
 * @param {object}  p.djSai        DJ que perde a data { id, nome, nome_artistico, telefone }
 * @param {object}  p.djEntra      DJ que ganha a data { id, nome, nome_artistico, telefone }
 * @param {string} [p.motivo]
 * @param {'admin'|'dj_pedido'} [p.origem='admin']
 * @param {boolean} [p.penalizacao=false]
 * @param {string} [p.novoEstado='proposta']  estado do slot após a troca (novo DJ aceita na app)
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

  // 3. Enfileira as duas mensagens WhatsApp na outbox
  const nomeSai   = djSai?.nome_artistico || djSai?.nome || 'DJ'
  const nomeEntra = djEntra.nome_artistico || djEntra.nome || 'DJ'

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
