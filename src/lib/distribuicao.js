import { supabase } from './supabase'
import { eachDayOfInterval, startOfMonth, endOfMonth, getDay, format, addDays } from 'date-fns'

/**
 * Pré-alocação removida — equilíbrio gerido pelo Filtro 5 (scoring).
 */
export async function calcularPreAlocacoes(_anoMes) {
  return {}
}

/**
 * Distribuição automática de DJs para um espaço e mês.
 *
 * Slots protegidos (nunca tocados):
 *  • estado = 'a_pedido' ou 'validação'
 *  • DJ com categoria "DJ Convidado EXT" ou "DJ Premium"
 *  • origem ≠ 'automatico'
 *
 * Cascata de atribuição (por prioridade):
 *  1. LOCK bloqueio → atribui directamente
 *  2. DJ fixo por turno × dia semana → atribui directamente
 *  3. Scoring → candidatos filtrados e ordenados
 *
 * Exclusões duras (base):
 *  • Sem registo de disponibilidade no mês (opt-in obrigatório)
 *  • excluido_admin, BAN, espaço excluiu DJ, DJ recusa espaço
 *  • Categoria sem match (salvo ignorarValidacoes=true)
 *
 * Exclusões duras por slot:
 *  • DJ indisponível neste dia ou recusou esta data
 *  • DJ com opt-in: só actua nos dias marcados
 *  • DJ já noutro espaço hoje (conflito físico)
 *  • DJ neste espaço no dia anterior
 *
 * Penalidades (soft):
 *  • Já neste espaço hoje (outro turno): −15
 *  • Neste espaço há 2 dias: −10
 *
 * Scoring (F1–F5, acumulativo):
 *  F1  DJ prefere espaço: prefere → +20
 *  F2  Média avaliações do espaço (0–10) × 3 → até +30; sem dados → 5×3=+15
 *  F3  Preferência admin × turno (0–10) + admin × dia semana (0–10) → até +20
 *  F4  Quantidade por turno: abaixo do ideal → +10
 *  F5  Equilíbrio: −contagem_neste_espaço×5 − contagem_global×1
 *
 * Desempate: quem entregou disponibilidades mais cedo no mês.
 *
 * @param {{ anoMes: string, espacoId: string, preAlocacoes?: object, modo?: 'completo'|'ajustes', ignorarValidacoes?: boolean }} opts
 */
