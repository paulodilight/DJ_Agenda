import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { format, parse, subMonths, startOfMonth, endOfMonth } from 'date-fns'
import { pt } from 'date-fns/locale'
import { clsx } from 'clsx'
import { CheckCircle, ChevronDown, ChevronLeft, ChevronRight, AlertCircle, RefreshCw, Send, RotateCcw } from 'lucide-react'

const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : ''

const FORMA_PAG_OPCOES = [
  { value: 'transferencia', label: 'Transferência' },
  { value: 'mbway',         label: 'MBWay' },
  { value: 'dinheiro',      label: 'Dinheiro' },
]

const SELECT = 'id, dj_id, dj_nome, espaco_nome, data, hora_inicio, hora_fim, valor, estado, estado_pagamento, pedido_pagamento_id, djs(nome, nome_artistico), espacos!agenda_espaco_id_fkey(nome)'

function formatData(str) {
  if (!str) return '—'
  try { return cap(format(new Date(str.slice(0, 10) + 'T12:00'), 'EEE d MMM', { locale: pt })) } catch { return str }
}

function formatDataHora(str) {
  if (!str) return '—'
  try { return format(new Date(str), "dd/MM 'às' HH:mm", { locale: pt }) } catch { return str }
}

function formatEuro(val) {
  if (val == null) return '—'
  return Number(val).toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })
}

function fmtAssinatura(ts) {
  if (!ts) return '—'
  try { return format(new Date(ts), 'HH:mm') } catch { return '—' }
}

const djNome     = (s) => s?.djs?.nome_artistico ?? s?.djs?.nome ?? s?.dj_nome ?? null
const espacoNome = (s) => s?.espacos?.nome ?? s?.espaco_nome ?? null

const TH = 'px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap'
const TD = 'px-3 py-2 text-xs'

