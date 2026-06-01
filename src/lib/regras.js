/**
 * Validação de regras de distribuição no frontend.
 * Espelho das regras definidas em REGRAS.md — usadas para destacar
 * conflitos na interface antes de enviar para o motor n8n.
 */

/** Formata "2026-06-13" → "13 Jun" */
function fmtData(iso) {
  if (!iso) return '?'
  const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  const partes = iso.split('-')
  return `${parseInt(partes[2])} ${meses[parseInt(partes[1]) - 1]}`
}

function diasEntre(dataA, dataB) {
  return Math.round(Math.abs((new Date(dataA) - new Date(dataB)) / (1000 * 60 * 60 * 24)))
}

/**
 * R4 — Verifica se DJ tem BAN num Cliente.
 */
export function temBan(djId, espacoId, bloqueios) {
  return bloqueios.some(
    (b) => b.tipo === 'BAN' && b.dj_id === djId && b.espaco_id === espacoId && b.activo
  )
}

/**
 * R5 — Verifica se há LOCK num slot (espaco + data).
 */
export function getLock(espacoId, data, bloqueios) {
  return bloqueios.find(
    (b) => b.tipo === 'LOCK' && b.espaco_id === espacoId && b.data === data && b.activo
  ) ?? null
}

/**
 * R1 — Espaçamento mínimo global entre atuações do mesmo DJ (qualquer Cliente).
 * Devolve o slot conflituante ou null.
 */
export function violaEspacamentoGlobal(djId, data, agendaExistente, diasEspacamento = 7) {
  return agendaExistente.find((slot) => {
    if (slot.dj_id !== djId || slot.estado === 'cancelado') return false
    const diff = diasEntre(data, slot.data)
    return diff > 0 && diff < diasEspacamento
  }) ?? null
}

/**
 * R2 — Não repetir DJ no mesmo Cliente em menos de X dias (só olha para o passado).
 * Devolve o slot conflituante ou null.
 */
export function violaRepeticaoEspaco(djId, espacoId, data, agendaExistente, diasSemRepeticao = 14) {
  const proposta = new Date(data)
  return agendaExistente.find((slot) => {
    if (slot.dj_id !== djId || slot.espaco_id !== espacoId || slot.estado === 'cancelado') return false
    const diff = (proposta - new Date(slot.data)) / (1000 * 60 * 60 * 24)
    return diff > 0 && diff < diasSemRepeticao
  }) ?? null
}

/**
 * R7 — DJ excede budget do Cliente.
 */
export function excedeBudget(valorDJ, budgetMax) {
  if (!budgetMax || !valorDJ) return false
  return valorDJ > budgetMax
}

/**
 * Gera lista de conflitos com mensagens detalhadas para um slot específico.
 * @param {string[]} [espacos=[]] - array de Clientes para lookup de nome por id
 */
export function validarSlot({ djId, espacoId, data, valorDJ, bloqueios, agenda, espaco, config, espacos = [] }) {
  const conflitos = []

  const nomeEspaco = (eid) => espacos.find(e => e.id === eid)?.nome?.trim() ?? 'outro Cliente'

  // ── BAN ──────────────────────────────────────────────────────────────────
  if (temBan(djId, espacoId, bloqueios)) {
    conflitos.push('🚫 BAN permanente neste Cliente')
  }

  // ── Espaçamento global ────────────────────────────────────────────────────
  const diasEspacamento = espaco?.dias_espacamento ?? Number(config?.dias_espacamento_global ?? 7)
  const slotEsp = violaEspacamentoGlobal(djId, data, agenda, diasEspacamento)
  if (slotEsp) {
    const dias = diasEntre(data, slotEsp.data)
    const local = nomeEspaco(slotEsp.espaco_id)
    conflitos.push(
      `⏱ Espaçamento global · actuou em ${local} a ${fmtData(slotEsp.data)} (${dias} dia${dias !== 1 ? 's' : ''} de intervalo) — mínimo ${diasEspacamento} dias`
    )
  }

  // ── Repetição no mesmo Cliente ─────────────────────────────────────────────
  const diasRepeticao = espaco?.dias_sem_repeticao ?? Number(config?.dias_sem_repeticao_global ?? 14)
  const slotRep = violaRepeticaoEspaco(djId, espacoId, data, agenda, diasRepeticao)
  if (slotRep) {
    const dias = diasEntre(data, slotRep.data)
    conflitos.push(
      `🔄 Repetição neste Cliente · esteve aqui a ${fmtData(slotRep.data)} (${dias} dia${dias !== 1 ? 's' : ''} atrás) — mínimo ${diasRepeticao} dias`
    )
  }

  // ── Budget ────────────────────────────────────────────────────────────────
  if (excedeBudget(valorDJ, espaco?.budget_max)) {
    conflitos.push(`💰 Budget · ${valorDJ}€ excede máximo do Cliente (${espaco.budget_max}€)`)
  }

  return conflitos
}
