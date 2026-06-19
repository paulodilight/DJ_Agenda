import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { format } from 'date-fns'
import { pt } from 'date-fns/locale'
import { clsx } from 'clsx'
import { CheckCircle, ChevronDown, ChevronUp, AlertCircle, RefreshCw } from 'lucide-react'

const FORMA_PAG_OPCOES = [
  { value: 'transferencia', label: 'Transferência' },
  { value: 'mbway',         label: 'MBWay' },
  { value: 'dinheiro',      label: 'Dinheiro' },
]

const ESTADO_PAG_LABELS = {
  pendente:                'Pendente',
  a_pagamento:             'A Pagamento',
  em_analise:              'Em Análise',
  aprovada_pagamento:      'Aprovada',
  em_pagamento:            'Em Pagamento',
  pago:                    'Pago',
  pendente_regularizacao:  'Pend. Regularização',
}

const ESTADO_PAG_COR = {
  pendente:               'bg-white/5 text-white/40',
  a_pagamento:            'bg-amber-400/15 text-amber-300',
  em_analise:             'bg-orange-500/20 text-orange-300',
  aprovada_pagamento:     'bg-teal-400/15 text-teal-300',
  em_pagamento:           'bg-blue-400/15 text-blue-300',
  pago:                   'bg-green-500/15 text-green-300',
  pendente_regularizacao: 'bg-red-500/15 text-red-300',
}

function EstadoPill({ estado }) {
  return (
    <span className={clsx('inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider', ESTADO_PAG_COR[estado] ?? 'bg-white/5 text-white/40')}>
      {ESTADO_PAG_LABELS[estado] ?? estado}
    </span>
  )
}

function formatData(str) {
  if (!str) return '—'
  try { return format(new Date(str.slice(0, 10) + 'T12:00'), 'dd MMM yyyy', { locale: pt }) } catch { return str }
}

function formatDataHora(str) {
  if (!str) return '—'
  try { return format(new Date(str), "dd/MM/yyyy 'às' HH:mm", { locale: pt }) } catch { return str }
}

function formatEuro(val) {
  if (val == null) return '—'
  return Number(val).toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })
}

