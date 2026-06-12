import { supabase } from './supabase'
import { eachDayOfInterval, startOfMonth, endOfMonth, getDay, format, addDays } from 'date-fns'

/**
 * Distribuição automática para um Cliente e mês.
 *
 * Regras aplicadas (por ordem de prioridade):
 *  0. Slots confirmados → nunca tocados
 *  1. LOCK bloqueio (dj fixo numa data específica) → atribuído directamente
 *  2. DJ fixo por turno+dia_semana → atribuído directamente (se disponível)
 *  3. Restantes slots → candidatos filtrados e scored
 *
 * Exclusões absolutas (elegibilidade base):
 *  • excluido_admin = true
 *  • BAN bloqueio para este Cliente
 *  • Cliente marcou DJ como 'excluido'
 *  • DJ marcou Cliente como 'recusa'
 *  • valor_sessao do DJ > budget_max do Cliente (se definido)
 *
 * Exclusões por slot (contexto do dia):
 *  • DJ marcou o dia como indisponível
 *  • DJ já atribuído noutro Cliente nesse dia (conflito cross-Cliente)
 *  • DJ já atribuído neste Cliente hoje (segundo turno no mesmo dia)
 *  • DJ apareceu neste Cliente nos últimos dias_sem_repeticao dias
 *  • DJ apareceu neste Cliente nos últimos dias_sem_repeticao dias (cross-Cliente: sem restrição)
 *  • Turno com categorias definidas: DJ sem categoria coincidente
 *
 * Score:
 *  prioridade_admin×2 + (preferido Cliente: +15) + (prefere Cliente: +10)
 *  − contagem_neste_Cliente×3 − contagem_noutros_Clientes×1
 *  − floor(valor_sessao/20)
 *
 * @param {{ anoMes: string, espacoId: string }} opts
 * @returns {{ inseridos: number, apagados: number }}
 */
/**
 * Pré-calcula quantos slots cada DJ deve ir a cada Cliente neste mês,
 * distribuindo a sua meta_datas_mes proporcionalmente aos pesos definidos
 * em admin_dj_espaco_pref (método de Hamilton / maior resto).
 *
 * Só considera DJs com registos de disponibilidade no mês (mesmo critério de
 * elegibilidade da distribuição principal).
 *
 * @returns {{ [djId]: { quotas: { [espacoId]: number }, total: number } }}
 */
export async function calcularPreAlocacoes(anoMes) {
  const [ano, mes] = anoMes.split('-').map(Number)
  const mesInicio  = startOfMonth(new Date(ano, mes - 1, 1))
  const mesFim     = endOfMonth(mesInicio)
  const dataInicio = format(mesInicio, 'yyyy-MM-dd')
  const dataFim    = format(mesFim,    'yyyy-MM-dd')

  const [djsRes, prefsRes, dispRes, turnosRes] = await Promise.all([
    supabase.from('djs')
      .select('id, meta_datas_mes')
      .in('estado', ['activo', 'activo_ext']),
    supabase.from('admin_dj_espaco_pref')
      .select('dj_id, espaco_id, peso'),
    supabase.from('disponibilidades')
      .select('dj_id')
      .gte('data', dataInicio)
      .lte('data', dataFim),
    supabase.from('turnos_espaco')
      .select('espaco_id, dias_semana'),
  ])

  // Clientes com pelo menos um turno activo (dias_semana não vazio → geram slots)
  const espacosActivos = new Set(
    (turnosRes.data ?? [])
      .filter(t => t.dias_semana?.length > 0)
      .map(t => t.espaco_id)
  )

  // meta de cada DJ
  const djsMeta = {}
  ;(djsRes.data ?? []).forEach(d => { djsMeta[d.id] = d.meta_datas_mes })

  // DJs com registos este mês (opt-in obrigatório)
  const djsComRegistos = new Set((dispRes.data ?? []).map(r => r.dj_id))

  // Soma de peso por DJ × Cliente — ignora Clientes fechados (sem dias_semana)
  // { djId: { espacoId: totalPeso } }
  const djEspacoPeso = {}
  ;(prefsRes.data ?? []).forEach(({ dj_id, espaco_id, peso }) => {
    if (!espacosActivos.has(espaco_id)) return  // Cliente fechado → não conta
    const p = peso ?? 0
    if (p <= 0) return
    if (!djEspacoPeso[dj_id]) djEspacoPeso[dj_id] = {}
    djEspacoPeso[dj_id][espaco_id] = (djEspacoPeso[dj_id][espaco_id] ?? 0) + p
  })

  const preAlocacoes = {}

  for (const [djId, espacoPeso] of Object.entries(djEspacoPeso)) {
    if (!djsComRegistos.has(djId)) continue

    const meta = djsMeta[djId]
    if (!meta || meta <= 0) continue

    const espacosComPeso = Object.entries(espacoPeso)   // [[espacoId, peso], ...]
    if (espacosComPeso.length === 0) continue

    const totalPeso = espacosComPeso.reduce((s, [, p]) => s + p, 0)

    // Método de Hamilton (maior resto): garante que os inteiros somam exactamente `meta`
    const shares = espacosComPeso.map(([eId, p]) => {
      const exact = meta * p / totalPeso
      return { espacoId: eId, exact, floor: Math.floor(exact) }
    })

    const sumFloors = shares.reduce((s, x) => s + x.floor, 0)
    const extras    = meta - sumFloors   // quantos "+1" ainda temos para distribuir

    // Distribui os extras pelos Clientes com maior parte fraccional
    shares.sort((a, b) => (b.exact - b.floor) - (a.exact - a.floor))
    shares.forEach((s, i) => { s.final = s.floor + (i < extras ? 1 : 0) })

    const quotas = {}
    shares.forEach(s => { quotas[s.espacoId] = s.final })

    preAlocacoes[djId] = { quotas, total: meta }
  }

  return preAlocacoes
}

