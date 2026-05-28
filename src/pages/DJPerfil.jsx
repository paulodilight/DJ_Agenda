import { useState, useMemo, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowUp, ArrowDown, Printer } from 'lucide-react'
import { useDJ } from '@/hooks/useDJs'
import { useAgenda } from '@/hooks/useAgenda'
import { useConflitos } from '@/hooks/useConflitos'
import { agendaApi } from '@/lib/api'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { LoadingPage } from '@/components/ui/LoadingSpinner'
import { Alerta } from '@/components/ui/Alerta'
import { EmptyState } from '@/components/ui/EmptyState'
import { FormSlot } from '@/components/agenda/FormSlot'
import { formatarData, formatarHora } from '@/utils/datas'
import { formatarEuro, labelEstadoDJ, labelEstado, corEstado, bgEstado } from '@/utils/formatacao'
import { format } from 'date-fns'
import { pt } from 'date-fns/locale'
import { clsx } from 'clsx'

const ESTADOS_PRESENCA = [
  { value: 'presente',   label: 'Presente',   cor: 'text-status-confirmado' },
  { value: 'faltou',     label: 'Faltou',     cor: 'text-orange-400' },
  { value: 'confirmado', label: 'Confirmado', cor: 'text-status-confirmado' },
  { value: 'proposta',   label: 'Proposta',   cor: 'text-status-proposta' },
  { value: 'cancelado',  label: 'Cancelado',  cor: 'text-status-cancelado' },
]

const HOJE = format(new Date(), 'yyyy-MM-dd')

const nomeMesAno = (anoMes) => {
  const [y, m] = anoMes.split('-')
  return format(new Date(Number(y), Number(m) - 1, 1), 'MMMM yyyy', { locale: pt })
}

