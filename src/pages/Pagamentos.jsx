import { useState, useEffect, useCallback, useMemo, Fragment } from 'react'
import { supabase } from '@/lib/supabase'
import { format, parse, subMonths, startOfMonth, endOfMonth } from 'date-fns'
import { pt } from 'date-fns/locale'
import { clsx } from 'clsx'
import { CheckCircle, ChevronDown, ChevronLeft, ChevronRight, AlertCircle, RefreshCw, Send } from 'lucide-react'

const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : ''

const FORMA_PAG_OPCOES = [
  { value: 'transferencia', label: 'Transferência' },
  { value: 'mbway',         label: 'MBWay' },
  { value: 'dinheiro',      label: 'Dinheiro' },
]

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

const djNome     = (s) => s?.djs?.nome_artistico ?? s?.djs?.nome ?? s?.dj_nome ?? null
const espacoNome = (s) => s?.espacos?.nome ?? s?.espaco_nome ?? null

const TH = 'px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider'
const TD = 'px-4 py-2 text-xs'

function TableWrap({ children }) {
  return (
    <div className="bg-surface-1 border border-border/60 rounded-2xl overflow-hidden">
      <table className="w-full text-xs">{children}</table>
    </div>
  )
}

function TableHead({ cols }) {
  return (
    <thead>
      <tr className="bg-surface-0/50 border-b border-border/40 text-accent-subtle/60">
        {cols.map(({ label, align = 'left' }) => (
          <th key={label} className={clsx(TH, align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left')}>
            {label}
          </th>
        ))}
      </tr>
    </thead>
  )
}

function BadgeEstado({ estado }) {
  const map = {
    em_regularizacao:           'bg-orange-500/15 text-orange-300 border-orange-400/25',
    em_pagamento:               'bg-blue-400/15   text-blue-300   border-blue-400/25',
    pago:                       'bg-green-500/15  text-green-300  border-green-500/25',
    auto_pagamento:             'bg-emerald-500/15 text-emerald-300 border-emerald-500/25',
    auto_pagamento_penalizacao: 'bg-yellow-500/15  text-yellow-300  border-yellow-500/25',
  }
  const label = {
    em_regularizacao:           'Em Regularização',
    em_pagamento:               'Em Pagamento',
    pago:                       'Pago',
    auto_pagamento:             'Auto Pag.',
    auto_pagamento_penalizacao: 'Com Penaliz.',
  }
  return (
    <span className={clsx('inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border', map[estado] ?? 'bg-white/5 text-white/40 border-white/10')}>
      {label[estado] ?? estado}
    </span>
  )
}

// ─── Tab: Em Regularização ───────────────────────────────────────────────────
function TabEmRegularizacao({ slots, onRefresh }) {
  const [expandidos, setExpandidos] = useState({})
  const [mensagens,  setMensagens]  = useState({})
  const [respostas,  setRespostas]  = useState({})
  const [enviando,   setEnviando]   = useState({})
  const [loadingApr, setLoadingApr] = useState({})

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

  if (!slots.length) return (
    <div className="text-center py-12 text-white/30 text-sm">Sem datas em regularização este mês</div>
  )

  return (
    <div className="flex flex-col gap-2">
      {slots.map(slot => {
        const msgs   = mensagens[slot.id]
        const aberto = !!expandidos[slot.id]
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
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] text-accent-subtle/50">{slot.hora_inicio?.slice(0,5) ?? '—'}–{slot.hora_fim?.slice(0,5) ?? '—'}</span>
                  {msgs && <span className="text-[10px] text-orange-400/60">{msgs.length} msg{msgs.length !== 1 ? 's' : ''}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {slot.valor != null && <span className="text-xs font-bold text-accent tabular-nums">{formatEuro(slot.valor)}</span>}
                <ChevronDown size={12} className={clsx('text-white/30 transition-transform', aberto && 'rotate-180')} />
              </div>
            </button>

            {aberto && (
              <div className="border-t border-border/30 px-4 py-3 flex flex-col gap-3">
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

                <div className="flex gap-2">
                  <textarea rows={2} placeholder="Responder ao DJ…"
                    value={respostas[slot.id] ?? ''}
                    onChange={e => setRespostas(r => ({ ...r, [slot.id]: e.target.value }))}
                    className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder:text-white/25 focus:outline-none focus:border-white/20 resize-none" />
                  <button onClick={() => enviarResposta(slot)}
                    disabled={!respostas[slot.id]?.trim() || !!enviando[slot.id]}
                    className="shrink-0 w-9 rounded-xl bg-blue-500/20 border border-blue-500/30 text-blue-400 flex items-center justify-center disabled:opacity-40">
                    <Send size={14} />
                  </button>
                </div>

                <div className="flex justify-end">
                  <button onClick={() => aprovarDireto(slot)} disabled={!!loadingApr[slot.id]}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold bg-emerald-500/15 border border-emerald-500/25 text-emerald-300 hover:bg-emerald-500/25 transition-colors disabled:opacity-40">
                    <CheckCircle size={12} />
                    {loadingApr[slot.id] ? 'A aprovar…' : 'Aprovar para Pagamento'}
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

// ─── Tab: Em Pagamento ───────────────────────────────────────────────────────
function TabEmPagamento({ slots, onRefresh }) {
  const [expandidos, setExpandidos] = useState({})
  const [formas,     setFormas]     = useState({})
  const [loadingDj,  setLoadingDj]  = useState({})

  const porDj = useMemo(() => {
    const map = {}
    for (const s of slots) {
      const id = s.dj_id; const nome = djNome(s) ?? '—'
      if (!map[id]) map[id] = { id, nome, slots: [] }
      map[id].slots.push(s)
    }
    return Object.values(map).sort((a, b) => a.nome.localeCompare(b.nome))
  }, [slots])

  const marcarPagoDj = async (djId, djSlots) => {
    const nome = djNome(djSlots[0]) ?? 'DJ'
    if (!confirm(`Marcar como PAGO ${djSlots.length} data${djSlots.length > 1 ? 's' : ''} de ${nome}?`)) return
    setLoadingDj(l => ({ ...l, [djId]: true }))
    const total = djSlots.reduce((a, s) => a + (s.valor ?? 0), 0)
    const { data: pedido } = await supabase.from('pedidos_pagamento').insert({
      dj_id: djId, estado: 'pago', valor_total: total,
      notas: formas[djId] ?? 'transferencia', data_pagamento: new Date().toISOString(),
    }).select().single()
    if (pedido) {
      await supabase.from('agenda')
        .update({ estado_pagamento: 'pago', pedido_pagamento_id: pedido.id })
        .in('id', djSlots.map(s => s.id))
    }
    setLoadingDj(l => ({ ...l, [djId]: false }))
    onRefresh()
  }

  if (!slots.length) return (
    <div className="text-center py-12 text-white/30 text-sm">Sem datas prontas a pagar este mês</div>
  )

  return (
    <div className="flex flex-col gap-3">
      {porDj.map(grupo => {
        const aberto = !!expandidos[grupo.id]
        const total  = grupo.slots.reduce((a, s) => a + (s.valor ?? 0), 0)
        return (
          <div key={grupo.id} className="bg-surface-1 border border-border/60 rounded-2xl overflow-hidden">
            <button onClick={() => setExpandidos(e => ({ ...e, [grupo.id]: !e[grupo.id] }))}
              className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-white/2 transition-colors">
              <div className="flex-1 min-w-0">
                <span className="text-sm font-bold text-accent">{grupo.nome}</span>
                <span className="text-xs text-accent-muted ml-2">{grupo.slots.length} data{grupo.slots.length > 1 ? 's' : ''}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-sm font-bold text-blue-300 tabular-nums">{formatEuro(total)}</span>
                <ChevronDown size={12} className={clsx('text-white/30 transition-transform', aberto && 'rotate-180')} />
              </div>
            </button>

            {aberto && (
              <div className="border-t border-border/30 px-4 py-3 flex flex-col gap-2">
                <div className="flex flex-col gap-1">
                  {grupo.slots.map(s => (
                    <div key={s.id} className="flex items-center gap-3 px-3 py-1.5 bg-white/3 rounded-xl border border-white/6 text-xs">
                      <span className="text-accent-muted whitespace-nowrap">{formatData(s.data)}</span>
                      <span className="text-accent-muted flex-1 truncate">{espacoNome(s) ?? '—'}</span>
                      <span className="text-accent-muted tabular-nums">{s.hora_inicio?.slice(0,5) ?? ''}</span>
                      <BadgeEstado estado={s.estado_pagamento} />
                      <span className="text-accent tabular-nums font-medium">{formatEuro(s.valor)}</span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-2 justify-end mt-1">
                  <select value={formas[grupo.id] ?? 'transferencia'}
                    onChange={e => setFormas(f => ({ ...f, [grupo.id]: e.target.value }))}
                    className="bg-surface-2 border border-border rounded-lg px-3 py-1.5 text-xs text-accent focus:outline-none">
                    {FORMA_PAG_OPCOES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <button onClick={() => marcarPagoDj(grupo.id, grupo.slots)} disabled={!!loadingDj[grupo.id]}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-green-500/20 border border-green-500/30 text-green-300 hover:bg-green-500/30 transition-colors disabled:opacity-40">
                    <CheckCircle size={12} />
                    {loadingDj[grupo.id] ? 'A processar…' : 'Marcar como Pago'}
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
function TabPago({ pedidos }) {
  const [expandidos,     setExpandidos]     = useState({})
  const [slotsPorPedido, setSlotsPorPedido] = useState({})

  const togPedido = async (id) => {
    if (!expandidos[id] && !slotsPorPedido[id]) {
      const { data } = await supabase.from('agenda')
        .select('id, espaco_nome, data, hora_inicio, valor, espacos!agenda_espaco_id_fkey(nome)')
        .eq('pedido_pagamento_id', id).order('data', { ascending: true })
      setSlotsPorPedido(s => ({ ...s, [id]: data ?? [] }))
    }
    setExpandidos(e => ({ ...e, [id]: !e[id] }))
  }

  if (!pedidos.length) return (
    <div className="text-center py-12 text-white/30 text-sm">Sem pagamentos concluídos este mês</div>
  )

  return (
    <TableWrap>
      <TableHead cols={[
        { label: 'Pago em' }, { label: 'DJ' }, { label: 'Forma' },
        { label: 'Valor', align: 'right' }, { label: '' },
      ]} />
      <tbody>
        {pedidos.map((p, i) => (
          <Fragment key={p.id}>
            <tr onClick={() => togPedido(p.id)}
              className={clsx('border-b border-border/20 hover:bg-white/2 cursor-pointer transition-colors',
                expandidos[p.id] ? 'bg-white/2' : (i === pedidos.length - 1 && 'border-0')
              )}>
              <td className={`${TD} text-accent-muted tabular-nums whitespace-nowrap`}>{formatDataHora(p.data_pagamento)}</td>
              <td className={`${TD} text-accent font-medium`}>{p.djs?.nome_artistico ?? p.djs?.nome ?? '—'}</td>
              <td className={`${TD} text-accent-muted capitalize`}>{p.notas ?? '—'}</td>
              <td className={`${TD} text-right font-semibold text-green-300 tabular-nums`}>{formatEuro(p.valor_total)}</td>
              <td className={`${TD} text-right`}>
                <ChevronDown size={12} className={clsx('text-white/30 transition-transform inline-block', expandidos[p.id] && 'rotate-180')} />
              </td>
            </tr>
            {expandidos[p.id] && (
              <tr className={clsx('border-b border-border/20', i === pedidos.length - 1 && 'border-0')}>
                <td colSpan={5} className="px-4 pt-0 pb-3">
                  <div className="flex flex-col gap-1 pt-3 border-t border-border/20">
                    {(slotsPorPedido[p.id] ?? []).map(s => (
                      <div key={s.id} className="flex items-center gap-3 px-3 py-1.5 bg-white/3 rounded-xl border border-white/6 text-xs">
                        <span className="text-accent-muted whitespace-nowrap">{formatData(s.data)}</span>
                        <span className="text-accent-muted flex-1">{s.espacos?.nome ?? s.espaco_nome ?? '—'}</span>
                        <span className="text-accent-muted tabular-nums">{s.hora_inicio?.slice(0,5) ?? ''}</span>
                        <span className="text-accent tabular-nums font-medium">{formatEuro(s.valor)}</span>
                      </div>
                    ))}
                  </div>
                </td>
              </tr>
            )}
          </Fragment>
        ))}
      </tbody>
    </TableWrap>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────
export function Pagamentos() {
  const [mes,        setMes]        = useState(() => format(subMonths(new Date(), 1), 'yyyy-MM'))
  const [aba,        setAba]        = useState(0)
  const [filtroNome, setFiltroNome] = useState('')
  const [emReg,      setEmReg]      = useState([])
  const [emPag,      setEmPag]      = useState([])
  const [pedidosPago, setPedidosPago] = useState([])
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
      const SELECT = 'id, dj_id, dj_nome, espaco_nome, data, hora_inicio, hora_fim, valor, estado_pagamento, pedido_pagamento_id, djs(nome, nome_artistico), espacos!agenda_espaco_id_fkey(nome)'
      const [resReg, resPag, resPago] = await Promise.all([
        supabase.from('agenda').select(SELECT)
          .eq('estado_pagamento', 'em_regularizacao')
          .gte('data', dataInicio).lte('data', dataFim).order('data'),
        supabase.from('agenda').select(SELECT)
          .eq('estado_pagamento', 'em_pagamento')
          .gte('data', dataInicio).lte('data', dataFim).order('data'),
        supabase.from('pedidos_pagamento').select('*, djs(nome, nome_artistico)')
          .eq('estado', 'pago')
          .gte('data_pagamento', dataInicio).lte('data_pagamento', dataFim + 'T23:59:59')
          .order('data_pagamento', { ascending: false }),
      ])
      setEmReg(resReg.data ?? [])
      setEmPag(resPag.data ?? [])
      setPedidosPago(resPago.data ?? [])
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

  const emRegFilt = filtrar(emReg)
  const emPagFilt = filtrar(emPag)

  const TABS = [
    { label: 'Em Regularização', count: emRegFilt.length },
    { label: 'Em Pagamento',     count: emPagFilt.length },
    { label: 'Pago',             count: pedidosPago.length },
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
            className="ml-2 bg-surface-2 border border-border rounded-lg px-3 py-1.5 text-xs text-accent placeholder:text-accent-subtle/40 focus:outline-none flex-1 max-w-[200px]" />
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

      {carregando ? (
        <div className="text-center py-16 text-white/30 text-sm">A carregar…</div>
      ) : (
        <>
          {aba === 0 && <TabEmRegularizacao slots={emRegFilt} onRefresh={carregar} />}
          {aba === 1 && <TabEmPagamento slots={emPagFilt} onRefresh={carregar} />}
          {aba === 2 && <TabPago pedidos={pedidosPago} />}
        </>
      )}
    </div>
  )
}
