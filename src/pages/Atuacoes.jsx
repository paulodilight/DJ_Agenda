import React, { useState, useMemo, useCallback, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Search, Star, Lock, Pencil } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, addDays, addWeeks, addMonths } from 'date-fns'
import { pt } from 'date-fns/locale'
import { useAgenda } from '@/hooks/useAgenda'
import { useConflitos } from '@/hooks/useConflitos'
import { useDJs } from '@/hooks/useDJs'
import { useEspacos } from '@/hooks/useEspacos'
import { agendaApi } from '@/lib/api'
import { FormSlot } from '@/components/agenda/FormSlot'
import { LoadingPage } from '@/components/ui/LoadingSpinner'
import { Alerta } from '@/components/ui/Alerta'
import { EmptyState } from '@/components/ui/EmptyState'
import { formatarData, formatarHora } from '@/utils/datas'
import { formatarEuro, corEstado } from '@/utils/formatacao'
import { clsx } from 'clsx'

const PERIODOS = [
  { value: 'dia',    label: 'Dia' },
  { value: 'semana', label: 'Semana' },
  { value: 'mes',    label: 'Mês' },
]

const ESTADOS_AGENDA = [
  { value: 'confirmado', label: 'Confirmado' },
  { value: 'proposta',   label: 'Proposta' },
  { value: 'cancelado',  label: 'Cancelado' },
]

const ESTADOS_PRESENCA = [
  { value: 'presente',   label: 'Presente' },
  { value: 'faltou',     label: 'Faltou' },
  ...ESTADOS_AGENDA,
]

function AssidulidadeCell({ slot, estadoActual, hoje, actualizando, onAlterar }) {
  const ocorreu = slot.data.slice(0, 10) <= hoje
  const opcoes = ocorreu ? ESTADOS_PRESENCA : ESTADOS_AGENDA
  return (
    <div className="flex items-center gap-1.5">
      <select
        value={estadoActual ?? 'proposta'}
        disabled={actualizando === slot.id}
        onChange={(e) => onAlterar(slot.id, e.target.value)}
        data-slot-id={slot.id}
        data-assiduidade={String(ocorreu)}
        className={clsx(
          'bg-surface-2 border border-border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-white/20 cursor-pointer',
          estadoActual === 'presente'
            ? 'text-status-confirmado'
            : estadoActual === 'faltou'
              ? 'text-orange-400'
              : corEstado(estadoActual)
        )}
      >
        {opcoes.map((e) => (
          <option key={e.value} value={e.value}>{e.label}</option>
        ))}
      </select>
      {ocorreu && (
        <span
          className="text-[9px] font-bold text-accent-subtle/40 border border-border/30 rounded px-1 py-0.5 tracking-wider select-none"
          title="Pode ser actualizado automaticamente pelo n8n"
        >
          N8N
        </span>
      )}
    </div>
  )
}

function diaSemana(dataStr) {
  return format(new Date(dataStr + 'T12:00'), 'EEEE', { locale: pt })
}

