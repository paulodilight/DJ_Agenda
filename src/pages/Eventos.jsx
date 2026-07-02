import { useState, useMemo } from 'react'
import { format, startOfMonth, endOfMonth, addMonths } from 'date-fns'
import { pt } from 'date-fns/locale'
import {
  Plus, CalendarDays, MapPin, FileText,
  Search, X, ChevronDown, ChevronRight,
  Clock, Wrench, Star, ArrowUpDown,
} from 'lucide-react'
import { useEventos } from '@/hooks/useEventos'
import { FormEvento } from '@/components/eventos/FormEvento'
import { LoadingPage } from '@/components/ui/LoadingSpinner'
import { useMesStore } from '@/store'
import { clsx } from 'clsx'

const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : ''

const COR_STATUS = {
  proposta:           { bg: 'bg-status-proposta/15',  text: 'text-status-proposta',  borda: 'border-status-proposta/30' },
  'aceitação':        { bg: 'bg-orange-500/15',        text: 'text-orange-400',        borda: 'border-orange-500/30' },
  'validação':        { bg: 'bg-violet-500/15',        text: 'text-violet-400',        borda: 'border-violet-500/30' },
  'pré-confirmado':   { bg: 'bg-sky-500/15',           text: 'text-sky-400',           borda: 'border-sky-500/30' },
  confirmado:         { bg: 'bg-status-confirmado/15', text: 'text-status-confirmado', borda: 'border-status-confirmado/30' },
  trocado:            { bg: 'bg-zinc-500/15',          text: 'text-zinc-400',          borda: 'border-zinc-500/30' },
  cancelado:          { bg: 'bg-status-cancelado/15',  text: 'text-status-cancelado',  borda: 'border-status-cancelado/30' },
  a_pedido:           { bg: 'bg-amber-600/15',         text: 'text-amber-600',         borda: 'border-amber-600/30' },
}

function BadgeStatus({ status }) {
  const c = COR_STATUS[status] ?? COR_STATUS.proposta
  return (
    <span className={clsx('text-[10px] font-semibold px-2 py-0.5 rounded border shrink-0', c.bg, c.text, c.borda)}>
      {cap(status ?? 'proposta')}
    </span>
  )
}

function Campo({ label, valor, icone: Icone }) {
  if (!valor) return null
  return (
    <div className="flex items-start gap-1.5">
      {Icone && <Icone size={11} className="text-accent-subtle/60 mt-0.5 shrink-0" />}
      <div>
        <span className="text-[10px] text-accent-subtle/60 uppercase tracking-wider">{label} </span>
        <span className="text-xs text-accent-muted">{valor}</span>
      </div>
    </div>
  )
}

