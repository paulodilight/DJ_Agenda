import { useState, useMemo } from 'react'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import { pt } from 'date-fns/locale'
import { Plus, CalendarDays, MapPin, FileText, Search, X } from 'lucide-react'
import { useEventos } from '@/hooks/useEventos'
import { FormEvento } from '@/components/eventos/FormEvento'
import { LoadingPage } from '@/components/ui/LoadingSpinner'
import { useMesStore } from '@/store'
import { clsx } from 'clsx'

const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : ''

const COR_STATUS = {
  confirmado: { bg: 'bg-status-confirmado/15', text: 'text-status-confirmado', borda: 'border-status-confirmado/30' },
  proposta:   { bg: 'bg-status-proposta/15',   text: 'text-status-proposta',   borda: 'border-status-proposta/30' },
  cancelado:  { bg: 'bg-status-cancelado/15',  text: 'text-status-cancelado',  borda: 'border-status-cancelado/30' },
}

function BadgeStatus({ status }) {
  const c = COR_STATUS[status] ?? COR_STATUS.proposta
  return (
    <span className={clsx('text-[10px] font-semibold px-2 py-0.5 rounded border', c.bg, c.text, c.borda)}>
      {cap(status ?? 'proposta')}
    </span>
  )
}

export function Eventos() {
  const { anoMes } = useMesStore()
  const [modalAberto, setModalAberto]   = useState(false)
  const [eventoActual, setEventoActual] = useState(null)
  const [dataInicial, setDataInicial]   = useState('')
  const [notasModal, setNotasModal]     = useState(null)
  const [pesquisa, setPesquisa]         = useState('')

  const { dataInicio, dataFim } = useMemo(() => {
    const [ano, mes] = anoMes.split('-').map(Number)
    const ref = new Date(ano, mes - 1, 1)
    return {
      dataInicio: format(startOfMonth(ref), 'yyyy-MM-dd'),
      dataFim:    format(endOfMonth(ref),   'yyyy-MM-dd'),
    }
  }, [anoMes])

  const { eventos, loading, recarregar } = useEventos({ dataInicio, dataFim })

  const titulo = cap(format(new Date(anoMes + '-01'), 'MMMM yyyy', { locale: pt }))

  const abrirNovo = (data = '') => {
    setEventoActual(null)
    setDataInicial(data)
    setModalAberto(true)
  }

  const abrirEditar = (ev) => {
    setEventoActual(ev)
    setDataInicial('')
    setModalAberto(true)
  }

  const fecharModal = () => { setModalAberto(false); setEventoActual(null) }

  // Filtrar por pesquisa
  const eventosFiltrados = useMemo(() => {
    const q = pesquisa.trim().toLowerCase()
    if (!q) return eventos
    return eventos.filter(e =>
      [e.evento, e.cliente, e.tipo, e.espaco_nome, e.morada, e.responsavel, e.status]
        .some(v => v?.toLowerCase().includes(q))
    )
  }, [eventos, pesquisa])

  // Agrupar por data_evento
  const porData = useMemo(() => {
    const grupos = {}
    eventosFiltrados.forEach((e) => {
      const key = e.data_evento ?? 'sem-data'
      if (!grupos[key]) grupos[key] = []
      grupos[key].push(e)
    })
    return Object.entries(grupos).sort(([a], [b]) => a.localeCompare(b))
  }, [eventosFiltrados])

  return (
    <div className="flex flex-col h-full">

      {/* Header */}
      <div className="px-6 py-4 border-b border-border shrink-0">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-base font-semibold text-accent uppercase tracking-wide">
              Eventos — {titulo}
            </h1>
            <p className="text-xs text-accent-muted mt-0.5">
              {eventosFiltrados.length}{pesquisa ? ` de ${eventos.length}` : ''} evento{eventosFiltrados.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Pesquisa */}
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-accent-subtle pointer-events-none" />
              <input
                type="text"
                value={pesquisa}
                onChange={e => setPesquisa(e.target.value)}
                placeholder="Pesquisar eventos…"
                className="pl-7 pr-7 py-1.5 text-xs bg-surface-2 border border-border rounded text-accent placeholder:text-accent-subtle/40 focus:outline-none focus:border-white/30 focus:bg-surface-3 transition-colors w-44"
              />
              {pesquisa && (
                <button onClick={() => setPesquisa('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-accent-subtle hover:text-accent">
                  <X size={11} />
                </button>
              )}
            </div>
            <button
              onClick={() => abrirNovo()}
              className="flex items-center gap-2 px-4 py-2 rounded border border-status-confirmado/40 bg-status-confirmado/10 text-status-confirmado text-xs font-semibold hover:bg-status-confirmado/20 transition-colors"
            >
              <Plus size={13} />
              Novo evento
            </button>
          </div>
        </div>
      </div>

      {/* Conteúdo */}
      <div className="flex-1 overflow-auto">
        {loading ? <LoadingPage /> : eventos.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-accent-subtle">
            <CalendarDays size={32} className="opacity-30" />
            <p className="text-sm">Sem eventos para {titulo.toLowerCase()}</p>
            <button
              onClick={() => abrirNovo()}
              className="text-xs text-accent/60 hover:text-accent underline underline-offset-2 transition-colors"
            >
              Criar primeiro evento
            </button>
          </div>
        ) : (
          <div className="p-6 flex flex-col gap-6">
            {porData.map(([data, evs]) => {
              const d = data !== 'sem-data' ? new Date(data + 'T00:00:00') : null
              const diaLabel = d
                ? cap(format(d, "EEEE, d 'de' MMMM", { locale: pt }))
                : 'Sem data'
              return (
                <div key={data}>
                  {/* Separador de data */}
                  <div className="flex items-center gap-3 mb-3">
                    <div className="flex items-center gap-2">
                      <CalendarDays size={13} className="text-accent-muted" />
                      <span className="text-xs font-semibold text-accent-muted uppercase tracking-wider">{diaLabel}</span>
                    </div>
                    <div className="flex-1 h-px bg-border/40" />
                    <button
                      onClick={() => abrirNovo(data !== 'sem-data' ? data : '')}
                      className="text-[10px] text-accent-subtle hover:text-accent transition-colors flex items-center gap-1"
                    >
                      <Plus size={10} /> Adicionar
                    </button>
                  </div>

                  {/* Tabela */}
                  <div className="bg-surface-1 border border-border rounded-lg overflow-hidden">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-border bg-surface-2">
                          <th className="text-left px-4 py-2.5 font-medium text-accent-muted w-[22%]">Evento</th>
                          <th className="text-left px-3 py-2.5 font-medium text-accent-muted w-[10%]">Tipo</th>
                          <th className="text-left px-3 py-2.5 font-medium text-accent-muted w-[15%]">Cliente</th>
                          <th className="text-left px-3 py-2.5 font-medium text-accent-muted w-[13%]">Local</th>
                          <th className="text-left px-3 py-2.5 font-medium text-accent-muted w-[12%]">Horário</th>
                          <th className="text-center px-3 py-2.5 font-medium text-accent-muted w-[10%]">Status</th>
                          <th className="text-center px-3 py-2.5 font-medium text-accent-muted w-[10%]">Notas</th>
                        </tr>
                      </thead>
                      <tbody>
                        {evs.map((ev, i) => (
                          <tr
                            key={ev.id}
                            className={clsx(
                              'border-b border-border/30 last:border-0 transition-colors',
                              ev.status === 'cancelado' ? 'opacity-50' : '',
                              i % 2 !== 0 && 'bg-surface-0/40'
                            )}
                          >
                            {/* Nome */}
                            <td className="px-4 py-2.5">
                              <button
                                onClick={() => abrirEditar(ev)}
                                className="font-semibold text-accent hover:text-status-confirmado transition-colors text-left truncate max-w-[180px] block"
                                title={ev.evento}
                              >
                                {ev.evento}
                              </button>
                              {ev.dia_instalacao && (
                                <p className="text-[10px] text-accent-subtle mt-0.5">
                                  Instalação: {format(new Date(ev.dia_instalacao + 'T00:00:00'), 'd MMM', { locale: pt })}
                                  {ev.hora_instalacao && ` às ${ev.hora_instalacao.slice(0, 5)}`}
                                </p>
                              )}
                            </td>

                            {/* Tipo */}
                            <td className="px-3 py-2.5 text-accent-muted">
                              {ev.tipo || <span className="text-border/50">—</span>}
                            </td>

                            {/* Cliente */}
                            <td className="px-3 py-2.5 text-accent-muted truncate max-w-[120px]">
                              {ev.cliente || <span className="text-border/50">—</span>}
                            </td>

                            {/* Espaço / Local */}
                            <td className="px-3 py-2.5">
                              {ev.espaco_nome
                                ? <span className="flex items-center gap-1 text-accent-muted truncate max-w-[110px]"><MapPin size={10} className="shrink-0" />{ev.espaco_nome}</span>
                                : ev.morada
                                  ? <span className="flex items-center gap-1 text-accent-muted truncate max-w-[110px]"><MapPin size={10} className="shrink-0" />{ev.morada}</span>
                                  : <span className="text-border/50">—</span>
                              }
                            </td>

                            {/* Horário */}
                            <td className="px-3 py-2.5 text-accent-muted tabular-nums whitespace-nowrap">
                              {ev.hora_inicio
                                ? `${ev.hora_inicio.slice(0, 5)}${ev.hora_fim ? ` – ${ev.hora_fim.slice(0, 5)}` : ''}`
                                : <span className="text-border/50">—</span>
                              }
                            </td>

                            {/* Status */}
                            <td className="px-3 py-2.5 text-center">
                              <BadgeStatus status={ev.status} />
                            </td>

                            {/* Notas */}
                            <td className="px-3 py-2.5 text-center">
                              {ev.notas_operacionais || ev.Equipamentos ? (
                                <button
                                  onClick={() => setNotasModal(ev)}
                                  className="flex items-center gap-1 mx-auto px-2 py-1 rounded border border-border/50 text-accent-subtle hover:text-accent hover:border-border transition-colors text-[10px]"
                                >
                                  <FileText size={10} />
                                  Ver notas
                                </button>
                              ) : (
                                <button
                                  onClick={() => abrirEditar(ev)}
                                  className="text-[10px] text-border/50 hover:text-accent-subtle transition-colors"
                                >
                                  + Adicionar
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Modal principal */}
      <FormEvento
        aberto={modalAberto}
        evento={eventoActual}
        dataInicial={dataInicial}
        onFechar={fecharModal}
        onGuardado={recarregar}
      />

      {/* Mini modal de notas */}
      {notasModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setNotasModal(null)}>
          <div className="bg-surface-1 border border-border rounded-xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-accent">{notasModal.evento}</p>
                <p className="text-[11px] text-accent-subtle mt-0.5">Notas técnicas e operacionais</p>
              </div>
              <button onClick={() => setNotasModal(null)} className="text-accent-subtle hover:text-accent text-lg leading-none">×</button>
            </div>
            <div className="px-5 py-4 flex flex-col gap-4">
              {notasModal.notas_operacionais && (
                <div>
                  <p className="text-[10px] font-semibold text-accent-subtle uppercase tracking-wider mb-1">Notas operacionais</p>
                  <p className="text-xs text-accent-muted whitespace-pre-wrap">{notasModal.notas_operacionais}</p>
                </div>
              )}
              {notasModal.Equipamentos && (
                <div>
                  <p className="text-[10px] font-semibold text-accent-subtle uppercase tracking-wider mb-1">Equipamentos</p>
                  <p className="text-xs text-accent-muted whitespace-pre-wrap">{notasModal.Equipamentos}</p>
                </div>
              )}
            </div>
            <div className="px-5 py-3 border-t border-border flex justify-end gap-2">
              <button
                onClick={() => { setNotasModal(null); abrirEditar(notasModal) }}
                className="text-xs text-accent-subtle hover:text-accent transition-colors"
              >
                Editar
              </button>
              <button
                onClick={() => setNotasModal(null)}
                className="px-3 py-1.5 rounded border border-border bg-surface-2 text-xs text-accent-muted hover:text-accent transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
