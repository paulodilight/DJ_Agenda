import { useState, useEffect, useCallback, useMemo, Fragment } from 'react'
import { supabase } from '@/lib/supabase'
import { format } from 'date-fns'
import { pt } from 'date-fns/locale'
import { clsx } from 'clsx'
import { CheckCircle, ChevronDown, AlertCircle, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react'

const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : ''

const FORMA_PAG_OPCOES = [
  { value: 'transferencia', label: 'Transferência' },
  { value: 'mbway',         label: 'MBWay' },
  { value: 'dinheiro',      label: 'Dinheiro' },
]

const ESTADO_PAG_LABELS = {
  pendente:                'Pendente',
  a_pagamento:             'A Pagar',
  em_analise:              'Em Análise',
  aprovada_pagamento:      'Aprovada',
  em_pagamento:            'Em Pagamento',
  pago:                    'Pago',
  pendente_regularizacao:  'Pend. Regularização',
}

const ESTADO_PAG_COR = {
  pendente:               'bg-white/5 text-white/40 border-white/10',
  a_pagamento:            'bg-amber-400/15 text-amber-300 border-amber-400/25',
  em_analise:             'bg-orange-500/20 text-orange-300 border-orange-400/25',
  aprovada_pagamento:     'bg-teal-400/15 text-teal-300 border-teal-400/25',
  em_pagamento:           'bg-blue-400/15 text-blue-300 border-blue-400/25',
  pago:                   'bg-green-500/15 text-green-300 border-green-500/25',
  pendente_regularizacao: 'bg-red-500/15 text-red-300 border-red-500/25',
}

function EstadoPill({ estado }) {
  return (
    <span className={clsx('inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border', ESTADO_PAG_COR[estado] ?? 'bg-white/5 text-white/40 border-white/10')}>
      {ESTADO_PAG_LABELS[estado] ?? estado}
    </span>
  )
}

function formatData(str) {
  if (!str) return '—'
  try { return cap(format(new Date(str.slice(0, 10) + 'T12:00'), 'EEE d MMM', { locale: pt })) } catch { return str }
}

function formatDataHora(str) {
  if (!str) return '—'
  try { return format(new Date(str), "dd/MM/yyyy 'às' HH:mm", { locale: pt }) } catch { return str }
}

function formatEuro(val) {
  if (val == null) return '—'
  return Number(val).toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })
}

const djNome    = (s) => s?.djs?.nome    ?? s?.dj_nome    ?? null
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

// ─── Tab: Pronto a Pagar ──────────────────────────────────────────────────────
function TabProntoAPagar({ aPagamento, aprovadas }) {
  if (!aPagamento.length && !aprovadas.length) return (
    <div className="text-center py-12 text-white/30 text-sm">Nenhuma data pronta a pagar este mês</div>
  )
  const totalAprovadas = aprovadas.reduce((a, s) => a + (s.valor ?? 0), 0)
  const totalAPagar    = aPagamento.reduce((a, s) => a + (s.valor ?? 0), 0)
  const cols = [
    { label: 'Data' }, { label: 'DJ' }, { label: 'Espaço' }, { label: 'Horário' },
    { label: 'Estado', align: 'center' }, { label: 'Valor', align: 'right' },
  ]
  const slotRow = (s, last) => (
    <tr key={s.id} className={clsx('border-b border-border/20 hover:bg-white/2 transition-colors', last && 'border-0')}>
      <td className={`${TD} text-accent-muted tabular-nums whitespace-nowrap`}>{formatData(s.data)}</td>
      <td className={`${TD} text-accent font-medium`}>{djNome(s) ?? '—'}</td>
      <td className={`${TD} text-accent-muted`}>{espacoNome(s) ?? '—'}</td>
      <td className={`${TD} text-accent-muted tabular-nums`}>{s.hora_inicio?.slice(0,5) ?? '—'}</td>
      <td className={`${TD} text-center`}><EstadoPill estado={s.estado_pagamento} /></td>
      <td className={clsx(`${TD} text-right font-semibold tabular-nums`, s.estado_pagamento === 'aprovada_pagamento' ? 'text-teal-300' : 'text-amber-300')}>{formatEuro(s.valor)}</td>
    </tr>
  )
  return (
    <TableWrap>
      <TableHead cols={cols} />
      <tbody>
        {aprovadas.length > 0 && <>
          <tr className="border-b border-teal-500/15">
            <td colSpan={6} className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-teal-400/70 bg-teal-500/5">
              Aprovadas pelo DJ · {formatEuro(totalAprovadas)}
            </td>
          </tr>
          {aprovadas.map((s, i) => slotRow(s, i === aprovadas.length - 1 && !aPagamento.length))}
        </>}
        {aPagamento.length > 0 && <>
          <tr className="border-b border-amber-500/15">
            <td colSpan={6} className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-amber-400/70 bg-amber-500/5">
              A Confirmar pelo DJ · {formatEuro(totalAPagar)}
            </td>
          </tr>
          {aPagamento.map((s, i) => slotRow(s, i === aPagamento.length - 1))}
        </>}
      </tbody>
    </TableWrap>
  )
}

