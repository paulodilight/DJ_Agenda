import { useState, useEffect } from 'react'
import { CalendarDays, ChevronRight } from 'lucide-react'
import { clsx } from 'clsx'
import { useColaboradorStore } from '@/store'
import { colaboradorApi } from '@/lib/colaboradorApi'
import { EventoModal } from '@/components/colaborador/EventoModal'
import { Badge } from '@/components/ui/Badge'
import { LoadingPage } from '@/components/ui/LoadingSpinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { labelEstado } from '@/utils/formatacao'
import { hhmm, dataLonga } from '@/components/colaborador/format'

const hojeISO = () => {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

const statusVar = (s) =>
  ({ confirmado: 'confirmado', proposta: 'proposta', cancelado: 'cancelado', realizado: 'confirmado', 'em curso': 'proposta' }[s?.toLowerCase()] ?? 'default')

function LogoCliente({ logo, nome, size = 48 }) {
  const inicial = (nome || '?').charAt(0).toUpperCase()
  return (
    <div style={{ width: size, height: size }}
      className="rounded-xl bg-surface-2 border border-border flex items-center justify-center shrink-0 overflow-hidden">
      {logo
        ? <img src={logo} alt={nome || ''} className="w-full h-full object-cover" />
        : <span className="font-bold text-accent-subtle" style={{ fontSize: size * 0.36 }}>{inicial}</span>}
    </div>
  )
}

function EventoLinha({ evento, onClick }) {
  const logo    = evento.espacos?.logo_url
  const cliente = evento.espacos?.nome || evento.cliente || null
  const dataInst = evento.dia_instalacao
    ? dataLonga(evento.dia_instalacao)
    : evento.data_evento ? dataLonga(evento.data_evento) : null
  const horaInst = hhmm(evento.hora_instalacao) || null

  return (
    <button onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 bg-surface-1 border border-border rounded-2xl hover:border-white/20 active:scale-[0.98] text-left transition-all">
      <LogoCliente logo={logo} nome={cliente || evento.evento} size={44} />
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <p className="text-sm font-bold text-accent truncate">{evento.evento}</p>
        {cliente && <p className="text-xs text-accent-muted truncate">{cliente}</p>}
        {(dataInst || horaInst) && (
          <p className="text-xs text-accent-subtle truncate capitalize">
            {[dataInst, horaInst].filter(Boolean).join(' · ')}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {evento.status && (
          <Badge variante={statusVar(evento.status)} className="hidden sm:inline-flex text-[10px]">
            {labelEstado(evento.status) || evento.status}
          </Badge>
        )}
        <ChevronRight size={14} className="text-accent-subtle" />
      </div>
    </button>
  )
}

export function ColaboradorEventos() {
  const { colaborador } = useColaboradorStore()
  const [loading, setLoading]           = useState(true)
  const [eventos, setEventos]           = useState([])
  const [mapaTecnicos, setMapaTecnicos] = useState({})
  const [filtro, setFiltro]             = useState('todos')
  const [aberto, setAberto]             = useState(null)

  useEffect(() => {
    if (!colaborador) return
    let activo = true
    setLoading(true)
    Promise.all([
      colaboradorApi.eventosDoTecnico(colaborador.id),
      colaboradorApi.listarColaboradores(),
    ])
      .then(([evs, colabs]) => {
        if (!activo) return
        setEventos(evs)
        setMapaTecnicos(Object.fromEntries(colabs.map(c => [c.id, c.nome])))
      })
      .catch(console.error)
      .finally(() => activo && setLoading(false))
    return () => { activo = false }
  }, [colaborador])

  if (loading) return <LoadingPage />
  if (eventos.length === 0)
    return <EmptyState icone={CalendarDays} titulo="Sem eventos" descricao="Sem eventos de momento." />

  const hoje = hojeISO()

  const lista = (() => {
    if (filtro === 'meus')    return eventos.filter(e => e.meu && e.data_evento >= hoje)
    if (filtro === 'antigos') return [...eventos].filter(e => e.data_evento < hoje).reverse()
    return eventos.filter(e => !e.data_evento || e.data_evento >= hoje)
  })()

  const FILTROS = [
    { id: 'todos',   label: 'Todos' },
    { id: 'meus',    label: 'Meus' },
    { id: 'antigos', label: 'Antigos' },
  ]

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-black tracking-tight text-accent uppercase">Eventos</h1>

      <div className="flex gap-2">
        {FILTROS.map(f => (
          <button key={f.id} onClick={() => setFiltro(f.id)}
            className={clsx(
              'flex-1 py-1.5 rounded-xl text-xs font-medium border transition-all',
              filtro === f.id
                ? 'bg-white text-black border-white'
                : 'bg-surface-1 text-accent-muted border-border hover:border-white/20',
            )}>
            {f.label}
          </button>
        ))}
      </div>

      {lista.length === 0 ? (
        <EmptyState icone={CalendarDays} titulo="Sem eventos" descricao="Nenhum evento para este filtro." />
      ) : (
        <div className="flex flex-col gap-2">
          {lista.map(ev => (
            <EventoLinha key={ev.id} evento={ev} onClick={() => setAberto(ev)} />
          ))}
        </div>
      )}

      {aberto && (
        <EventoModal evento={aberto} mapaTecnicos={mapaTecnicos} onFechar={() => setAberto(null)} />
      )}
    </div>
  )
}
