import { useMemo, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  startOfWeek, endOfWeek, eachDayOfInterval,
  addDays, format, isToday, isTomorrow, startOfMonth, subMonths,
} from 'date-fns'
import { pt } from 'date-fns/locale'
import {
  CheckCircle2, Clock, AlertCircle, CalendarDays,
  Users, MapPin, TrendingUp, ArrowRight, Music2,
} from 'lucide-react'
import { CalendarioSemana } from '@/components/agenda/CalendarioSemana'
import { FormSlot } from '@/components/agenda/FormSlot'
import { useAgenda } from '@/hooks/useAgenda'
import { useEspacos } from '@/hooks/useEspacos'
import { useDJs } from '@/hooks/useDJs'
import { useBloqueios } from '@/hooks/useBloqueios'
import { useConflitos } from '@/hooks/useConflitos'
import { isoData, nomeMes } from '@/utils/datas'
import { formatarEuro } from '@/utils/formatacao'
import { supabase } from '@/lib/supabase'
import { LoadingPage } from '@/components/ui/LoadingSpinner'
import { clsx } from 'clsx'

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)

/* ── KPI Card ── */
function KpiCard({ icone: Icone, valor, label, sub, cor, bgCor }) {
  return (
    <div className="bg-surface-1 border border-border rounded-lg px-4 py-4 flex items-center gap-4">
      <div className={clsx('w-10 h-10 rounded-lg flex items-center justify-center shrink-0', bgCor)}>
        <Icone size={18} className={cor} />
      </div>
      <div className="min-w-0">
        <p className={clsx('text-2xl font-bold tabular-nums leading-none', cor)}>{valor}</p>
        <p className="text-xs text-accent-muted mt-1 truncate">{label}</p>
        {sub && <p className="text-[10px] text-accent-subtle mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

/* ── Etiqueta de data relativa ── */
function DataTag({ iso }) {
  const d = new Date(iso + 'T00:00:00')
  if (isToday(d))    return <span className="text-[10px] font-semibold text-status-confirmado bg-status-confirmado/10 px-1.5 py-0.5 rounded">Hoje</span>
  if (isTomorrow(d)) return <span className="text-[10px] font-semibold text-status-proposta bg-status-proposta/10 px-1.5 py-0.5 rounded">Amanhã</span>
  const dia = format(d, 'EEE d MMM', { locale: pt })
  return <span className="text-[10px] text-accent-subtle">{cap(dia)}</span>
}

/* ── Linha de próxima atuação ── */
function AtuacaoRow({ slot, conflito = false }) {
  const estado = slot.estado ?? 'proposta'
  const corEstado = {
    confirmado: 'bg-status-confirmado/20 text-status-confirmado',
    proposta:   'bg-status-proposta/20 text-status-proposta',
    cancelado:  'bg-status-cancelado/20 text-status-cancelado',
  }[estado] ?? 'bg-surface-3 text-accent-muted'

  return (
    <div className={clsx(
      'flex items-center gap-3 py-2.5 border-b border-border/30 last:border-0',
      conflito && 'bg-red-500/5'
    )}>
      <div className="w-1 h-8 rounded-full shrink-0" style={{
        background: conflito ? '#ef4444' : estado === 'confirmado' ? '#22c55e' : estado === 'cancelado' ? '#ef4444' : '#eab308'
      }} />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-accent truncate">
          {slot.dj_nome || <span className="italic text-accent-subtle font-normal">Sem DJ</span>}
        </p>
        <p className="text-[10px] text-accent-subtle truncate mt-0.5">
          {slot.espaco_nome ?? '—'}
          {slot.hora_inicio && ` · ${slot.hora_inicio.slice(0,5)}`}
        </p>
      </div>
      <div className="shrink-0 flex flex-col items-end gap-1">
        <DataTag iso={slot.data} />
        <span className={clsx('text-[10px] px-1.5 py-0.5 rounded font-medium', corEstado)}>
          {cap(estado)}
        </span>
      </div>
    </div>
  )
}

/* ── Mini bar chart (CSS) ── */
function MiniBarChart({ dados }) {
  const max = Math.max(...dados.map((d) => d.total), 1)
  return (
    <div className="flex items-end gap-1 h-16">
      {dados.map((d) => (
        <div key={d.label} className="flex-1 flex flex-col items-center gap-1">
          <div
            className="w-full rounded-t"
            style={{
              height: `${Math.max((d.total / max) * 52, 3)}px`,
              background: d.atual
                ? 'rgba(34,197,94,0.7)'
                : 'rgba(255,255,255,0.08)',
            }}
          />
          <span className="text-[9px] text-accent-subtle">{d.label}</span>
        </div>
      ))}
    </div>
  )
}

/* ══════════════════════════════════════════════════ */
export function Dashboard() {
  const hoje = useMemo(() => new Date(), [])
  const inicioSemana = useMemo(() => startOfWeek(hoje, { weekStartsOn: 1 }), [hoje])
  const fimSemana    = useMemo(() => endOfWeek(hoje, { weekStartsOn: 1 }), [hoje])
  const dias         = useMemo(() => eachDayOfInterval({ start: inicioSemana, end: fimSemana }), [inicioSemana, fimSemana])

  /* próximos 14 dias */
  const inicio14 = useMemo(() => isoData(hoje), [hoje])
  const fim14    = useMemo(() => isoData(addDays(hoje, 14)), [hoje])

  const [mesesData, setMesesData] = useState([])

  /* Carregar contagens mensais reais (últimos 6 meses) */
  useEffect(() => {
    const inicio = format(startOfMonth(subMonths(hoje, 5)), 'yyyy-MM-dd')
    const fim    = format(hoje, 'yyyy-MM-dd')
    supabase
      .from('agenda')
      .select('data')
      .gte('data', inicio)
      .lte('data', fim)
      .then(({ data }) => {
        if (!data) return
        const contagem = {}
        data.forEach(({ data: d }) => {
          const chave = d.slice(0, 7) // 'yyyy-MM'
          contagem[chave] = (contagem[chave] ?? 0) + 1
        })
        setMesesData(contagem)
      })
      .catch(() => {})
  }, [hoje])

  const [modalAberto, setModalAberto]       = useState(false)
  const [slotSeleccionado, setSlotSel]      = useState(null)
  const [dataInicial, setDataInicial]       = useState('')
  const [espacoIdInicial, setEspacoIdInicial] = useState('')
  const navigate = useNavigate()

  const { agenda: agendaSemana, loading, recarregar } = useAgenda({
    dataInicio: isoData(inicioSemana),
    dataFim: isoData(fimSemana),
  })
  const { agenda: proximas } = useAgenda({ dataInicio: inicio14, dataFim: fim14 })
  const { espacos } = useEspacos()
  const { djs }    = useDJs()
  const { bloqueios } = useBloqueios()

  // Agenda combinada (semana + proximas) para detecção de conflitos
  const agendaConflitos = useMemo(() => {
    const ids = new Set()
    return [...agendaSemana, ...proximas].filter(s => {
      if (ids.has(s.id)) return false
      ids.add(s.id)
      return true
    })
  }, [agendaSemana, proximas])
  const { conflictsIdx } = useConflitos({
    agenda: agendaConflitos,
    dataInicio: isoData(inicioSemana),
    dataFim: fim14,
  })

  const stats = useMemo(() => ({
    confirmados: agendaSemana.filter((a) => a.estado === 'confirmado').length,
    propostas:   agendaSemana.filter((a) => a.estado === 'proposta').length,
    semDJ:       agendaSemana.filter((a) => !a.dj_nome).length,
    total:       agendaSemana.length,
    djsActivos:  djs.filter((d) => d.estado === 'activo' || d.estado === 'activo_ext').length,
    espacosTotal: espacos.length,
    valorSemana: agendaSemana.filter(a => a.estado === 'confirmado').reduce((s, a) => s + (a.valor ?? 0), 0),
  }), [agendaSemana, djs, espacos])

  /* Dados reais para o mini bar (últimos 6 meses) */
  const barDados = useMemo(() => {
    const meses = []
    for (let i = 5; i >= 0; i--) {
      const d     = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1)
      const chave = format(d, 'yyyy-MM')
      meses.push({
        label: cap(format(d, 'MMM', { locale: pt })),
        total: mesesData[chave] ?? 0,
        atual: i === 0,
      })
    }
    return meses
  }, [hoje, mesesData])

  const proximasOrdenadas = useMemo(() =>
    [...proximas].sort((a, b) => (a.data + (a.hora_inicio ?? '')).localeCompare(b.data + (b.hora_inicio ?? '')))
      .slice(0, 8),
    [proximas]
  )

  const abrirNovoSlot = (data = '', espacoId = '', _turnoId = null) => {
    setSlotSel(null); setDataInicial(data); setEspacoIdInicial(espacoId); setModalAberto(true)
  }
  const abrirEditarSlot = (slot) => {
    setSlotSel(slot); setDataInicial(''); setEspacoIdInicial(''); setModalAberto(true)
  }
  const fecharModal = () => { setModalAberto(false); setSlotSel(null) }

  return (
    <div className="flex flex-col h-full">

      <div className="flex-1 overflow-auto px-6 py-5 flex flex-col gap-5">

        {/* ── KPI row ── */}
        <div className="grid grid-cols-4 gap-3">
          <KpiCard
            icone={CheckCircle2}
            valor={stats.confirmados}
            label="Confirmados"
            sub="esta semana"
            cor="text-status-confirmado"
            bgCor="bg-status-confirmado/10"
          />
          <KpiCard
            icone={Clock}
            valor={stats.propostas}
            label="Propostas"
            sub="por confirmar"
            cor="text-status-proposta"
            bgCor="bg-status-proposta/10"
          />
          <KpiCard
            icone={Users}
            valor={stats.djsActivos}
            label="DJs activos"
            sub={`${espacos.length} Cliente${espacos.length !== 1 ? 's' : ''}`}
            cor="text-status-lock"
            bgCor="bg-status-lock/10"
          />
          <KpiCard
            icone={TrendingUp}
            valor={formatarEuro(stats.valorSemana)}
            label="Valor esta semana"
            sub={`${stats.total} slot${stats.total !== 1 ? 's' : ''} no total`}
            cor="text-accent"
            bgCor="bg-surface-3"
          />
        </div>

        {/* ── Content row ── */}
        <div className="flex gap-5 min-h-0">

          {/* ── Calendário ── */}
          <div className="flex-1 min-w-0 bg-surface-1 border border-border rounded-lg overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <CalendarDays size={13} className="text-accent-muted" />
                <p className="text-xs font-medium text-accent-muted uppercase tracking-wider">Semana actual</p>
              </div>
              <button
                onClick={() => navigate('/agenda')}
                className="flex items-center gap-1 text-xs text-accent-subtle hover:text-accent transition-colors"
              >
                Ver agenda <ArrowRight size={11} />
              </button>
            </div>
            <div className="flex-1 overflow-auto">
              {loading
                ? <LoadingPage />
                : (
                  <CalendarioSemana
                    dias={dias}
                    espacos={espacos}
                    agenda={agendaSemana}
                    bloqueios={bloqueios}
                    onClickSlot={abrirEditarSlot}
                    onClickVazio={abrirNovoSlot}
                    conflictsIdx={conflictsIdx}
                    onSugestaoAplicada={recarregar}
                  />
                )
              }
            </div>
          </div>

          {/* ── Painel direito ── */}
          <div className="w-72 shrink-0 flex flex-col gap-4">

            {/* Mini chart */}
            <div className="bg-surface-1 border border-border rounded-lg px-4 py-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Music2 size={13} className="text-accent-muted" />
                  <p className="text-xs font-medium text-accent-muted uppercase tracking-wider">Atuações / mês</p>
                </div>
                <span className="text-[10px] text-status-confirmado font-semibold">
                  {mesesData[format(hoje, 'yyyy-MM')] ?? 0} este mês
                </span>
              </div>
              <MiniBarChart dados={barDados} />
            </div>

            {/* Sem DJ */}
            {stats.semDJ > 0 && (
              <div className="bg-status-cancelado/5 border border-status-cancelado/20 rounded-lg px-4 py-3 flex items-center gap-3">
                <AlertCircle size={15} className="text-status-cancelado shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-status-cancelado">{stats.semDJ} slot{stats.semDJ !== 1 ? 's' : ''} sem DJ</p>
                  <p className="text-[10px] text-accent-subtle mt-0.5">Esta semana — requerem atenção</p>
                </div>
              </div>
            )}

            {/* Próximas atuações */}
            <div className="bg-surface-1 border border-border rounded-lg flex flex-col flex-1 min-h-0">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <MapPin size={13} className="text-accent-muted" />
                  <p className="text-xs font-medium text-accent-muted uppercase tracking-wider">Próximas</p>
                </div>
                <button
                  onClick={() => navigate('/atuacoes')}
                  className="flex items-center gap-1 text-xs text-accent-subtle hover:text-accent transition-colors"
                >
                  Ver todas <ArrowRight size={11} />
                </button>
              </div>
              <div className="flex-1 overflow-auto px-4 py-1">
                {proximasOrdenadas.length === 0
                  ? <p className="text-xs text-accent-subtle py-4 text-center">Sem atuações nos próximos 14 dias</p>
                  : proximasOrdenadas.map((s) => <AtuacaoRow key={s.id} slot={s} conflito={conflictsIdx.has(s.id)} />)
                }
              </div>
            </div>

          </div>
        </div>

      </div>

      <FormSlot
        aberto={modalAberto}
        slot={slotSeleccionado}
        dataInicial={dataInicial}
        espacoIdInicial={espacoIdInicial}
        onFechar={fecharModal}
        onGuardado={recarregar}
        conflito={slotSeleccionado ? conflictsIdx.has(slotSeleccionado.id) : false}
      />
    </div>
  )
}
