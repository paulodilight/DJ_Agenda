import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import { pt } from 'date-fns/locale'
import { useMesStore, useAppStore } from '@/store'
import { supabase } from '@/lib/supabase'
import { formatarEuro } from '@/utils/formatacao'
import { LoadingPage } from '@/components/ui/LoadingSpinner'
import { clsx } from 'clsx'

const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : ''

const PAGAVEIS   = new Set(['confirmado', 'presente', 'a_pedido'])
const CANCELADOS = new Set(['cancelado', 'faltou', 'sem_efeito'])

const CFG = { horaExtraRate: 30, premioRate: 2, ivaRate: 0.23 }

function safeParse(str, fallback) {
  try { return str ? JSON.parse(str) : fallback } catch { return fallback }
}

function isTransporte(morada) {
  if (!morada) return false
  return /comporta|alcácer|grandola|grândola|melides|carvalhal|troia|tróia/i.test(morada)
}

function toMin(t) {
  if (!t) return 0
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function calcHorasExtra(slot) {
  const padrao = slot.turnos_espaco?.hora_fim
  if (!padrao) return 0
  let diff = toMin(slot.hora_fim) - toMin(padrao)
  if (diff < 0) diff += 24 * 60
  return diff > 0 ? Math.round(diff / 30) * 0.5 : 0
}

function assStatus(slot) {
  const p = slot.presencas_djs
  if (!p?.signed_at) return 'ausente'
  const inicio = new Date(`${slot.data}T${slot.hora_inicio}`)
  return new Date(p.signed_at) <= inicio ? 'a_tempo' : 'atrasada'
}

// ─── Badge estado pagamento ───────────────────────────────────────────────────

const ESTADO_PAG_CFG = {
  auto_pagamento:             { label: 'Auto Pag.',     cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25' },
  auto_pagamento_penalizacao: { label: 'Com Penaliz.',  cls: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/25' },
  em_regularizacao:           { label: 'Em Regulariz.', cls: 'bg-orange-500/15 text-orange-300 border-orange-500/25' },
  em_pagamento:               { label: 'Em Pagamento',  cls: 'bg-blue-500/15 text-blue-300 border-blue-500/25' },
  pago:                       { label: 'Pago',          cls: 'bg-emerald-600/20 text-emerald-300 border-emerald-600/30' },
}

function BadgeEstadoPag({ estado }) {
  const cfg = ESTADO_PAG_CFG[estado] ?? { label: estado ?? '—', cls: 'bg-surface-2 text-accent-muted border-border' }
  return (
    <span className={clsx('inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold', cfg.cls)}>
      {cfg.label}
    </span>
  )
}

// ─── Subcomponentes base ──────────────────────────────────────────────────────

function RadioOpt({ label, checked, onChange, small }) {
  return (
    <label className={clsx('flex items-center gap-2 cursor-pointer', small ? 'text-[11px]' : 'text-xs')}>
      <span className={clsx(
        'flex-shrink-0 rounded-full border-2 flex items-center justify-center transition-colors',
        small ? 'w-3.5 h-3.5' : 'w-4 h-4',
        checked ? 'border-accent bg-accent' : 'border-border bg-surface-0'
      )}>
        {checked && <span className={clsx('rounded-full bg-white', small ? 'w-1 h-1' : 'w-1.5 h-1.5')} />}
      </span>
      <span className={checked ? 'text-accent font-medium' : 'text-accent-muted'}>{label}</span>
    </label>
  )
}

function BRow({ label, value, bold, accent }) {
  return (
    <div className="flex items-center justify-between px-4 py-2">
      <span className={clsx('text-xs', bold ? 'font-semibold text-accent' : 'text-accent-muted')}>{label}</span>
      <span className={clsx('text-xs tabular-nums font-semibold', accent ?? (bold ? 'text-accent' : 'text-accent-muted'))}>{value}</span>
    </div>
  )
}

// ─── Card Pagamentos por DJ ───────────────────────────────────────────────────

function CardPagamentos({ djId, djNome, dataInicio, dataFim, refreshKey, onRefresh }) {
  const [slots, setSlots] = useState([])
  const [tab, setTab] = useState('em_pagamento')
  const [actioning, setActioning] = useState(false)

  useEffect(() => {
    if (!djId || djId === '__ext') { setSlots([]); return }
    let cancelled = false
    supabase
      .from('agenda')
      .select('id, data, hora_inicio, hora_fim, valor, estado_pagamento, pedido_pagamento_id, espacos!agenda_espaco_id_fkey(nome)')
      .eq('dj_id', djId)
      .in('estado_pagamento', ['auto_pagamento', 'auto_pagamento_penalizacao', 'em_pagamento', 'em_regularizacao', 'pago'])
      .gte('data', dataInicio)
      .lte('data', dataFim)
      .order('data', { ascending: false })
      .then(({ data }) => { if (!cancelled) setSlots(data ?? []) })
    return () => { cancelled = true }
  }, [djId, dataInicio, dataFim, refreshKey])

  const emPagamento     = slots.filter(s => ['auto_pagamento', 'auto_pagamento_penalizacao', 'em_pagamento'].includes(s.estado_pagamento))
  const emRegularizacao = slots.filter(s => s.estado_pagamento === 'em_regularizacao')
  const pago            = slots.filter(s => s.estado_pagamento === 'pago')

  const TABS = [
    { id: 'em_pagamento',     label: 'Em Pagamento',     count: emPagamento.length },
    { id: 'em_regularizacao', label: 'Em Regularização', count: emRegularizacao.length },
    { id: 'pago',             label: 'Pago',             count: pago.length },
  ]

  const currentSlots = tab === 'em_pagamento' ? emPagamento : tab === 'em_regularizacao' ? emRegularizacao : pago

  async function marcarPago(slot) {
    setActioning(true)
    try {
      const { data: pedido } = await supabase.from('pedidos_pagamento').insert({
        dj_id: djId,
        valor_total: Number(slot.valor ?? 0),
        estado: 'pago',
        data_pagamento: new Date().toISOString(),
      }).select().single()
      await supabase.from('agenda')
        .update({ estado_pagamento: 'pago', pedido_pagamento_id: pedido?.id ?? null })
        .eq('id', slot.id)
      onRefresh()
    } finally { setActioning(false) }
  }

  async function regularizar(slot) {
    setActioning(true)
    try {
      await supabase.from('agenda').update({ estado_pagamento: 'auto_pagamento_penalizacao' }).eq('id', slot.id)
      onRefresh()
    } finally { setActioning(false) }
  }

  async function aprovarAdmin(slot) {
    setActioning(true)
    try {
      await supabase.from('agenda').update({ estado_pagamento: 'em_pagamento' }).eq('id', slot.id)
      onRefresh()
    } finally { setActioning(false) }
  }

  if (!djId) return null

  return (
    <div className="bg-surface-1 border border-border rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-border bg-surface-2">
        <span className="text-sm font-semibold text-accent">Pagamentos — {djNome}</span>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={clsx(
              'flex-1 px-3 py-2.5 text-[11px] font-semibold transition-colors flex items-center justify-center gap-1.5',
              tab === t.id
                ? 'border-b-2 border-accent text-accent bg-surface-2/40'
                : 'text-accent-muted hover:text-accent'
            )}>
            {t.label}
            {t.count > 0 && (
              <span className="rounded-full bg-surface-2 border border-border px-1.5 py-0.5 text-[9px] font-bold tabular-nums">{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Tabela */}
      <div className="overflow-x-auto">
        {currentSlots.length === 0 ? (
          <p className="px-5 py-8 text-xs text-accent-subtle text-center">Sem datas neste estado</p>
        ) : (
          <table className="w-full text-xs border-collapse min-w-[520px]">
            <thead>
              <tr className="border-b border-border/50">
                <th className="text-left px-4 py-2 font-medium text-accent-muted">Data</th>
                <th className="text-left px-3 py-2 font-medium text-accent-muted">Espaço</th>
                <th className="text-left px-3 py-2 font-medium text-accent-muted">Horário</th>
                <th className="text-left px-3 py-2 font-medium text-accent-muted">Estado</th>
                <th className="text-right px-4 py-2 font-medium text-accent-muted">Valor</th>
                {tab !== 'pago' && <th className="px-4 py-2" />}
              </tr>
            </thead>
            <tbody>
              {currentSlots.map((s, i) => (
                <tr key={s.id} className={clsx('border-b border-border/20 last:border-0', i % 2 !== 0 && 'bg-surface-0/30')}>
                  <td className="px-4 py-2.5 text-accent-muted tabular-nums whitespace-nowrap">
                    {format(new Date(s.data + 'T00:00:00'), 'EEE d MMM', { locale: pt })}
                  </td>
                  <td className="px-3 py-2.5 text-accent-muted truncate max-w-[130px]">
                    {s.espacos?.nome ?? '—'}
                  </td>
                  <td className="px-3 py-2.5 text-accent-muted tabular-nums whitespace-nowrap">
                    {s.hora_inicio?.slice(0, 5)}–{s.hora_fim?.slice(0, 5)}
                  </td>
                  <td className="px-3 py-2.5">
                    <BadgeEstadoPag estado={s.estado_pagamento} />
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-accent">
                    {s.valor != null ? formatarEuro(Number(s.valor)) : '—'}
                  </td>
                  {tab !== 'pago' && (
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1.5 justify-end">
                        {tab === 'em_pagamento' && (
                          <button onClick={() => marcarPago(s)} disabled={actioning}
                            className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold text-emerald-400 hover:bg-emerald-500/20 transition-colors disabled:opacity-50 whitespace-nowrap">
                            Marcar Pago
                          </button>
                        )}
                        {tab === 'em_regularizacao' && (
                          <>
                            <button onClick={() => regularizar(s)} disabled={actioning}
                              className="rounded-lg border border-orange-500/40 bg-orange-500/10 px-2 py-1 text-[10px] font-bold text-orange-400 hover:bg-orange-500/20 transition-colors disabled:opacity-50 whitespace-nowrap">
                              Regularizar
                            </button>
                            <button onClick={() => aprovarAdmin(s)} disabled={actioning}
                              className="rounded-lg border border-blue-500/40 bg-blue-500/10 px-2 py-1 text-[10px] font-bold text-blue-400 hover:bg-blue-500/20 transition-colors disabled:opacity-50 whitespace-nowrap">
                              Aprovar
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

export function ContasDJs() {
  const { anoMes } = useMesStore()
  const storeConfig = useAppStore((s) => s.config)
  const [searchParams] = useSearchParams()
  const [slots, setSlots]     = useState([])
  const [loading, setLoading] = useState(true)
  const [djSel, setDjSel]     = useState('')
  const [djCat, setDjCat]     = useState(null)
  const [filtroNome, setFiltroNome] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('todos')
  const [refreshPag, setRefreshPag] = useState(0)

  const cfgTransportes = useMemo(() => safeParse(storeConfig?.contas_transportes, [{ valor: 120 }]), [storeConfig])
  const cfgDescontos   = useMemo(() => safeParse(storeConfig?.contas_descontos,   [{ valor: 2 }]),   [storeConfig])
  const cfgRetencaoPct = Number(storeConfig?.contas_desconto_pct ?? 25)
  const transporteRate = cfgTransportes[0]?.valor ?? 120

  const [docTipo, setDocTipo]           = useState('recibo')
  const [comRetencao, setComRetencao]   = useState(false)
  const [retencaoPct, setRetencaoPct]   = useState(cfgRetencaoPct)
  const [premioOverride, setPremioOverride] = useState(null)
  const [descontoOp, setDescontoOp]     = useState(() => cfgDescontos[0]?.valor ?? 2)

  const { dataInicio, dataFim, titulo } = useMemo(() => {
    const [ano, mes] = anoMes.split('-').map(Number)
    const ref = new Date(ano, mes - 1, 1)
    return {
      dataInicio: format(startOfMonth(ref), 'yyyy-MM-dd'),
      dataFim:    format(endOfMonth(ref),   'yyyy-MM-dd'),
      titulo:     cap(format(ref, 'MMMM yyyy', { locale: pt })),
    }
  }, [anoMes])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    supabase
      .from('agenda')
      .select(`
        id, dj_id, turno_id, data, hora_inicio, hora_fim, valor, estado,
        djs(nome, nome_artistico),
        espacos(id, nome, morada),
        presencas_djs(agenda_id, signed_at, signed_by),
        turnos_espaco(hora_fim)
      `)
      .not('dj_id', 'is', null)
      .gte('data', dataInicio)
      .lte('data', dataFim)
      .order('data')
      .then(({ data, error }) => {
        if (cancelled || error) return
        setSlots(data ?? [])
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [dataInicio, dataFim])

  // Pré-selecionar DJ vindo do URL ?dj=<id>
  useEffect(() => {
    const id = searchParams.get('dj')
    if (id) { setDjSel(id); setPremioOverride(null) }
  }, [searchParams])

  useEffect(() => {
    if (!djSel || djSel === '__ext') { setDjCat(null); return }
    supabase
      .from('dj_categorias')
      .select('posicao, categorias_dj(nome)')
      .eq('dj_id', djSel)
      .eq('posicao', 1)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) { setDjCat(null); return }
        const nome = data.categorias_dj?.nome ?? ''
        setDjCat({ nome, label: /residente/i.test(nome) ? 'Residente' : nome || 'Convidado INT' })
      })
  }, [djSel])

  const porDJ = useMemo(() => {
    const map = {}
    slots.forEach(s => {
      const id = s.dj_id ?? '__ext'
      if (!map[id]) map[id] = {
        id, nome: s.djs?.nome_artistico || s.djs?.nome || 'Externo',
        slots: [], pagaveis: 0, proposta: 0, cancelados: 0, valor: 0,
      }
      map[id].slots.push(s)
      if (PAGAVEIS.has(s.estado))        { map[id].pagaveis++;  map[id].valor += Number(s.valor ?? 0) }
      else if (CANCELADOS.has(s.estado)) { map[id].cancelados++ }
      else                                { map[id].proposta++ }
    })
    return Object.values(map).sort((a, b) => b.valor - a.valor)
  }, [slots])

  const porDJFiltrado = useMemo(() => {
    return porDJ.filter(r => {
      const nomeOk = !filtroNome || r.nome.toLowerCase().includes(filtroNome.toLowerCase())
      const estadoOk = filtroEstado === 'todos'
        || (filtroEstado === 'confirmados' && r.pagaveis > 0)
        || (filtroEstado === 'proposta'    && r.proposta > 0)
      return nomeOk && estadoOk
    })
  }, [porDJ, filtroNome, filtroEstado])

  const djData = djSel ? porDJ.find(d => d.id === djSel) : null

  const slotsRich = useMemo(() => {
    if (!djData) return []
    return djData.slots
      .filter(s => PAGAVEIS.has(s.estado))
      .map(s => ({
        ...s,
        horasExtra: calcHorasExtra(s),
        transporte: isTransporte(s.espacos?.morada),
        assStatus:  assStatus(s),
      }))
  }, [djData])

  const premioAuto  = slotsRich.length > 0 && slotsRich.every(s => s.assStatus === 'a_tempo')
  const premioAtivo = premioOverride !== null ? premioOverride : premioAuto

  const calc = useMemo(() => {
    if (!slotsRich.length) return null
    const n               = slotsRich.length
    const valorAtuacoes   = slotsRich.reduce((s, sl) => s + Number(sl.valor ?? 0), 0)
    const totalHExt       = slotsRich.reduce((s, sl) => s + sl.horasExtra, 0)
    const valorHExt       = totalHExt * CFG.horaExtraRate
    const nTransp         = slotsRich.filter(s => s.transporte).length
    const valorTransp     = nTransp * transporteRate
    const valorPremio     = premioAtivo ? n * CFG.premioRate : 0
    const valorDesconto   = descontoOp * n
    const subtotal        = valorAtuacoes + valorHExt + valorTransp + valorPremio - valorDesconto
    const ajuste          = docTipo === 'fatura'
      ? subtotal * CFG.ivaRate
      : comRetencao ? -(subtotal * retencaoPct / 100) : 0
    const labelAjuste     = docTipo === 'fatura' ? 'IVA (23%)' : `Retenção (${retencaoPct}%)`
    return { n, valorAtuacoes, totalHExt, valorHExt, nTransp, valorTransp, valorPremio, valorDesconto, subtotal, ajuste, labelAjuste, total: subtotal + ajuste }
  }, [slotsRich, premioAtivo, descontoOp, docTipo, comRetencao, retencaoPct, transporteRate])

  const selecionarDJ = (id) => {
    setDjSel(prev => prev === id ? '' : id)
    setPremioOverride(null)
  }

  if (loading) return <LoadingPage />

  return (
    <div className="p-6 flex flex-col gap-6 max-w-5xl mx-auto">

      {/* ── Selector DJ ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <label className="text-[10px] font-semibold text-accent-muted uppercase tracking-widest">DJ</label>
        <select
          value={djSel}
          onChange={e => selecionarDJ(e.target.value)}
          className="flex-1 max-w-sm bg-surface-1 border border-border rounded-lg px-3 py-2 text-sm text-accent focus:outline-none focus:ring-1 focus:ring-accent/30"
        >
          <option value="">— selecionar DJ —</option>
          {porDJ.map(d => (
            <option key={d.id} value={d.id}>
              {d.nome}  ·  {d.pagaveis} data{d.pagaveis !== 1 ? 's' : ''}
            </option>
          ))}
        </select>
        {djCat && (
          <span className="text-[11px] px-2.5 py-1 rounded-md bg-surface-2 border border-border text-accent-muted">
            {djCat.label}
          </span>
        )}
      </div>

      {/* ── Detalhe DJ selecionado ── */}
      {djSel && djData && (
        <>
          <div className="grid md:grid-cols-[1fr_300px] gap-5 items-start">

            {/* Lista de datas */}
            <div className="bg-surface-1 border border-border rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-border bg-surface-2 flex items-center justify-between">
                <span className="text-sm font-semibold text-accent">{djData.nome}</span>
                <span className="text-[11px] text-accent-muted">{slotsRich.length} atuações confirmadas · {titulo}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse min-w-[520px]">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-left px-4 py-2 font-medium text-accent-muted">Data</th>
                      <th className="text-left px-3 py-2 font-medium text-accent-muted">Espaço</th>
                      <th className="text-left px-3 py-2 font-medium text-accent-muted">Horário</th>
                      <th className="text-center px-2 py-2 font-medium text-accent-muted" title="Assinatura">Ass.</th>
                      <th className="text-center px-2 py-2 font-medium text-accent-muted" title="Horas extra">H+</th>
                      <th className="text-center px-2 py-2 font-medium text-accent-muted" title="Transporte">Trp.</th>
                      <th className="text-right px-4 py-2 font-medium text-accent-muted">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {djData.slots.map((s, i) => {
                      const isPag = PAGAVEIS.has(s.estado)
                      const rich  = slotsRich.find(r => r.id === s.id)
                      return (
                        <tr key={s.id} className={clsx(
                          'border-b border-border/20 last:border-0',
                          i % 2 !== 0 ? 'bg-surface-0/30' : '',
                          !isPag && 'opacity-40'
                        )}>
                          <td className="px-4 py-2.5 text-accent-muted tabular-nums whitespace-nowrap">
                            {format(new Date(s.data + 'T00:00:00'), 'EEE d MMM', { locale: pt })}
                          </td>
                          <td className="px-3 py-2.5 text-accent-muted truncate max-w-[120px]">
                            {s.espacos?.nome ?? '—'}
                          </td>
                          <td className="px-3 py-2.5 text-accent-muted tabular-nums whitespace-nowrap">
                            {s.hora_inicio?.slice(0,5)}–{s.hora_fim?.slice(0,5)}
                          </td>
                          <td className="px-2 py-2.5 text-center">
                            {!isPag ? <span className="text-border/40">—</span>
                              : rich?.assStatus === 'a_tempo'   ? <span className="text-status-confirmado font-bold" title="Assinado a tempo">✓</span>
                              : rich?.assStatus === 'atrasada'  ? <span className="text-amber-500" title="Assinatura atrasada">!</span>
                              : <span className="text-border/50" title="Sem assinatura">✗</span>}
                          </td>
                          <td className="px-2 py-2.5 text-center tabular-nums">
                            {rich?.horasExtra > 0
                              ? <span className="text-status-proposta font-medium">+{rich.horasExtra}h</span>
                              : <span className="text-border/40">—</span>}
                          </td>
                          <td className="px-2 py-2.5 text-center">
                            {rich?.transporte
                              ? <span className="text-accent-muted" title="Transporte incluído">↗</span>
                              : <span className="text-border/40">—</span>}
                          </td>
                          <td className={clsx(
                            'px-4 py-2.5 text-right tabular-nums font-semibold',
                            isPag ? 'text-accent' : 'text-accent-subtle line-through'
                          )}>
                            {s.valor != null ? formatarEuro(Number(s.valor)) : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  {slotsRich.length > 0 && (
                    <tfoot>
                      <tr className="border-t border-border bg-surface-2/60">
                        <td colSpan={3} className="px-4 py-2 text-xs font-semibold text-accent-muted">Totais</td>
                        <td className="px-2 py-2 text-center text-[10px] text-accent-muted">
                          {slotsRich.filter(s => s.assStatus === 'a_tempo').length}/{slotsRich.length}
                        </td>
                        <td className="px-2 py-2 text-center text-xs font-medium text-status-proposta tabular-nums">
                          {slotsRich.reduce((s, r) => s + r.horasExtra, 0) > 0
                            ? `+${slotsRich.reduce((s, r) => s + r.horasExtra, 0)}h`
                            : '—'}
                        </td>
                        <td className="px-2 py-2 text-center text-[10px] text-accent-muted">
                          {slotsRich.filter(s => s.transporte).length > 0
                            ? slotsRich.filter(s => s.transporte).length
                            : '—'}
                        </td>
                        <td className="px-4 py-2 text-right font-bold text-accent tabular-nums">
                          {formatarEuro(slotsRich.reduce((s, r) => s + Number(r.valor ?? 0), 0))}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>

            {/* Coluna direita: Opções + Resumo */}
            <div className="flex flex-col gap-4">

              {/* Opções */}
              <div className="bg-surface-1 border border-border rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 border-b border-border bg-surface-2">
                  <span className="text-[11px] font-semibold text-accent-muted uppercase tracking-widest">Opções</span>
                </div>
                <div className="p-4 flex flex-col gap-5">

                  {/* Documento */}
                  <div>
                    <p className="text-[10px] font-semibold text-accent-muted uppercase tracking-widest mb-2">Documento</p>
                    <div className="flex gap-1 p-1 bg-surface-0 rounded-lg border border-border">
                      {[['recibo', 'Recibo Verde'], ['fatura', 'Fatura']].map(([v, l]) => (
                        <button key={v} onClick={() => setDocTipo(v)}
                          className={clsx(
                            'flex-1 text-xs py-1.5 rounded-md transition-colors font-medium',
                            docTipo === v
                              ? 'bg-surface-2 text-accent shadow-sm border border-border'
                              : 'text-accent-muted hover:text-accent'
                          )}>{l}</button>
                      ))}
                    </div>
                    {docTipo === 'fatura' && (
                      <p className="mt-2 text-[11px] text-status-proposta pl-1">+23% IVA aplicado ao total</p>
                    )}
                    {docTipo === 'recibo' && (
                      <div className="mt-2.5 flex flex-col gap-2">
                        <div className="flex gap-1 p-1 bg-surface-0 rounded-lg border border-border">
                          <button onClick={() => setComRetencao(false)}
                            className={clsx('flex-1 text-xs py-1.5 rounded-md transition-colors font-medium',
                              !comRetencao ? 'bg-surface-2 text-accent shadow-sm border border-border' : 'text-accent-muted hover:text-accent')}>
                            Sem retenção</button>
                          <button onClick={() => setComRetencao(true)}
                            className={clsx('flex-1 text-xs py-1.5 rounded-md transition-colors font-medium',
                              comRetencao ? 'bg-surface-2 text-accent shadow-sm border border-border' : 'text-accent-muted hover:text-accent')}>
                            Com retenção</button>
                        </div>
                        {comRetencao && (
                          <div className="flex items-center gap-2 pl-1">
                            <span className="text-xs text-accent-muted">Percentagem</span>
                            <input type="number" min={0} max={100} value={retencaoPct}
                              onChange={e => setRetencaoPct(Number(e.target.value))}
                              className="w-14 bg-surface-0 border border-border rounded-lg px-2 py-1 text-xs text-accent text-center focus:outline-none focus:ring-1 focus:ring-accent/30" />
                            <span className="text-xs text-accent-muted">%</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Prémio assiduidade */}
                  <div>
                    <p className="text-[10px] font-semibold text-accent-muted uppercase tracking-widest mb-2">Prémio Assiduidade</p>
                    <div className="flex items-start justify-between gap-2">
                      <p className={clsx('text-[11px]', premioAtivo ? 'text-status-confirmado' : 'text-accent-muted')}>
                        {premioOverride === null
                          ? premioAuto ? 'Auto · elegível' : 'Auto · não elegível'
                          : premioOverride ? 'Ativado manualmente' : 'Desativado manualmente'}
                      </p>
                      <button
                        onClick={() => setPremioOverride(premioOverride !== null ? null : !premioAuto)}
                        className={clsx(
                          'text-[10px] px-2 py-0.5 rounded border flex-shrink-0 transition-colors',
                          premioOverride !== null
                            ? 'border-accent/40 bg-accent/5 text-accent'
                            : 'border-border text-accent-muted hover:border-accent/30'
                        )}>
                        {premioOverride !== null ? 'auto' : 'forçar'}
                      </button>
                    </div>
                    {premioOverride !== null && (
                      <div className="mt-2 flex gap-2">
                        <button onClick={() => setPremioOverride(true)}
                          className={clsx('flex-1 text-[11px] py-1.5 rounded-lg border transition-colors',
                            premioOverride ? 'bg-status-confirmado/10 border-status-confirmado/40 text-status-confirmado font-medium' : 'border-border text-accent-muted hover:border-border/80')}>
                          Ativar</button>
                        <button onClick={() => setPremioOverride(false)}
                          className={clsx('flex-1 text-[11px] py-1.5 rounded-lg border transition-colors',
                            !premioOverride ? 'bg-status-cancelado/10 border-status-cancelado/40 text-status-cancelado font-medium' : 'border-border text-accent-muted hover:border-border/80')}>
                          Desativar</button>
                      </div>
                    )}
                  </div>

                  {/* Desconto */}
                  {cfgDescontos.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold text-accent-muted uppercase tracking-widest mb-2">Desconto</p>
                      <div className="flex flex-wrap gap-1.5">
                        {cfgDescontos.map((d, i) => (
                          <button key={i} type="button" onClick={() => setDescontoOp(d.valor)}
                            className={clsx('px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors',
                              descontoOp === d.valor
                                ? 'bg-accent/10 border-accent/40 text-accent'
                                : 'border-border text-accent-muted hover:border-border/80')}>
                            {d.label || `Desconto ${i + 1}`} — {d.valor}€
                          </button>
                        ))}
                        <button type="button" onClick={() => setDescontoOp(0)}
                          className={clsx('px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors',
                            descontoOp === 0
                              ? 'bg-accent/10 border-accent/40 text-accent'
                              : 'border-border text-accent-muted hover:border-border/80')}>
                          Sem desconto</button>
                      </div>
                      {calc && descontoOp > 0 && (
                        <span className="text-xs text-accent-subtle mt-1 block tabular-nums">= −{formatarEuro(calc.valorDesconto)}</span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Resumo */}
              {calc && (
                <div className="bg-surface-1 border border-border rounded-xl overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-border bg-surface-2">
                    <span className="text-[11px] font-semibold text-accent-muted uppercase tracking-widest">Resumo</span>
                  </div>
                  <div className="divide-y divide-border/30">
                    <BRow label={`Valor atuações (${calc.n} data${calc.n !== 1 ? 's' : ''})`} value={formatarEuro(calc.valorAtuacoes)} />
                    {calc.valorHExt > 0 && (
                      <BRow label={`Horas extra (${calc.totalHExt}h × ${CFG.horaExtraRate}€)`} value={`+${formatarEuro(calc.valorHExt)}`} accent="text-status-proposta" />
                    )}
                    {calc.valorTransp > 0 && (
                      <BRow label={`Transporte (${calc.nTransp} × ${transporteRate}€)`} value={`+${formatarEuro(calc.valorTransp)}`} accent="text-status-proposta" />
                    )}
                    {premioAtivo && (
                      <BRow label={`Prémio assiduidade (${calc.n} × ${CFG.premioRate}€)`} value={`+${formatarEuro(calc.valorPremio)}`} accent="text-status-proposta" />
                    )}
                    {calc.valorDesconto > 0 && (
                      <BRow label={`Desconto operação (${descontoOp}€ × ${calc.n})`} value={`−${formatarEuro(calc.valorDesconto)}`} accent="text-status-cancelado" />
                    )}
                    <BRow label="Subtotal" value={formatarEuro(calc.subtotal)} bold />
                    {calc.ajuste !== 0 && (
                      <BRow label={calc.labelAjuste} value={`${calc.ajuste > 0 ? '+' : ''}${formatarEuro(calc.ajuste)}`}
                        accent={calc.ajuste < 0 ? 'text-status-cancelado' : 'text-status-proposta'} />
                    )}
                    <div className="px-4 py-3.5 flex items-center justify-between bg-surface-2/40">
                      <span className="text-sm font-bold text-accent">Total a pagar</span>
                      <span className="text-lg font-bold text-status-confirmado tabular-nums">{formatarEuro(calc.total)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Card Pagamentos ── */}
          <CardPagamentos
            djId={djSel}
            djNome={djData.nome}
            dataInicio={dataInicio}
            dataFim={dataFim}
            refreshKey={refreshPag}
            onRefresh={() => setRefreshPag(k => k + 1)}
          />
        </>
      )}

      {/* ── Tabela resumo geral ── */}
      <div className="bg-surface-1 border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-surface-2 flex items-center gap-3 flex-wrap">
          <span className="text-sm font-semibold text-accent mr-auto">Contas — {titulo}</span>
          <input type="text" placeholder="Pesquisar DJ..." value={filtroNome}
            onChange={e => setFiltroNome(e.target.value)}
            className="bg-surface-0 border border-border rounded-lg px-3 py-1.5 text-xs text-accent placeholder:text-accent-subtle w-36 focus:outline-none focus:ring-1 focus:ring-accent/30" />
          <div className="flex gap-0.5 p-0.5 bg-surface-0 rounded-lg border border-border">
            {[['todos', 'Todos'], ['confirmados', 'Confirmados'], ['proposta', 'Proposta']].map(([v, l]) => (
              <button key={v} onClick={() => setFiltroEstado(v)}
                className={clsx('text-[11px] px-2.5 py-1 rounded-md transition-colors font-medium',
                  filtroEstado === v ? 'bg-surface-2 text-accent border border-border shadow-sm' : 'text-accent-muted hover:text-accent')}>
                {l}</button>
            ))}
          </div>
          <span className="text-[11px] text-accent-muted tabular-nums whitespace-nowrap">
            {porDJFiltrado.length} DJs · {porDJFiltrado.reduce((s,r)=>s+r.pagaveis,0)} datas · <span className="text-status-confirmado font-semibold">{formatarEuro(porDJFiltrado.reduce((s,r)=>s+r.valor,0))}</span>
          </span>
        </div>
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-4 py-2.5 font-medium text-accent-muted">DJ</th>
              <th className="text-center px-3 py-2.5 font-medium text-accent-muted">Confirm.</th>
              <th className="text-center px-3 py-2.5 font-medium text-accent-muted">Proposta</th>
              <th className="text-center px-3 py-2.5 font-medium text-accent-muted">Canceladas</th>
              <th className="text-right px-4 py-2.5 font-medium text-accent-muted">Valor</th>
            </tr>
          </thead>
          <tbody>
            {porDJFiltrado.map((r, i) => (
              <tr key={r.id} onClick={() => selecionarDJ(r.id)}
                className={clsx(
                  'border-b border-border/20 last:border-0 cursor-pointer transition-colors',
                  r.id === djSel ? 'bg-accent/5'
                    : i % 2 !== 0 ? 'bg-surface-0/30 hover:bg-surface-2/40'
                    : 'hover:bg-surface-2/40'
                )}>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    {r.id === djSel && <span className="w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" />}
                    <span className="font-semibold text-accent">{r.nome}</span>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-center">
                  <span className={r.pagaveis > 0 ? 'text-status-confirmado font-semibold' : 'text-border/40'}>{r.pagaveis || '—'}</span>
                </td>
                <td className="px-3 py-2.5 text-center">
                  <span className={r.proposta > 0 ? 'text-status-proposta' : 'text-border/40'}>{r.proposta || '—'}</span>
                </td>
                <td className="px-3 py-2.5 text-center">
                  <span className={r.cancelados > 0 ? 'text-status-cancelado' : 'text-border/40'}>{r.cancelados || '—'}</span>
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-accent">
                  {r.valor > 0 ? formatarEuro(r.valor) : <span className="text-border/40">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border bg-surface-2">
              <td className="px-4 py-2.5 font-bold text-accent uppercase tracking-wider text-xs">Total</td>
              <td className="px-3 py-2.5 text-center font-bold text-status-confirmado">
                {porDJFiltrado.reduce((s,r)=>s+r.pagaveis,0)}
              </td>
              <td /><td />
              <td className="px-4 py-2.5 text-right font-bold text-status-confirmado tabular-nums text-sm">
                {formatarEuro(porDJFiltrado.reduce((s,r)=>s+r.valor,0))}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

    </div>
  )
}
