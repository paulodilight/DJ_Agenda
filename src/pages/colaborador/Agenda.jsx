import { useState, useEffect, useMemo } from 'react'
import { format, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns'
import { pt } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Search, X, Eye, EyeOff, RotateCcw } from 'lucide-react'
import { clsx } from 'clsx'
import { supabase } from '@/lib/supabase'
import { useMesStore, useColaboradorStore } from '@/store'
import { EventoModal } from '@/components/colaborador/EventoModal'
import { LoadingPage } from '@/components/ui/LoadingSpinner'
import { corTecnico } from '@/utils/tecnicoColor'

const isoData  = (d) => format(d, 'yyyy-MM-dd')
const hhmm     = (t) => t?.slice(0, 5) ?? null
const cap      = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : ''
const hojeStr  = isoData(new Date())

const NOMES_DIA = { 1:'Seg', 2:'Ter', 3:'Qua', 4:'Qui', 5:'Sex', 6:'Sáb', 0:'Dom' }
const nomeDia = (d) => {
  const dt = new Date(d + 'T00:00:00')
  return `${NOMES_DIA[dt.getDay()]}, ${cap(format(dt, 'd MMM', { locale: pt }))}`
}

function TecChip({ nome, cor, idx }) {
  const c = cor ?? corTecnico(nome, idx)
  return (
    <span className={clsx(
      'inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border whitespace-nowrap shrink-0',
      c.chip,
    )}>
      {nome}
    </span>
  )
}