export function Eventos() {
  const { anoMes, setAnoMes } = useMesStore()
  const [modalAberto, setModalAberto]   = useState(false)
  const [eventoActual, setEventoActual] = useState(null)
  const [dataInicial, setDataInicial]   = useState('')
  const [notasModal, setNotasModal]     = useState(null)
  const [pesquisa, setPesquisa]         = useState('')
  const [abertos, setAbertos]           = useState(new Set())
  const [ordenar, setOrdenar]           = useState('asc') // 'asc' = próximos primeiro
  const [filtroEspaco, setFiltroEspaco] = useState('')

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

  const espacos = useMemo(() => {
    const set = new Set(eventos.map(e => e.espaco_nome).filter(Boolean))
    return [...set].sort()
  }, [eventos])

  const mesesOpcoes = useMemo(() => {
    const hoje = new Date()
    return Array.from({ length: 25 }, (_, i) => {
      const d = addMonths(hoje, i - 12)
      return { val: format(d, 'yyyy-MM'), label: cap(format(d, 'MMMM yyyy', { locale: pt })) }
    })
  }, [])

  const abrirNovo = (data = '') => { setEventoActual(null); setDataInicial(data); setModalAberto(true) }
  const abrirEditar = (ev) => { setEventoActual(ev); setDataInicial(''); setModalAberto(true) }
  const fecharModal = () => { setModalAberto(false); setEventoActual(null) }

  const toggleAberto = (id) => setAbertos(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const HOJE = format(new Date(), 'yyyy-MM-dd')

  const eventosFiltrados = useMemo(() => {
    let list = eventos
    const q = pesquisa.trim().toLowerCase()
    if (q) list = list.filter(e =>
      [e.evento, e.cliente, e.tipo, e.espaco_nome, e.morada, e.responsavel, e.status]
        .some(v => v?.toLowerCase().includes(q))
    )
    if (filtroEspaco) list = list.filter(e => e.espaco_nome === filtroEspaco)
    if (ordenar === 'asc') list = list.filter(e => (e.data_evento ?? '') >= HOJE)
    return [...list].sort((a, b) => {
      const da = a.data_evento ?? ''
      const db = b.data_evento ?? ''
      return ordenar === 'desc' ? db.localeCompare(da) : da.localeCompare(db)
    })
  }, [eventos, pesquisa, filtroEspaco, ordenar, HOJE])

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
              {eventosFiltrados.length}{pesquisa || filtroEspaco ? ` de ${eventos.length}` : ''} evento{eventosFiltrados.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Pesquisa */}
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-accent-subtle pointer-events-none" />
              <input
                type="text"
                value={pesquisa}
                onChange={e => setPesquisa(e.target.value)}
                placeholder="Pesquisar…"
                className="pl-7 pr-7 py-1.5 text-xs bg-surface-2 border border-border rounded text-accent placeholder:text-accent-subtle/40 focus:outline-none focus:border-white/30 focus:bg-surface-3 transition-colors w-36"
              />
              {pesquisa && (
                <button onClick={() => setPesquisa('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-accent-subtle hover:text-accent">
                  <X size={11} />
                </button>
              )}
            </div>

            {/* Ordenar */}
            <button
              onClick={() => setOrdenar(o => o === 'asc' ? 'desc' : 'asc')}
              className={clsx(
                'flex items-center gap-1.5 px-2.5 py-1.5 rounded border text-xs transition-colors whitespace-nowrap',
                ordenar === 'asc'
                  ? 'border-status-confirmado/40 bg-status-confirmado/10 text-status-confirmado'
                  : 'border-border bg-surface-2 text-accent-muted hover:text-accent'
              )}
            >
              <ArrowUpDown size={11} />
              {ordenar === 'asc' ? 'Próximos' : 'Recentes'}
            </button>

            {/* Mês */}
            <select
              value={anoMes}
              onChange={e => setAnoMes(e.target.value)}
              className="px-2 py-1.5 text-xs bg-surface-2 border border-border rounded text-accent-muted focus:outline-none focus:border-white/30 transition-colors"
            >
              {mesesOpcoes.map(m => (
                <option key={m.val} value={m.val}>{m.label}</option>
              ))}
            </select>

            {/* Espaço */}
            <select
              value={filtroEspaco}
              onChange={e => setFiltroEspaco(e.target.value)}
              className={clsx(
                'px-2 py-1.5 text-xs bg-surface-2 border rounded focus:outline-none focus:border-white/30 transition-colors',
                filtroEspaco ? 'border-status-confirmado/40 text-status-confirmado' : 'border-border text-accent-muted'
              )}
            >
              <option value="">Todos os espaços</option>
              {espacos.map(esp => <option key={esp} value={esp}>{esp}</option>)}
            </select>

            <button
              onClick={() => abrirNovo()}
              className="flex items-center gap-2 px-4 py-2 rounded border border-status-confirmado/40 bg-status-confirmado/10 text-status-confirmado text-xs font-semibold hover:bg-status-confirmado/20 transition-colors"
            >
              <Plus size={13} />Novo evento
            </button>
          </div>
        </div>
      </div>

      {/* Lista */}
      <div className="flex-1 overflow-auto">
        {loading ? <LoadingPage /> : eventos.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-accent-subtle">
            <CalendarDays size={32} className="opacity-30" />
            <p className="text-sm">Sem eventos para {titulo.toLowerCase()}</p>
            <button onClick={() => abrirNovo()} className="text-xs text-accent/60 hover:text-accent underline underline-offset-2 transition-colors">
              Criar primeiro evento
            </button>
          </div>
        ) : (
          <div className="p-4 flex flex-col gap-1">
            {eventosFiltrados.map((ev) => {
              const aberto   = abertos.has(ev.id)
              const d        = ev.data_evento ? new Date(ev.data_evento + 'T00:00:00') : null
              const diaSem   = d ? cap(format(d, 'EEE', { locale: pt })) : ''
              const dataFmt  = d ? format(d, 'd MMM', { locale: pt }) : 'Sem data'
              const horario  = ev.hora_inicio
                ? `${ev.hora_inicio.slice(0,5)}${ev.hora_fim ? `–${ev.hora_fim.slice(0,5)}` : ''}`
                : null
              const local    = ev.espaco_nome || ev.morada || null
              const temNotas = ev.notas_operacionais || ev.Equipamentos

              return (
                <div key={ev.id} className={clsx(
                  'rounded-lg border transition-colors overflow-hidden',
                  ev.status === 'cancelado'  ? 'opacity-50 border-border/40'
                    : aberto ? 'border-border bg-surface-1'
                    : 'border-border/50 bg-surface-1 hover:border-border hover:bg-surface-1'
                )}>
                  {/* ── Cabeçalho (sempre visível) ── */}
                  <button
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left"
                    onClick={() => toggleAberto(ev.id)}
                  >
                    {/* Chevron */}
                    <span className="text-accent-subtle/50 shrink-0">
                      {aberto ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                    </span>

                    {/* Data */}
                    <span className="text-xs text-accent-subtle tabular-nums whitespace-nowrap w-20 shrink-0">
                      {diaSem && <span className="text-accent-subtle/60">{diaSem} </span>}
                      {dataFmt}
                    </span>

                    {/* Nome */}
                    <span className={clsx(
                      'flex-1 text-sm font-semibold truncate',
                      ev.status === 'cancelado' ? 'line-through text-accent-muted' : 'text-accent'
                    )}>
                      {ev.evento || '—'}
                    </span>

                    {/* Xclusive badge */}
                    {ev.xclusive && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-400 border border-violet-500/20 font-semibold uppercase tracking-wider shrink-0 flex items-center gap-1">
                        <Star size={8} className="fill-violet-400" />Xclusive
                      </span>
                    )}

                    {/* Tipo */}
                    {ev.tipo && (
                      <span className="text-[11px] text-accent-subtle/60 whitespace-nowrap shrink-0 hidden sm:block">{ev.tipo}</span>
                    )}

                    {/* Horário rápido */}
                    {horario && !aberto && (
                      <span className="text-[11px] text-accent-subtle/60 tabular-nums whitespace-nowrap shrink-0 hidden md:block">{horario}</span>
                    )}

                    {/* Status */}
                    <BadgeStatus status={ev.status} />
                  </button>

                  {/* ── Detalhe expandido ── */}
                  {aberto && (
                    <div className="px-4 pb-4 border-t border-border/40">
                      <div className="pt-3 flex flex-wrap gap-x-6 gap-y-2">
                        <Campo label="Horário" valor={horario} icone={Clock} />
                        <Campo label="Local"   valor={local}   icone={MapPin} />
                        <Campo label="Tipo"    valor={ev.tipo} />
                        <Campo label="Responsável" valor={ev.tecnico?.nome ?? ev.responsavel} />
                        <Campo label="Contacto"    valor={ev.contacto_pelo_evento} />
                        {ev.dia_instalacao && (
                          <Campo
                            label="Instalação"
                            valor={`${format(new Date(ev.dia_instalacao + 'T00:00:00'), 'd MMM', { locale: pt })}${ev.hora_instalacao ? ` às ${ev.hora_instalacao.slice(0,5)}` : ''}`}
                            icone={Wrench}
                          />
                        )}
                        {ev.valor_artistico     && <Campo label="Valor artístico"   valor={`${ev.valor_artistico} €`} />}
                        {ev.valor_apoio_tecnico && <Campo label="Apoio técnico"      valor={`${ev.valor_apoio_tecnico} €`} />}
                        {ev.tecnico2?.nome      && <Campo label="2º Técnico"         valor={ev.tecnico2.nome} />}
                      </div>

                      {/* Notas */}
                      {(ev.notas_operacionais || ev.Equipamentos) && (
                        <div className="mt-3 pt-3 border-t border-border/30 flex flex-col gap-1.5">
                          {ev.notas_operacionais && (
                            <p className="text-xs text-accent-subtle/80 whitespace-pre-wrap leading-relaxed">{ev.notas_operacionais}</p>
                          )}
                          {ev.Equipamentos && (
                            <p className="text-xs text-accent-subtle/70 whitespace-pre-wrap leading-relaxed">{ev.Equipamentos}</p>
                          )}
                        </div>
                      )}

                      {/* Acções */}
                      <div className="mt-3 flex items-center gap-3">
                        <button
                          onClick={() => abrirEditar(ev)}
                          className="text-xs text-accent-muted hover:text-accent transition-colors underline underline-offset-2"
                        >
                          Editar
                        </button>
                        {temNotas && (
                          <button
                            onClick={() => setNotasModal(ev)}
                            className="flex items-center gap-1 text-xs text-accent-subtle/60 hover:text-accent-muted transition-colors"
                          >
                            <FileText size={11} />Ver notas completas
                          </button>
                        )}
                      </div>
                    </div>
                  )}
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

      {/* Modal notas */}
      {notasModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setNotasModal(null)}>
          <div className="bg-surface-1 border border-border rounded-xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
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
              <button onClick={() => { setNotasModal(null); abrirEditar(notasModal) }} className="text-xs text-accent-subtle hover:text-accent transition-colors">Editar</button>
              <button onClick={() => setNotasModal(null)} className="px-3 py-1.5 rounded border border-border bg-surface-2 text-xs text-accent-muted hover:text-accent transition-colors">Fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