// ─────────────────────────────────────────────
// Tab: Em Análise
// ─────────────────────────────────────────────
function TabEmAnalise({ emAnalise, pendentesReg, onRefresh }) {
  const [respostas, setRespostas] = useState({})
  const [loading, setLoading] = useState({})

  useEffect(() => {
    const init = {}
    emAnalise.forEach(s => { init[s.id] = s.resposta_admin ?? '' })
    setRespostas(init)
  }, [emAnalise])

  const guardarResposta = async (id) => {
    setLoading(l => ({ ...l, [id]: 'guardar' }))
    await supabase.from('agenda').update({ resposta_admin: respostas[id] }).eq('id', id)
    setLoading(l => ({ ...l, [id]: null }))
    onRefresh()
  }

  const devolverPagamento = async (id) => {
    if (!confirm('Devolver este slot para "A Pagamento"? A resposta será limpa.')) return
    setLoading(l => ({ ...l, [id]: 'devolver' }))
    await supabase.from('agenda').update({ estado_pagamento: 'a_pagamento', resposta_admin: null, motivo_discordancia: null }).eq('id', id)
    setLoading(l => ({ ...l, [id]: null }))
    onRefresh()
  }

  const regularizar = async (id) => {
    setLoading(l => ({ ...l, [id]: 'reg' }))
    await supabase.from('agenda').update({ estado_pagamento: 'a_pagamento' }).eq('id', id)
    setLoading(l => ({ ...l, [id]: null }))
    onRefresh()
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Em Análise */}
      <div className="flex flex-col gap-3">
        {emAnalise.length === 0 ? (
          <div className="text-center py-12 text-white/30 text-sm">Nenhum slot em análise</div>
        ) : emAnalise.map(slot => (
          <div key={slot.id} className="bg-white/3 border border-white/8 rounded-2xl p-4 flex flex-col gap-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-white">{slot.dj_nome ?? '—'}</p>
                <p className="text-xs text-white/50 mt-0.5">{formatData(slot.data)} · {slot.espaco_nome ?? '—'} · {slot.hora_inicio?.slice(0,5) ?? ''}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-sm font-bold text-white/80">{formatEuro(slot.valor)}</span>
                <EstadoPill estado="em_analise" />
              </div>
            </div>
            {slot.motivo_discordancia && (
              <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-orange-400/70 mb-1">Motivo do DJ</p>
                <p className="text-xs text-orange-200">{slot.motivo_discordancia}</p>
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-white/40">Resposta Admin</label>
              <textarea
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder:text-white/25 focus:outline-none focus:border-white/20 resize-none"
                rows={2}
                placeholder="Escrever resposta ao DJ…"
                value={respostas[slot.id] ?? ''}
                onChange={e => setRespostas(r => ({ ...r, [slot.id]: e.target.value }))}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => guardarResposta(slot.id)}
                disabled={!!loading[slot.id]}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/8 border border-white/12 text-white/70 hover:text-white hover:bg-white/12 transition-colors disabled:opacity-40"
              >
                {loading[slot.id] === 'guardar' ? 'A guardar…' : 'Guardar Resposta'}
              </button>
              <button
                type="button"
                onClick={() => devolverPagamento(slot.id)}
                disabled={!!loading[slot.id]}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-400/15 border border-amber-400/25 text-amber-300 hover:bg-amber-400/25 transition-colors disabled:opacity-40"
              >
                {loading[slot.id] === 'devolver' ? 'A processar…' : 'Devolver a Pagamento'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Pendentes de Regularização */}
      {pendentesReg.length > 0 && (
        <div className="flex flex-col gap-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-white/40">Pendentes de Regularização</p>
          {pendentesReg.map(slot => (
            <div key={slot.id} className="bg-white/3 border border-red-500/20 rounded-2xl p-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white">{slot.dj_nome ?? '—'}</p>
                <p className="text-xs text-white/50 mt-0.5">{formatData(slot.data)} · {slot.espaco_nome ?? '—'}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-sm font-bold text-white/70">{formatEuro(slot.valor)}</span>
                <button
                  type="button"
                  onClick={() => regularizar(slot.id)}
                  disabled={loading[slot.id] === 'reg'}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-500/15 border border-red-500/25 text-red-300 hover:bg-red-500/25 transition-colors disabled:opacity-40"
                >
                  {loading[slot.id] === 'reg' ? 'A processar…' : 'Regularizar'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// Card de pedido (Em Pagamento)
// ─────────────────────────────────────────────
function PedidoCard({ pedido, onRefresh }) {
  const [slots, setSlots] = useState([])
  const [slotsAbertos, setSlotsAbertos] = useState(false)
  const [slotsCarregados, setSlotsCarregados] = useState(false)
  const [forma, setForma] = useState('transferencia')
  const [loading, setLoading] = useState(false)

  const carregarSlots = useCallback(async () => {
    if (slotsCarregados) return
    const { data } = await supabase
      .from('agenda')
      .select('id, dj_nome, espaco_nome, data, hora_inicio, valor, estado_pagamento')
      .eq('pedido_pagamento_id', pedido.id)
      .order('data', { ascending: true })
    setSlots(data ?? [])
    setSlotsCarregados(true)
  }, [pedido.id, slotsCarregados])

  const toggleSlots = () => {
    if (!slotsAbertos && !slotsCarregados) carregarSlots()
    setSlotsAbertos(v => !v)
  }

  const marcarPago = async () => {
    if (!confirm(`Marcar pedido de ${pedido.djs?.nome ?? 'DJ'} como pago?`)) return
    setLoading(true)
    // Ensure slots are loaded
    let slotsParaPagar = slots
    if (!slotsCarregados) {
      const { data } = await supabase
        .from('agenda')
        .select('id')
        .eq('pedido_pagamento_id', pedido.id)
      slotsParaPagar = data ?? []
      setSlots(slotsParaPagar)
      setSlotsCarregados(true)
    }
    // Update pedido
    await supabase
      .from('pedidos_pagamento')
      .update({ estado: 'pago', data_pagamento: new Date().toISOString(), notas: forma })
      .eq('id', pedido.id)
    // Update all linked agenda slots
    if (slotsParaPagar.length > 0) {
      await supabase
        .from('agenda')
        .update({ estado_pagamento: 'pago' })
        .eq('pedido_pagamento_id', pedido.id)
    }
    setLoading(false)
    onRefresh()
  }

  const nomeDJ = pedido.djs?.nome ?? '—'
  const fotoDJ = pedido.djs?.foto_url

  return (
    <div className="bg-white/3 border border-white/8 rounded-2xl p-4 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {fotoDJ ? (
            <img src={fotoDJ} alt={nomeDJ} className="w-9 h-9 rounded-full object-cover border border-white/10" />
          ) : (
            <div className="w-9 h-9 rounded-full bg-white/8 border border-white/10 flex items-center justify-center text-sm font-bold text-white/60">
              {nomeDJ.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <p className="text-sm font-semibold text-white">{nomeDJ}</p>
            <p className="text-xs text-white/40 mt-0.5">Criado {formatDataHora(pedido.criado_em)}</p>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-lg font-bold text-white">{formatEuro(pedido.valor_total)}</p>
          <EstadoPill estado="em_pagamento" />
        </div>
      </div>

      {/* Slots toggle */}
      <button
        type="button"
        onClick={toggleSlots}
        className="flex items-center justify-between w-full px-3 py-2 bg-white/4 rounded-lg border border-white/8 hover:bg-white/6 transition-colors"
      >
        <span className="text-xs text-white/60 font-medium">Ver slots incluídos</span>
        {slotsAbertos ? <ChevronUp size={13} className="text-white/40" /> : <ChevronDown size={13} className="text-white/40" />}
      </button>

      {slotsAbertos && (
        <div className="flex flex-col gap-1.5">
          {slots.length === 0 ? (
            <p className="text-xs text-white/30 text-center py-2">Sem slots</p>
          ) : slots.map(s => (
            <div key={s.id} className="flex items-center justify-between px-3 py-2 bg-white/3 rounded-lg border border-white/6">
              <div>
                <p className="text-xs text-white/80">{formatData(s.data)} · {s.espaco_nome ?? '—'}</p>
                <p className="text-[10px] text-white/40">{s.hora_inicio?.slice(0,5) ?? ''}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-white/70">{formatEuro(s.valor)}</span>
                <EstadoPill estado={s.estado_pagamento} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Forma de pagamento + Marcar pago */}
      <div className="flex items-center gap-2 pt-1 border-t border-white/6">
        <select
          value={forma}
          onChange={e => setForma(e.target.value)}
          className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-white/20"
        >
          {FORMA_PAG_OPCOES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <button
          type="button"
          onClick={marcarPago}
          disabled={loading}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-green-500/20 border border-green-500/30 text-green-300 hover:bg-green-500/30 transition-colors disabled:opacity-40"
        >
          <CheckCircle size={13} />
          {loading ? 'A processar…' : 'Marcar como Pago'}
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────
export function Pagamentos() {
  const [aba, setAba] = useState(0)
  const [pedidos, setPedidos] = useState([])
  const [emAnalise, setEmAnalise] = useState([])
  const [pendentesReg, setPendentesReg] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState(null)

  const classificarPendentes = useCallback(async () => {
    await supabase.rpc('classificar_pagamentos', { p_dj_id: null })
  }, [])

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro(null)
    try {
      await classificarPendentes()
      const [resPedidos, resAnalise, resPendentes] = await Promise.all([
        supabase
          .from('pedidos_pagamento')
          .select('*, djs(nome, foto_url)')
          .order('criado_em', { ascending: false }),
        supabase
          .from('agenda')
          .select('id, dj_id, dj_nome, espaco_nome, data, hora_inicio, valor, motivo_discordancia, resposta_admin')
          .eq('estado_pagamento', 'em_analise')
          .order('data', { ascending: false }),
        supabase
          .from('agenda')
          .select('id, dj_id, dj_nome, espaco_nome, data, hora_inicio, valor')
          .eq('estado_pagamento', 'pendente_regularizacao')
          .order('data', { ascending: false }),
      ])
      if (resPedidos.error) throw resPedidos.error
      if (resAnalise.error) throw resAnalise.error
      if (resPendentes.error) throw resPendentes.error
      setPedidos(resPedidos.data ?? [])
      setEmAnalise(resAnalise.data ?? [])
      setPendentesReg(resPendentes.data ?? [])
    } catch (e) {
      setErro(e.message)
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const pedidosEmPagamento = pedidos.filter(p => p.estado === 'em_pagamento')
  const pedidosPago        = pedidos.filter(p => p.estado === 'pago')

  const analiseCount      = emAnalise.length + pendentesReg.length
  const emPagamentoCount  = pedidosEmPagamento.length

  const TABS = [
    { label: 'Em Análise',   count: analiseCount },
    { label: 'Em Pagamento', count: emPagamentoCount },
    { label: 'Histórico',    count: null },
  ]

  return (
    <div className="p-6 max-w-3xl mx-auto flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white tracking-tight">Pagamentos</h2>
        <button
          type="button"
          onClick={carregar}
          className="p-1.5 rounded hover:bg-white/6 text-white/40 hover:text-white transition-colors"
          title="Recarregar"
        >
          <RefreshCw size={14} className={carregando ? 'animate-spin' : ''} />
        </button>
      </div>

      {erro && (
        <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-xs text-red-300">
          <AlertCircle size={14} />
          {erro}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1.5">
        {TABS.map((t, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setAba(i)}
            className={clsx(
              'rounded-full px-3 py-1 text-xs font-bold transition-all flex items-center gap-1.5',
              aba === i ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white'
            )}
          >
            {t.label}
            {t.count != null && t.count > 0 && (
              <span className={clsx(
                'rounded-full px-1.5 py-0.5 text-[9px] font-bold',
                aba === i ? 'bg-white/15 text-white' : 'bg-white/8 text-white/50'
              )}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {carregando ? (
        <div className="text-center py-16 text-white/30 text-sm">A carregar…</div>
      ) : (
        <>
          {/* Tab 0: Em Análise */}
          {aba === 0 && (
            <TabEmAnalise
              emAnalise={emAnalise}
              pendentesReg={pendentesReg}
              onRefresh={carregar}
            />
          )}

          {/* Tab 1: Em Pagamento */}
          {aba === 1 && (
            <div className="flex flex-col gap-3">
              {pedidosEmPagamento.length === 0 ? (
                <div className="text-center py-12 text-white/30 text-sm">Nenhum pedido em pagamento</div>
              ) : pedidosEmPagamento.map(p => (
                <PedidoCard key={p.id} pedido={p} onRefresh={carregar} />
              ))}
            </div>
          )}

          {/* Tab 2: Histórico */}
          {aba === 2 && (
            <div className="flex flex-col gap-2">
              {pedidosPago.length === 0 ? (
                <div className="text-center py-12 text-white/30 text-sm">Sem histórico de pagamentos</div>
              ) : pedidosPago.map(p => (
                <div key={p.id} className="bg-white/3 border border-white/8 rounded-2xl px-4 py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {p.djs?.foto_url ? (
                      <img src={p.djs.foto_url} alt={p.djs?.nome} className="w-8 h-8 rounded-full object-cover border border-white/10" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-white/8 border border-white/10 flex items-center justify-center text-xs font-bold text-white/50">
                        {(p.djs?.nome ?? '?').charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-semibold text-white">{p.djs?.nome ?? '—'}</p>
                      <p className="text-xs text-white/40">
                        Pago {p.data_pagamento ? formatDataHora(p.data_pagamento) : '—'}
                        {p.notas ? ` · ${p.notas}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-green-300">{formatEuro(p.valor_total)}</p>
                    <EstadoPill estado="pago" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