export function ColaboradorAgenda() {
  const { anoMes, navegar }  = useMesStore()
  const { colaborador }      = useColaboradorStore()

  const [loading, setLoading]     = useState(true)
  const [portrait, setPortrait]   = useState(() => typeof window !== 'undefined' && window.innerWidth < window.innerHeight)

  useEffect(() => {
    const handler = () => setPortrait(window.innerWidth < window.innerHeight)
    window.addEventListener('resize', handler)
    window.addEventListener('orientationchange', handler)
    return () => { window.removeEventListener('resize', handler); window.removeEventListener('orientationchange', handler) }
  }, [])
  const [tecnicos, setTecnicos]   = useState([])
  const [eventos, setEventos]     = useState([])
  const [evTecnicos, setEvTecs]   = useState([])
  const [agendamentos, setAgends] = useState([])
  const [slots, setSlots]         = useState([])
  const [espacos, setEspacos]     = useState([])
  const [filtroEspaco, setFiltro]   = useState('')
  const [filtroMeu, setFiltroMeu]   = useState(false)
  const [ocultarVazios, setOcultar] = useState(true)
  const [pesquisa, setPesquisa]     = useState('')
  const [eventoAberto, setAberto]   = useState(null)
  const [mapaTecnicos, setMapaTec]  = useState({})
  const [meusIds, setMeusIds]       = useState(new Set())

  const { dataInicio, dataFim, dias } = useMemo(() => {
    const [ano, mes] = anoMes.split('-').map(Number)
    const inicio = startOfMonth(new Date(ano, mes - 1, 1))
    const fim    = endOfMonth(inicio)
    return { dataInicio: isoData(inicio), dataFim: isoData(fim), dias: eachDayOfInterval({ start: inicio, end: fim }) }
  }, [anoMes])

  const nomeMes = cap(format(new Date(dataInicio + 'T00:00:00'), 'MMMM yyyy', { locale: pt }))

  useEffect(() => {
    if (!colaborador) return
    let activo = true
    setLoading(true)

    Promise.all([
      supabase.from('vw_colaboradores').select('id, nome, foto_url, tipo').order('nome'),
      supabase.from('espacos').select('id, nome').eq('activo', true).order('nome'),
      supabase.from('supa_eventos')
        .select('id, espaco_id, evento, data_evento, hora_inicio, hora_fim, hora_instalacao, dia_instalacao, status, tecnico_id, notas_operacionais, Equipamentos, notas_colaborador, contacto_pelo_evento, morada, tipo')
        .gte('data_evento', dataInicio).lte('data_evento', dataFim).neq('status', 'cancelado'),
      supabase.from('agendamentos_tecnicos').select('*').gte('data', dataInicio).lte('data', dataFim),
      supabase.from('agenda')
        .select('id, espaco_id, data, dj_nome, djs(nome, nome_artistico)')
        .gte('data', dataInicio).lte('data', dataFim)
        .not('estado', 'in', '("cancelado","sem_efeito","faltou")'),
    ])
      .then(async ([tRes, eRes, evRes, agRes, slRes]) => {
        if (!activo) return
        const tecs   = tRes.data ?? []
        const evs    = evRes.data ?? []
        setTecnicos(tecs)
        setEspacos(eRes.data ?? [])
        setAgends(agRes.data ?? [])
        setSlots(slRes.data ?? [])
        setMapaTec(Object.fromEntries(tecs.map(t => [t.id, t])))

        if (evs.length > 0) {
          const { data: etData } = await supabase
            .from('evento_tecnicos').select('evento_id, tecnico_id').in('evento_id', evs.map(e => e.id))
          setEvTecs(etData ?? [])
          setEventos(evs)  // todos os eventos do mês

          // IDs dos eventos onde o colaborador está incluído
          const viaJuncao = new Set((etData ?? []).filter(r => r.tecnico_id === colaborador.id).map(r => r.evento_id))
          const viaResp   = new Set(evs.filter(e => e.tecnico_id === colaborador.id).map(e => e.id))
          setMeusIds(new Set([...viaJuncao, ...viaResp]))
        } else {
          setEvTecs([]); setEventos([]); setMeusIds(new Set())
        }
      })
      .catch(console.error)
      .finally(() => activo && setLoading(false))

    return () => { activo = false }
  }, [colaborador, dataInicio, dataFim])

  // Índices
  const tecCorMap = useMemo(() => {
    const m = {}
    tecnicos.forEach((t, i) => { m[t.id] = corTecnico(t.nome, i) })
    return m
  }, [tecnicos])

  const evTecIdx = useMemo(() => {
    const m = {}
    evTecnicos.forEach(({ evento_id, tecnico_id }) => {
      if (!m[evento_id]) m[evento_id] = []
      if (!m[evento_id].includes(tecnico_id)) m[evento_id].push(tecnico_id)
    })
    return m
  }, [evTecnicos])

  const folgasIdx = useMemo(() => {
    const m = {}
    agendamentos.filter(a => a.folga).forEach(a => {
      if (!m[a.data]) m[a.data] = []
      m[a.data].push(a.tecnico_id)
    })
    return m
  }, [agendamentos])

  const djIdx = useMemo(() => {
    const m = {}
    slots.forEach(s => {
      const nome = s.djs?.nome_artistico ?? s.djs?.nome ?? s.dj_nome
      if (!nome) return
      const k = `${s.data}|${s.espaco_id}`
      if (!m[k]) m[k] = []
      if (!m[k].includes(nome)) m[k].push(nome)
    })
    return m
  }, [slots])

  const i4djEspacoId = useMemo(() => espacos.find(e => e.nome?.trim().toLowerCase() === 'lmd')?.id ?? null, [espacos])

  const tecnicosFixos = useMemo(() => tecnicos.filter(t => t.tipo === 'fixo'), [tecnicos])

  const lmdPorDia = useMemo(() => {
    const m = {}
    dias.forEach(dia => {
      const dataStr   = isoData(dia)
      const folgasHoje = new Set(folgasIdx[dataStr] ?? [])
      const atribuidos = new Set(
        evTecnicos.filter(et => {
          const ev = eventos.find(e => e.id === et.evento_id)
          return ev?.data_evento === dataStr
        }).map(et => et.tecnico_id)
      )
      const livres = tecnicosFixos.filter(t => !folgasHoje.has(t.id) && !atribuidos.has(t.id)).map(t => t.id)
      m[dataStr] = livres
    })
    return m
  }, [dias, folgasIdx, evTecnicos, eventos, tecnicosFixos])

  // Filtrar eventos para exibição
  const eventosFiltrados = useMemo(() => {
    let evs = filtroMeu ? eventos.filter(e => meusIds.has(e.id)) : eventos
    if (filtroEspaco) evs = evs.filter(e => e.espaco_id === filtroEspaco)
    if (pesquisa.trim()) {
      const q = pesquisa.trim().toLowerCase()
      evs = evs.filter(e =>
        (e.evento ?? '').toLowerCase().includes(q) ||
        (espacos.find(s => s.id === e.espaco_id)?.nome ?? '').toLowerCase().includes(q)
      )
    }
    return evs
  }, [eventos, filtroMeu, meusIds, filtroEspaco, pesquisa, espacos])

  // Agrupar por dia
  const linhasPorDia = useMemo(() => {
    const evPorDia = {}
    eventosFiltrados.forEach(ev => {
      if (!evPorDia[ev.data_evento]) evPorDia[ev.data_evento] = []
      evPorDia[ev.data_evento].push(ev)
    })
    return dias
      .map(dia => {
        const dataStr = isoData(dia)
        const evs = evPorDia[dataStr] ?? []
        const folgas = folgasIdx[dataStr] ?? []
        return { dataStr, evs, folgas }
      })
      .filter(d => !ocultarVazios || d.evs.length > 0 || d.folgas.includes(colaborador?.id))
  }, [dias, eventosFiltrados, folgasIdx, colaborador, ocultarVazios])

  // Espaços com actividade no mês (para filtros)
  // Espaços activos — baseados nos eventos do filtro corrente (meus ou todos)
  const espacosActivos = useMemo(() => {
    const base = filtroMeu ? eventos.filter(e => meusIds.has(e.id)) : eventos
    const ids  = new Set(base.map(e => e.espaco_id))
    return espacos.filter(e => ids.has(e.id))
  }, [espacos, eventos, filtroMeu, meusIds])

  const thCls = 'px-2 py-2 text-left text-[11px] font-bold text-accent-subtle uppercase tracking-widest whitespace-nowrap'

  if (loading) return <LoadingPage />

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Header: mês + filtros ── */}
      <div className="shrink-0 border-b border-border/50 bg-surface-0/40">

        {/* Navegação de mês + pesquisa + toggle */}
        <div className="px-4 py-2 flex items-center gap-2 border-b border-border/30 flex-wrap">
          <button onClick={() => navegar(-1)}
            className="p-1.5 rounded bg-surface-2 border border-border hover:bg-surface-3 transition-colors shrink-0">
            <ChevronLeft size={14} />
          </button>
          <span className="text-sm font-bold text-accent capitalize min-w-[130px] text-center">{nomeMes}</span>
          <button onClick={() => navegar(1)}
            className="p-1.5 rounded bg-surface-2 border border-border hover:bg-surface-3 transition-colors shrink-0">
            <ChevronRight size={14} />
          </button>
          {/* Toggle ícones */}
          <div className="flex border border-border rounded-lg overflow-hidden shrink-0">
            <button onClick={() => setOcultar(false)} title="Todos os dias"
              className={clsx('px-2.5 py-1.5 transition-colors', !ocultarVazios ? 'bg-amber-400/20 text-amber-400' : 'text-accent-muted hover:text-accent bg-surface-2')}>
              <Eye size={15} />
            </button>
            <button onClick={() => setOcultar(true)} title="Ocultar dias vazios"
              className={clsx('px-2.5 py-1.5 border-l border-border transition-colors', ocultarVazios ? 'bg-amber-400/20 text-amber-400' : 'text-accent-muted hover:text-accent bg-surface-2')}>
              <EyeOff size={15} />
            </button>
          </div>
          <div className="relative ml-auto">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-accent-subtle pointer-events-none" />
            <input type="text" placeholder="Pesquisar…" value={pesquisa} onChange={e => setPesquisa(e.target.value)}
              className="pl-8 pr-7 py-1.5 bg-surface-2 border border-border rounded text-xs text-accent placeholder:text-accent-subtle/50 focus:outline-none focus:border-white/20 w-36" />
            {pesquisa && (
              <button onClick={() => setPesquisa('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-accent-subtle hover:text-accent">
                <X size={11} />
              </button>
            )}
          </div>
        </div>

        {/* Filtro colaborador + clientes */}
        <div className="px-4 py-2 flex items-center gap-1 flex-wrap border-b border-border/30">
          <span className="text-[10px] font-semibold text-accent-subtle uppercase tracking-widest mr-1">Apoio</span>
          <button onClick={() => setFiltroMeu(false)}
            className={clsx('px-3 py-1.5 rounded text-xs border',
              !filtroMeu ? 'bg-surface-3 text-accent border-white/20 font-medium' : 'bg-surface-2 text-accent-muted border-border')}>
            Todos
          </button>
          {colaborador && (
            <button onClick={() => setFiltroMeu(true)}
              className={clsx('px-3 py-1.5 rounded text-xs border font-medium',
                filtroMeu
                  ? (tecCorMap[colaborador.id]?.chip ?? 'bg-amber-400/15 text-amber-400 border-amber-400/30')
                  : 'bg-surface-2 text-accent-muted border-border')}>
              {colaborador.nome}
            </button>
          )}
          {espacosActivos.length > 0 && (
            <>
              <span className="text-[10px] font-semibold text-accent-subtle uppercase tracking-widest ml-3 mr-1">Cliente</span>
              <select value={filtroEspaco} onChange={e => setFiltro(e.target.value)}
                className="bg-surface-2 border border-border rounded px-2 py-1.5 text-xs text-accent focus:outline-none focus:border-white/20">
                <option value="">Todos</option>
                {espacosActivos.map(e => <option key={e.id} value={e.id}>{e.nome.trim()}</option>)}
              </select>
            </>
          )}
        </div>
      </div>

      {/* Aviso landscape (mobile portrait) */}
      {portrait && (
        <div className="mx-4 mb-2 flex items-center gap-2 rounded-xl bg-amber-400/10 border border-amber-400/20 px-3 py-2 text-amber-400/80">
          <RotateCcw size={14} className="shrink-0" />
          <p className="text-xs">Roda o telemóvel para melhor visibilidade</p>
        </div>
      )}

      {/* ── Tabela ── */}
      <div className={clsx('flex-1 overflow-auto', !portrait ? 'text-[10px]' : '')}>
        {linhasPorDia.length === 0 ? (
          <p className="text-center text-accent-subtle/40 py-16 text-sm">
            {pesquisa || filtroEspaco ? 'Nenhum resultado.' : 'Sem eventos neste mês.'}
          </p>
        ) : (
          <table className="w-full text-xs border-collapse" style={{ minWidth: '100%' }}>
            <colgroup>
              <col style={{ width: 100 }} />
              <col style={{ width: 110 }} />
              <col style={{ width: 130 }} />
              <col style={{ minWidth: 200 }} />
              <col style={{ width: 74 }} />
              <col style={{ width: 74 }} />
              <col style={{ width: 120 }} />
              <col style={{ width: 100 }} />
              {i4djEspacoId && <col style={{ width: 90 }} />}
            </colgroup>
            <thead className="sticky top-0 z-10 bg-surface-2 border-b-2 border-border">
              <tr>
                <th className={thCls}>Dia</th>
                <th className={thCls}>Técnico</th>
                <th className={thCls}>Cliente</th>
                <th className={thCls}>Evento</th>
                <th className={clsx(thCls, 'text-center')}>Hora Inst.</th>
                <th className={clsx(thCls, 'text-center')}>Início</th>
                <th className={thCls}>DJ</th>
                {i4djEspacoId && <th className={clsx(thCls, 'border-l border-red-500/30 text-red-400/70')}>LMD</th>}
                <th className={clsx(thCls, 'border-l border-border/60')}>Folga</th>
              </tr>
            </thead>
            <tbody>
              {linhasPorDia.flatMap(({ dataStr, evs, folgas }, dayIdx) => {
                const zebraCls  = dayIdx % 2 === 1 ? 'bg-white/[0.04]' : ''
                const isWeekend = [0, 6].includes(new Date(dataStr + 'T00:00:00').getDay())
                const tecsFolga = folgas.map(id => ({ id, tec: tecnicos.find(t => t.id === id) })).filter(x => x.tec)
                const rowSpan   = Math.max(evs.length, 1)
                const linhas    = evs.length > 0 ? evs : [null]

                const isHoje = dataStr === hojeStr
                return linhas.map((ev, li) => {
                  const espaco  = ev ? espacos.find(e => e.id === ev.espaco_id) : null
                  const tecIds  = ev ? (evTecIdx[ev.id] ?? (ev.tecnico_id ? [ev.tecnico_id] : [])) : []
                  const djNomes = ev ? (djIdx[`${dataStr}|${ev.espaco_id}`] ?? []) : []

                  return (
                    <tr key={ev ? ev.id : `${dataStr}-empty`}
                      onClick={() => ev && setAberto(ev)}
                      className={clsx(
                        'hover:bg-surface-2/20 align-middle',
                        ev && 'cursor-pointer',
                        li < linhas.length - 1 ? 'border-b border-border/10' : 'border-b border-border/20',
                        isHoje
                          ? 'bg-zinc-400/25'
                          : clsx(zebraCls, isWeekend && 'bg-amber-400/[0.03]'),
                      )}>

                      {li === 0 && (
                        <td rowSpan={rowSpan}
                          className={clsx('px-3 py-2 font-medium whitespace-nowrap align-top border-r border-border/40',
                            isWeekend ? 'text-amber-400/80' : 'text-accent-muted')}>
                          {nomeDia(dataStr)}
                        </td>
                      )}

                      {/* Técnicos */}
                      <td className="px-2 py-1.5">
                        <div className="flex flex-nowrap gap-1 overflow-hidden">
                          {tecIds.length === 0
                            ? <span className="text-border/30 text-[10px]">—</span>
                            : tecIds.map(tid => {
                                const t = tecnicos.find(x => x.id === tid)
                                const tidx = tecnicos.findIndex(x => x.id === tid)
                                return t ? <TecChip key={tid} nome={t.nome} cor={tecCorMap[tid]} idx={tidx} /> : null
                              })
                          }
                        </div>
                      </td>

                      {/* Cliente */}
                      <td className="px-2 py-2 font-medium whitespace-nowrap text-accent-muted">
                        {espaco?.nome?.trim() ?? ''}
                      </td>

                      {/* Evento — clicável */}
                      <td className="px-2 py-2 text-accent-muted">
                        {ev ? (
                          <button onClick={() => setAberto(ev)}
                            className="text-left leading-snug line-clamp-2">
                            {ev.evento}
                          </button>
                        ) : null}
                      </td>

                      {/* Hora inst. */}
                      <td className="px-2 py-2 text-center tabular-nums text-accent-subtle whitespace-nowrap font-medium">
                        {ev?.hora_instalacao ? hhmm(ev.hora_instalacao) : ev ? <span className="text-border/20">—</span> : null}
                      </td>

                      {/* Hora início */}
                      <td className="px-2 py-2 text-center tabular-nums text-accent-subtle whitespace-nowrap">
                        {ev?.hora_inicio ? hhmm(ev.hora_inicio) : ev ? <span className="text-border/20">—</span> : null}
                      </td>

                      {/* DJ */}
                      <td className="px-2 py-2 text-accent-muted whitespace-nowrap">
                        {ev ? (djNomes.length ? djNomes.join(' · ') : <span className="text-border/20">—</span>) : null}
                      </td>

                      {/* LMD — rowSpan */}
                      {li === 0 && i4djEspacoId && (
                        <td rowSpan={rowSpan}
                          className="px-2 py-2 border-l border-red-500/20 align-middle whitespace-nowrap">
                          <span className="flex flex-nowrap gap-1 overflow-hidden">
                            {(lmdPorDia[dataStr] ?? []).map(tid => {
                              const tec = tecnicos.find(t => t.id === tid)
                              if (!tec) return null
                              return (
                                <span key={tid} className={clsx(
                                  'inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-semibold border shrink-0',
                                  tecCorMap[tid]?.chip ?? 'bg-red-400/15 text-red-400 border-red-400/30'
                                )}>{tec.nome}</span>
                              )
                            })}
                            {(lmdPorDia[dataStr] ?? []).length === 0 && <span className="text-border/20 text-[10px]">—</span>}
                          </span>
                        </td>
                      )}

                      {/* Folga — rowSpan — última coluna */}
                      {li === 0 && (
                        <td rowSpan={rowSpan}
                          className="px-2 py-2 border-l border-border/40 whitespace-nowrap align-middle">
                          {tecsFolga.length > 0
                            ? <span className="flex flex-nowrap gap-1 overflow-hidden">
                                {tecsFolga.map(({ id, tec }) => (
                                  <TecChip key={id} nome={tec.nome} cor={tecCorMap[id]} idx={tecnicos.findIndex(t => t.id === id)} />
                                ))}
                              </span>
                            : <span className="text-border/20 text-[10px]">—</span>
                          }
                        </td>
                      )}
                    </tr>
                  )
                })
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal do evento */}
      {eventoAberto && (
        <EventoModal
          evento={{
            ...eventoAberto,
            _tecnicosIds: evTecIdx[eventoAberto.id] ?? (eventoAberto.tecnico_id ? [eventoAberto.tecnico_id] : []),
            espacos: espacos.find(e => e.id === eventoAberto.espaco_id) ? { nome: espacos.find(e => e.id === eventoAberto.espaco_id)?.nome } : null,
          }}
          mapaTecnicos={Object.fromEntries(tecnicos.map(t => [t.id, t.nome]))}
          onFechar={() => setAberto(null)}
        />
      )}
    </div>
  )
}