export function DJPerfil() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { dj, loading: loadingDJ, erro: erroDJ } = useDJ(id)
  const { agenda, loading: loadingAgenda, erro: erroAgenda, recarregar } = useAgenda({ djId: id })

  const [modalAberto, setModalAberto] = useState(false)
  const [slotSeleccionado, setSlotSeleccionado] = useState(null)
  const [filtroMes, setFiltroMes] = useState('todos')
  const [ordemDesc, setOrdemDesc] = useState(true) // default: mais recente primeiro
  const [actualizando, setActualizando] = useState(null)

  // Range de datas da agenda para o hook de conflitos
  const { dataInicioRange, dataFimRange } = useMemo(() => {
    const datas = agenda.map(s => s.data).filter(Boolean).sort()
    return {
      dataInicioRange: datas[0] ?? null,
      dataFimRange:    datas[datas.length - 1] ?? null,
    }
  }, [agenda])
  const { conflictsIdx } = useConflitos({ agenda, dataInicio: dataInicioRange, dataFim: dataFimRange })

  // Meses disponíveis para o filtro
  const meses = useMemo(() => {
    const set = new Set(agenda.map((s) => s.data?.slice(0, 7)).filter(Boolean))
    return [...set].sort()
  }, [agenda])

  // Aplicar filtro de mês + ordenação
  const slotsFiltrados = useMemo(() => {
    let lista = filtroMes === 'todos'
      ? [...agenda]
      : agenda.filter((s) => s.data?.startsWith(filtroMes))
    lista.sort((a, b) => {
      const cmp = a.data.localeCompare(b.data)
      return ordemDesc ? -cmp : cmp
    })
    return lista
  }, [agenda, filtroMes, ordemDesc])

  // Totais para o header — reflectem os filtros activos
  const totais = useMemo(() => ({
    total: slotsFiltrados.length,
    presente: slotsFiltrados.filter((s) => s.estado === 'presente').length,
    faltou: slotsFiltrados.filter((s) => s.estado === 'faltou').length,
    confirmado: slotsFiltrados.filter((s) => s.estado === 'confirmado').length,
    cancelado: slotsFiltrados.filter((s) => s.estado === 'cancelado').length,
    valor: slotsFiltrados.reduce((acc, s) => acc + (s.valor ?? 0), 0),
  }), [slotsFiltrados])

  const alterarEstado = useCallback(async (slotId, estado) => {
    setActualizando(slotId)
    try {
      await agendaApi.actualizar(slotId, { estado })
      recarregar()
    } catch { /* silencioso */ }
    finally { setActualizando(null) }
  }, [recarregar])

  const abrirSlot = (slot) => { setSlotSeleccionado(slot); setModalAberto(true) }
  const fecharModal = () => { setModalAberto(false); setSlotSeleccionado(null) }

  if (loadingDJ) return <LoadingPage />
  if (erroDJ) return <Alerta tipo="erro" mensagem={erroDJ} className="m-6" />

  return (
    <div className="flex flex-col h-full dj-perfil-wrap">
      <style>{`
        @media print {
          body, html { background: white !important; }
          .dj-perfil-wrap { background: white !important; color: #111 !important; height: auto !important; }
          .dj-perfil-wrap * { color: #111 !important; background: transparent !important; border-color: #ccc !important; box-shadow: none !important; }
          .no-print { display: none !important; }
          .dj-perfil-wrap table { border-collapse: collapse; width: 100%; }
          .dj-perfil-wrap th, .dj-perfil-wrap td { border-bottom: 1px solid #ddd; padding: 6px 10px; font-size: 11px; }
          .dj-perfil-wrap thead tr { border-bottom: 2px solid #999; }
          .dj-perfil-wrap .print-table-wrap { border: 1px solid #ccc; border-radius: 4px; overflow: visible; }
        }
      `}</style>
      {/* Header */}
      <div className="px-6 py-4 border-b border-border shrink-0">
        <button
          onClick={() => navigate('/djs')}
          className="no-print flex items-center gap-1.5 text-xs text-accent-muted hover:text-accent mb-3 transition-colors"
        >
          <ArrowLeft size={13} />
          Voltar aos DJs
        </button>

        {dj && (
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-base font-semibold text-accent">
                  {dj.nome_artistico || dj.nome}
                </h1>
                {dj.nome_artistico && (
                  <span className="text-xs text-accent-muted">{dj.nome}</span>
                )}
                <Badge variante={dj.estado === 'activo' ? 'confirmado' : dj.estado === 'banido' ? 'ban' : 'default'}>
                  {labelEstadoDJ(dj.estado)}
                </Badge>
              </div>
              <div className="flex items-center gap-4 mt-1.5 flex-wrap">
                {dj.whatsapp && <span className="text-xs text-accent-muted">{dj.whatsapp}</span>}
                {dj.email && <span className="text-xs text-accent-muted">{dj.email}</span>}
                {dj.valor_sessao && (
                  <span className="text-xs text-accent-muted">{formatarEuro(dj.valor_sessao)} / sessão</span>
                )}
              </div>
            </div>

            {/* Stats */}
            <div className="flex items-center gap-5 text-right flex-wrap">
              <div>
                <p className="text-lg font-semibold text-accent tabular-nums">{totais.total}</p>
                <p className="text-xs text-accent-muted">total</p>
              </div>
              {totais.presente > 0 && (
                <div>
                  <p className="text-lg font-semibold text-status-confirmado tabular-nums">{totais.presente}</p>
                  <p className="text-xs text-accent-muted">presente</p>
                </div>
              )}
              {totais.confirmado > 0 && (
                <div>
                  <p className="text-lg font-semibold text-status-confirmado tabular-nums">{totais.confirmado}</p>
                  <p className="text-xs text-accent-muted">confirmado</p>
                </div>
              )}
              <div>
                <p className="text-lg font-semibold text-orange-400 tabular-nums">{totais.faltou}</p>
                <p className="text-xs text-accent-muted">faltou</p>
              </div>
              {totais.cancelado > 0 && (
                <div>
                  <p className="text-lg font-semibold text-status-cancelado tabular-nums">{totais.cancelado}</p>
                  <p className="text-xs text-accent-muted">cancelado</p>
                </div>
              )}
              {totais.valor > 0 && (
                <div>
                  <p className="text-lg font-semibold text-accent tabular-nums">{formatarEuro(totais.valor)}</p>
                  <p className="text-xs text-accent-muted">valor total</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Toolbar */}
      <div className="no-print px-6 py-3 border-b border-border flex items-center gap-3 shrink-0 flex-wrap">
        {/* Filtro mês */}
        <select
          value={filtroMes}
          onChange={(e) => setFiltroMes(e.target.value)}
          className="bg-surface-2 border border-border rounded px-2 py-1.5 text-xs text-accent-muted focus:outline-none"
        >
          <option value="todos">Todos os meses</option>
          {meses.map((m) => (
            <option key={m} value={m}>{nomeMesAno(m)}</option>
          ))}
        </select>

        {/* Ordenação */}
        <button
          onClick={() => setOrdemDesc((v) => !v)}
          className="flex items-center gap-1 text-xs text-accent-muted hover:text-accent transition-colors border border-border rounded px-2 py-1.5 bg-surface-2"
        >
          {ordemDesc ? <ArrowDown size={12} /> : <ArrowUp size={12} />}
          {ordemDesc ? 'Mais recente' : 'Mais antigo'}
        </button>

        <span className="text-xs text-accent-subtle ml-auto">
          {slotsFiltrados.length} data{slotsFiltrados.length !== 1 ? 's' : ''}
        </span>

        {/* Imprimir */}
        <button
          onClick={() => window.print()}
          className="flex items-center gap-1.5 text-xs text-accent-muted hover:text-accent transition-colors border border-border rounded px-2 py-1.5 bg-surface-2"
        >
          <Printer size={12} />
          Imprimir
        </button>
      </div>

      {/* Lista */}
      <div className="flex-1 overflow-auto px-6 py-4">
        {loadingAgenda && <LoadingPage />}
        {erroAgenda && <Alerta tipo="erro" mensagem={erroAgenda} />}

        {!loadingAgenda && !erroAgenda && slotsFiltrados.length === 0 && (
          <EmptyState titulo="Nenhuma data" descricao="Sem datas para os filtros seleccionados." />
        )}

        {!loadingAgenda && !erroAgenda && slotsFiltrados.length > 0 && (
          <div className="bg-surface-1 border border-border rounded-lg overflow-hidden print-table-wrap">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-accent-muted">Data</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-accent-muted">Espaço</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-accent-muted">Horário</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-accent-muted">Evento</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-accent-muted">Valor</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-accent-muted">Estado</th>
                  <th className="no-print px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {slotsFiltrados.map((slot, i) => {
                  const eHoje = slot.data === HOJE
                  const temConflito = conflictsIdx.has(slot.id)
                  return (
                    <tr
                      key={slot.id}
                      className={clsx(
                        i < slotsFiltrados.length - 1 && 'border-b border-border/50',
                        temConflito
                          ? 'bg-red-500/[0.06] border-l-2 border-l-red-500/70'
                          : eHoje
                            ? 'bg-status-confirmado/5 border-l-2 border-l-status-confirmado'
                            : 'hover:bg-surface-2/40 transition-colors'
                      )}
                    >
                      <td className="px-4 py-3 tabular-nums">
                        <span className={clsx('font-medium', eHoje ? 'text-status-confirmado' : 'text-accent')}>
                          {formatarData(slot.data)}
                        </span>
                        {eHoje && <span className="ml-2 text-[10px] text-status-confirmado font-semibold uppercase tracking-wider">hoje</span>}
                      </td>
                      <td className="px-4 py-3 text-accent-muted">{slot.espaco_nome ?? '—'}</td>
                      <td className="px-4 py-3 text-accent-muted tabular-nums">
                        {formatarHora(slot.hora_inicio)}–{formatarHora(slot.hora_fim)}
                      </td>
                      <td className="px-4 py-3 text-accent-subtle text-xs max-w-[120px] truncate">
                        {slot.evento ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-accent-muted tabular-nums">
                        {formatarEuro(slot.valor)}
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={slot.estado ?? 'proposta'}
                          disabled={actualizando === slot.id}
                          onChange={(e) => alterarEstado(slot.id, e.target.value)}
                          className={clsx(
                            'bg-surface-2 border border-border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-white/20 cursor-pointer',
                            corEstado(slot.estado)
                          )}
                        >
                          {ESTADOS_PRESENCA.map((e) => (
                            <option key={e.value} value={e.value}>{e.label}</option>
                          ))}
                        </select>
                      </td>
                      <td className="no-print px-4 py-3 text-right">
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
      />
    </div>
  )
}
