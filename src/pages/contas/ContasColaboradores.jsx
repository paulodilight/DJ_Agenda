import { useState, useEffect, useMemo } from 'react'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import { pt } from 'date-fns/locale'
import { useMesStore } from '@/store'
import { supabase } from '@/lib/supabase'
import { formatarEuro } from '@/utils/formatacao'
import { LoadingPage } from '@/components/ui/LoadingSpinner'
import { clsx } from 'clsx'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { corTecnico } from '@/utils/tecnicoColor'

const cap  = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : ''
const fmtD = (d) => format(new Date(d + 'T00:00:00'), "EEE d/MM", { locale: pt })

const TIPO_LABEL = { mensal: 'Mensal', dia: 'Por dia', hora: 'Por hora', evento: 'Por evento' }

function BadgeTipo({ tipo }) {
  if (!tipo) return null
  const cores = {
    mensal:  'bg-blue-400/10 border-blue-400/20 text-blue-400',
    dia:     'bg-violet-400/10 border-violet-400/20 text-violet-400',
    hora:    'bg-amber-400/10 border-amber-400/20 text-amber-400',
    evento:  'bg-surface-3 border-border text-accent-subtle',
  }
  return (
    <span className={clsx('text-[10px] px-2 py-0.5 rounded-full border font-medium', cores[tipo] ?? cores.evento)}>
      {TIPO_LABEL[tipo] ?? tipo}
    </span>
  )
}

function calcDuracaoMin(hora_inicio, hora_fim) {
  if (!hora_inicio || !hora_fim) return 0
  const [hI, mI] = hora_inicio.split(':').map(Number)
  const [hF, mF] = hora_fim.split(':').map(Number)
  let min = (hF * 60 + mF) - (hI * 60 + mI)
  if (min < 0) min += 24 * 60
  return min
}

function calcHorasAssin(assinTec) {
  let lmdMin = 0
  let evMin  = 0

  // LMD: parear entrada+saída por agendamento_id (ou por dia se null)
  const lmdEnt = assinTec.filter(a => a.tipo === 'lmd_entrada')
  const lmdSai = assinTec.filter(a => a.tipo === 'lmd_saida')
  lmdEnt.forEach(en => {
    const dia = en.registado_em?.slice(0, 10)
    const sa  = lmdSai.find(s =>
      (en.agendamento_id && s.agendamento_id === en.agendamento_id) ||
      (!en.agendamento_id && s.registado_em?.slice(0, 10) === dia)
    )
    if (!sa) return
    const diff = (new Date(sa.registado_em) - new Date(en.registado_em)) / 60000
    if (diff > 0) lmdMin += Math.max(0, diff - 60) // -1h almoço
  })

  // Eventos: parear entrada+saída por evento_id
  const evEnt = assinTec.filter(a => a.tipo === 'evento_entrada')
  const evSai = assinTec.filter(a => a.tipo === 'evento_saida')
  evEnt.forEach(en => {
    const sa = evSai.find(s => s.evento_id === en.evento_id)
    if (!sa) return
    const diff = (new Date(sa.registado_em) - new Date(en.registado_em)) / 60000
    if (diff > 0) evMin += diff
  })

  return { lmdMin: Math.round(lmdMin), evMin: Math.round(evMin), totalMin: Math.round(lmdMin + evMin) }
}