export async function correrDistribuicao({ anoMes, espacoId, preAlocacoes = {}, modo = 'completo', ignorarValidacoes = false }) {
  const [ano, mes] = anoMes.split('-').map(Number)
  const mesInicio  = startOfMonth(new Date(ano, mes - 1, 1))
  const mesFim     = endOfMonth(mesInicio)
  const dataInicio = format(mesInicio, 'yyyy-MM-dd')
  const dataFim    = format(mesFim,    'yyyy-MM-dd')

  // IDs dos turnos deste espaço (necessário para subconsultas)
  const turnoIdsRes = await supabase.from('turnos_espaco').select('id').eq('espaco_id', espacoId)
  const turnoIds    = turnoIdsRes.data?.map(t => t.id) ?? []

  // Carregar todos os dados em paralelo
  const [
    djsRes, turnosRes, fixosRes, indispRes,
    espPrefRes, djPrefRes,
    agendaRes, agendaGlobalRes,
    turnoCatsRes, djCatsRes,
    valoresDiaRes, bloqueiosRes,
    adminTurnoRes, adminDiaSemRes,
    turnoQtdRes,
    avaliacoesRes,
    catsNomesRes,
  ] = await Promise.all([
    supabase.from('djs')
      .select('id, nome_artistico, nome, valor_sessao, prioridade_admin, excluido_admin')
      .in('estado', ['activo', 'activo_ext']),

    supabase.from('turnos_espaco')
      .select('id, nome, valor, hora_inicio, hora_fim, dias_semana')
      .eq('espaco_id', espacoId).order('ordem'),

    supabase.from('djs_fixos_espaco')
      .select('turno_id, dia_semana, dj_id').eq('espaco_id', espacoId),

    supabase.from('disponibilidades')
      .select('dj_id, data, disponivel, criado_em')
      .gte('data', dataInicio).lte('data', dataFim),

    supabase.from('espaco_dj_preferencias')
      .select('dj_id, tipo').eq('espaco_id', espacoId),

    supabase.from('dj_preferencias_espaco')
      .select('dj_id, preferencia').eq('espaco_id', espacoId),

    supabase.from('agenda')
      .select('id, dj_id, data, turno_id, estado, hora_inicio, origem')
      .eq('espaco_id', espacoId).gte('data', dataInicio).lte('data', dataFim),

    supabase.from('agenda')
      .select('dj_id, data')
      .gte('data', dataInicio).lte('data', dataFim)
      .neq('espaco_id', espacoId).not('dj_id', 'is', null),

    turnoIds.length > 0
      ? supabase.from('turno_categorias').select('turno_id, categoria_id').in('turno_id', turnoIds)
      : Promise.resolve({ data: [] }),

    supabase.from('dj_categorias').select('dj_id, categoria_id'),

    turnoIds.length > 0
      ? supabase.from('turno_valores_dia').select('turno_id, dia_semana, valor, hora_inicio, hora_fim').in('turno_id', turnoIds)
      : Promise.resolve({ data: [] }),

    supabase.from('bloqueios')
      .select('tipo, dj_id, data')
      .eq('espaco_id', espacoId).eq('activo', true).in('tipo', ['BAN', 'LOCK']),

    // F3: preferência admin × turno
    turnoIds.length > 0
      ? supabase.from('admin_dj_turno_pref').select('dj_id, turno_id, peso').eq('espaco_id', espacoId)
      : Promise.resolve({ data: [] }),

    // F3: preferência admin × dia semana
    supabase.from('admin_dj_dia_semana_pref').select('dj_id, dia_semana, peso').eq('espaco_id', espacoId),

    // F4: quantidade por turno × DJ
    turnoIds.length > 0
      ? supabase.from('admin_turno_quantidade_pref').select('turno_id, dj_id, quantidade_ideal').eq('espaco_id', espacoId)
      : Promise.resolve({ data: [] }),

    // F2: avaliações do espaço por DJ (via agenda join)
    supabase.from('avaliacoes_djs')
      .select('nota, agenda!inner(dj_id)')
      .eq('espaco_id', espacoId).not('nota', 'is', null),

    supabase.from('categorias_dj').select('id, nome'),
  ])

  for (const r of [djsRes, turnosRes, fixosRes, agendaRes]) {
    if (r.error) throw r.error
  }

  const djs    = djsRes.data    ?? []
  const turnos = turnosRes.data ?? []
  const fixos  = fixosRes.data  ?? []

  if (turnos.length === 0) return { inseridos: 0, apagados: 0 }

  // ── Disponibilidades ──────────────────────────────────────────────────────
  const indisponiveis  = new Set()   // "dj_id|data" → explicitamente indisponível
  const optInDias      = {}          // dj_id → Set<data> → restringe a esses dias
  const djsComRegistos = new Set()   // dj_ids com pelo menos um registo no mês
  const entregaDJ      = {}          // dj_id → timestamp (ms) da entrega mais cedo

  ;(indispRes.data ?? []).forEach(({ dj_id, data, disponivel, criado_em }) => {
    djsComRegistos.add(dj_id)
    if (!disponivel) {
      indisponiveis.add(`${dj_id}|${data}`)
    } else {
      if (!optInDias[dj_id]) optInDias[dj_id] = new Set()
      optInDias[dj_id].add(data)
    }
    if (criado_em) {
      const t = new Date(criado_em).getTime()
      if (!Number.isNaN(t) && (entregaDJ[dj_id] === undefined || t < entregaDJ[dj_id])) {
        entregaDJ[dj_id] = t
      }
    }
  })

  // ── Preferências espaço ↔ DJ ──────────────────────────────────────────────
  const espPrefs = {}
  ;(espPrefRes.data ?? []).forEach(p => { espPrefs[p.dj_id] = p.tipo })
  const djPrefs = {}
  ;(djPrefRes.data ?? []).forEach(p => { djPrefs[p.dj_id] = p.preferencia })

  // ── Bloqueios ─────────────────────────────────────────────────────────────
  const banSet  = new Set()
  const lockMap = {}
  ;(bloqueiosRes.data ?? []).forEach(b => {
    if (b.tipo === 'BAN'  && b.dj_id)          banSet.add(b.dj_id)
    if (b.tipo === 'LOCK' && b.dj_id && b.data) lockMap[b.data] = b.dj_id
  })

  // ── Categorias ────────────────────────────────────────────────────────────
  const turnoCatsMap = {}
  ;(turnoCatsRes.data ?? []).forEach(({ turno_id, categoria_id }) => {
    if (!turnoCatsMap[turno_id]) turnoCatsMap[turno_id] = new Set()
    turnoCatsMap[turno_id].add(categoria_id)
  })
  const djCatsMap = {}
  ;(djCatsRes.data ?? []).forEach(({ dj_id, categoria_id }) => {
    if (!djCatsMap[dj_id]) djCatsMap[dj_id] = new Set()
    djCatsMap[dj_id].add(categoria_id)
  })

  // Categorias que protegem o slot da redistribuição
  const catsProtegidasIds = new Set(
    (catsNomesRes.data ?? [])
      .filter(c => ['dj convidado ext', 'dj premium'].includes((c.nome ?? '').trim().toLowerCase()))
      .map(c => c.id)
  )
  const djProtegido = (djId) => {
    const cats = djId ? djCatsMap[djId] : null
    if (!cats) return false
    for (const c of cats) if (catsProtegidasIds.has(c)) return true
    return false
  }

  // ── Valores por dia por turno ─────────────────────────────────────────────
  const valoresDiaMap = {}
  ;(valoresDiaRes.data ?? []).forEach(({ turno_id, dia_semana, valor, hora_inicio, hora_fim }) => {
    if (!valoresDiaMap[turno_id]) valoresDiaMap[turno_id] = {}
    valoresDiaMap[turno_id][dia_semana] = { valor, hora_inicio, hora_fim }
  })

  // ── F3: Admin × turno ────────────────────────────────────────────────────
  const adminTurnoMap = {}
  ;(adminTurnoRes.data ?? []).forEach(({ dj_id, turno_id, peso }) => {
    adminTurnoMap[`${dj_id}|${turno_id}`] = peso ?? 0
  })

  // ── F3: Admin × dia semana ────────────────────────────────────────────────
  const adminDiaSemMap = {}
  ;(adminDiaSemRes.data ?? []).forEach(({ dj_id, dia_semana, peso }) => {
    adminDiaSemMap[`${dj_id}|${dia_semana}`] = peso ?? 0
  })

  // ── F4: Quantidade por turno × DJ ─────────────────────────────────────────
  const turnoQtdMap = {}
  ;(turnoQtdRes.data ?? []).forEach(({ turno_id, dj_id, quantidade_ideal }) => {
    turnoQtdMap[`${turno_id}|${dj_id}`] = quantidade_ideal
  })

  // ── F2: Média avaliações por DJ neste espaço ──────────────────────────────
  const avalSum   = {}
  const avalCount = {}
  ;(avaliacoesRes.data ?? []).forEach(({ nota, agenda }) => {
    const djId = agenda?.dj_id
    if (!djId || nota == null) return
    avalSum[djId]   = (avalSum[djId]   ?? 0) + nota
    avalCount[djId] = (avalCount[djId] ?? 0) + 1
  })
  const avalAvg = {}
  for (const [djId, total] of Object.entries(avalSum)) {
    avalAvg[djId] = total / avalCount[djId]
  }

  // ── Agenda global (outros espaços): conflitos + contagem ──────────────────
  const globalConflictSet = new Set()
  const globalCount       = {}
  ;(agendaGlobalRes.data ?? []).forEach(({ dj_id, data }) => {
    globalConflictSet.add(`${dj_id}|${data}`)
    globalCount[dj_id] = (globalCount[dj_id] ?? 0) + 1
  })

  // ── Slots protegidos + slots a redistribuir ───────────────────────────────
  const agendaExistente = agendaRes.data ?? []
  const ESTADOS_PROTEGIDOS = new Set(['a_pedido', 'validação'])

  const aApagar = agendaExistente.filter(s => {
    if (ESTADOS_PROTEGIDOS.has(s.estado)) return false
    if (djProtegido(s.dj_id))             return false
    if (modo === 'ajustes') return s.estado === 'alterar'
    return s.origem === 'automatico'
  })

  const idsAutomaticos = aApagar.map(s => s.id)
  const idsApagarSet   = new Set(idsAutomaticos)

  const posicoesLivres = modo === 'ajustes'
    ? new Set(aApagar.map(s => `${s.data}|${s.turno_id ?? ''}`))
    : null

  // DJ que recusou uma data não volta a ser proposto para ela
  const rejeitadosSet = new Set(
    aApagar.filter(s => s.estado === 'alterar' && s.dj_id).map(s => `${s.dj_id}|${s.data}`)
  )

  if (idsAutomaticos.length > 0) {
    const { error } = await supabase.from('agenda').delete().in('id', idsAutomaticos)
    if (error) throw error
  }

  const slotsManuais = agendaExistente.filter(s => !idsApagarSet.has(s.id))

  // Posições já ocupadas (protegidos)
  const confirmados = new Set()
  slotsManuais.forEach(s => {
    confirmados.add(`${s.data}|${s.turno_id ?? s.hora_inicio ?? ''}`)
    if (!s.turno_id) confirmados.add(`${s.data}|*`)
  })

  // Contagem inicial dos slots manuais com DJ (para equilíbrio)
  const contagemConf = {}
  slotsManuais.filter(s => s.dj_id).forEach(s => {
    contagemConf[s.dj_id] = (contagemConf[s.dj_id] ?? 0) + 1
  })

  // ── Elegíveis base (filtros permanentes) ──────────────────────────────────
  const djsElegiveis = djs.filter(dj => {
    if (!djsComRegistos.has(dj.id))     return false  // sem opt-in este mês
    if (dj.excluido_admin)              return false
    if (banSet.has(dj.id))              return false
    if (espPrefs[dj.id] === 'excluido') return false
    if (djPrefs[dj.id]  === 'recusa')   return false
    return true
  })

  // ── Sets dinâmicos de atribuição ──────────────────────────────────────────
  const novas         = []
  const contagemNovas = {}
  const assignedThisSpace = new Set(
    slotsManuais.filter(s => s.dj_id).map(s => `${s.dj_id}|${s.data}`)
  )

  const getContagem = (djId) => (contagemConf[djId] ?? 0) + (contagemNovas[djId] ?? 0)

  // ── Percorrer todos os dias do mês × turnos ───────────────────────────────
  const dias = eachDayOfInterval({ start: mesInicio, end: mesFim })

  for (const dia of dias) {
    const iso      = format(dia, 'yyyy-MM-dd')
    const diaSem   = getDay(dia)
    const ontem    = format(addDays(dia, -1), 'yyyy-MM-dd')
    const anteOntem = format(addDays(dia, -2), 'yyyy-MM-dd')

    for (const turno of turnos) {
      if (!turno.dias_semana?.length || !turno.dias_semana.includes(diaSem)) continue

      const chave = `${iso}|${turno.id ?? turno.hora_inicio ?? ''}`
      if (confirmados.has(chave) || confirmados.has(`${iso}|*`)) continue
      if (posicoesLivres && !posicoesLivres.has(`${iso}|${turno.id ?? ''}`)) continue

      let djId = null

      // ── Prioridade 1: LOCK bloqueio ─────────────────────────────────────
      if (lockMap[iso]) {
        const lockDjId = lockMap[iso]
        const dispOk = !indisponiveis.has(`${lockDjId}|${iso}`) &&
          (!(optInDias[lockDjId]?.size > 0) || optInDias[lockDjId].has(iso))
        if (dispOk) djId = lockDjId
      }

      // ── Prioridade 2: DJ fixo ────────────────────────────────────────────
      if (!djId) {
        const fixo = fixos.find(f => f.turno_id === turno.id && f.dia_semana === diaSem)
        if (fixo?.dj_id) {
          const dispOk = !indisponiveis.has(`${fixo.dj_id}|${iso}`) &&
            (!(optInDias[fixo.dj_id]?.size > 0) || optInDias[fixo.dj_id].has(iso))
          if (dispOk) djId = fixo.dj_id
        }
      }

      // ── Prioridade 3: Scoring ────────────────────────────────────────────
      if (!djId) {
        const catsPermitidas = turnoCatsMap[turno.id]

        const candidatos = djsElegiveis.filter(dj => {
          // Indisponibilidade explícita neste dia
          if (indisponiveis.has(`${dj.id}|${iso}`)) return false
          // DJ recusou esta data (estado alterar)
          if (rejeitadosSet.has(`${dj.id}|${iso}`)) return false
          // Opt-in: DJ só actua nos dias que marcou
          if (optInDias[dj.id]?.size > 0 && !optInDias[dj.id].has(iso)) return false
          // Conflito físico: já noutro espaço hoje
          if (globalConflictSet.has(`${dj.id}|${iso}`)) return false
          // Não repetir neste espaço no dia anterior (hard)
          if (assignedThisSpace.has(`${dj.id}|${ontem}`)) return false
          // Categoria: hard exclusion salvo ignorarValidacoes
          if (!ignorarValidacoes && catsPermitidas?.size > 0) {
            const djCats = djCatsMap[dj.id]
            if (!djCats) return false
            let match = false
            for (const c of catsPermitidas) { if (djCats.has(c)) { match = true; break } }
            if (!match) return false
          }
          return true
        })

        if (candidatos.length === 0) {
          novas.push(construirSlot(espacoId, turno, iso, null, djs, valoresDiaMap, diaSem))
          continue
        }

        const scored = candidatos.map(dj => {
          // F1: DJ prefere este espaço
          const f1 = djPrefs[dj.id] === 'prefere' ? 20 : 0

          // F2: Média avaliações do espaço (0–10 scale; neutro=5 sem dados) × 3 → máx 30
          const nota = avalAvg[dj.id] ?? 5
          const f2   = nota * 3

          // F3: Preferência admin × turno + admin × dia semana → máx 20
          const f3 = (adminTurnoMap[`${dj.id}|${turno.id}`] ?? 0) +
                     (adminDiaSemMap[`${dj.id}|${diaSem}`]  ?? 0)

          // F4: Quantidade por turno — abaixo do ideal → +10
          const qtdIdeal = turnoQtdMap[`${turno.id}|${dj.id}`] ?? 0
          const f4 = qtdIdeal > 0 && getContagem(dj.id) < qtdIdeal ? 10 : 0

          // F5: Equilíbrio
          const f5 = -getContagem(dj.id) * 5 - (globalCount[dj.id] ?? 0) * 1

          // Penalidades suaves
          const penHoje     = assignedThisSpace.has(`${dj.id}|${iso}`)      ? -15 : 0  // outro turno hoje
          const penAnteOntem = assignedThisSpace.has(`${dj.id}|${anteOntem}`) ? -10 : 0 // há 2 dias

          return { dj, score: f1 + f2 + f3 + f4 + f5 + penHoje + penAnteOntem }
        })

        // Ordena por score; em empate, prioriza quem entregou disponibilidades mais cedo
        scored.sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score
          const ea = entregaDJ[a.dj.id] ?? Infinity
          const eb = entregaDJ[b.dj.id] ?? Infinity
          return ea - eb
        })
        djId = scored[0].dj.id
      }

      if (djId) {
        contagemNovas[djId] = (contagemNovas[djId] ?? 0) + 1
        assignedThisSpace.add(`${djId}|${iso}`)
      }

      novas.push(construirSlot(espacoId, turno, iso, djId, djs, valoresDiaMap, diaSem))
    }
  }

  // ── Inserir slots novos ───────────────────────────────────────────────────
  if (novas.length > 0) {
    const { error } = await supabase.from('agenda').insert(novas)
    if (error) throw error
  }

  return { inseridos: novas.length, apagados: idsAutomaticos.length }
}

function construirSlot(espacoId, turno, iso, djId, djs = [], valoresDiaMap = {}, diaSem = null) {
  const dj      = djId ? djs.find(d => d.id === djId) : null
  const cfgDia  = diaSem != null ? valoresDiaMap[turno.id]?.[diaSem] : null
  const valor   = cfgDia?.valor ?? dj?.valor_sessao ?? null
  const horaInicio = cfgDia?.hora_inicio ?? turno.hora_inicio ?? '20:00'
  const horaFim    = cfgDia?.hora_fim    ?? turno.hora_fim    ?? '02:00'
  return {
    espaco_id:   espacoId,
    turno_id:    turno.id    ?? null,
    data:        iso,
    hora_inicio: horaInicio,
    hora_fim:    horaFim,
    valor,
    dj_id:       djId ?? null,
    dj_nome:     dj ? (dj.nome_artistico || dj.nome) : null,
    estado:      'proposta',
    origem:      'automatico',
  }
}