function TableHead({ cols }) {
  return (
    <thead>
      <tr className="bg-surface-0/50 border-b border-border/40 text-accent-subtle/60">
        {cols.map(({ label, align = 'left' }, i) => (
          <th key={i} className={clsx(TH, align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left')}>
            {label}
          </th>
        ))}
      </tr>
    </thead>
  )
}

function BadgeEstadoDJ({ estado }) {
  const map = {
    confirmado: 'bg-blue-500/15 text-blue-300 border-blue-400/25',
    presente:   'bg-emerald-500/15 text-emerald-300 border-emerald-500/25',
    a_pedido:   'bg-violet-500/15 text-violet-300 border-violet-400/25',
    faltou:     'bg-red-500/15 text-red-300 border-red-500/25',
    cancelado:  'bg-red-700/15 text-red-400 border-red-600/25',
  }
  const label = {
    confirmado: 'Confirmado',
    presente:   'Presente',
    a_pedido:   'A Pedido',
    faltou:     'Faltou',
    cancelado:  'Cancelado',
  }
  if (!estado) return <span className="text-white/20">—</span>
  return (
    <span className={clsx('inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border', map[estado] ?? 'bg-white/5 text-white/40 border-white/10')}>
      {label[estado] ?? estado}
    </span>
  )
}

function BadgeEstadoPag({ estado }) {
  const map = {
    auto_pagamento:             'bg-emerald-500/15 text-emerald-300 border-emerald-500/25',
    auto_pagamento_penalizacao: 'bg-yellow-500/15  text-yellow-300  border-yellow-500/25',
    em_regularizacao:           'bg-orange-500/15  text-orange-300  border-orange-400/25',
    em_pagamento:               'bg-blue-400/15    text-blue-300    border-blue-400/25',
    pago:                       'bg-green-500/15   text-green-300   border-green-500/25',
  }
  const label = {
    auto_pagamento:             'Auto Pag.',
    auto_pagamento_penalizacao: 'Com Penaliz.',
    em_regularizacao:           'Em Regularização',
    em_pagamento:               'Em Pagamento',
    pago:                       'Pago',
  }
  if (!estado) return <span className="text-white/20">—</span>
  return (
    <span className={clsx('inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border', map[estado] ?? 'bg-white/5 text-white/40 border-white/10')}>
      {label[estado] ?? estado}
    </span>
  )
}

const COLS_BASE = [
  { label: 'Data' },
  { label: 'DJ' },
  { label: 'Espaço' },
  { label: 'Horário' },
  { label: 'Assinatura' },
  { label: 'Est. Data' },
  { label: 'Est. Pagto' },
  { label: 'Valor', align: 'right' },
]

function SlotRow({ slot, presMap, extra }) {
  const assinatura = presMap[slot.id]
  return (
    <tr className="border-b border-border/20 last:border-0 hover:bg-white/[0.02] transition-colors">
      <td className={clsx(TD, 'whitespace-nowrap text-accent-muted tabular-nums')}>{formatData(slot.data)}</td>
      <td className={clsx(TD, 'font-medium text-accent whitespace-nowrap')}>{djNome(slot) ?? '—'}</td>
      <td className={clsx(TD, 'text-accent-muted max-w-[140px] truncate')}>{espacoNome(slot) ?? '—'}</td>
      <td className={clsx(TD, 'text-accent-muted tabular-nums whitespace-nowrap')}>
        {slot.hora_inicio?.slice(0,5) ?? '—'}–{slot.hora_fim?.slice(0,5) ?? '—'}
      </td>
      <td className={clsx(TD, 'tabular-nums whitespace-nowrap', assinatura ? 'text-accent-muted' : 'text-white/20')}>
        {assinatura ? fmtAssinatura(assinatura) : '—'}
      </td>
      <td className={TD}><BadgeEstadoDJ estado={slot.estado} /></td>
      <td className={TD}><BadgeEstadoPag estado={slot.estado_pagamento} /></td>
      <td className={clsx(TD, 'text-right font-semibold text-accent tabular-nums whitespace-nowrap')}>{formatEuro(slot.valor)}</td>
      {extra}
    </tr>
  )
}

// ─── Tab: Em Pagamento ───────────────────────────────────────────────────────
function TabEmPagamento({ slots, presMap, onRefresh }) {
  const [formas,  setFormas]  = useState({})
  const [loading, setLoading] = useState({})

  const marcarPago = async (slot) => {
    if (loading[slot.id]) return
    setLoading(l => ({ ...l, [slot.id]: true }))
    const forma = formas[slot.id] ?? 'transferencia'
    const { data: pedido } = await supabase.from('pedidos_pagamento').insert({
      dj_id: slot.dj_id, estado: 'pago', valor_total: slot.valor ?? 0,
      notas: forma, data_pagamento: new Date().toISOString(),
    }).select().single()
    if (pedido) {
      await supabase.from('agenda')
        .update({ estado_pagamento: 'pago', pedido_pagamento_id: pedido.id })
        .eq('id', slot.id)
    }
    setLoading(l => ({ ...l, [slot.id]: false }))
    onRefresh()
  }

  if (!slots.length) return (
    <div className="text-center py-12 text-white/30 text-sm">Sem datas em pagamento este mês</div>
  )

  return (
    <div className="overflow-x-auto rounded-2xl border border-border/60 bg-surface-1">
      <table className="w-full text-xs">
        <TableHead cols={[...COLS_BASE, { label: 'Modo Pag.' }, { label: '' }]} />
        <tbody>
          {slots.map(slot => (
            <SlotRow key={slot.id} slot={slot} presMap={presMap} extra={<>
              <td className={TD}>
                <select
                  value={formas[slot.id] ?? 'transferencia'}
                  onChange={e => setFormas(f => ({ ...f, [slot.id]: e.target.value }))}
                  className="bg-surface-2 border border-border rounded-lg px-2 py-1 text-xs text-accent focus:outline-none"
                >
                  {FORMA_PAG_OPCOES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </td>
              <td className={clsx(TD, 'text-right')}>
                <button
                  onClick={() => marcarPago(slot)}
                  disabled={!!loading[slot.id]}
                  className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-bold bg-green-500/15 border border-green-500/25 text-green-300 hover:bg-green-500/25 disabled:opacity-40 transition-colors whitespace-nowrap"
                >
                  <CheckCircle size={11} />
                  {loading[slot.id] ? '…' : 'Marcar Pago'}
                </button>
              </td>
            </>} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Tab: Em Regularização ───────────────────────────────────────────────────
function TabEmRegularizacao({ slots, presMap, onRefresh }) {
  const [expandidos, setExpandidos] = useState({})
  const [mensagens,  setMensagens]  = useState({})
  const [respostas,  setRespostas]  = useState({})
  const [enviando,   setEnviando]   = useState({})
  const [loadingApr, setLoadingApr] = useState({})
  const [loadingReg, setLoadingReg] = useState({})

  const toggle = async (id) => {
    const next = !expandidos[id]
    setExpandidos(e => ({ ...e, [id]: next }))
    if (next && !mensagens[id]) {
      const { data } = await supabase.from('regularizacao_mensagens')
        .select('*').eq('agenda_id', id).order('criado_em', { ascending: true })
      setMensagens(m => ({ ...m, [id]: data ?? [] }))
    }
  }

  const enviarResposta = async (slot) => {
    const texto = respostas[slot.id]?.trim()
    if (!texto || enviando[slot.id]) return
    setEnviando(e => ({ ...e, [slot.id]: true }))
    await supabase.from('regularizacao_mensagens').insert({ agenda_id: slot.id, autor: 'admin', texto })
    setRespostas(r => ({ ...r, [slot.id]: '' }))
    const { data } = await supabase.from('regularizacao_mensagens')
      .select('*').eq('agenda_id', slot.id).order('criado_em', { ascending: true })
    setMensagens(m => ({ ...m, [slot.id]: data ?? [] }))
    setEnviando(e => ({ ...e, [slot.id]: false }))
  }

  const aprovarDireto = async (slot) => {
    if (!confirm(`Aprovar para pagamento — ${djNome(slot) ?? 'DJ'} · ${formatData(slot.data)}?`)) return
    setLoadingApr(l => ({ ...l, [slot.id]: true }))
    await supabase.from('regularizacao_mensagens').update({ resolvida: true }).eq('agenda_id', slot.id)
    await supabase.from('agenda').update({ estado_pagamento: 'em_pagamento' }).eq('id', slot.id)
    setLoadingApr(l => ({ ...l, [slot.id]: false }))
    onRefresh()
  }

  const regularizar = async (slot) => {
    if (!confirm(`Devolver ao DJ para confirmar — ${djNome(slot) ?? 'DJ'} · ${formatData(slot.data)}?`)) return
    setLoadingReg(l => ({ ...l, [slot.id]: true }))
    await supabase.from('agenda').update({ estado_pagamento: 'auto_pagamento_penalizacao' }).eq('id', slot.id)
    setLoadingReg(l => ({ ...l, [slot.id]: false }))
    onRefresh()
  }

  if (!slots.length) return (
    <div className="text-center py-12 text-white/30 text-sm">Sem datas em regularização este mês</div>
  )

  return (
    <div className="flex flex-col gap-2">
      {slots.map(slot => {
        const msgs        = mensagens[slot.id]
        const aberto      = !!expandidos[slot.id]
        const assinatura  = presMap[slot.id]
        return (
          <div key={slot.id} className="bg-surface-1 border border-orange-500/20 rounded-2xl overflow-hidden">
            <button onClick={() => toggle(slot.id)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/2 transition-colors">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-accent">{djNome(slot) ?? '—'}</span>
                  <span className="text-[10px] text-accent-muted">·</span>
                  <span className="text-xs text-accent-muted tabular-nums">{formatData(slot.data)}</span>
                  <span className="text-xs text-accent-muted hidden sm:inline">· {espacoNome(slot) ?? '—'}</span>
                  <BadgeEstadoDJ estado={slot.estado} />
                </div>
                <div className="flex items-center gap-3 mt-0.5 text-[10px] text-accent-subtle/50 flex-wrap">
                  <span>{slot.hora_inicio?.slice(0,5) ?? '—'}–{slot.hora_fim?.slice(0,5) ?? '—'}</span>
                  {assinatura && <span>Assinatura: {fmtAssinatura(assinatura)}</span>}
                  {msgs != null && <span className="text-orange-400/60">{msgs.length} msg{msgs.length !== 1 ? 's' : ''}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {slot.valor != null && <span className="text-xs font-bold text-accent tabular-nums">{formatEuro(slot.valor)}</span>}
                <ChevronDown size={12} className={clsx('text-white/30 transition-transform', aberto && 'rotate-180')} />
              </div>
            </button>

            {aberto && (
              <div className="border-t border-border/30 px-4 py-3 flex flex-col gap-3">
                {/* Thread */}
                {!msgs ? (
                  <p className="text-xs text-white/30 text-center py-2">A carregar…</p>
                ) : msgs.length === 0 ? (
                  <p className="text-xs text-white/25 italic text-center py-2">Sem mensagens.</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {msgs.map(m => (
                      <div key={m.id} className={`flex flex-col gap-0.5 ${m.autor === 'admin' ? 'items-end' : 'items-start'}`}>
                        <span className="text-[10px] text-white/25 uppercase tracking-wider">
                          {m.autor === 'admin' ? 'Tu (Admin)' : 'DJ'} · {formatDataHora(m.criado_em)}
                        </span>
                        <div className={clsx(
                          'max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-relaxed',
                          m.autor === 'admin'
                            ? 'bg-blue-500/15 border border-blue-500/20 text-blue-100/80 rounded-tr-sm'
                            : 'bg-orange-500/10 border border-orange-500/20 text-orange-100/80 rounded-tl-sm',
                        )}>
                          {m.texto}
                          {m.resolvida && <span className="ml-2 text-emerald-400/70 font-semibold">· ✓ Resolvida</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Resposta admin */}
                <div className="flex gap-2">
                  <textarea rows={2} placeholder="Responder ao DJ…"
                    value={respostas[slot.id] ?? ''}
                    onChange={e => setRespostas(r => ({ ...r, [slot.id]: e.target.value }))}
                    className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder:text-white/25 focus:outline-none focus:border-white/20 resize-none"
                  />
                  <button onClick={() => enviarResposta(slot)}
                    disabled={!respostas[slot.id]?.trim() || !!enviando[slot.id]}
                    className="shrink-0 w-9 rounded-xl bg-blue-500/20 border border-blue-500/30 text-blue-400 flex items-center justify-center disabled:opacity-40">
                    <Send size={14} />
                  </button>
                </div>

                {/* Acções admin */}
                <div className="flex gap-2 justify-end flex-wrap">
                  <button onClick={() => regularizar(slot)} disabled={!!loadingReg[slot.id]}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold bg-yellow-500/15 border border-yellow-500/25 text-yellow-300 hover:bg-yellow-500/25 transition-colors disabled:opacity-40">
                    <RotateCcw size={12} />
                    {loadingReg[slot.id] ? 'A devolver…' : 'Regularizar'}
                  </button>
                  <button onClick={() => aprovarDireto(slot)} disabled={!!loadingApr[slot.id]}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold bg-emerald-500/15 border border-emerald-500/25 text-emerald-300 hover:bg-emerald-500/25 transition-colors disabled:opacity-40">
                    <CheckCircle size={12} />
                    {loadingApr[slot.id] ? 'A aprovar…' : 'Aprovar pelo Admin'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Tab: Pago ───────────────────────────────────────────────────────────────
function TabPago({ slots, presMap, pedidosMap }) {
  if (!slots.length) return (
    <div className="text-center py-12 text-white/30 text-sm">Sem pagamentos concluídos este mês</div>
  )

  return (
    <div className="overflow-x-auto rounded-2xl border border-border/60 bg-surface-1">
      <table className="w-full text-xs">
        <TableHead cols={[...COLS_BASE, { label: 'Pago em' }, { label: 'Forma' }]} />
        <tbody>
          {slots.map(slot => {
            const pedido = pedidosMap[slot.pedido_pagamento_id]
            return (
              <SlotRow key={slot.id} slot={slot} presMap={presMap} extra={<>
                <td className={clsx(TD, 'text-accent-muted whitespace-nowrap tabular-nums')}>
                  {pedido?.data_pagamento ? formatDataHora(pedido.data_pagamento) : '—'}
                </td>
                <td className={clsx(TD, 'text-accent-muted capitalize')}>
                  {pedido?.notas ?? '—'}
                </td>
              </>} />
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────
export function Pagamentos() {
  const [mes,        setMes]        = useState(() => format(subMonths(new Date(), 1), 'yyyy-MM'))
  const [aba,        setAba]        = useState(0)
  const [filtroNome, setFiltroNome] = useState('')
  const [emPag,      setEmPag]      = useState([])
  const [emReg,      setEmReg]      = useState([])
  const [pago,       setPago]       = useState([])
  const [presMap,    setPresMap]    = useState({})
  const [pedidosMap, setPedidosMap] = useState({})
  const [carregando, setCarregando] = useState(true)
  const [erro,       setErro]       = useState(null)

  const dataInicio = useMemo(() => {
    try { return format(startOfMonth(parse(mes + '-01', 'yyyy-MM-dd', new Date())), 'yyyy-MM-dd') } catch { return '' }
  }, [mes])
  const dataFim = useMemo(() => {
    try { return format(endOfMonth(parse(mes + '-01', 'yyyy-MM-dd', new Date())), 'yyyy-MM-dd') } catch { return '' }
  }, [mes])

  const navMes = (dir) => {
    const [ano, m] = mes.split('-').map(Number)
    setMes(format(new Date(ano, m - 1 + dir, 1), 'yyyy-MM'))
  }

  const mesLabel = useMemo(() => {
    try { return cap(format(parse(mes + '-01', 'yyyy-MM-dd', new Date()), 'MMMM yyyy', { locale: pt })) } catch { return mes }
  }, [mes])

  const carregar = useCallback(async () => {
    if (!dataInicio || !dataFim) return
    setCarregando(true); setErro(null)
    try {
      const [resPag, resReg, resPago] = await Promise.all([
        supabase.from('agenda').select(SELECT)
          .in('estado_pagamento', ['auto_pagamento', 'auto_pagamento_penalizacao', 'em_pagamento'])
          .gte('data', dataInicio).lte('data', dataFim).order('data'),
        supabase.from('agenda').select(SELECT)
          .eq('estado_pagamento', 'em_regularizacao')
          .gte('data', dataInicio).lte('data', dataFim).order('data'),
        supabase.from('agenda').select(SELECT)
          .eq('estado_pagamento', 'pago')
          .gte('data', dataInicio).lte('data', dataFim).order('data'),
      ])
      const emPagData = resPag.data  ?? []
      const emRegData = resReg.data  ?? []
      const pagoData  = resPago.data ?? []
      setEmPag(emPagData)
      setEmReg(emRegData)
      setPago(pagoData)

      // Presenças para todos os slots
      const allIds = [...emPagData, ...emRegData, ...pagoData].map(s => s.id)
      if (allIds.length) {
        const { data: presencas } = await supabase.from('presencas_djs')
          .select('agenda_id, signed_at').in('agenda_id', allIds)
        setPresMap(Object.fromEntries((presencas ?? []).map(p => [p.agenda_id, p.signed_at])))
      } else {
        setPresMap({})
      }

      // Pedidos para os slots pagos
      const pedidoIds = [...new Set(pagoData.map(s => s.pedido_pagamento_id).filter(Boolean))]
      if (pedidoIds.length) {
        const { data: peds } = await supabase.from('pedidos_pagamento')
          .select('id, notas, data_pagamento').in('id', pedidoIds)
        const map = {}
        peds?.forEach(p => { map[p.id] = p })
        setPedidosMap(map)
      } else {
        setPedidosMap({})
      }
    } catch (e) {
      setErro(e.message)
    } finally {
      setCarregando(false)
    }
  }, [dataInicio, dataFim])

  useEffect(() => { carregar() }, [carregar])

  const filtrar = (list) => {
    if (!filtroNome.trim()) return list
    const q = filtroNome.toLowerCase()
    return list.filter(s => (djNome(s) ?? '').toLowerCase().includes(q))
  }

  const emPagFilt = filtrar(emPag)
  const emRegFilt = filtrar(emReg)
  const pagFilt   = filtrar(pago)

  const TABS = [
    { label: 'Em Pagamento',     count: emPagFilt.length },
    { label: 'Em Regularização', count: emRegFilt.length },
    { label: 'Pago',             count: pagFilt.length },
  ]

  return (
    <div className="p-6 flex flex-col gap-6 min-h-0">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white tracking-tight">Pagamentos</h2>
        <button type="button" onClick={carregar}
          className="p-1.5 rounded hover:bg-white/6 text-white/40 hover:text-white transition-colors" title="Recarregar">
          <RefreshCw size={14} className={carregando ? 'animate-spin' : ''} />
        </button>
      </div>

      {erro && (
        <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-xs text-red-300">
          <AlertCircle size={14} /> {erro}
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => navMes(-1)}
            className="p-1.5 rounded bg-surface-2 border border-border hover:bg-surface-3 transition-colors">
            <ChevronLeft size={14} />
          </button>
          <span className="text-sm font-bold text-accent capitalize min-w-[150px] text-center">{mesLabel}</span>
          <button onClick={() => navMes(1)}
            className="p-1.5 rounded bg-surface-2 border border-border hover:bg-surface-3 transition-colors">
            <ChevronRight size={14} />
          </button>
          <input type="text" placeholder="Filtrar DJ…" value={filtroNome}
            onChange={e => setFiltroNome(e.target.value)}
            className="ml-2 bg-surface-2 border border-border rounded-lg px-3 py-1.5 text-xs text-accent placeholder:text-accent-subtle/40 focus:outline-none flex-1 max-w-[200px]"
          />
        </div>

        <div className="flex gap-1.5 flex-wrap">
          {TABS.map((t, i) => (
            <button key={i} type="button" onClick={() => setAba(i)}
              className={clsx('rounded-full px-3 py-1 text-xs font-bold transition-all flex items-center gap-1.5',
                aba === i ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white')}>
              {t.label}
              {t.count > 0 && (
                <span className={clsx('rounded-full px-1.5 py-0.5 text-[9px] font-bold',
                  aba === i ? 'bg-white/15 text-white' : 'bg-white/8 text-white/50')}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Conteúdo */}
      {carregando ? (
        <div className="flex items-center justify-center py-16 text-white/30 text-sm">A carregar…</div>
      ) : (
        <>
          {aba === 0 && <TabEmPagamento slots={emPagFilt} presMap={presMap} onRefresh={carregar} />}
          {aba === 1 && <TabEmRegularizacao slots={emRegFilt} presMap={presMap} onRefresh={carregar} />}
          {aba === 2 && <TabPago slots={pagFilt} presMap={presMap} pedidosMap={pedidosMap} />}
        </>
      )}
    </div>
  )
}