// ─── Tab: Em Pagamento (pedidos + em_analise + pendente_reg) ─────────────────
function TabEmPagamento({ pedidos, emAnalise, pendentesReg, onRefresh }) {
  const [expandidos, setExpandidos]           = useState({})
  const [slotsPorPedido, setSlotsPorPedido]   = useState({})
  const [formas, setFormas]                   = useState({})
  const [loadingPedido, setLoadingPedido]     = useState({})
  const [loadingSlot, setLoadingSlot]         = useState({})
  const [respostas, setRespostas]             = useState({})

  useEffect(() => {
    const init = {}
    emAnalise.forEach(s => { init[s.id] = s.resposta_admin ?? '' })
    setRespostas(init)
  }, [emAnalise])

  const togPedido = async (id) => {
    if (!expandidos[id] && !slotsPorPedido[id]) {
      const { data } = await supabase.from('agenda')
        .select('id, espaco_nome, data, hora_inicio, valor, espacos!agenda_espaco_id_fkey(nome)')
        .eq('pedido_pagamento_id', id).order('data', { ascending: true })
      setSlotsPorPedido(s => ({ ...s, [id]: data ?? [] }))
    }
    setExpandidos(e => ({ ...e, [id]: !e[id] }))
  }

  const togAnalise = (id) => setExpandidos(e => ({ ...e, [`a_${id}`]: !e[`a_${id}`] }))

  const marcarPago = async (e, pedido) => {
    e.stopPropagation()
    if (!confirm(`Marcar pedido de ${pedido.djs?.nome ?? 'DJ'} como pago?`)) return
    const id = pedido.id
    setLoadingPedido(l => ({ ...l, [id]: true }))
    let slotsData = slotsPorPedido[id]
    if (!slotsData) {
      const { data } = await supabase.from('agenda').select('id').eq('pedido_pagamento_id', id)
      slotsData = data ?? []
    }
    await supabase.from('pedidos_pagamento').update({
      estado: 'pago', data_pagamento: new Date().toISOString(), notas: formas[id] ?? 'transferencia',
    }).eq('id', id)
    if (slotsData.length > 0) await supabase.from('agenda').update({ estado_pagamento: 'pago' }).eq('pedido_pagamento_id', id)
    setLoadingPedido(l => ({ ...l, [id]: false }))
    onRefresh()
  }

  const guardarResposta = async (id) => {
    setLoadingSlot(l => ({ ...l, [id]: 'guardar' }))
    await supabase.from('agenda').update({ resposta_admin: respostas[id] }).eq('id', id)
    setLoadingSlot(l => ({ ...l, [id]: null }))
    onRefresh()
  }

  const devolverPagamento = async (id) => {
    if (!confirm('Devolver para "A Pagar"?')) return
    setLoadingSlot(l => ({ ...l, [id]: 'devolver' }))
    await supabase.from('agenda').update({ estado_pagamento: 'a_pagamento', resposta_admin: null, motivo_discordancia: null }).eq('id', id)
    setLoadingSlot(l => ({ ...l, [id]: null }))
    onRefresh()
  }

  const regularizar = async (id) => {
    setLoadingSlot(l => ({ ...l, [id]: 'reg' }))
    await supabase.from('agenda').update({ estado_pagamento: 'a_pagamento' }).eq('id', id)
    setLoadingSlot(l => ({ ...l, [id]: null }))
    onRefresh()
  }

  if (!pedidos.length && !emAnalise.length && !pendentesReg.length) return (
    <div className="text-center py-12 text-white/30 text-sm">Nenhum pagamento em processo este mês</div>
  )

  return (
    <div className="flex flex-col gap-4">
      {/* Pedidos em pagamento */}
      {pedidos.length > 0 && (
        <TableWrap>
          <TableHead cols={[
            { label: 'Criado em' }, { label: 'DJ' }, { label: 'Total', align: 'right' },
            { label: 'Estado', align: 'center' }, { label: '', align: 'right' },
          ]} />
          <tbody>
            {pedidos.map((p, i) => (
              <Fragment key={p.id}>
                <tr onClick={() => togPedido(p.id)}
                  className={clsx('border-b border-border/20 hover:bg-white/2 cursor-pointer transition-colors',
                    expandidos[p.id] ? 'bg-white/2' : (i === pedidos.length - 1 && 'border-0')
                  )}>
                  <td className={`${TD} text-accent-muted tabular-nums whitespace-nowrap`}>{formatDataHora(p.criado_em)}</td>
                  <td className={`${TD} text-accent font-medium`}>{p.djs?.nome ?? '—'}</td>
                  <td className={`${TD} text-right font-semibold text-accent tabular-nums`}>{formatEuro(p.valor_total)}</td>
                  <td className={`${TD} text-center`}><EstadoPill estado="em_pagamento" /></td>
                  <td className={`${TD} text-right`}>
                    <ChevronDown size={12} className={clsx('text-white/30 transition-transform inline-block', expandidos[p.id] && 'rotate-180')} />
                  </td>
                </tr>
                {expandidos[p.id] && (
                  <tr className={clsx('border-b border-border/20', i === pedidos.length - 1 && 'border-0')}>
                    <td colSpan={5} className="px-4 pt-0 pb-3">
                      <div className="flex flex-col gap-2 pt-3 border-t border-border/20">
                        {(slotsPorPedido[p.id] ?? []).length > 0 && (
                          <div className="flex flex-col gap-1">
                            {slotsPorPedido[p.id].map(s => (
                              <div key={s.id} className="flex items-center gap-3 px-3 py-1.5 bg-white/3 rounded border border-white/6 text-xs">
                                <span className="text-accent-muted whitespace-nowrap">{formatData(s.data)}</span>
                                <span className="text-accent-muted flex-1">{espacoNome(s) ?? '—'}</span>
                                <span className="text-accent-muted tabular-nums">{s.hora_inicio?.slice(0,5) ?? ''}</span>
                                <span className="text-accent tabular-nums font-medium">{formatEuro(s.valor)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="flex items-center gap-2 justify-end">
                          <select value={formas[p.id] ?? 'transferencia'}
                            onChange={e => { e.stopPropagation(); setFormas(f => ({ ...f, [p.id]: e.target.value })) }}
                            className="bg-surface-2 border border-border rounded-lg px-3 py-1.5 text-xs text-accent focus:outline-none">
                            {FORMA_PAG_OPCOES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                          <button type="button" disabled={loadingPedido[p.id]} onClick={e => marcarPago(e, p)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-green-500/20 border border-green-500/30 text-green-300 hover:bg-green-500/30 transition-colors disabled:opacity-40">
                            <CheckCircle size={12} />
                            {loadingPedido[p.id] ? 'A processar…' : 'Marcar como Pago'}
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </TableWrap>
      )}

      {/* Em Análise */}
      {emAnalise.length > 0 && (
        <TableWrap>
          <TableHead cols={[
            { label: 'Data' }, { label: 'DJ' }, { label: 'Espaço' },
            { label: 'Motivo' }, { label: 'Estado', align: 'center' }, { label: 'Valor', align: 'right' },
          ]} />
          <tbody>
            {emAnalise.map((slot, i) => (
              <Fragment key={slot.id}>
                <tr onClick={() => togAnalise(slot.id)}
                  className={clsx('border-b border-border/20 hover:bg-white/2 cursor-pointer transition-colors',
                    expandidos[`a_${slot.id}`] ? 'bg-white/2' : (i === emAnalise.length - 1 && 'border-0')
                  )}>
                  <td className={`${TD} text-accent-muted tabular-nums whitespace-nowrap`}>{formatData(slot.data)}</td>
                  <td className={`${TD} text-accent font-medium`}>{djNome(slot) ?? '—'}</td>
                  <td className={`${TD} text-accent-muted`}>{espacoNome(slot) ?? '—'}</td>
                  <td className={`${TD} text-accent-muted max-w-[180px] truncate`}>{slot.motivo_discordancia || '—'}</td>
                  <td className={`${TD} text-center`}><EstadoPill estado="em_analise" /></td>
                  <td className={`${TD} text-right font-semibold text-accent tabular-nums`}>{formatEuro(slot.valor)}</td>
                </tr>
                {expandidos[`a_${slot.id}`] && (
                  <tr className={clsx('border-b border-border/20', i === emAnalise.length - 1 && 'border-0')}>
                    <td colSpan={6} className="px-4 pt-0 pb-3">
                      <div className="flex flex-col gap-2 pt-3 border-t border-border/20">
                        {slot.motivo_discordancia && (
                          <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg px-3 py-2">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-orange-400/70 mb-1">Motivo do DJ</p>
                            <p className="text-xs text-orange-200">{slot.motivo_discordancia}</p>
                          </div>
                        )}
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-semibold uppercase tracking-wider text-white/40">Resposta Admin</label>
                          <textarea rows={2} placeholder="Escrever resposta ao DJ…"
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder:text-white/25 focus:outline-none focus:border-white/20 resize-none"
                            value={respostas[slot.id] ?? ''}
                            onChange={e => setRespostas(r => ({ ...r, [slot.id]: e.target.value }))}
                            onClick={e => e.stopPropagation()} />
                        </div>
                        <div className="flex gap-2 justify-end">
                          <button type="button" disabled={!!loadingSlot[slot.id]}
                            onClick={e => { e.stopPropagation(); guardarResposta(slot.id) }}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/8 border border-white/12 text-white/70 hover:text-white hover:bg-white/12 transition-colors disabled:opacity-40">
                            {loadingSlot[slot.id] === 'guardar' ? 'A guardar…' : 'Guardar Resposta'}
                          </button>
                          <button type="button" disabled={!!loadingSlot[slot.id]}
                            onClick={e => { e.stopPropagation(); devolverPagamento(slot.id) }}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-400/15 border border-amber-400/25 text-amber-300 hover:bg-amber-400/25 transition-colors disabled:opacity-40">
                            {loadingSlot[slot.id] === 'devolver' ? 'A processar…' : 'Devolver a Pagamento'}
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </TableWrap>
      )}

      {/* Pendente Regularização */}
      {pendentesReg.length > 0 && (
        <TableWrap>
          <TableHead cols={[
            { label: 'Data' }, { label: 'DJ' }, { label: 'Espaço' },
            { label: 'Estado', align: 'center' }, { label: 'Valor', align: 'right' }, { label: '', align: 'right' },
          ]} />
          <tbody>
            {pendentesReg.map((slot, i) => (
              <tr key={slot.id} className={clsx('border-b border-border/20 hover:bg-white/2', i === pendentesReg.length - 1 && 'border-0')}>
                <td className={`${TD} text-accent-muted tabular-nums whitespace-nowrap`}>{formatData(slot.data)}</td>
                <td className={`${TD} text-accent font-medium`}>{djNome(slot) ?? '—'}</td>
                <td className={`${TD} text-accent-muted`}>{espacoNome(slot) ?? '—'}</td>
                <td className={`${TD} text-center`}><EstadoPill estado="pendente_regularizacao" /></td>
                <td className={`${TD} text-right font-semibold text-accent tabular-nums`}>{formatEuro(slot.valor)}</td>
                <td className={`${TD} text-right`}>
                  <button type="button" disabled={loadingSlot[slot.id] === 'reg'} onClick={() => regularizar(slot.id)}
                    className="px-2.5 py-1 rounded-lg text-[10px] font-semibold bg-red-500/15 border border-red-500/25 text-red-300 hover:bg-red-500/25 transition-colors disabled:opacity-40">
                    {loadingSlot[slot.id] === 'reg' ? 'A processar…' : 'Regularizar'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
    </div>
  )
}

// ─── Tab: Pago ───────────────────────────────────────────────────────────────
function TabPago({ pedidos }) {
  if (!pedidos.length) return (
    <div className="text-center py-12 text-white/30 text-sm">Sem pagamentos concluídos este mês</div>
  )
  return (
    <TableWrap>
      <TableHead cols={[
        { label: 'Data Pag.' }, { label: 'DJ' }, { label: 'Forma' },
        { label: 'Valor', align: 'right' }, { label: 'Estado', align: 'center' },
      ]} />
      <tbody>
        {pedidos.map((p, i) => (
          <tr key={p.id} className={clsx('border-b border-border/20 hover:bg-white/2', i === pedidos.length - 1 && 'border-0')}>
            <td className={`${TD} text-accent-muted tabular-nums whitespace-nowrap`}>{p.data_pagamento ? formatDataHora(p.data_pagamento) : '—'}</td>
            <td className={`${TD} text-accent font-medium`}>{p.djs?.nome ?? '—'}</td>
            <td className={`${TD} text-accent-muted`}>{p.notas ?? '—'}</td>
            <td className={`${TD} text-right font-semibold text-green-300 tabular-nums`}>{formatEuro(p.valor_total)}</td>
            <td className={`${TD} text-center`}><EstadoPill estado="pago" /></td>
          </tr>
        ))}
      </tbody>
    </TableWrap>
  )
}

// ─── Tab: Todas ──────────────────────────────────────────────────────────────
function TabTodas({ slots }) {
  const [filtroNome, setFiltroNome] = useState('')
  const [djSel, setDjSel]           = useState('')
  const [filtroEspaco, setFiltroEspaco] = useState('')

  const djs = useMemo(() => {
    const map = {}
    for (const s of slots) {
      const nome = djNome(s)
      if (s.dj_id && nome) map[s.dj_id] = nome
    }
    return Object.entries(map).map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome))
  }, [slots])

  const espacos = useMemo(() => {
    const set = new Set(slots.map(s => espacoNome(s)).filter(Boolean))
    return [...set].sort()
  }, [slots])

  const filtrados = useMemo(() => slots.filter(s => {
    if (djSel && s.dj_id !== djSel) return false
    if (filtroNome.trim() && !(djNome(s) ?? '').toLowerCase().includes(filtroNome.toLowerCase())) return false
    if (filtroEspaco && espacoNome(s) !== filtroEspaco) return false
    return true
  }), [slots, djSel, filtroNome, filtroEspaco])

  const total = filtrados.reduce((a, s) => a + (s.valor ?? 0), 0)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2 flex-wrap items-center">
        <select value={djSel} onChange={e => { setDjSel(e.target.value); setFiltroNome('') }}
          className="bg-surface-2 border border-border rounded-lg px-3 py-1.5 text-xs text-accent focus:outline-none min-w-[160px]">
          <option value="">Todos os DJs</option>
          {djs.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
        </select>
        <select value={filtroEspaco} onChange={e => setFiltroEspaco(e.target.value)}
          className="bg-surface-2 border border-border rounded-lg px-3 py-1.5 text-xs text-accent focus:outline-none min-w-[140px]">
          <option value="">Todos os espaços</option>
          {espacos.map(e => <option key={e} value={e}>{e}</option>)}
        </select>
        <input
          type="text" placeholder="Pesquisar DJ…" value={filtroNome}
          onChange={e => { setFiltroNome(e.target.value); setDjSel('') }}
          className="bg-surface-2 border border-border rounded-lg px-3 py-1.5 text-xs text-accent placeholder:text-accent-subtle/40 focus:outline-none flex-1 min-w-[140px]"
        />
        {filtrados.length > 0 && (
          <span className="ml-auto text-xs text-accent-muted tabular-nums shrink-0">
            {filtrados.length} data{filtrados.length !== 1 ? 's' : ''} · {formatEuro(total)}
          </span>
        )}
      </div>
      {filtrados.length === 0 ? (
        <div className="text-center py-12 text-white/30 text-sm">Sem datas com pagamentos</div>
      ) : (
        <TableWrap>
          <TableHead cols={[
            { label: 'Data' }, { label: 'DJ' }, { label: 'Espaço' }, { label: 'Horário' },
            { label: 'Estado', align: 'center' }, { label: 'Valor', align: 'right' },
          ]} />
          <tbody>
            {filtrados.map((s, i) => (
              <tr key={s.id} className={clsx('border-b border-border/20 hover:bg-white/2 transition-colors', i === filtrados.length - 1 && 'border-0')}>
                <td className={`${TD} text-accent-muted tabular-nums whitespace-nowrap`}>{formatData(s.data)}</td>
                <td className={`${TD} text-accent font-medium`}>{djNome(s) ?? '—'}</td>
                <td className={`${TD} text-accent-muted`}>{espacoNome(s) ?? '—'}</td>
                <td className={`${TD} text-accent-muted tabular-nums`}>{s.hora_inicio?.slice(0,5) ?? '—'}</td>
                <td className={`${TD} text-center`}><EstadoPill estado={s.estado_pagamento} /></td>
                <td className={`${TD} text-right font-semibold text-accent tabular-nums`}>{formatEuro(s.valor)}</td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────
export function Pagamentos() {
  const [mes, setMes]               = useState(() => format(new Date(), 'yyyy-MM'))
  const [aba, setAba]               = useState(0)
  const [pedidosEm, setPedidosEm]   = useState([])
  const [pedidosPago, setPedidosPago] = useState([])
  const [emAnalise, setEmAnalise]   = useState([])
  const [pendentesReg, setPendentesReg] = useState([])
  const [aPagamento, setAPagamento] = useState([])
  const [aprovadas, setAprovadas]   = useState([])
  const [todasDatas, setTodasDatas] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro]             = useState(null)

  const { dataInicio, dataFim } = useMemo(() => {
    const [ano, m] = mes.split('-').map(Number)
    const inicio = new Date(ano, m - 1, 1)
    const fim    = new Date(ano, m, 0)
    return { dataInicio: format(inicio, 'yyyy-MM-dd'), dataFim: format(fim, 'yyyy-MM-dd') }
  }, [mes])

  const navMes = (dir) => {
    const [ano, m] = mes.split('-').map(Number)
    setMes(format(new Date(ano, m - 1 + dir, 1), 'yyyy-MM'))
  }

  const mesLabel = cap(format(new Date(mes + '-01T12:00'), 'MMMM yyyy', { locale: pt }))

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro(null)
    try {
      await supabase.rpc('classificar_pagamentos', { p_dj_id: null })
      const [resPedidosEm, resPedidosPago, resAnalise, resPendentes, resAPagar, resAprovadas, resDatas] = await Promise.all([
        supabase.from('pedidos_pagamento')
          .select('*, djs(nome, foto_url)')
          .eq('estado', 'em_pagamento')
          .gte('criado_em', dataInicio).lte('criado_em', dataFim + 'T23:59:59')
          .order('criado_em', { ascending: false }),
        supabase.from('pedidos_pagamento')
          .select('*, djs(nome, foto_url)')
          .eq('estado', 'pago')
          .gte('data_pagamento', dataInicio).lte('data_pagamento', dataFim + 'T23:59:59')
          .order('data_pagamento', { ascending: false }),
        supabase.from('agenda')
          .select('id, dj_id, dj_nome, espaco_nome, data, hora_inicio, valor, motivo_discordancia, resposta_admin, djs(nome), espacos!agenda_espaco_id_fkey(nome)')
          .eq('estado_pagamento', 'em_analise')
          .gte('data', dataInicio).lte('data', dataFim)
          .order('data', { ascending: false }),
        supabase.from('agenda')
          .select('id, dj_id, dj_nome, espaco_nome, data, hora_inicio, valor, djs(nome), espacos!agenda_espaco_id_fkey(nome)')
          .eq('estado_pagamento', 'pendente_regularizacao')
          .gte('data', dataInicio).lte('data', dataFim)
          .order('data', { ascending: false }),
        supabase.from('agenda')
          .select('id, dj_id, dj_nome, espaco_nome, data, hora_inicio, valor, estado_pagamento, djs(nome), espacos!agenda_espaco_id_fkey(nome)')
          .eq('estado_pagamento', 'a_pagamento')
          .gte('data', dataInicio).lte('data', dataFim)
          .order('data', { ascending: true }),
        supabase.from('agenda')
          .select('id, dj_id, dj_nome, espaco_nome, data, hora_inicio, valor, estado_pagamento, djs(nome), espacos!agenda_espaco_id_fkey(nome)')
          .eq('estado_pagamento', 'aprovada_pagamento')
          .gte('data', dataInicio).lte('data', dataFim)
          .order('data', { ascending: true }),
        supabase.from('agenda')
          .select('id, dj_id, dj_nome, espaco_nome, data, hora_inicio, valor, estado_pagamento, djs(nome), espacos!agenda_espaco_id_fkey(nome)')
          .not('estado_pagamento', 'in', '("pendente")')
          .gte('data', dataInicio).lte('data', dataFim)
          .order('data', { ascending: false }),
      ])
      setPedidosEm(resPedidosEm.data ?? [])
      setPedidosPago(resPedidosPago.data ?? [])
      setEmAnalise(resAnalise.data ?? [])
      setPendentesReg(resPendentes.data ?? [])
      setAPagamento(resAPagar.data ?? [])
      setAprovadas(resAprovadas.data ?? [])
      setTodasDatas(resDatas.data ?? [])
    } catch (e) {
      setErro(e.message)
    } finally {
      setCarregando(false)
    }
  }, [dataInicio, dataFim])

  useEffect(() => { carregar() }, [carregar])

  const TABS = [
    { label: 'Pronto a Pagar', count: aPagamento.length + aprovadas.length },
    { label: 'Em Pagamento',   count: pedidosEm.length + emAnalise.length + pendentesReg.length },
    { label: 'Pago',           count: pedidosPago.length },
    { label: 'Todas',          count: todasDatas.length },
  ]

  return (
    <div className="p-6 flex flex-col gap-6 min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white tracking-tight">Pagamentos</h2>
        <button type="button" onClick={carregar}
          className="p-1.5 rounded hover:bg-white/6 text-white/40 hover:text-white transition-colors" title="Recarregar">
          <RefreshCw size={14} className={carregando ? 'animate-spin' : ''} />
        </button>
      </div>

      {erro && (
        <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-xs text-red-300">
          <AlertCircle size={14} />{erro}
        </div>
      )}

      {/* Navegação mês + Tabs */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <button onClick={() => navMes(-1)}
            className="p-1.5 rounded bg-surface-2 border border-border hover:bg-surface-3 transition-colors">
            <ChevronLeft size={14} />
          </button>
          <span className="text-sm font-bold text-accent capitalize min-w-[150px] text-center">{mesLabel}</span>
          <button onClick={() => navMes(1)}
            className="p-1.5 rounded bg-surface-2 border border-border hover:bg-surface-3 transition-colors">
            <ChevronRight size={14} />
          </button>
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
          {aba === 0 && <TabProntoAPagar aPagamento={aPagamento} aprovadas={aprovadas} />}
          {aba === 1 && <TabEmPagamento pedidos={pedidosEm} emAnalise={emAnalise} pendentesReg={pendentesReg} onRefresh={carregar} />}
          {aba === 2 && <TabPago pedidos={pedidosPago} />}
          {aba === 3 && <TabTodas slots={todasDatas} />}
        </>
      )}
    </div>
  )
}
