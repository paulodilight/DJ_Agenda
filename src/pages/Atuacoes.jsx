import { useState, useMemo, useCallback } from 'react'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'
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

  const { agenda, loading, erro, recarregar } = useAgenda({
    dataInicio,
    dataFim,
    djId: filtroDJ || undefined,
    espacoId: filtroEspaco || undefined,
  })

  // Agenda sem filtros para detectar duplicados cross-espaço/DJ
  const { agenda: agendaGeral } = useAgenda({ dataInicio, dataFim })
  const { conflictsIdx } = useConflitos({ agenda: agendaGeral, dataInicio, dataFim })

  const { djs } = useDJs()
  const { espacos } = useEspacos()

  const djsActivos = useMemo(() => djs.filter((d) => d.estado !== 'banido'), [djs])

  const agendaFiltrada = useMemo(() => {
    if (!pesquisa.trim()) return agenda
    const q = pesquisa.toLowerCase()
    return agenda.filter((s) =>
      (s.dj_nome ?? '').toLowerCase().includes(q) ||
      (s.espaco_nome ?? '').toLowerCase().includes(q) ||
      (s.evento ?? '').toLowerCase().includes(q) ||
      (s.notas ?? '').toLowerCase().includes(q)
    )
  }, [agenda, pesquisa])

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

        {/* Filtro Espaço */}
        <select
          value={filtroEspaco}
          onChange={(e) => setFiltroEspaco(e.target.value)}
          className="bg-surface-2 border border-border rounded px-2 py-1.5 text-xs text-accent-muted focus:outline-none"
        >
          <option value="">Todos os espaços</option>
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
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-accent-muted">Espaço</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-accent-muted">Valor</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-accent-muted">Assiduidade</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-accent-muted">Evento</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-accent-muted">Notas</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {agendaFiltrada.map((slot, i) => {
                  const eHoje = slot.data === hoje
                  const temConflito = conflictsIdx.has(slot.id)
                  return (
                    <tr
                      key={slot.id}
                      className={clsx(
                        i < agendaFiltrada.length - 1 && 'border-b border-border/50',
                        temConflito
                          ? 'bg-red-500/[0.06] border-l-2 border-l-red-500/70'
                          : eHoje
                            ? 'bg-status-confirmado/5 border-l-2 border-l-status-confirmado'
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
                      <td className="px-4 py-3">
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
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => abrirSlot(slot)}
                          className="text-xs text-accent-subtle hover:text-accent transition-colors"
                        >
                          Editar →
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

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
