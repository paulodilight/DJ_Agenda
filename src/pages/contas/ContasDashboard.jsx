import { useState, useEffect, useMemo } from 'react'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import { pt } from 'date-fns/locale'
import { useNavigate } from 'react-router-dom'
import { Users, Wallet, Wrench, TrendingUp, ArrowRight } from 'lucide-react'
import { useMesStore } from '@/store'
import { useEspacos } from '@/hooks/useEspacos'
import { supabase } from '@/lib/supabase'
import { formatarEuro } from '@/utils/formatacao'
import { LoadingPage } from '@/components/ui/LoadingSpinner'
import { clsx } from 'clsx'
import { OverviewPagamentos } from '@/components/contas/OverviewPagamentos'

const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : ''

const PAGAVEIS = new Set(['confirmado', 'presente', 'a_pedido'])

export function ContasDashboard() {
  const { anoMes } = useMesStore()
  const { espacos } = useEspacos()
  const navigate = useNavigate()

  const [slots, setSlots]       = useState([])
  const [eventos, setEventos]   = useState([])
  const [servicos, setServicos] = useState([])
  const [agendTec, setAgendTec] = useState([])
  const [loading, setLoading]   = useState(true)

  const { dataInicio, dataFim, titulo, mes } = useMemo(() => {
    const [ano, mesN] = anoMes.split('-').map(Number)
    const ref = new Date(ano, mesN - 1, 1)
    return {
      dataInicio: format(startOfMonth(ref), 'yyyy-MM-dd'),
      dataFim:    format(endOfMonth(ref),   'yyyy-MM-dd'),
      titulo:     cap(format(ref, 'MMMM yyyy', { locale: pt })),
      mes:        anoMes,
    }
  }, [anoMes])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      supabase.from('agenda')
        .select('id, dj_id, espaco_id, valor, estado, djs(nome, nome_artistico)')
        .gte('data', dataInicio).lte('data', dataFim),
      supabase.from('supa_eventos')
        .select('id, espaco_id, evento, cliente, valor, status')
        .gte('data_evento', dataInicio).lte('data_evento', dataFim)
        .neq('status', 'cancelado'),
      supabase.from('contas_clientes')
        .select('id, espaco_id, tipo, descricao, valor')
        .eq('mes', mes),
      supabase.from('agendamentos_tecnicos')
        .select('id, tecnico_id, valor, confirmado, tecnicos(nome)')
        .gte('data', dataInicio).lte('data', dataFim),
    ]).then(([s, e, c, t]) => {
      if (cancelled) return
      setSlots(s.data ?? [])
      setEventos(e.data ?? [])
      setServicos(c.data ?? [])
      setAgendTec(t.data ?? [])
    }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [dataInicio, dataFim, mes])

  // ── Totais DJs ────────────────────────────────────────────────────────────
  const totalDJs = useMemo(() => {
    return slots
      .filter(s => PAGAVEIS.has(s.estado))
      .reduce((sum, s) => sum + Number(s.valor ?? 0), 0)
  }, [slots])

  const topDJs = useMemo(() => {
    const map = {}
    slots.filter(s => PAGAVEIS.has(s.estado)).forEach(s => {
      const id = s.dj_id ?? '__ext'
      if (!map[id]) map[id] = { nome: s.djs?.nome_artistico || s.djs?.nome || 'Externo', valor: 0, datas: 0 }
      map[id].valor += Number(s.valor ?? 0)
      map[id].datas++
    })
    return Object.values(map).sort((a, b) => b.valor - a.valor).slice(0, 5)
  }, [slots])

  // ── Totais Clientes ───────────────────────────────────────────────────────
  const totalClientes = useMemo(() => {
    const s = slots.reduce((a, x) => a + Number(x.valor ?? 0), 0)
    const e = eventos.reduce((a, x) => a + Number(x.valor ?? 0), 0)
    const c = servicos.reduce((a, x) => a + Number(x.valor ?? 0), 0)
    return s + e + c
  }, [slots, eventos, servicos])

  const topClientes = useMemo(() => {
    const map = {}
    espacos.forEach(esp => {
      const slotsEsp   = slots.reduce((a, x)    => x.espaco_id === esp.id ? a + Number(x.valor ?? 0) : a, 0)
      const evtosEsp   = eventos.reduce((a, x)  => x.espaco_id === esp.id ? a + Number(x.valor ?? 0) : a, 0)
      const servsEsp   = servicos.reduce((a, x) => x.espaco_id === esp.id ? a + Number(x.valor ?? 0) : a, 0)
      const total = slotsEsp + evtosEsp + servsEsp
      if (total > 0) map[esp.id] = { nome: esp.nome, valor: total }
    })
    return Object.values(map).sort((a, b) => b.valor - a.valor)
  }, [slots, eventos, servicos, espacos])

  // ── Totais Colaboradores ──────────────────────────────────────────────────
  const totalColaboradores = useMemo(() => {
    return agendTec.reduce((sum, a) => sum + Number(a.valor ?? 0), 0)
  }, [agendTec])

  const topColaboradores = useMemo(() => {
    const map = {}
    agendTec.forEach(a => {
      const id = a.tecnico_id ?? '__ext'
      if (!map[id]) map[id] = { nome: a.tecnicos?.nome ?? 'Sem técnico', valor: 0, dias: 0 }
      map[id].valor += Number(a.valor ?? 0)
      map[id].dias++
    })
    return Object.values(map).sort((a, b) => b.valor - a.valor)
  }, [agendTec])

  const saldo = totalClientes - totalDJs - totalColaboradores

  if (loading) return <LoadingPage />

  return (
    <div className="p-6 flex flex-col gap-6">

      {/* ── Pagamentos em aberto ── */}
      <OverviewPagamentos onSelectDJ={(id) => navigate('/contas/djs?dj=' + id)} />

      {/* ── KPIs principais ── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">

        {/* Receita clientes */}
        <div className="bg-surface-1 border border-border rounded-lg px-5 py-4 flex flex-col gap-1">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-7 h-7 rounded bg-status-confirmado/15 flex items-center justify-center">
              <Wallet size={13} className="text-status-confirmado" />
            </div>
            <p className="text-[10px] font-bold text-accent-subtle uppercase tracking-widest">Receita Clientes</p>
          </div>
          <p className="text-2xl font-bold tabular-nums text-status-confirmado">{formatarEuro(totalClientes)}</p>
          <p className="text-[11px] text-accent-subtle">{topClientes.length} Clientes · {titulo}</p>
        </div>

        {/* Custo DJs */}
        <div className="bg-surface-1 border border-border rounded-lg px-5 py-4 flex flex-col gap-1">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-7 h-7 rounded bg-blue-400/15 flex items-center justify-center">
              <Users size={13} className="text-blue-400" />
            </div>
            <p className="text-[10px] font-bold text-accent-subtle uppercase tracking-widest">Custo DJs</p>
          </div>
          <p className="text-2xl font-bold tabular-nums text-blue-400">{formatarEuro(totalDJs)}</p>
          <p className="text-[11px] text-accent-subtle">
            {slots.filter(s => PAGAVEIS.has(s.estado)).length} atuações confirmadas
          </p>
        </div>

        {/* Custo Colaboradores */}
        <div className="bg-surface-1 border border-border rounded-lg px-5 py-4 flex flex-col gap-1">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-7 h-7 rounded bg-purple-400/15 flex items-center justify-center">
              <Wrench size={13} className="text-purple-400" />
            </div>
            <p className="text-[10px] font-bold text-accent-subtle uppercase tracking-widest">Colaboradores</p>
          </div>
          <p className="text-2xl font-bold tabular-nums text-purple-400">{formatarEuro(totalColaboradores)}</p>
          <p className="text-[11px] text-accent-subtle">
            {agendTec.length} agendamentos · {topColaboradores.length} técnicos
          </p>
        </div>

        {/* Saldo */}
        <div className={clsx(
          'border rounded-lg px-5 py-4 flex flex-col gap-1',
          saldo >= 0 ? 'bg-status-confirmado/8 border-status-confirmado/30' : 'bg-status-cancelado/8 border-status-cancelado/30'
        )}>
          <div className="flex items-center gap-2 mb-1">
            <div className={clsx('w-7 h-7 rounded flex items-center justify-center', saldo >= 0 ? 'bg-status-confirmado/15' : 'bg-status-cancelado/15')}>
              <TrendingUp size={13} className={saldo >= 0 ? 'text-status-confirmado' : 'text-status-cancelado'} />
            </div>
            <p className="text-[10px] font-bold text-accent-subtle uppercase tracking-widest">Margem</p>
          </div>
          <p className={clsx('text-2xl font-bold tabular-nums', saldo >= 0 ? 'text-status-confirmado' : 'text-status-cancelado')}>
            {formatarEuro(saldo)}
          </p>
          <p className="text-[11px] text-accent-subtle">Receita − DJs − Técnicos</p>
        </div>
      </div>

      {/* ── Detalhe em 3 colunas ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">

        {/* Top Clientes */}
        <div className="bg-surface-1 border border-border rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-surface-2 flex items-center justify-between">
            <p className="text-[11px] font-bold text-accent uppercase tracking-wider">Por Cliente</p>
            <button onClick={() => navigate('/contas/clientes')} className="text-[10px] text-accent-subtle hover:text-accent flex items-center gap-1 transition-colors">
              Ver tudo <ArrowRight size={10} />
            </button>
          </div>
          <div className="divide-y divide-border/30">
            {topClientes.length === 0 ? (
              <p className="px-4 py-4 text-[11px] text-accent-subtle italic">Sem dados</p>
            ) : topClientes.map((c, i) => (
              <div key={i} className="px-4 py-2.5 flex items-center justify-between text-xs">
                <span className="text-accent-muted">{c.nome}</span>
                <span className="tabular-nums font-semibold text-status-confirmado">{formatarEuro(c.valor)}</span>
              </div>
            ))}
          </div>
          {totalClientes > 0 && (
            <div className="px-4 py-2.5 border-t border-border bg-surface-2 flex items-center justify-between text-xs">
              <span className="font-bold text-accent-subtle uppercase tracking-wider">Total</span>
              <span className="tabular-nums font-bold text-status-confirmado">{formatarEuro(totalClientes)}</span>
            </div>
          )}
        </div>

        {/* Top DJs */}
        <div className="bg-surface-1 border border-border rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-surface-2 flex items-center justify-between">
            <p className="text-[11px] font-bold text-accent uppercase tracking-wider">Por DJ</p>
            <button onClick={() => navigate('/contas/djs')} className="text-[10px] text-accent-subtle hover:text-accent flex items-center gap-1 transition-colors">
              Ver tudo <ArrowRight size={10} />
            </button>
          </div>
          <div className="divide-y divide-border/30">
            {topDJs.length === 0 ? (
              <p className="px-4 py-4 text-[11px] text-accent-subtle italic">Sem dados</p>
            ) : topDJs.map((d, i) => (
              <div key={i} className="px-4 py-2.5 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-accent-subtle text-[10px] w-4">{i + 1}</span>
                  <span className="text-accent-muted">{d.nome}</span>
                  <span className="text-accent-subtle text-[10px]">{d.datas}×</span>
                </div>
                <span className="tabular-nums font-semibold text-blue-400">{formatarEuro(d.valor)}</span>
              </div>
            ))}
          </div>
          {totalDJs > 0 && (
            <div className="px-4 py-2.5 border-t border-border bg-surface-2 flex items-center justify-between text-xs">
              <span className="font-bold text-accent-subtle uppercase tracking-wider">Total</span>
              <span className="tabular-nums font-bold text-blue-400">{formatarEuro(totalDJs)}</span>
            </div>
          )}
        </div>

        {/* Colaboradores */}
        <div className="bg-surface-1 border border-border rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-surface-2 flex items-center justify-between">
            <p className="text-[11px] font-bold text-accent uppercase tracking-wider">Colaboradores</p>
            <button onClick={() => navigate('/contas/colaboradores')} className="text-[10px] text-accent-subtle hover:text-accent flex items-center gap-1 transition-colors">
              Ver tudo <ArrowRight size={10} />
            </button>
          </div>
          <div className="divide-y divide-border/30">
            {topColaboradores.length === 0 ? (
              <p className="px-4 py-4 text-[11px] text-accent-subtle italic">Sem dados</p>
            ) : topColaboradores.map((c, i) => (
              <div key={i} className="px-4 py-2.5 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-accent-muted">{c.nome}</span>
                  <span className="text-accent-subtle text-[10px]">{c.dias} dias</span>
                </div>
                <span className="tabular-nums font-semibold text-purple-400">{formatarEuro(c.valor)}</span>
              </div>
            ))}
          </div>
          {totalColaboradores > 0 && (
            <div className="px-4 py-2.5 border-t border-border bg-surface-2 flex items-center justify-between text-xs">
              <span className="font-bold text-accent-subtle uppercase tracking-wider">Total</span>
              <span className="tabular-nums font-bold text-purple-400">{formatarEuro(totalColaboradores)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
