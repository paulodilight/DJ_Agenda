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

const CFG = { horaExtraRate: 30, ivaRate: 0.23 }

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

// ─── Estado pagamento ─────────────────────────────────────────────────────────

const ESTADO_PAG_CFG = {
  auto_pagamento:             { label: 'Auto Pag.',     cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25' },
  auto_pagamento_penalizacao: { label: 'Com Penaliz.',  cls: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/25' },
  em_regularizacao:           { label: 'Em Regulariz.', cls: 'bg-orange-500/15 text-orange-300 border-orange-500/25' },
  em_pagamento:               { label: 'Em Pagamento',  cls: 'bg-blue-500/15 text-blue-300 border-blue-500/25' },
  pago:                       { label: 'Pago',          cls: 'bg-emerald-600/20 text-emerald-300 border-emerald-600/30' },
}

const ESTADOS_SELECT = [
  { value: 'auto_pagamento',             label: 'Auto Pagamento' },
  { value: 'auto_pagamento_penalizacao', label: 'Com Penalização' },
  { value: 'em_pagamento',               label: 'Em Pagamento' },
  { value: 'em_regularizacao',           label: 'Em Regularização' },
  { value: 'pago',                       label: 'Pago' },
]

function SelectEstadoPag({ value, onChange, disabled }) {
  const cfg = ESTADO_PAG_CFG[value] ?? { label: '—', cls: 'bg-surface-2 text-accent-muted border-border' }
  return (
    <div className="relative inline-block">
      <span className={clsx('inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold cursor-pointer select-none', cfg.cls)}>
        {cfg.label}
        <svg className="w-2.5 h-2.5 opacity-60" viewBox="0 0 10 6" fill="none">
          <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </span>
      <select
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        className="absolute inset-0 w-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
      >
        {ESTADOS_SELECT.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}

// ─── Subcomponentes base ──────────────────────────────────────────────────────

function BRow({ label, value, bold, accent }) {
  return (
    <div className="flex items-center justify-between px-4 py-2">
      <span className={clsx('text-xs', bold ? 'font-semibold text-accent' : 'text-accent-muted')}>{label}</span>
      <span className={clsx('text-xs tabular-nums font-semibold', accent ?? (bold ? 'text-accent' : 'text-accent-muted'))}>{value}</span>
    </div>
  )
}

function ToggleSwitch({ checked, onChange }) {
  return (
    <button type="button" onClick={onChange}
      className={clsx('w-8 h-4 rounded-full transition-colors relative flex-shrink-0',
        checked ? 'bg-status-confirmado' : 'bg-surface-3'
      )}>
      <div className={clsx('absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform shadow-sm',
        checked ? 'left-[18px]' : 'left-0.5')} />
    </button>
  )
}

function ToggleRow({ label, sub, checked, onChange }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs text-accent">{label}</p>
        {sub && <p className="text-[10px] text-accent-muted mt-0.5">{sub}</p>}
      </div>
      <ToggleSwitch checked={checked} onChange={onChange} />
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

export function ContasDJs() {
  const { anoMes } = useMesStore()
  const storeConfig = useAppStore((s) => s.config)
  const [searchParams] = useSearchParams()
  const [slots, setSlots]               = useState([])
  const [loading, setLoading]           = useState(true)
  const [djSel, setDjSel]               = useState('')
  const [djCat, setDjCat]               = useState(null)
  const [filtroNome, setFiltroNome]     = useState('')
  const [refreshKey, setRefreshKey]     = useState(0)
  const [salvando, setSalvando]         = useState(false)
  const [marcandoPagas, setMarcandoPagas] = useState(false)

  const cfgTransportes      = useMemo(() => safeParse(storeConfig?.contas_transportes, [{ valor: 120 }]), [storeConfig])
  const cfgDescontos        = useMemo(() => safeParse(storeConfig?.contas_descontos,   [{ valor: 2 }]),   [storeConfig])
  const cfgRetencaoPct      = Number(storeConfig?.contas_desconto_pct ?? 25)
  const transporteRate      = cfgTransportes[0]?.valor ?? 120
  const valorQualidadeRate  = Number(storeConfig?.contas_valor_qualidade ?? 0)
  const valorQualidadeAtivo = storeConfig?.contas_valor_qualidade_ativo !== false

  const [reciboVerde, setReciboVerde]       = useState(true)
  const [comIva, setComIva]                 = useState(false)
  const [comRetencao, setComRetencao]       = useState(false)
  const [retencaoPct, setRetencaoPct]       = useState(cfgRetencaoPct)
  const [premioOverride, setPremioOverride] = useState(null)
  const [descontoOp, setDescontoOp]         = useState(() => cfgDescontos[0]?.valor ?? 2)

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
        estado_pagamento, data_pagamento,
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
  }, [dataInicio, dataFim, refreshKey])

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
        slots: [], pagaveis: 0, pagas: 0, proposta: 0, cancelados: 0, valor: 0, dataPagamento: null,
      }
      map[id].slots.push(s)
      if (PAGAVEIS.has(s.estado)) {
        map[id].pagaveis++
        map[id].valor += Number(s.valor ?? 0)
        if (s.estado_pagamento === 'pago') {
          map[id].pagas++
          if (s.data_pagamento) {
            if (!map[id].dataPagamento || s.data_pagamento > map[id].dataPagamento) {
              map[id].dataPagamento = s.data_pagamento
            }
          }
        }
      } else if (CANCELADOS.has(s.estado)) {
        map[id].cancelados++
      } else {
        map[id].proposta++
      }
    })
    return Object.values(map).map(d => ({
      ...d,
      estadoPag: d.pagaveis === 0 ? null
        : d.pagas === d.pagaveis ? 'pago'
        : d.pagas > 0 ? 'parcial'
        : null,
    })).sort((a, b) => b.valor - a.valor)
  }, [slots])

  const porDJFiltrado = useMemo(() => {
    return porDJ.filter(r => !filtroNome || r.nome.toLowerCase().includes(filtroNome.toLowerCase()))
  }, [porDJ, filtroNome])

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
  const todasPagas  = slotsRich.length > 0 && slotsRich.every(s => s.estado_pagamento === 'pago' && s.data_pagamento)

  const calc = useMemo(() => {
    if (!slotsRich.length) return null
    const n              = slotsRich.length
    const valorAtuacoes  = slotsRich.reduce((s, sl) => s + Number(sl.valor ?? 0), 0)
    const totalHExt      = slotsRich.reduce((s, sl) => s + sl.horasExtra, 0)
    const valorHExt      = totalHExt * CFG.horaExtraRate
    const nTransp        = slotsRich.filter(s => s.transporte).length
    const valorTransp    = nTransp * transporteRate
    const valorPremio    = premioAtivo && valorQualidadeRate > 0 ? n * valorQualidadeRate : 0
    const valorDesconto  = descontoOp * n
    const subtotal       = valorAtuacoes + valorHExt + valorTransp + valorPremio - valorDesconto
    const ajusteIva      = comIva ? subtotal * CFG.ivaRate : 0
    const ajusteRetencao = comRetencao ? -(subtotal * retencaoPct / 100) : 0
    return { n, valorAtuacoes, totalHExt, valorHExt, nTransp, valorTransp, valorPremio, valorDesconto, subtotal, ajusteIva, ajusteRetencao, total: subtotal + ajusteIva + ajusteRetencao }
  }, [slotsRich, premioAtivo, descontoOp, comIva, comRetencao, retencaoPct, transporteRate, valorQualidadeRate])

  const selecionarDJ = (id) => {
    const next = id === djSel ? '' : id
    setDjSel(next)
    if (next) {
      try {
        const s = JSON.parse(localStorage.getItem(`dj_contas_${next}`) || '{}')
        setReciboVerde(s.reciboVerde  ?? true)
        setComIva(s.comIva           ?? false)
        setComRetencao(s.comRetencao ?? false)
        setRetencaoPct(s.retencaoPct ?? cfgRetencaoPct)
        setDescontoOp(s.descontoOp   ?? (cfgDescontos[0]?.valor ?? 2))
        setPremioOverride(s.premioOverride ?? null)
      } catch { setPremioOverride(null); setReciboVerde(true); setComIva(false); setComRetencao(false) }
    } else {
      setPremioOverride(null)
      setReciboVerde(true)
      setComIva(false)
      setComRetencao(false)
    }
  }

  const guardarOpcoes = () => {
    if (!djSel) return
    localStorage.setItem(`dj_contas_${djSel}`, JSON.stringify({
      reciboVerde, comIva, comRetencao, retencaoPct, descontoOp, premioOverride
    }))
  }

  async function mudarEstadoSlot(slotId, novoEstado) {
    setSalvando(true)
    try {
      const today = new Date().toISOString().split('T')[0]
      const update = { estado_pagamento: novoEstado }
      if (novoEstado === 'pago') update.data_pagamento = today
      await supabase.from('agenda').update(update).eq('id', slotId)
      setRefreshKey(k => k + 1)
    } finally { setSalvando(false) }
  }

  async function mudarDataPag(slotId, data) {
    await supabase.from('agenda').update({ data_pagamento: data || null }).eq('id', slotId)
    setRefreshKey(k => k + 1)
  }

  async function marcarTodasPagas() {
    if (marcandoPagas || todasPagas) return
    setMarcandoPagas(true)
    try {
      const today = new Date().toISOString().split('T')[0]
      const ids = slotsRich.map(s => s.id)
      if (ids.length > 0) {
        await supabase.from('agenda')
          .update({ estado_pagamento: 'pago', data_pagamento: today })
          .in('id', ids)
      }
      setRefreshKey(k => k + 1)
    } finally { setMarcandoPagas(false) }
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
        <div className="grid md:grid-cols-[1fr_300px] gap-5 items-start">

          {/* Lista de datas */}
          <div className="bg-surface-1 border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-border bg-surface-2 flex items-center justify-between gap-3 flex-wrap">
              <span className="text-sm font-semibold text-accent">{djData.nome}</span>
              <div className="flex items-center gap-3">
                <span className="text-[11px] text-accent-muted">{slotsRich.length} atuações confirmadas · {titulo}</span>
                {slotsRich.length > 0 && (
                  <button
                    onClick={marcarTodasPagas}
                    disabled={marcandoPagas || todasPagas}
                    className={clsx(
                      'text-[10px] font-semibold px-2.5 py-1 rounded-md border transition-colors whitespace-nowrap',
                      todasPagas
                        ? 'bg-green-600/20 text-green-300 border-green-600/30 cursor-default'
                        : 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30 hover:bg-yellow-500/30 disabled:opacity-50'
                    )}
                  >
                    {todasPagas ? '✓ Todas Pagas' : marcandoPagas ? '...' : 'Todas Pagas'}
                  </button>
                )}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse min-w-[760px]">
                <thead>
                  <tr className="border-b border-border/50">
                    <th className="text-left px-4 py-2 font-medium text-accent-muted w-[100px]">Data</th>
                    <th className="text-left px-3 py-2 font-medium text-accent-muted">Espaço</th>
                    <th className="text-left px-3 py-2 font-medium text-accent-muted w-[105px]">Horário</th>
                    <th className="text-center px-2 py-2 font-medium text-accent-muted w-[42px]" title="Assinatura">Ass.</th>
                    <th className="text-center px-2 py-2 font-medium text-accent-muted w-[42px]" title="Horas extra">H+</th>
                    <th className="text-left px-3 py-2 font-medium text-accent-muted w-[130px]">Estado</th>
                    <th className="text-left px-3 py-2 font-medium text-accent-muted w-[130px]">Data Pag.</th>
                    <th className="text-right px-4 py-2 font-medium text-accent-muted w-[80px]">Valor</th>
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
                            : rich?.assStatus === 'a_tempo'  ? <span className="text-status-confirmado font-bold" title="Assinado a tempo">✓</span>
                            : rich?.assStatus === 'atrasada' ? <span className="text-amber-500" title="Assinatura atrasada">!</span>
                            : <span className="text-border/50" title="Sem assinatura">✗</span>}
                        </td>
                        <td className="px-2 py-2.5 text-center tabular-nums">
                          {rich?.horasExtra > 0
                            ? <span className="text-status-proposta font-medium">+{rich.horasExtra}h</span>
                            : <span className="text-border/40">—</span>}
                        </td>
                        <td className="px-3 py-2.5">
                          {isPag
                            ? <SelectEstadoPag
                                value={s.estado_pagamento}
                                onChange={v => mudarEstadoSlot(s.id, v)}
                                disabled={salvando}
                              />
                            : <span className="text-border/40">—</span>}
                        </td>
                        <td className="px-3 py-2.5">
                          {isPag
                            ? <input
                                type="date"
                                value={s.data_pagamento ?? ''}
                                onChange={e => mudarDataPag(s.id, e.target.value)}
                                className="bg-transparent border border-border/40 rounded px-1.5 py-0.5 text-[10px] text-accent-muted focus:outline-none focus:border-accent/40 w-[110px]"
                              />
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
                      <td colSpan={2} />
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

                <div>
                  <p className="text-[10px] font-semibold text-accent-muted uppercase tracking-widest mb-3">Documento</p>
                  <div className="flex flex-col gap-3">
                    <ToggleRow label="Recibo Verde" checked={reciboVerde} onChange={() => setReciboVerde(v => !v)} />
                    <ToggleRow label="IVA (23%)" sub="+23% sobre o subtotal" checked={comIva} onChange={() => setComIva(v => !v)} />
                    <ToggleRow label="Retenção na fonte" checked={comRetencao} onChange={() => setComRetencao(v => !v)} />
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
                </div>

                {valorQualidadeAtivo && valorQualidadeRate > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold text-accent-muted uppercase tracking-widest mb-3">Valor Qualidade</p>
                    <ToggleRow
                      label="Ativar"
                      sub={premioOverride === null
                        ? premioAuto ? 'Auto · elegível' : 'Auto · não elegível'
                        : undefined}
                      checked={premioAtivo}
                      onChange={() => setPremioOverride(!premioAtivo)}
                    />
                  </div>
                )}

                {cfgDescontos.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold text-accent-muted uppercase tracking-widest mb-2">Desconto</p>
                    <select
                      value={descontoOp}
                      onChange={e => setDescontoOp(Number(e.target.value))}
                      className="w-full appearance-none bg-surface-0 border border-border rounded-lg px-3 py-2 text-xs text-accent focus:outline-none focus:ring-1 focus:ring-accent/30 cursor-pointer"
                    >
                      {cfgDescontos.map((d, i) => (
                        <option key={i} value={d.valor}>{d.label || `Desconto ${i + 1}`} — {d.valor}€</option>
                      ))}
                      <option value={0}>Sem desconto</option>
                    </select>
                    {calc && descontoOp > 0 && (
                      <span className="text-xs text-accent-subtle mt-1 block tabular-nums">= −{formatarEuro(calc.valorDesconto)}</span>
                    )}
                  </div>
                )}

                <button
                  type="button"
                  onClick={guardarOpcoes}
                  className="w-full py-2 rounded-lg bg-surface-2 border border-border text-xs text-accent-muted hover:text-accent hover:border-accent/40 transition-colors"
                >
                  Guardar preferências
                </button>
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
                  {premioAtivo && valorQualidadeAtivo && valorQualidadeRate > 0 && (
                    <BRow label={`Valor Qualidade (${calc.n} × ${valorQualidadeRate}€)`} value={`+${formatarEuro(calc.valorPremio)}`} accent="text-status-proposta" />
                  )}
                  {calc.valorDesconto > 0 && (
                    <BRow label={`Desconto operação (${descontoOp}€ × ${calc.n})`} value={`−${formatarEuro(calc.valorDesconto)}`} accent="text-status-cancelado" />
                  )}
                  <BRow label="Subtotal" value={formatarEuro(calc.subtotal)} bold />
                  {calc.ajusteIva !== 0 && (
                    <BRow label="IVA (23%)" value={`+${formatarEuro(calc.ajusteIva)}`} accent="text-status-proposta" />
                  )}
                  {calc.ajusteRetencao !== 0 && (
                    <BRow label={`Retenção (${retencaoPct}%)`} value={formatarEuro(calc.ajusteRetencao)} accent="text-status-cancelado" />
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
      )}

      {/* ── Tabela resumo geral ── */}
      <div className="bg-surface-1 border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-surface-2 flex items-center gap-3 flex-wrap">
          <span className="text-sm font-semibold text-accent mr-auto">Contas — {titulo}</span>
          <input type="text" placeholder="Pesquisar DJ..." value={filtroNome}
            onChange={e => setFiltroNome(e.target.value)}
            className="bg-surface-0 border border-border rounded-lg px-3 py-1.5 text-xs text-accent placeholder:text-accent-subtle w-36 focus:outline-none focus:ring-1 focus:ring-accent/30" />
          <span className="text-[11px] text-accent-muted tabular-nums whitespace-nowrap">
            {porDJFiltrado.length} DJs · {porDJFiltrado.reduce((s, r) => s + r.pagaveis, 0)} datas · <span className="text-status-confirmado font-semibold">{formatarEuro(porDJFiltrado.reduce((s, r) => s + r.valor, 0))}</span>
          </span>
        </div>
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-4 py-2.5 font-medium text-accent-muted">DJ</th>
              <th className="text-center px-3 py-2.5 font-medium text-accent-muted">Confirmadas</th>
              <th className="text-center px-3 py-2.5 font-medium text-accent-muted">Estado</th>
              <th className="text-center px-3 py-2.5 font-medium text-accent-muted">Data Pagamento</th>
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
                  <span className={r.pagaveis > 0 ? 'text-status-confirmado font-semibold' : 'text-border/40'}>
                    {r.pagaveis || '—'}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-center">
                  {r.estadoPag === 'pago'
                    ? <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-600/20 text-emerald-300 border border-emerald-600/30">Pago</span>
                    : r.estadoPag === 'parcial'
                    ? <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/25">Parcial</span>
                    : <span className="text-border/40">—</span>}
                </td>
                <td className="px-3 py-2.5 text-center text-accent-muted tabular-nums">
                  {r.dataPagamento
                    ? format(new Date(r.dataPagamento + 'T00:00:00'), 'd MMM yyyy', { locale: pt })
                    : <span className="text-border/40">—</span>}
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
                {porDJFiltrado.reduce((s, r) => s + r.pagaveis, 0)}
              </td>
              <td />
              <td />
              <td className="px-4 py-2.5 text-right font-bold text-status-confirmado tabular-nums text-sm">
                {formatarEuro(porDJFiltrado.reduce((s, r) => s + r.valor, 0))}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

    </div>
  )
}
