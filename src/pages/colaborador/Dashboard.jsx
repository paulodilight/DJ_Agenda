import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, ClipboardList, Camera, ChevronRight, MapPin, CalendarClock, Wrench, LayoutList } from 'lucide-react'
import { useColaboradorStore } from '@/store'
import { colaboradorApi } from '@/lib/colaboradorApi'
import { Avatar } from '@/components/apoiot/Avatar'
import { EventoModal } from '@/components/apoiot/EventoModal'
import { LoadingPage } from '@/components/ui/LoadingSpinner'
import { hhmm, dataLonga } from '@/components/apoiot/format'

const hojeISO = () => {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

function CardNav({ to, Icone, rotulo }) {
  return (
    <Link to={to}
      className="group flex items-center gap-4 px-5 py-3.5 rounded-2xl bg-surface-1 border border-border hover:border-white/20 active:scale-[0.98] transition-all">
      <span className="w-10 h-10 rounded-xl bg-surface-3 flex items-center justify-center shrink-0 text-accent-muted group-hover:text-accent transition-colors">
        <Icone size={20} />
      </span>
      <span className="text-sm font-semibold text-accent">{rotulo}</span>
      <ChevronRight size={16} className="ml-auto text-accent-subtle group-hover:text-accent transition-colors shrink-0" />
    </Link>
  )
}

export function ColaboradorDashboard() {
  const { colaborador, actualizarFoto } = useColaboradorStore()
  const [loading, setLoading]           = useState(true)
  const [eventos, setEventos]           = useState([])
  const [mapaTecnicos, setMapaTecnicos] = useState({})
  const [aEnviarFoto, setAEnviarFoto]   = useState(false)
  const [eventoAberto, setEventoAberto] = useState(null)
  const fileRef = useRef(null)

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

  const hoje = hojeISO()
  const chaveOrdem = (e) => {
    const hora = e.hora_instalacao ?? e.hora_inicio ?? '00:00'
    return `${e.data_evento ?? '9999-99-99'}T${hora}`
  }
  const proximos = eventos
    .filter(e => e.meu && e.data_evento && e.data_evento >= hoje)
    .sort((a, b) => chaveOrdem(a).localeCompare(chaveOrdem(b)))
  const proximoEvento = proximos[0] ?? null

  const localProximo   = proximoEvento?.espacos?.nome || proximoEvento?.cliente || null
  const instalProximo  = proximoEvento?.hora_instalacao
    ? [dataLonga(proximoEvento.dia_instalacao || proximoEvento.data_evento), hhmm(proximoEvento.hora_instalacao)].filter(Boolean).join(' · ')
    : null

  const onUploadFoto = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAEnviarFoto(true)
    try {
      const url = await colaboradorApi.uploadFoto(colaborador.id, file)
      actualizarFoto(url)
    } catch (err) { alert('Não foi possível enviar a foto: ' + err.message) }
    finally {
      setAEnviarFoto(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  if (loading) return <LoadingPage />

  return (
    <div className="grid lg:grid-cols-3 gap-4 lg:gap-8 items-start lg:items-center max-w-4xl mx-auto w-full">

      {/* ── Esquerda: saudação + próximo evento clicável ── */}
      <div className="order-2 lg:order-1">
        <p className="text-3xl sm:text-4xl font-black text-accent leading-tight text-center lg:text-left">
          Olá, {colaborador?.nome}!
        </p>

        {proximoEvento ? (
          <button onClick={() => setEventoAberto(proximoEvento)}
            className="mt-4 w-full text-left rounded-2xl border border-white/10 bg-surface-1 p-4 hover:border-amber-500/30 hover:bg-surface-2 active:scale-[0.99] transition-all group">
            <p className="text-[10px] font-bold uppercase tracking-widest text-amber-400/70 mb-2 group-hover:text-amber-400 transition-colors">
              Próximo evento →
            </p>
            <p className="text-lg font-bold text-accent leading-snug">{proximoEvento.evento}</p>
            <div className="mt-2 flex flex-col gap-1.5">
              <span className="flex items-center gap-2 text-sm text-accent-muted">
                <CalendarClock size={13} className="text-accent-subtle shrink-0" />
                <span className="capitalize">{dataLonga(proximoEvento.data_evento)}</span>
                {proximoEvento.hora_inicio && <span>· {hhmm(proximoEvento.hora_inicio)}</span>}
              </span>
              {localProximo && (
                <span className="flex items-center gap-2 text-sm text-accent-muted">
                  <MapPin size={13} className="text-accent-subtle shrink-0" />
                  {localProximo}
                </span>
              )}
              {instalProximo && (
                <span className="flex items-center gap-2 text-xs text-accent-subtle">
                  <Wrench size={12} className="shrink-0" />
                  Instalação: {instalProximo}
                </span>
              )}
            </div>
          </button>
        ) : (
          <div className="mt-4 rounded-2xl border border-white/10 bg-surface-1 p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-accent-subtle mb-2">Próximo evento</p>
            <p className="text-sm text-accent-subtle">Sem eventos agendados de momento.</p>
          </div>
        )}
      </div>

      {/* ── Centro: avatar ── */}
      <div className="order-1 lg:order-2 w-full" style={{ textAlign: 'center' }}>
        <div style={{ display: 'inline-block', position: 'relative' }}>
          <Avatar nome={colaborador?.nome} foto={colaborador?.foto_url} tamanho="xl" anel />
          <button onClick={() => fileRef.current?.click()} disabled={aEnviarFoto} title="Trocar foto"
            className="absolute bottom-1 right-1 w-9 h-9 rounded-full bg-surface-3 border border-border flex items-center justify-center text-accent-muted hover:text-accent hover:bg-surface-4 transition-colors disabled:opacity-50">
            <Camera size={15} />
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onUploadFoto} />
        </div>
        {aEnviarFoto && <p className="text-xs text-accent-subtle mt-2">A enviar…</p>}
      </div>

      {/* ── Direita: navegação ── */}
      <div className="order-3 flex flex-col gap-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-accent-subtle mb-2">As minhas páginas</p>
        <CardNav to="/apoiot/agenda"  Icone={LayoutList}    rotulo="Agenda" />
        <CardNav to="/apoiot/eventos" Icone={CalendarDays}  rotulo="Eventos" />
        <CardNav to="/apoiot/tarefas" Icone={ClipboardList} rotulo="Tarefas" />
      </div>

      {eventoAberto && (
        <EventoModal
          evento={eventoAberto}
          mapaTecnicos={mapaTecnicos}
          onFechar={() => setEventoAberto(null)}
        />
      )}
    </div>
  )
}