function capitalizar(str) {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

export function Atuacoes() {
  const hoje = format(new Date(), 'yyyy-MM-dd')
  const [periodo, setPeriodo] = useState('semana')
  const [dataRef, setDataRef] = useState(hoje)
  const [filtroDJ, setFiltroDJ] = useState('')
  const [filtroEspaco, setFiltroEspaco] = useState('')
  const [pesquisa, setPesquisa] = useState('')
  const [actualizando, setActualizando] = useState(null)
  const [estadoOverrides, setEstadoOverrides] = useState({})
  const [modalAberto, setModalAberto] = useState(false)
  const [slotSeleccionado, setSlotSeleccionado] = useState(null)

  const { dataInicio, dataFim, labelPeriodo } = useMemo(() => {
    const d = new Date(dataRef + 'T12:00')
    if (periodo === 'dia') {
      return { dataInicio: dataRef, dataFim: dataRef, labelPeriodo: formatarData(dataRef) }
    }
    if (periodo === 'semana') {
      const ini = startOfWeek(d, { weekStartsOn: 1 })
      const fim = endOfWeek(d, { weekStartsOn: 1 })
      return {
        dataInicio: format(ini, 'yyyy-MM-dd'),
        dataFim: format(fim, 'yyyy-MM-dd'),
        labelPeriodo: `${format(ini, 'dd MMM', { locale: pt })} – ${format(fim, 'dd MMM yyyy', { locale: pt })}`,
      }
    }
    // mes
    const ini = startOfMonth(d)
    const fim = endOfMonth(d)
    return {
      dataInicio: format(ini, 'yyyy-MM-dd'),
      dataFim: format(fim, 'yyyy-MM-dd'),
      labelPeriodo: capitalizar(format(d, 'MMMM yyyy', { locale: pt })),
    }
  }, [periodo, dataRef])

  const navegar = (dir) => {
    const d = new Date(dataRef + 'T12:00')
    if (periodo === 'dia')    setDataRef(format(addDays(d, dir), 'yyyy-MM-dd'))
    if (periodo === 'semana') setDataRef(format(addWeeks(d, dir), 'yyyy-MM-dd'))
    if (periodo === 'mes')    setDataRef(format(addMonths(d, dir), 'yyyy-MM-dd'))
  }

  const [avaliacoes, setAvaliacoes] = useState({}) // { agenda_id: avaliacao }
  const [validacoes, setValidacoes] = useState({}) // { agenda_id: validacao_nota }

  const { agenda, loading, erro, recarregar } = useAgenda({
    dataInicio,
    dataFim,
    djId: filtroDJ || undefined,
    espacoId: filtroEspaco || undefined,
  })

  // Agenda sem filtros para detectar duplicados cross-Cliente/DJ
  const { agenda: agendaGeral } = useAgenda({ dataInicio, dataFim })
  const { conflictsIdx } = useConflitos({ agenda: agendaGeral, dataInicio, dataFim })

  const { djs } = useDJs()
  const { espacos } = useEspacos()

  // Carregar avaliações do Operator para o período visível
  useEffect(() => {
    if (!agenda.length) return
    const ids = agenda.map((s) => s.id)
    supabase
      .from('avaliacoes_djs')
      .select('agenda_id, nota, nota_artistica, nota_assiduidade, nota_profissionalismo, nota_adaptacao, interesse, gravado, notas_bloqueadas, comentario, notas_dj, auto_nota_artistica, auto_nota_assiduidade, auto_nota_profissionalismo, auto_nota_adaptacao')
      .in('agenda_id', ids)
      .then(({ data }) => {
        if (!data) return
        const map = {}
        data.forEach((a) => { map[a.agenda_id] = a })
        setAvaliacoes(map)
      })
    supabase
      .from('validacoes_datas')
      .select('agenda_id, nota, decisao')
      .in('agenda_id', ids)
      .then(({ data }) => {
        if (!data) return
        const map = {}
        data.forEach((v) => { map[v.agenda_id] = v })
        setValidacoes(map)
      })
  }, [agenda])

  const djsActivos = useMemo(() => djs.filter((d) => d.estado !== 'banido'), [djs])

  const agendaFiltrada = useMemo(() => {
    let lista = agenda
    if (pesquisa.trim()) {
      const q = pesquisa.toLowerCase()
      lista = lista.filter((s) =>
        (s.dj_nome ?? '').toLowerCase().includes(q) ||
        (s.espaco_nome ?? '').toLowerCase().includes(q) ||
        (s.evento ?? '').toLowerCase().includes(q) ||
        (s.notas ?? '').toLowerCase().includes(q)
      )
    }
    // Ordenar: hoje + futuro primeiro (asc), passado ao fundo (asc)
    const futuras = lista.filter((s) => s.data >= hoje).sort((a, b) => a.data.localeCompare(b.data) || a.hora_inicio.localeCompare(b.hora_inicio))
    const passadas = lista.filter((s) => s.data < hoje).sort((a, b) => a.data.localeCompare(b.data) || a.hora_inicio.localeCompare(b.hora_inicio))
    return [...futuras, ...passadas]
  }, [agenda, pesquisa, hoje])

  const alterarEstado = useCallback(async (slotId, estado) => {
    setEstadoOverrides((prev) => ({ ...prev, [slotId]: estado }))
    setActualizando(slotId)
    try {
      await agendaApi.actualizar(slotId, { estado })
      recarregar()
    } catch {
      setEstadoOverrides((prev) => { const n = { ...prev }; delete n[slotId]; return n })
    } finally {
      setActualizando(null)
    }
  }, [recarregar])

  const [cardAberto, setCardAberto] = useState(false)
  const [slotDetalhe, setSlotDetalhe] = useState(null)

  const abrirCard = (slot) => { setSlotDetalhe(slot); setCardAberto(true) }
  const fecharCard = () => { setCardAberto(false); setSlotDetalhe(null) }

  const abrirSlot = (slot) => { setSlotSeleccionado(slot); setModalAberto(true) }
  const fecharModal = () => { setModalAberto(false); setSlotSeleccionado(null) }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="px-6 py-3 border-b border-border shrink-0 flex items-center gap-3 flex-wrap">
        {/* Toggle período */}
        <div className="flex rounded border border-border overflow-hidden">
          {PERIODOS.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriodo(p.value)}
              className={clsx(
                'px-3 py-1.5 text-xs transition-colors',
                periodo === p.value
                  ? 'bg-surface-3 text-accent'
                  : 'bg-surface-2 text-accent-muted hover:text-accent'
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Navegação período */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => navegar(-1)}
            className="p-1.5 rounded border border-border bg-surface-2 text-accent-muted hover:text-accent transition-colors"
          >
            <ChevronLeft size={13} />
          </button>
          <span className="text-xs text-accent min-w-[160px] text-center font-medium">{labelPeriodo}</span>
          <button
            onClick={() => navegar(1)}
            className="p-1.5 rounded border border-border bg-surface-2 text-accent-muted hover:text-accent transition-colors"
          >
            <ChevronRight size={13} />
          </button>
          {dataRef !== hoje && (
            <button
              onClick={() => setDataRef(hoje)}
              className="ml-1 px-2 py-1 text-xs rounded border border-border bg-surface-2 text-accent-muted hover:text-accent transition-colors"
            >
              Hoje
            </button>
          )}
        </div>

        {/* Filtro DJ */}
        <select
          value={filtroDJ}
          onChange={(e) => setFiltroDJ(e.target.value)}
          className="bg-surface-2 border border-border rounded px-2 py-1.5 text-xs text-accent-muted focus:outline-none"
        >
          <option value="">Todos os DJs</option>
          {djsActivos.map((d) => (
            <option key={d.id} value={d.id}>{d.nome_artistico || d.nome}</option>
          ))}
        </select>

        {/* Filtro Cliente */}
        <select
          value={filtroEspaco}
          onChange={(e) => setFiltroEspaco(e.target.value)}
          className="bg-surface-2 border border-border rounded px-2 py-1.5 text-xs text-accent-muted focus:outline-none"
        >
          <option value="">Todos os Clientes</option>
          {espacos.map((e) => (
            <option key={e.id} value={e.id}>{e.nome}</option>
          ))}
        </select>

        {/* Pesquisa livre */}
        <div className="relative ml-auto">
          <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-accent-subtle pointer-events-none" />
          <input
            type="text"
            value={pesquisa}
            onChange={(e) => setPesquisa(e.target.value)}
            placeholder="Pesquisar…"
            className="bg-surface-2 border border-border rounded pl-8 pr-3 py-1.5 text-xs text-accent placeholder:text-accent-subtle/60 focus:outline-none focus:border-white/20 transition-colors w-44"
          />
        </div>

        {/* Contador */}
        <span className="text-[11px] text-accent-subtle tabular-nums shrink-0">
          {pesquisa ? `${agendaFiltrada.length} / ${agenda.length}` : agenda.length} result{agenda.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Tabela */}
      <div className="flex-1 overflow-auto px-6 py-4">
        {loading && <LoadingPage />}
        {erro && <Alerta tipo="erro" mensagem={erro} />}

        {!loading && !erro && agenda.length === 0 && (
          <EmptyState titulo="Sem atuações" descricao="Nenhuma atuação para o período e filtros seleccionados." />
        )}

        {!loading && !erro && agenda.length > 0 && agendaFiltrada.length === 0 && (
          <EmptyState
            icone={Search}
            titulo="Sem resultados"
            descricao={`Nenhuma atuação encontrada para "${pesquisa}".`}
          />
        )}

        {!loading && !erro && agendaFiltrada.length > 0 && (
          <div className="bg-surface-1 border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-accent-muted whitespace-nowrap">Dia da semana</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-accent-muted whitespace-nowrap">Data</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-accent-muted">DJ</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-accent-muted whitespace-nowrap">Horário</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-accent-muted">Cliente</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-accent-muted">Valor</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-accent-muted">Assiduidade</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-accent-muted">Evento</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-accent-muted">Notas</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-accent-muted" title="Avaliação do gestor (Operator)">Avaliação Gestor</th>
                  <th className="sticky right-0 px-3 py-2.5 bg-surface-1" />
                </tr>
              </thead>
              <tbody>
                {agendaFiltrada.map((slot, i) => {
                  const eHoje = slot.data === hoje
                  const ePassado = slot.data < hoje
                  const temConflito = conflictsIdx.has(slot.id)
                  const anteriorEraFutura = i > 0 && agendaFiltrada[i - 1].data >= hoje
                  const esteEPassado = slot.data < hoje
                  const mostrarSeparador = esteEPassado && anteriorEraFutura
                  return (
                    <React.Fragment key={slot.id}>
                    {mostrarSeparador && (
                      <tr>
                        <td colSpan={11} className="px-4 py-2 bg-surface-0 border-y border-border/40">
                          <span className="text-[10px] uppercase tracking-widest text-accent-subtle/50">Anteriores</span>
                        </td>
                      </tr>
                    )}
                    <tr
                      onClick={() => abrirCard(slot)}
                      className={clsx(
                        'cursor-pointer',
                        i < agendaFiltrada.length - 1 && 'border-b border-border/50',
                        temConflito
                          ? 'bg-red-500/[0.06] border-l-2 border-l-red-500/70 hover:bg-red-500/10'
                          : eHoje
                            ? 'bg-status-confirmado/5 border-l-2 border-l-status-confirmado hover:bg-status-confirmado/10'
                            : ePassado
                              ? 'hover:bg-surface-2/50 transition-colors'
                              : 'hover:bg-surface-2/40 transition-colors'
                      )}
                    >
                      <td className="px-4 py-3 text-accent-muted text-xs whitespace-nowrap">
                        {capitalizar(diaSemana(slot.data))}
                      </td>
                      <td className="px-4 py-3 tabular-nums whitespace-nowrap">
                        <span className={clsx('font-medium', eHoje ? 'text-status-confirmado' : 'text-accent')}>
                          {formatarData(slot.data)}
                        </span>
                        {eHoje && <span className="ml-2 text-[10px] text-status-confirmado font-semibold uppercase tracking-wider">hoje</span>}
                      </td>
                      <td className="px-4 py-3 font-medium text-accent">
                        {slot.dj_nome ?? <span className="italic text-accent-subtle">Sem DJ</span>}
                      </td>
                      <td className="px-4 py-3 text-accent-muted tabular-nums whitespace-nowrap">
                        {formatarHora(slot.hora_inicio)}–{formatarHora(slot.hora_fim)}
                      </td>
                      <td className="px-4 py-3 text-accent-muted whitespace-nowrap">
                        {slot.espaco_nome ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-accent-muted tabular-nums text-right whitespace-nowrap">
                        {formatarEuro(slot.valor)}
                      </td>
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <AssidulidadeCell
                          slot={slot}
                          estadoActual={estadoOverrides[slot.id] ?? slot.estado}
                          hoje={hoje}
                          actualizando={actualizando}
                          onAlterar={alterarEstado}
                        />
                      </td>
                      <td className="px-4 py-3 text-accent-subtle text-xs max-w-[140px] truncate" title={slot.evento}>
                        {slot.evento ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-accent-subtle text-xs max-w-[180px] truncate" title={slot.notas}>
                        {slot.notas ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        {(() => {
                          const av = avaliacoes[slot.id]
                          if (!av) return <span className="text-xs text-accent-subtle">—</span>
                          const total = (av.nota_artistica ?? 0) + (av.nota_assiduidade ?? 0) + (av.nota_profissionalismo ?? 0) + (av.nota_adaptacao ?? 0)
                          const temNotas = !!av.comentario?.trim()
                          return (
                            <div className="flex flex-col gap-0.5">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-semibold text-accent tabular-nums">{total}/20</span>
                                {av.interesse && (
                                  <span className="flex items-center gap-0.5 text-[10px] text-yellow-400" title="Interesse do gestor">
                                    <Star size={10} fill="currentColor" strokeWidth={0} />
                                    {av.interesse}
                                  </span>
                                )}
                                {av.gravado && <Lock size={10} className="text-status-confirmado" title="Avaliação gravada" />}
                              </div>
                              {temNotas && (
                                <p className="text-[11px] text-accent-subtle truncate max-w-[140px]" title={av.comentario}>
                                  {av.comentario}
                                </p>
                              )}
                            </div>
                          )
                        })()}
                      </td>
                      <td className="sticky right-0 px-3 py-3 bg-surface-1" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => abrirSlot(slot)}
                          title="Editar atuação"
                          className="flex items-center justify-center w-7 h-7 rounded-lg border border-border bg-surface-2 text-accent-muted hover:text-accent hover:border-white/20 transition-all"
                        >
                          <Pencil size={13} />
                        </button>
                      </td>
                    </tr>
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Card de detalhe ── */}
      {cardAberto && slotDetalhe && (() => {
        const av = avaliacoes[slotDetalhe.id]
        const val = validacoes[slotDetalhe.id]
        const total = av ? (av.nota_artistica ?? 0) + (av.nota_assiduidade ?? 0) + (av.nota_profissionalismo ?? 0) + (av.nota_adaptacao ?? 0) : 0
        const eHoje = slotDetalhe.data === hoje
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={fecharCard}>
            <div
              className="bg-surface-1 border border-border rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              {/* Cabeçalho */}
              <div className={clsx('px-5 pt-4 pb-3 border-b border-border flex items-start justify-between gap-3',
                eHoje ? 'border-l-4 border-l-status-confirmado' : conflictsIdx.has(slotDetalhe.id) ? 'border-l-4 border-l-red-500/70' : ''
              )}>
                <div>
                  <p className="text-xs text-accent-muted mb-0.5">
                    {capitalizar(diaSemana(slotDetalhe.data))} · {formatarData(slotDetalhe.data)}
                    {eHoje && <span className="ml-2 text-[10px] font-bold text-status-confirmado uppercase tracking-wider">hoje</span>}
                  </p>
                  <h2 className="text-base font-semibold text-accent">{slotDetalhe.dj_nome ?? 'Sem DJ'}</h2>
                  <p className="text-xs text-accent-muted mt-0.5">{slotDetalhe.espaco_nome} · {formatarHora(slotDetalhe.hora_inicio)}–{formatarHora(slotDetalhe.hora_fim)}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => { fecharCard(); abrirSlot(slotDetalhe) }}
                    title="Editar atuação"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-surface-2 text-xs text-accent-muted hover:text-accent hover:border-white/20 transition-all"
                  >
                    <Pencil size={11} /> Editar
                  </button>
                  <button onClick={fecharCard} className="p-1.5 rounded-lg border border-border bg-surface-2 text-accent-muted hover:text-accent transition-colors">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
                  </button>
                </div>
              </div>

              {/* Corpo */}
              <div className="px-5 py-4 flex flex-col gap-3 max-h-[65vh] overflow-y-auto">

                {/* Valor + Horas extras */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-[10px] font-medium text-accent-muted uppercase tracking-wider mb-0.5">Valor</p>
                    <span className="text-base font-bold text-accent tabular-nums">{formatarEuro(slotDetalhe.valor)}</span>
                  </div>
                  <div>
                    <p className="text-[10px] font-medium text-accent-muted uppercase tracking-wider mb-0.5">Horas extras</p>
                    <span className="text-base font-bold text-accent tabular-nums">
                      {slotDetalhe.horas_extra != null ? `${slotDetalhe.horas_extra}h` : <span className="text-accent-subtle/40">—</span>}
                    </span>
                  </div>
                </div>

                {/* Assiduidade com hora */}
                <div className="flex items-center justify-between gap-4">
                  <span className="text-xs font-medium text-accent-muted uppercase tracking-wider">Assiduidade</span>
                  <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                    <AssidulidadeCell
                      slot={slotDetalhe}
                      estadoActual={estadoOverrides[slotDetalhe.id] ?? slotDetalhe.estado}
                      hoje={hoje}
                      actualizando={actualizando}
                      onAlterar={alterarEstado}
                    />
                    <span className="text-xs text-accent-muted tabular-nums font-mono">{formatarHora(slotDetalhe.hora_inicio)}</span>
                  </div>
                </div>

                {/* Evento */}
                {slotDetalhe.evento && (
                  <div className="flex items-start gap-3">
                    <span className="text-xs font-medium text-accent-muted uppercase tracking-wider shrink-0 mt-0.5">Evento</span>
                    <span className="text-sm text-accent-subtle flex-1 text-right">{slotDetalhe.evento}</span>
                  </div>
                )}

                <div className="border-t border-border/40" />

                {/* Observações (form inicial) */}
                {slotDetalhe.notas?.trim() && (
                  <div className="flex flex-col gap-1">
                    <p className="text-[10px] font-semibold text-accent-subtle/50 uppercase tracking-wider">Observações</p>
                    <p className="text-sm text-accent-subtle leading-relaxed whitespace-pre-wrap">{slotDetalhe.notas}</p>
                  </div>
                )}

                {/* Nota do DJ */}
                {av?.notas_dj?.trim() && (
                  <div className="flex flex-col gap-1">
                    <p className="text-[10px] font-semibold text-accent-subtle/50 uppercase tracking-wider">Nota do DJ</p>
                    <p className="text-sm text-accent-subtle leading-relaxed whitespace-pre-wrap">{av.notas_dj}</p>
                  </div>
                )}

                {/* Nota do Operator */}
                {av?.comentario?.trim() && (
                  <div className="flex flex-col gap-1">
                    <p className="text-[10px] font-semibold text-accent-subtle/50 uppercase tracking-wider">Nota do Operator</p>
                    <p className="text-sm text-accent-subtle leading-relaxed whitespace-pre-wrap">{av.comentario}</p>
                  </div>
                )}

                {/* Nota do Manager (decisão validacoes_datas) */}
                {val?.nota?.trim() && (
                  <div className="flex flex-col gap-1">
                    <p className="text-[10px] font-semibold text-accent-subtle/50 uppercase tracking-wider">Nota do Manager</p>
                    <p className="text-sm text-accent-subtle leading-relaxed whitespace-pre-wrap">{val.nota}</p>
                  </div>
                )}

                {/* Auto-avaliação DJ */}
                {av && [av.auto_nota_artistica, av.auto_nota_assiduidade, av.auto_nota_profissionalismo, av.auto_nota_adaptacao].some(v => v != null) && (
                  <div className="flex flex-col gap-1.5 border border-border/40 rounded-lg p-3">
                    <p className="text-[10px] font-semibold text-accent-subtle/50 uppercase tracking-wider">Auto-avaliação DJ</p>
                    {[
                      { label: 'Artística',       val: av.auto_nota_artistica },
                      { label: 'Assiduidade',     val: av.auto_nota_assiduidade },
                      { label: 'Profissionalismo',val: av.auto_nota_profissionalismo },
                      { label: 'Adaptação',       val: av.auto_nota_adaptacao },
                    ].map(({ label, val }) => (
                      <div key={label} className="flex items-center justify-between">
                        <span className="text-xs text-accent-muted">{label}</span>
                        <div className="flex items-center gap-1.5">
                          <div className="flex gap-0.5">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <Star key={i} size={9} className={i < (val ?? 0) ? 'fill-blue-400 text-blue-400' : 'text-white/15'} />
                            ))}
                          </div>
                          <span className="text-[11px] text-accent-subtle w-4 text-right tabular-nums">{val ?? '—'}</span>
                        </div>
                      </div>
                    ))}
                    <div className="flex items-center justify-between border-t border-border/40 pt-1.5 mt-0.5">
                      <span className="text-xs font-medium text-accent-muted">Total auto</span>
                      <span className="text-sm font-bold text-blue-400 tabular-nums">
                        {[av.auto_nota_artistica, av.auto_nota_assiduidade, av.auto_nota_profissionalismo, av.auto_nota_adaptacao].filter(v => v != null).reduce((a, b) => a + b, 0)} / 20
                      </span>
                    </div>
                  </div>
                )}

                {/* Avaliação Operator */}
                {av && total > 0 && (
                  <div className="flex flex-col gap-1.5 border border-border/40 rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-semibold text-accent-subtle/50 uppercase tracking-wider">Avaliação Operator</p>
                      <div className="flex items-center gap-2">
                        {av.gravado && <Lock size={10} className="text-status-confirmado" title="Avaliação gravada" />}
                        {av.interesse > 0 && (
                          <span className="flex items-center gap-0.5 text-[10px] text-yellow-400" title="Interesse">
                            <Star size={9} fill="currentColor" strokeWidth={0} /> {av.interesse}
                          </span>
                        )}
                      </div>
                    </div>
                    {[
                      { label: 'Artística',       val: av.nota_artistica },
                      { label: 'Assiduidade',     val: av.nota_assiduidade },
                      { label: 'Profissionalismo',val: av.nota_profissionalismo },
                      { label: 'Adaptação',       val: av.nota_adaptacao },
                    ].map(({ label, val }) => (
                      <div key={label} className="flex items-center justify-between">
                        <span className="text-xs text-accent-muted">{label}</span>
                        <div className="flex items-center gap-1.5">
                          <div className="flex gap-0.5">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <Star key={i} size={9} className={i < (val ?? 0) ? 'fill-yellow-400 text-yellow-400' : 'text-white/15'} />
                            ))}
                          </div>
                          <span className="text-[11px] text-accent-subtle w-4 text-right tabular-nums">{val ?? '—'}</span>
                        </div>
                      </div>
                    ))}
                    <div className="flex items-center justify-between border-t border-border/40 pt-1.5 mt-0.5">
                      <span className="text-xs font-medium text-accent-muted">Total Operator</span>
                      <span className="text-sm font-bold text-yellow-400 tabular-nums">{total} / 20</span>
                    </div>
                  </div>
                )}

                {/* A minha avaliação (admin) */}
                {av?.nota != null && (
                  <div className="flex flex-col gap-1.5 border border-border/40 rounded-lg p-3">
                    <p className="text-[10px] font-semibold text-accent-subtle/50 uppercase tracking-wider">A minha avaliação</p>
                    <div className="flex items-center gap-2">
                      <div className="flex gap-0.5">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star key={i} size={14} className={i < (av.nota ?? 0) ? 'fill-emerald-400 text-emerald-400' : 'text-white/15'} />
                        ))}
                      </div>
                      <span className="text-sm font-bold text-emerald-400 tabular-nums">{av.nota} / 5</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })()}

      <FormSlot
        aberto={modalAberto}
        slot={slotSeleccionado}
        onFechar={fecharModal}
        onGuardado={recarregar}
        simplificado
      />
    </div>
  )
}