function fmtHoras(min) {
  if (!min) return '—'
  const h = Math.floor(min / 60)
  const m = min % 60
  return m > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${h}h`
}

// Cálculo final com todas as variáveis
function calcFinal(tipo, valorBase, diasEfetivos, horasMin, somaEventos, faltas) {
  const b = Number(valorBase ?? 0)
  const f = Number(faltas ?? 0)
  switch (tipo) {
    case 'mensal':  return Math.max(0, b - (b / 30) * f)
    case 'dia':     return b * Math.max(0, diasEfetivos - f)
    case 'hora':    return b * (horasMin / 60)
    case 'evento':  return somaEventos
    default:        return somaEventos
  }
}

// Input de variável reutilizável
function VarInput({ label, value, onChange, placeholder, readOnly, badge, unit, nota }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 border-b border-border/20 last:border-0">
      <span className="text-[11px] text-accent-subtle min-w-0 shrink-0 w-40">{label}</span>
      <div className="flex items-center gap-2 flex-1 justify-end">
        {readOnly ? (
          <span className="text-sm font-semibold text-accent tabular-nums">{value}</span>
        ) : (
          <div className="flex items-center gap-1.5">
            <input
              type="number" min="0" step="0.01"
              value={value}
              onChange={e => onChange(e.target.value)}
              placeholder={placeholder}
              className="w-24 text-right bg-surface-2 border border-border rounded px-2 py-1 text-xs text-accent tabular-nums focus:outline-none focus:border-white/25 transition-colors"
            />
            {unit && <span className="text-[10px] text-accent-subtle">{unit}</span>}
          </div>
        )}
        {badge && (
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-surface-3 border border-border/50 text-accent-subtle/60 uppercase tracking-wider shrink-0">
            {badge}
          </span>
        )}
        {nota && <span className="text-[10px] text-accent-subtle/50 italic shrink-0">{nota}</span>}
      </div>
    </div>
  )
}

export function ContasColaboradores() {
  const { anoMes } = useMesStore()
  const [tecnicos, setTecnicos]         = useState([])
  const [eventos, setEventos]           = useState([])
  const [agendamentos, setAgendamentos] = useState([])
  const [espacos, setEspacos]           = useState([])
  const [assinaturas, setAssinaturas]   = useState([])
  const [loading, setLoading]           = useState(true)
  const [expand, setExpand]             = useState(null)
  const [filtroTec, setFiltroTec]       = useState('dashboard')

  // vars[tecId] = { valorBase: string, dias: string, faltas: string }
  const [vars, setVars] = useState({})

  const setVar = (tecId, campo, valor) =>
    setVars(prev => ({ ...prev, [tecId]: { ...(prev[tecId] ?? {}), [campo]: valor } }))

  const { dataInicio, dataFim, titulo } = useMemo(() => {
    const [ano, mes] = anoMes.split('-').map(Number)
    const ref = new Date(ano, mes - 1, 1)
    return {
      dataInicio: format(startOfMonth(ref), 'yyyy-MM-dd'),
      dataFim:    format(endOfMonth(ref),   'yyyy-MM-dd'),
      titulo:     cap(format(ref, 'MMMM yyyy', { locale: pt })),
    }
  }, [anoMes])

  useEffect(() => { setVars({}); setFiltroTec('dashboard') }, [anoMes])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      supabase.from('tecnicos').select('*').eq('ativo', true).order('nome'),
      supabase.from('supa_eventos')
        .select('id, tecnico_id, evento, data_evento, espaco_id, valor_apoio_tecnico, status, hora_inicio, hora_fim, hora_instalacao')
        .gte('data_evento', dataInicio).lte('data_evento', dataFim).neq('status', 'cancelado'),
      supabase.from('agendamentos_tecnicos').select('*').gte('data', dataInicio).lte('data', dataFim),
      supabase.from('espacos').select('id, nome'),
      supabase.from('assinaturas_tecnico')
        .select('tecnico_id, tipo, evento_id, agendamento_id, registado_em')
        .gte('registado_em', dataInicio + 'T00:00:00.000Z')
        .lte('registado_em', dataFim + 'T23:59:59.999Z'),
    ]).then(([tRes, evRes, agRes, esRes, asRes]) => {
      if (cancelled) return
      setTecnicos(tRes.data ?? [])
      setEventos(evRes.data ?? [])
      setAgendamentos(agRes.data ?? [])
      setEspacos(esRes.data ?? [])
      setAssinaturas(asRes.data ?? [])
    }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [dataInicio, dataFim])

  const espacoNome = useMemo(() => {
    const m = {}
    espacos.forEach(e => { m[e.id] = e.nome.trim() })
    return m
  }, [espacos])

  const cards = useMemo(() => {
    return tecnicos.map(tec => {
      const evsTec    = eventos.filter(e => e.tecnico_id === tec.id)
      const agsTec    = agendamentos.filter(a => a.tecnico_id === tec.id && !a.folga)
      const folgasTec = agendamentos.filter(a => a.tecnico_id === tec.id && a.folga).map(a => a.data).sort()
      const assinTec  = assinaturas.filter(a => a.tecnico_id === tec.id)

      const somaEventos = evsTec.reduce((s, e) => s + Number(e.valor_apoio_tecnico ?? 0), 0)
      const somaAgs     = agsTec.reduce((s, a) => s + Number(a.valor ?? 0), 0)
      const nDias       = new Set([...evsTec.map(e => e.data_evento), ...agsTec.map(a => a.data)]).size
      const horasMin    = evsTec.reduce((s, e) => s + calcDuracaoMin(e.hora_instalacao ?? e.hora_inicio, e.hora_fim), 0)
      const horasAssin  = calcHorasAssin(assinTec)
      const valorFaturado = somaEventos  // o que cobrámos ao cliente pelo apoio

      // Variáveis editáveis com fallback para valor da DB
      const v             = vars[tec.id] ?? {}
      const valorBaseStr  = v.valorBase ?? ''
      const valorBaseEfetivo = valorBaseStr !== '' ? Number(valorBaseStr) : Number(tec.valor_base ?? 0)
      const diasStr       = v.dias ?? ''
      const diasEfetivos  = diasStr !== '' ? Math.max(0, Number(diasStr)) : nDias
      const faltasStr     = v.faltas ?? ''
      const faltas        = faltasStr !== '' ? Math.max(0, Number(faltasStr)) : 0

      // Dedução por faltas (mensal e dia)
      const deducaoFaltas = (() => {
        if (faltas === 0) return 0
        if (tec.tipo_pagamento === 'mensal') return (valorBaseEfetivo / 30) * faltas
        if (tec.tipo_pagamento === 'dia')    return valorBaseEfetivo * faltas
        return 0
      })()

      const valorPagar = calcFinal(tec.tipo_pagamento, valorBaseEfetivo, diasEfetivos, horasMin, somaEventos + somaAgs, faltas)

      return {
        tec,
        evsTec:     evsTec.sort((a, b) => a.data_evento.localeCompare(b.data_evento)),
        agsTec:     agsTec.sort((a, b) => a.data.localeCompare(b.data)),
        folgasTec,
        nDias, diasEfetivos, horasMin,
        horasAssin,
        nEventos:   evsTec.length,
        nFolgas:    folgasTec.length,
        faltas, deducaoFaltas,
        valorBaseEfetivo,
        valorFaturado,
        valorPagar,
        valorBaseStr, diasStr, faltasStr,
      }
    })
  }, [tecnicos, eventos, agendamentos, assinaturas, vars])

  const totalPagar      = cards.reduce((s, c) => s + c.valorPagar, 0)
  const totalHoras      = cards.reduce((s, c) => s + c.horasMin, 0)
  const totalEvents     = cards.reduce((s, c) => s + c.nEventos, 0)
  const totalHorasAssin = cards.reduce((s, c) => s + c.horasAssin.totalMin, 0)

  // Cards filtrados — dashboard não mostra cards individuais
  const cardsFiltrados = filtroTec === 'dashboard'
    ? []
    : cards.filter(c => c.tec.id === filtroTec)

  if (loading) return <LoadingPage />

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Filtro por colaborador ── */}
      <div className="shrink-0 border-b border-border/50 bg-surface-0/40 px-6 py-2 flex items-center gap-1 flex-wrap">
        <span className="text-[10px] font-semibold text-accent-subtle uppercase tracking-widest mr-2">Ver</span>
        <button
          onClick={() => setFiltroTec('dashboard')}
          className={clsx(
            'px-3 py-1.5 rounded text-xs transition-colors border',
            filtroTec === 'dashboard'
              ? 'bg-status-confirmado/15 text-status-confirmado border-status-confirmado/30 font-semibold'
              : 'bg-surface-2 text-accent-muted border-border hover:text-accent'
          )}
        >
          Dashboard
        </button>
        {cards.map((c, i) => {
          const cor = corTecnico(c.tec.nome, i)
          const activo = filtroTec === c.tec.id
          return (
            <button
              key={c.tec.id}
              onClick={() => setFiltroTec(activo ? 'dashboard' : c.tec.id)}
              className={clsx(
                'px-3 py-1.5 rounded text-xs transition-colors border font-medium',
                activo
                  ? cor.btn
                  : 'bg-surface-2 text-accent-muted border-border hover:text-accent'
              )}
            >
              {c.tec.nome}
            </button>
          )
        })}
      </div>

      {/* ── Conteúdo scrollável ── */}
      <div className="flex-1 overflow-y-auto">
      <div className="p-6 flex flex-col gap-5">

      {/* ── KPIs ── */}
      <div className="flex gap-3 flex-wrap">
        <div className="bg-surface-1 border border-border rounded-lg px-5 py-3">
          <p className="text-2xl font-bold tabular-nums text-status-confirmado">{formatarEuro(totalPagar)}</p>
          <p className="text-[11px] text-accent-muted mt-0.5">total a pagar — {titulo}</p>
        </div>
        <div className="bg-surface-1 border border-border rounded-lg px-5 py-3">
          <p className="text-2xl font-bold tabular-nums text-accent">{totalEvents}</p>
          <p className="text-[11px] text-accent-muted mt-0.5">eventos com apoio técnico</p>
        </div>
        <div className="bg-surface-1 border border-border rounded-lg px-5 py-3">
          <p className="text-2xl font-bold tabular-nums text-accent-muted">{fmtHoras(totalHoras)}</p>
          <p className="text-[11px] text-accent-muted mt-0.5">horas totais (agenda)</p>
        </div>
        <div className="bg-surface-1 border border-border rounded-lg px-5 py-3">
          <p className="text-2xl font-bold tabular-nums text-indigo-400">{totalHorasAssin > 0 ? fmtHoras(totalHorasAssin) : '—'}</p>
          <p className="text-[11px] text-accent-muted mt-0.5">horas registadas (assinaturas)</p>
        </div>
        <div className="bg-surface-1 border border-border rounded-lg px-5 py-3">
          <p className="text-2xl font-bold tabular-nums text-accent-muted">{cards.length}</p>
          <p className="text-[11px] text-accent-muted mt-0.5">colaboradores</p>
        </div>
      </div>

      {/* ── Cards por técnico ── */}
      <div className="grid grid-cols-1 gap-4">
        {cardsFiltrados.map(({
          tec, evsTec, agsTec, folgasTec,
          nDias, diasEfetivos, horasMin, horasAssin,
          nEventos, nFolgas, faltas, deducaoFaltas,
          valorBaseEfetivo, valorFaturado, valorPagar,
          valorBaseStr, diasStr, faltasStr,
        }) => {
          const aberto = expand === tec.id
          const tipo   = tec.tipo_pagamento
          const isDia  = tipo === 'dia'
          const isHora = tipo === 'hora'
          const isMensal = tipo === 'mensal'
          const cor    = corTecnico(tec.nome, cardsFiltrados.findIndex(c => c.tec.id === tec.id))

          // Label do valor base
          const labelValor = isDia ? 'Valor / dia' : isHora ? 'Valor / hora' : isMensal ? 'Valor / mês' : 'Valor / evento'

          return (
            <div key={tec.id} className="bg-surface-1 border border-border rounded-xl overflow-hidden">

              {/* ── Cabeçalho ── */}
              <div className="px-5 py-4 flex items-center justify-between gap-4 border-b border-border/40">
                <div className="flex items-center gap-3">
                  <div className={clsx('w-10 h-10 rounded-full border flex items-center justify-center text-sm font-bold shrink-0', cor.avatar)}>
                    {tec.nome.charAt(0)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-accent">{tec.nome}</p>
                      <BadgeTipo tipo={tipo} />
                    </div>
                    <p className="text-[11px] text-accent-subtle/70 mt-0.5">
                      {[
                        nEventos > 0 && `${nEventos} evento${nEventos !== 1 ? 's' : ''}`,
                        horasMin > 0 && fmtHoras(horasMin),
                        nFolgas  > 0 && `${nFolgas} folga${nFolgas !== 1 ? 's' : ''}`,
                      ].filter(Boolean).join(' · ') || 'Sem actividade'}
                    </p>
                  </div>
                </div>

                {/* Total a pagar */}
                <div className="text-right shrink-0">
                  <p className={clsx('text-2xl font-bold tabular-nums', valorPagar > 0 ? 'text-status-confirmado' : 'text-border/40')}>
                    {valorPagar > 0 ? formatarEuro(valorPagar) : '—'}
                  </p>
                  <p className="text-[10px] text-accent-subtle mt-0.5">total a pagar</p>
                </div>
              </div>

              {/* ── Variáveis de cálculo ── */}
              <div className="px-5 py-1">

                {/* Valor base (editável) */}
                <VarInput
                  label={labelValor}
                  value={valorBaseStr !== '' ? valorBaseStr : String(tec.valor_base ?? '')}
                  onChange={v => setVar(tec.id, 'valorBase', v)}
                  placeholder={String(tec.valor_base ?? '0')}
                  unit="€"
                  nota={valorBaseStr !== '' && Number(valorBaseStr) !== Number(tec.valor_base ?? 0)
                    ? `base: ${formatarEuro(Number(tec.valor_base ?? 0))}`
                    : null}
                />

                {/* Dias trabalhados — só para "dia" */}
                {isDia && (
                  <VarInput
                    label="Dias trabalhados"
                    value={diasStr !== '' ? diasStr : String(nDias)}
                    onChange={v => setVar(tec.id, 'dias', v)}
                    placeholder={String(nDias)}
                    unit="dias"
                    nota={nDias > 0 ? `calculado: ${nDias}` : null}
                  />
                )}

                {/* Horas trabalhadas (agenda) */}
                <VarInput
                  label="Horas trabalhadas"
                  value={fmtHoras(horasMin)}
                  readOnly
                  badge="auto"
                  nota={horasMin === 0 ? 'sem hora início/fim nos eventos' : null}
                />

                {/* Horas registadas por assinatura */}
                <div className="flex items-start justify-between gap-3 py-2.5 border-b border-border/20">
                  <span className="text-[11px] text-accent-subtle min-w-0 shrink-0 w-40">Horas c/ assinatura</span>
                  <div className="flex flex-col items-end gap-0.5">
                    <span className={clsx('text-sm font-semibold tabular-nums', horasAssin.totalMin > 0 ? 'text-indigo-400' : 'text-border/40')}>
                      {horasAssin.totalMin > 0 ? fmtHoras(horasAssin.totalMin) : '—'}
                    </span>
                    {horasAssin.totalMin > 0 && (
                      <span className="text-[10px] text-accent-subtle/60 tabular-nums">
                        {horasAssin.lmdMin > 0 && `LMD ${fmtHoras(horasAssin.lmdMin)}`}
                        {horasAssin.lmdMin > 0 && horasAssin.evMin > 0 && ' · '}
                        {horasAssin.evMin > 0 && `Eventos ${fmtHoras(horasAssin.evMin)}`}
                      </span>
                    )}
                  </div>
                </div>

                {/* Faltas */}
                <VarInput
                  label="Faltas"
                  value={faltasStr !== '' ? faltasStr : '0'}
                  onChange={v => setVar(tec.id, 'faltas', v)}
                  placeholder="0"
                  unit="dias"
                  nota={deducaoFaltas > 0 ? `− ${formatarEuro(deducaoFaltas)}` : null}
                />

                {/* Valor faturado ao cliente */}
                <VarInput
                  label="Valor faturado ao cliente"
                  value={valorFaturado > 0 ? formatarEuro(valorFaturado) : '—'}
                  readOnly
                  badge="auto"
                />

                {/* Folgas */}
                {nFolgas > 0 && (
                  <div className="flex items-center gap-2 py-2.5 border-b border-border/20">
                    <span className="text-[11px] text-accent-subtle w-40">Folgas</span>
                    <div className="flex gap-1.5 flex-wrap">
                      {folgasTec.map(d => (
                        <span key={d} className="text-[10px] px-2 py-0.5 rounded-full bg-orange-400/10 border border-orange-400/20 text-orange-400 font-medium">
                          {fmtD(d)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* ── Linha de total ── */}
              <div className="mx-5 mb-4 mt-2 px-4 py-3 rounded-lg bg-surface-2/60 border border-border/40 flex items-center justify-between">
                <span className="text-[11px] font-semibold text-accent-subtle uppercase tracking-wider">Total a pagar</span>
                <span className={clsx('text-xl font-bold tabular-nums', valorPagar > 0 ? 'text-status-confirmado' : 'text-border/40')}>
                  {valorPagar > 0 ? formatarEuro(valorPagar) : '—'}
                </span>
              </div>

              {/* ── Detalhe dos eventos (expandível) ── */}
              {nEventos > 0 && (
                <>
                  <button
                    onClick={() => setExpand(aberto ? null : tec.id)}
                    className="w-full px-5 py-2.5 border-t border-border/30 flex items-center justify-between text-[11px] text-accent-subtle hover:bg-surface-2/30 transition-colors"
                  >
                    <span>{aberto ? 'Ocultar' : 'Ver'} eventos ({nEventos})</span>
                    {aberto ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  </button>

                  {aberto && (
                    <div className="border-t border-border/30">
                      <table className="w-full text-[11px] border-collapse">
                        <thead>
                          <tr className="bg-surface-2/60 border-b border-border/30">
                            <th className="text-left px-5 py-2 font-medium text-accent-subtle">Data</th>
                            <th className="text-left px-3 py-2 font-medium text-accent-subtle">Cliente</th>
                            <th className="text-left px-3 py-2 font-medium text-accent-subtle">Evento</th>
                            <th className="text-center px-3 py-2 font-medium text-accent-subtle">Duração</th>
                            <th className="text-right px-5 py-2 font-medium text-accent-subtle">Valor</th>
                          </tr>
                        </thead>
                        <tbody>
                          {evsTec.map(ev => {
                            const dur = calcDuracaoMin(ev.hora_inicio, ev.hora_fim)
                            return (
                              <tr key={`ev-${ev.id}`} className="border-b border-border/20 last:border-0 hover:bg-surface-2/20">
                                <td className="px-5 py-2 text-accent-muted whitespace-nowrap">{fmtD(ev.data_evento)}</td>
                                <td className="px-3 py-2 text-accent-muted">{espacoNome[ev.espaco_id] ?? '—'}</td>
                                <td className="px-3 py-2 text-accent">{ev.evento || <span className="text-border/40">—</span>}</td>
                                <td className="px-3 py-2 text-center text-accent-subtle tabular-nums">
                                  {dur > 0 ? fmtHoras(dur) : <span className="text-border/30">—</span>}
                                </td>
                                <td className="px-5 py-2 text-right tabular-nums font-medium text-accent">
                                  {ev.valor_apoio_tecnico != null
                                    ? formatarEuro(Number(ev.valor_apoio_tecnico))
                                    : <span className="text-border/40">—</span>}
                                </td>
                              </tr>
                            )
                          })}
                          {agsTec.map(ag => (
                            <tr key={`ag-${ag.id}`} className="border-b border-border/20 last:border-0 hover:bg-surface-2/20">
                              <td className="px-5 py-2 text-accent-muted whitespace-nowrap">{fmtD(ag.data)}</td>
                              <td className="px-3 py-2 text-accent-muted">{espacoNome[ag.espaco_id] ?? '—'}</td>
                              <td className="px-3 py-2 text-accent-subtle italic">{ag.evento || 'Agendamento manual'}</td>
                              <td className="px-3 py-2 text-center text-border/30">—</td>
                              <td className="px-5 py-2 text-right tabular-nums font-medium text-accent">
                                {ag.valor != null ? formatarEuro(Number(ag.valor)) : <span className="text-border/40">—</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t border-border bg-surface-2/40">
                            <td colSpan={4} className="px-5 py-2 text-right text-[10px] font-semibold text-accent-subtle uppercase tracking-wider">Total faturado</td>
                            <td className="px-5 py-2 text-right font-bold text-accent tabular-nums">{formatarEuro(valorFaturado)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </>
              )}

            </div>
          )
        })}
      </div>
      </div>{/* fim p-6 */}
      </div>{/* fim overflow-y-auto */}
    </div>
  )
}