/**
 * @param {{ anoMes: string, espacoId: string, preAlocacoes?: object, modo?: 'completo'|'ajustes' }} opts
 *   modo 'completo' — distribuição de raiz: apaga e recria todos os slots automáticos não protegidos
 *   modo 'ajustes'  — só redistribui slots em estado 'alterar'; tudo o resto fica intocado
 */
export async function correrDistribuicao({ anoMes, espacoId, preAlocacoes = {}, modo = 'completo' }) {
  const [ano, mes] = anoMes.split('-').map(Number)
  const mesInicio  = startOfMonth(new Date(ano, mes - 1, 1))
  const mesFim     = endOfMonth(mesInicio)
  const dataInicio = format(mesInicio, 'yyyy-MM-dd')
  const dataFim    = format(mesFim,    'yyyy-MM-dd')

  // ── 0. IDs dos turnos do Cliente (necessário para subconsultas) ──────────
  const turnoIdsRes = await supabase
    .from('turnos_espaco')
    .select('id')
    .eq('espaco_id', espacoId)
  const turnoIds = turnoIdsRes.data?.map(t => t.id) ?? []

  // ── 1. Carregar todos os dados em paralelo ──────────────────────────────
  const [
    espacoRes,
    djsRes,
    turnosRes,
    fixosRes,
    indispRes,
    espPrefRes,
    djPrefRes,
    agendaRes,
    agendaGlobalRes,
    turnoCatsRes,
    djCatsRes,
    valoresDiaRes,
    bloqueiosRes,
    adminPrefsRes,
    metaEspacoRes,
    catsNomesRes,
  ] = await Promise.all([
    // Configurações do Cliente
    supabase
      .from('espacos')
      .select('budget_max, dias_sem_repeticao, dias_espacamento')
      .eq('id', espacoId)
      .single(),

    // DJs activos e activos EXT
    supabase
      .from('djs')
      .select('id, nome_artistico, nome, valor_sessao, prioridade_admin, excluido_admin, meta_datas_mes, orcamento_max')
      .in('estado', ['activo', 'activo_ext']),

    // Turnos do Cliente
    supabase
      .from('turnos_espaco')
      .select('id, nome, valor, hora_inicio, hora_fim, dias_semana')
      .eq('espaco_id', espacoId)
      .order('ordem'),

    // DJs fixos por turno × dia
    supabase
      .from('djs_fixos_espaco')
      .select('turno_id, dia_semana, dj_id')
      .eq('espaco_id', espacoId),

    // Disponibilidades no mês (disponivel=true → opt-in; disponivel=false → excluído)
    supabase
      .from('disponibilidades')
      .select('dj_id, data, disponivel, criado_em')
      .gte('data', dataInicio)
      .lte('data', dataFim),

    // Preferências do Cliente sobre cada DJ
    supabase
      .from('espaco_dj_preferencias')
      .select('dj_id, tipo')
      .eq('espaco_id', espacoId),

    // Preferências de cada DJ sobre este Cliente
    supabase
      .from('dj_preferencias_espaco')
      .select('dj_id, preferencia')
      .eq('espaco_id', espacoId),

    // Agenda deste Cliente no mês
    supabase
      .from('agenda')
      .select('id, dj_id, data, turno_id, estado, hora_inicio, origem')
      .eq('espaco_id', espacoId)
      .gte('data', dataInicio)
      .lte('data', dataFim),

    // Agenda GLOBAL no mês (todos os outros Clientes) — conflitos + contagem
    supabase
      .from('agenda')
      .select('dj_id, data')
      .gte('data', dataInicio)
      .lte('data', dataFim)
      .neq('espaco_id', espacoId)
      .not('dj_id', 'is', null),

    // Categorias permitidas por turno
    turnoIds.length > 0
      ? supabase.from('turno_categorias').select('turno_id, categoria_id').in('turno_id', turnoIds)
      : Promise.resolve({ data: [], error: null }),

    // Categorias por DJ
    supabase.from('dj_categorias').select('dj_id, categoria_id'),

    // Valores por dia por turno
    turnoIds.length > 0
      ? supabase.from('turno_valores_dia').select('turno_id, dia_semana, valor, hora_inicio, hora_fim').in('turno_id', turnoIds)
      : Promise.resolve({ data: [], error: null }),

    // Bloqueios activos para este Cliente (BAN + LOCK)
    supabase
      .from('bloqueios')
      .select('tipo, dj_id, data')
      .eq('espaco_id', espacoId)
      .eq('activo', true)
      .in('tipo', ['BAN', 'LOCK']),

    // Preferências admin (Equilíbrio): dj_id + turno_id + peso (score bonus)
    supabase
      .from('admin_dj_espaco_pref')
      .select('dj_id, turno_id, peso')
      .eq('espaco_id', espacoId),

    // Meta por DJ por Cliente (sobrepõe meta global para este Cliente)
    supabase
      .from('dj_meta_espaco')
      .select('dj_id, max_datas_mes')
      .eq('espaco_id', espacoId),

    // Nomes das categorias (para identificar categorias protegidas)
    supabase
      .from('categorias_dj')
      .select('id, nome'),
  ])

  for (const r of [espacoRes, djsRes, turnosRes, fixosRes, agendaRes]) {
    if (r.error) throw r.error
  }

  // ── Configurações do Cliente ────────────────────────────────────────────
  const espaco       = espacoRes.data
  const budgetMax    = espaco.budget_max         ?? null
  const diasSemRepet = espaco.dias_sem_repeticao ?? 0
  // Nota: dias_espacamento cross-Cliente não se aplica —
  // um DJ pode tocar em Clientes diferentes em dias consecutivos.

  // ── Categorias por turno: turno_id → Set<categoria_id> ─────────────────
  const turnoCatsMap = {}
  ;(turnoCatsRes.data ?? []).forEach(({ turno_id, categoria_id }) => {
    if (!turnoCatsMap[turno_id]) turnoCatsMap[turno_id] = new Set()
    turnoCatsMap[turno_id].add(categoria_id)
  })

  // ── Categorias por DJ: dj_id → Set<categoria_id> ───────────────────────
  const djCatsMap = {}
  ;(djCatsRes.data ?? []).forEach(({ dj_id, categoria_id }) => {
    if (!djCatsMap[dj_id]) djCatsMap[dj_id] = new Set()
    djCatsMap[dj_id].add(categoria_id)
  })

  // ── Valores por dia: turno_id → { dia_semana: { valor, hora_inicio, hora_fim } } ──
  const valoresDiaMap = {}
  ;(valoresDiaRes.data ?? []).forEach(({ turno_id, dia_semana, valor, hora_inicio, hora_fim }) => {
    if (!valoresDiaMap[turno_id]) valoresDiaMap[turno_id] = {}
    valoresDiaMap[turno_id][dia_semana] = { valor, hora_inicio, hora_fim }
  })

  const djs    = djsRes.data    ?? []
  const turnos = turnosRes.data ?? []
  const fixos  = fixosRes.data  ?? []

  // ── Disponibilidades ──────────────────────────────────────────────────
  //
  //   disponivel = false  → DJ explicitamente indisponível nesse dia (exclusão directa)
  //   disponivel = true   → DJ registou opt-in para esse dia;
  //                         se tiver ALGUM registo opt-in no mês, só pode actuar nesses dias
  //
  const indisponiveis  = new Set()   // "dj_id|data" → excluído
  const optInDias      = {}          // dj_id → Set<data> → restringe a esses dias
  const djsComRegistos = new Set()   // dj_ids com pelo menos um registo no mês
  const entregaDJ      = {}          // dj_id → timestamp (ms) da entrega mais cedo das disponibilidades

  ;(indispRes.data ?? []).forEach(({ dj_id, data, disponivel, criado_em }) => {
    djsComRegistos.add(dj_id)
    if (!disponivel) {
      indisponiveis.add(`${dj_id}|${data}`)
    } else {
      if (!optInDias[dj_id]) optInDias[dj_id] = new Set()
      optInDias[dj_id].add(data)
    }
    // Quem entregou primeiro as disponibilidades (menor criado_em do mês)
    if (criado_em) {
      const t = new Date(criado_em).getTime()
      if (!Number.isNaN(t) && (entregaDJ[dj_id] === undefined || t < entregaDJ[dj_id])) {
        entregaDJ[dj_id] = t
      }
    }
  })

  // ── Preferências ──────────────────────────────────────────────────────
  const espPrefs = {}  // dj_id → 'preferido'|'excluido'
  ;(espPrefRes.data ?? []).forEach(p => { espPrefs[p.dj_id] = p.tipo })

  const djPrefs = {}   // dj_id → 'prefere'|'neutro'|'recusa'
  ;(djPrefRes.data ?? []).forEach(p => { djPrefs[p.dj_id] = p.preferencia })

  // ── Preferências admin: "dj_id|turno_id" → peso (score bonus) ───────────
  const adminPesoMap = {}
  ;(adminPrefsRes.data ?? []).forEach(p => {
    adminPesoMap[`${p.dj_id}|${p.turno_id}`] = p.peso ?? 10
  })

  // ── Meta por DJ neste Cliente: dj_id → max_datas_mes ──────────────────────
  //    Quando definida, sobrepõe a meta global e limita aparições NESTE Cliente
  const metaEspacoMap = {}
  ;(metaEspacoRes.data ?? []).forEach(({ dj_id, max_datas_mes }) => {
    metaEspacoMap[dj_id] = max_datas_mes
  })

  // ── Bloqueios ─────────────────────────────────────────────────────────
  const banSet  = new Set()          // dj_ids com BAN permanente neste Cliente
  const lockMap = {}                 // data → dj_id (LOCK numa data específica)
  ;(bloqueiosRes.data ?? []).forEach(b => {
    if (b.tipo === 'BAN'  && b.dj_id)          banSet.add(b.dj_id)
    if (b.tipo === 'LOCK' && b.dj_id && b.data) lockMap[b.data] = b.dj_id
  })

  // ── Agenda global (outros Clientes): conflitos e contagem ──────────────
  const globalConflictSet = new Set()  // "dj_id|data" já atribuídos noutros Clientes
  const globalCount       = {}         // dj_id → nº de slots em outros Clientes no mês
  ;(agendaGlobalRes.data ?? []).forEach(({ dj_id, data }) => {
    globalConflictSet.add(`${dj_id}|${data}`)
    globalCount[dj_id] = (globalCount[dj_id] ?? 0) + 1
  })

  // ── Agenda deste Cliente ────────────────────────────────────────────────
  const agendaExistente = agendaRes.data ?? []

  // ── 2. Apagar slots a redistribuir e proteger os restantes ─────────────
  //
  //   Protegidos (nunca tocados, em qualquer modo):
  //   • origem = 'manual' / 'excel' / outro
  //   • estado = 'a_pedido' ou 'validação'
  //   • DJ do slot com categoria protegida (DJ Convidado EXT / DJ Premium)
  //
  //   modo 'completo' → apaga todos os automáticos não protegidos
  //   modo 'ajustes'  → apaga apenas slots em estado 'alterar' (não protegidos)
  //
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

  const ESTADOS_PROTEGIDOS = new Set(['a_pedido', 'validação'])

  const aApagar = agendaExistente.filter(s => {
    if (ESTADOS_PROTEGIDOS.has(s.estado)) return false
    if (djProtegido(s.dj_id))             return false
    if (modo === 'ajustes') return s.estado === 'alterar'
    return s.origem === 'automatico'
  })
  const idsAutomaticos = aApagar.map(s => s.id)
  const idsApagarSet   = new Set(idsAutomaticos)

  // Em modo ajustes, só se preenchem as posições libertadas pelos slots 'alterar'
  const posicoesLivres = modo === 'ajustes'
    ? new Set(aApagar.map(s => `${s.data}|${s.turno_id ?? ''}`))
    : null

  // DJ que recusou uma data não volta a ser proposto para essa mesma data
  const rejeitadosSet = new Set(
    aApagar.filter(s => s.estado === 'alterar' && s.dj_id).map(s => `${s.dj_id}|${s.data}`)
  )

  if (idsAutomaticos.length > 0) {
    const { error } = await supabase.from('agenda').delete().in('id', idsAutomaticos)
    if (error) throw error
  }

  // Todos os slots não apagados ficam como referência (posições ocupadas)
  const slotsManuais = agendaExistente.filter(s => !idsApagarSet.has(s.id))

  const confirmados = new Set()
  slotsManuais.forEach(s => {
    confirmados.add(`${s.data}|${s.turno_id ?? s.hora_inicio ?? ''}`)
    if (!s.turno_id) confirmados.add(`${s.data}|*`)
  })

  // Contagem de slots protegidos com DJ (para efeito de espaçamento e score)
  const contagemConf = {}
  slotsManuais
    .filter(s => s.dj_id)
    .forEach(s => { contagemConf[s.dj_id] = (contagemConf[s.dj_id] ?? 0) + 1 })

  // ── 3. DJs elegíveis base ──────────────────────────────────────────────
  // Filtragem permanente: excluídos independentemente do dia ou turno
  const djsElegiveis = djs.filter(dj => {
    if (!djsComRegistos.has(dj.id))       return false  // sem confirmação de disponibilidade este mês
    if (dj.excluido_admin)                return false  // banido pelo admin
    if (banSet.has(dj.id))                return false  // BAN bloqueio neste Cliente
    if (espPrefs[dj.id] === 'excluido')   return false  // Cliente excluiu DJ
    if (djPrefs[dj.id]  === 'recusa')     return false  // DJ recusa Cliente
    // meta_datas_mes = 0 → não distribuir automaticamente
    if (dj.meta_datas_mes != null && dj.meta_datas_mes === 0) return false
    // Budget máximo do Cliente (valor por sessão do DJ não pode exceder o limite do Cliente)
    if (budgetMax != null && (dj.valor_sessao ?? 0) > budgetMax) return false
    return true
  })

  // ── 4. Gerar propostas ─────────────────────────────────────────────────
  const novas         = []
  const contagemNovas = {}  // dj_id → nº de slots atribuídos nesta distribuição (neste Cliente)

  // Sets dinâmicos — inicializados com slots manuais com DJ
  const manuaisComDJ = slotsManuais.filter(s => s.dj_id)
  const assignedThisSpace = new Set(
    manuaisComDJ.map(s => `${s.dj_id}|${s.data}`)
  )

  const getContagem = (djId) =>
    (contagemConf[djId] ?? 0) + (contagemNovas[djId] ?? 0)

  // Se o Cliente não tem turnos configurados → não distribuir (ignorar Cliente)
  if (turnos.length === 0) {
    return { inseridos: 0, apagados: 0 }
  }

  const dias = eachDayOfInterval({ start: mesInicio, end: mesFim })

  const turnosEfectivos = turnos

  for (const dia of dias) {
    const iso    = format(dia, 'yyyy-MM-dd')
    const diaSem = getDay(dia)  // 0=dom … 6=sáb

    for (const turno of turnosEfectivos) {
      // Turno sem dias ou dia fora da lista → ignorar
      if (!turno.dias_semana?.length || !turno.dias_semana.includes(diaSem)) continue

      const chave = `${iso}|${turno.id ?? turno.hora_inicio ?? ''}`
      // Não tocar: slot protegido já ocupa esta data/turno
      if (confirmados.has(chave) || confirmados.has(`${iso}|*`)) continue

      // Modo ajustes: só preencher posições libertadas por slots em 'alterar'
      if (posicoesLivres && !posicoesLivres.has(`${iso}|${turno.id ?? ''}`)) continue

      let djId = null

      // ── Prioridade 1: LOCK bloqueio ─────────────────────────────────
      if (lockMap[iso]) {
        const lockDjId = lockMap[iso]
        const dispOk = !indisponiveis.has(`${lockDjId}|${iso}`) &&
          (!(optInDias[lockDjId]?.size > 0) || optInDias[lockDjId].has(iso))
        if (dispOk) djId = lockDjId
      }

      // ── Prioridade 2: DJ fixo ────────────────────────────────────────
      if (!djId) {
        const fixo = fixos.find(f => f.turno_id === turno.id && f.dia_semana === diaSem)
        if (fixo?.dj_id) {
          const dispOk = !indisponiveis.has(`${fixo.dj_id}|${iso}`) &&
            (!(optInDias[fixo.dj_id]?.size > 0) || optInDias[fixo.dj_id].has(iso))
          if (dispOk) djId = fixo.dj_id
        }
      }

      // ── Prioridade 3: Scoring ────────────────────────────────────────
      if (!djId) {
        const catsPermitidas = turnoCatsMap[turno.id]

        const candidatos = djsElegiveis.filter(dj => {
          // ── Meta por Cliente (limita aparições NESTE Cliente) ──────────────
          //    0 = nunca distribuir neste Cliente; N = máximo de N aparições
          const maxNEsteEspaco = metaEspacoMap[dj.id]
          if (maxNEsteEspaco != null) {
            if (maxNEsteEspaco === 0) return false
            if (getContagem(dj.id) >= maxNEsteEspaco) return false
          }

          // ── Pré-alocação: reserva quota para Clientes prioritários ─────────
          //
          //   Cada DJ tem uma quota calculada proporcionalmente aos seus pesos
          //   (admin_dj_espaco_pref) usando o método de Hamilton.
          //
          //   Dois casos:
          //   A) Este Cliente TEM quota definida → cap: bloqueia quando a quota
          //      local está esgotada (garante Cliente para outros Clientes preferidos)
          //   B) Este Cliente NÃO TEM quota → bloqueia enquanto a quota total
          //      preferida ainda não foi preenchida; liberta depois disso
          //      (overflow vai para Clientes sem preferência explícita)
          const djPreAlloc = preAlocacoes[dj.id]
          if (djPreAlloc) {
            const quotaNesteEspaco = djPreAlloc.quotas[espacoId]
            if (quotaNesteEspaco !== undefined) {
              // Cliente com quota explícita: bloqueia quando esgotada
              if (getContagem(dj.id) >= quotaNesteEspaco) return false
            } else {
              // Cliente sem quota: bloqueia se ainda há quota preferida por preencher
              const totalUsado = (globalCount[dj.id] ?? 0) + getContagem(dj.id)
              if (totalUsado < djPreAlloc.total) return false
            }
          }

          // ── Meta global: DJ atingiu o máximo total em todos os Clientes ───
          if (dj.meta_datas_mes != null && dj.meta_datas_mes > 0) {
            const totalGlobal = (globalCount[dj.id] ?? 0) + getContagem(dj.id)
            if (totalGlobal >= dj.meta_datas_mes) return false
          }

          // Orçamento máximo do DJ: se tiver valor_sessao e orcamento_max definidos,
          // verifica se adicionar mais uma sessão excederia o limite mensal
          if (dj.orcamento_max != null && dj.valor_sessao != null) {
            const totalSlots = (globalCount[dj.id] ?? 0) + getContagem(dj.id)
            const ganhoActual = totalSlots * dj.valor_sessao
            if (ganhoActual >= dj.orcamento_max) return false
          }

          // Indisponibilidade explícita no dia
          if (indisponiveis.has(`${dj.id}|${iso}`)) return false

          // DJ recusou ('Não aceito') esta data — não voltar a propor o mesmo DJ
          if (rejeitadosSet.has(`${dj.id}|${iso}`)) return false

          // Opt-in: DJ registou disponibilidades para este mês → só pode actuar nos dias marcados
          if (optInDias[dj.id]?.size > 0 && !optInDias[dj.id].has(iso)) return false

          // Conflito cross-Cliente: já está noutro Cliente hoje
          if (globalConflictSet.has(`${dj.id}|${iso}`)) return false

          // Já está neste Cliente hoje (outro turno)
          if (assignedThisSpace.has(`${dj.id}|${iso}`)) return false

          // dias_sem_repeticao: DJ não pode repetir neste Cliente nos últimos N dias
          if (diasSemRepet > 0) {
            for (let d = 1; d <= diasSemRepet; d++) {
              const dataAnterior = format(addDays(dia, -d), 'yyyy-MM-dd')
              if (assignedThisSpace.has(`${dj.id}|${dataAnterior}`)) return false
            }
          }

          // Categoria: o turno exige categoria e o DJ não tem nenhuma coincidente
          if (catsPermitidas?.size > 0) {
            const djCats = djCatsMap[dj.id]
            if (!djCats) return false
            let match = false
            for (const c of catsPermitidas) { if (djCats.has(c)) { match = true; break } }
            if (!match) return false
          }

          return true
        })

        if (candidatos.length === 0) {
          // Sem candidatos → slot vazio (sem DJ)
          novas.push(construirSlot(espacoId, turno, iso, null, djs, valoresDiaMap, diaSem))
          continue
        }

        const scored = candidatos.map(dj => ({
          dj,
          score:
            (dj.prioridade_admin ?? 5) * 2 +
            (espPrefs[dj.id] === 'preferido'                      ? 15 : 0) +  // Cliente prefere DJ
            (djPrefs[dj.id]  === 'prefere'                        ? 10 : 0) +  // DJ prefere Cliente
            (adminPesoMap[`${dj.id}|${turno.id}`]              ?? 0) +  // peso admin neste turno
            - getContagem(dj.id) * 3 -           // penaliza quem já tem datas neste Cliente
            (globalCount[dj.id] ?? 0) * 1 -    // penaliza ligeiramente quem já tem datas noutros Clientes
            Math.floor((dj.valor_sessao ?? 0) / 20),
        }))

        // Ordena por score; em empate, prioriza quem entregou as disponibilidades
        // mais cedo (incentiva os DJs a responder rapidamente). Sem entrega → último.
        scored.sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score
          const ea = entregaDJ[a.dj.id] ?? Infinity
          const eb = entregaDJ[b.dj.id] ?? Infinity
          return ea - eb
        })
        djId = scored[0].dj.id
      }

      // Actualizar contadores e sets dinâmicos
      if (djId) {
        contagemNovas[djId] = (contagemNovas[djId] ?? 0) + 1
        assignedThisSpace.add(`${djId}|${iso}`)
      }

      novas.push(construirSlot(espacoId, turno, iso, djId, djs, valoresDiaMap, diaSem))
    }
  }

  // ── 5. Inserir slots novos ─────────────────────────────────────────────
  if (novas.length > 0) {
    const { error } = await supabase.from('agenda').insert(novas)
    if (error) throw error
  }

  return { inseridos: novas.length, apagados: idsAutomaticos.length }
}

function construirSlot(espacoId, turno, iso, djId, djs = [], valoresDiaMap = {}, diaSem = null) {
  const dj     = djId ? djs.find(d => d.id === djId) : null
  const cfgDia = diaSem != null ? valoresDiaMap[turno.id]?.[diaSem] : null
  const valor  = cfgDia?.valor ?? dj?.valor_sessao ?? null
  // Fallback: per-day config → turno geral → default
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
    estado:      'proposta',
    origem:      'automatico',
  }
}
