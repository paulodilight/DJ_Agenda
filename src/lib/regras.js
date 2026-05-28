/**
 * Validação de regras de distribuição no frontend.
 * Espelho das regras definidas em REGRAS.md — usadas para destacar
 * conflitos na interface antes de enviar para o motor n8n.
 */

/**
 * R4 — Verifica se DJ tem BAN num espaço.
 * @param {string} djId
 * @param {string} espacoId
 * @param {Array} bloqueios
 */
export function temBan(djId, espacoId, bloqueios) {
  return bloqueios.some(
    (b) => b.tipo === 'BAN' && b.dj_id === djId && b.espaco_id === espacoId && b.activo
  )
}

/**
 * R5 — Verifica se há LOCK num slot (espaco + data).
 * @param {string} espacoId
 * @param {string} data  ISO date string
 * @param {Array} bloqueios
 */
export function getLock(espacoId, data, bloqueios) {
  return bloqueios.find(
    (b) => b.tipo === 'LOCK' && b.espaco_id === espacoId && b.data === data && b.activo
  ) ?? null
}

/**
 * R1 — Espaçamento mínimo global entre atuações do mesmo DJ.
 * @param {string} djId
 * @param {string} data  ISO date string
 * @param {Array} agendaExistente
 * @param {number} diasEspacamento
 */
export function violaEspacamentoGlobal(djId, data, agendaExistente, diasEspacamento = 7) {
  const proposta = new Date(data)
  return agendaExistente.some((slot) => {
    if (slot.dj_id !== djId || slot.estado === 'cancelado') return false
    const slotData = new Date(slot.data)
    const diff = Math.abs((proposta - slotData) / (1000 * 60 * 60 * 24))
    return diff > 0 && diff < diasEspacamento
  })
}

/**
 * R2 — Não repetir DJ no mesmo espaço em menos de X dias.
 * @param {string} djId
 * @param {string} espacoId
 * @param {string} data  ISO date string
 * @param {Array} agendaExistente
 * @param {number} diasSemRepeticao
 */
export function violaRepeticaoEspaco(djId, espacoId, data, agendaExistente, diasSemRepeticao = 14) {
  const proposta = new Date(data)
  return agendaExistente.some((slot) => {
    if (slot.dj_id !== djId || slot.espaco_id !== espacoId || slot.estado === 'cancelado') return false
    const slotData = new Date(slot.data)
    const diff = (proposta - slotData) / (1000 * 60 * 60 * 24)
    return diff > 0 && diff < diasSemRepeticao
  })
}

/**
 * R7 — DJ excede budget do espaço.
 * @param {number} valorDJ
 * @param {number|null} budgetMax
 */
export function excedeBudget(valorDJ, budgetMax) {
  if (!budgetMax || !valorDJ) return false
  return valorDJ > budgetMax
}

/**
 * Gera lista de conflitos para um slot específico.
 * Retorna array de strings com as violações encontradas.
 */
export function validarSlot({ djId, espacoId, data, valorDJ, bloqueios, agenda, espaco, config }) {
  const conflitos = []

  if (temBan(djId, espacoId, bloqueios)) {
    conflitos.push('DJ tem BAN neste espaço')
  }

  const diasEspacamento = espaco?.dias_espacamento ?? Number(config?.dias_espacamento_global ?? 7)
  if (violaEspacamentoGlobal(djId, data, agenda, diasEspacamento)) {
    conflitos.push(`DJ actuou há menos de ${diasEspacamento} dias`)
  }

  const diasRepeticao = espaco?.dias_sem_repeticao ?? Number(config?.dias_sem_repeticao_global ?? 14)
  if (violaRepeticaoEspaco(djId, espacoId, data, agenda, diasRepeticao)) {
    conflitos.push(`DJ repetiu neste espaço há menos de ${diasRepeticao} dias`)
  }

  if (excedeBudget(valorDJ, espaco?.budget_max)) {
    conflitos.push(`Valor (${valorDJ}€) excede budget do espaço (${espaco.budget_max}€)`)
  }

  return conflitos
}
