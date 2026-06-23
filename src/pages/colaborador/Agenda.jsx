import { useState, useEffect, useMemo } from 'react'
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  startOfWeek, endOfWeek, addDays, addWeeks, subWeeks,
  isSameMonth, parseISO,
} from 'date-fns'
import { pt } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, CalendarDays, CalendarRange, List, Star, Wrench, X, PenLine, Package } from 'lucide-react'
import { clsx } from 'clsx'
import { supabase } from '@/lib/supabase'
import { useMesStore, useColaboradorStore } from '@/store'
import { EventoModal } from '@/components/colaborador/EventoModal'
import { LoadingPage } from '@/components/ui/LoadingSpinner'
import { corTecnico } from '@/utils/tecnicoColor'
import { useAssinaturaDia } from '@/hooks/useAssinaturaDia'

const isoData = (d) => format(d, 'yyyy-MM-dd')
const hhmm    = (t) => t?.slice(0, 5) ?? null
const cap     = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : ''
const hojeStr = isoData(new Date())

const NOMES_DIA_ABREV   = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']
const NOMES_DIA_SEMANA  = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado']

// ── Pill de evento ────────────────────────────────────────────────────────────
function PillEvento({ ev, espaco, meu, tecNome, tecCor, compact = false, onClick }) {
  const instalar = hhmm(ev.hora_instalacao)
  const inicio   = hhmm(ev.hora_inicio)
  return (
    <button onClick={onClick}
      className={clsx(
        'w-full text-left rounded-lg border transition-all active:scale-[0.98]',
        meu
          ? 'bg-amber-400/[0.06] border-amber-400/25 hover:border-amber-400/40'
          : 'bg-surface-2/60 border-border/60 hover:border-white/15',
        compact ? 'px-2 py-1.5' : 'px-3 py-2',
      )}>
      {/* Linha 1: espaço + técnico */}
      <div className="flex items-center justify-between gap-1 min-w-0">
        <span className={clsx('font-bold truncate text-accent', compact ? 'text-[12px]' : 'text-[13px]')}>
          {espaco}
        </span>
        <span className="flex items-center gap-1 shrink-0">
          {meu && (
            <span className="text-[12px] font-bold text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded px-1 py-0.5 leading-none">
              Meu
            </span>
          )}
          {tecNome && (
            <span className="flex items-center gap-0.5 text-[12px]">
              <span className={clsx('w-1.5 h-1.5 rounded-full shrink-0', tecCor?.dot ?? 'bg-slate-400')} />
              <span className={clsx('font-semibold', tecCor?.text ?? 'text-slate-400')}>{tecNome.split(' ')[0]}</span>
            </span>
          )}
        </span>
      </div>
      {/* Linha 2: nome do evento */}
      <p className={clsx('truncate mt-0.5', compact ? 'text-[11px] text-accent-subtle' : 'text-[12px] text-accent-muted')}>{ev.evento}</p>
      {/* Linha 3: horários */}
      {(instalar || inicio) && (
        <div className="flex items-center gap-1.5 mt-1" style={{ fontSize: 10, color: '#64748b' }}>
          {instalar && <span className="flex items-center gap-0.5"><Wrench size={9} className="text-amber-400/70" />{instalar}</span>}
          {instalar && inicio && <span>·</span>}
          {inicio && <span>{inicio}</span>}
        </div>
      )}
    </button>
  )
}

// ── Pill LMD ─────────────────────────────────────────────────────────────────
function PillLmd({ onClick, comBotao = false }) {
  return (
    <button onClick={onClick}
      className="w-full text-left rounded-lg px-2 py-1.5 border border-indigo-500/20 bg-indigo-500/[0.06] hover:border-indigo-500/35 transition-all active:scale-[0.98]">
      <div className="flex items-center gap-1.5">
        <Package size={10} className="text-indigo-400 shrink-0" />
        <span className="text-[12px] font-bold text-indigo-400">LMD</span>
        {comBotao && <span className="ml-auto text-[12px] text-indigo-400/60">assinar →</span>}
      </div>
    </button>
  )
}

// ── Modal LMD ─────────────────────────────────────────────────────────────────
function ModalLmd({ dataStr, proxima, registar, onFechar }) {
  const [loading, setLoading] = useState(false)
  const nomeDia   = cap(format(parseISO(dataStr), 'EEEE, d MMMM', { locale: pt }))
  const podeAssinar = proxima?.tipo === 'lmd_saida'

  const assinar = async () => {
    setLoading(true)
    await registar('lmd_saida', { agendamentoId: proxima?.agendamentoId })
    setLoading(false)
    onFechar()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onFechar} />
      <div className="relative z-10 w-full max-w-sm bg-surface-1 border border-indigo-500/20 rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-5 pt-4 pb-3 border-b border-border/40 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
            <Package size={16} className="text-indigo-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-black text-accent text-[15px]">LMD — Armazém</p>
            <p className="text-[13px] text-accent-subtle capitalize">{nomeDia}</p>
          </div>
          <button onClick={onFechar}
            className="w-8 h-8 rounded-full bg-surface-2 border border-border flex items-center justify-center text-accent-subtle hover:text-accent transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="px-5 py-4">
          {podeAssinar ? (
            <button onClick={assinar} disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-red-400/30 bg-red-400/[0.07] text-red-400 text-[15px] font-semibold hover:opacity-80 disabled:opacity-50 transition-opacity">
              <PenLine size={15} />
              {loading ? 'A registar…' : 'Saída LMD'}
            </button>
          ) : (
            <p className="text-[15px] text-accent-subtle text-center py-2">Sem ação pendente para o LMD.</p>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Vista Mês ─────────────────────────────────────────────────────────────────
function VistaMes({ anoMes, dias, eventosPorDia, lmdPorDia, meusIds, espacosIdx, tecnicos, tecCorMap, evTecIdx, colaborador, onEventoClick, onDiaClick }) {
  const semanas = useMemo(() => {
    const rows = []
    let i = 0
    while (i < dias.length) { rows.push(dias.slice(i, i + 7)); i += 7 }
    return rows
  }, [dias])

  const [ano, mes] = anoMes.split('-').map(Number)
  const mesRef = new Date(ano, mes - 1)

  return (
    <div className="flex-1 overflow-auto">
      <div className="grid grid-cols-7 border-b border-border/40 bg-surface-1/60 sticky top-0 z-10">
        {['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'].map(d => (
          <div key={d} className="py-1.5 text-center text-[12px] font-bold text-accent-subtle uppercase tracking-widest">{d}</div>
        ))}
      </div>
      {semanas.map((semana, si) => (
        <div key={si} className="grid grid-cols-7 border-b border-border/20" style={{ minHeight: 80 }}>
          {semana.map(dia => {
            const dataStr    = isoData(dia)
            const noMes      = isSameMonth(dia, mesRef)
            const isHoje     = dataStr === hojeStr
            const evs        = eventosPorDia[dataStr] ?? []
            const temMeuLmd  = (lmdPorDia[dataStr] ?? []).includes(colaborador?.id)
            return (
              <div key={dataStr} onClick={() => onDiaClick(dataStr)}
                className={clsx(
                  'border-r border-border/20 last:border-r-0 p-1 cursor-pointer hover:bg-surface-2/40 transition-colors',
                  !noMes && 'opacity-30',
                  isHoje && 'bg-amber-400/[0.04]',
                )}>
                <div className={clsx(
                  'w-6 h-6 flex items-center justify-center rounded-full text-[12px] font-bold mb-1 mx-auto',
                  isHoje ? 'bg-amber-400 text-black' : 'text-accent-muted',
                )}>
                  {dia.getDate()}
                </div>
                {temMeuLmd && (
                  <div className="mb-0.5 rounded px-1 py-0.5 bg-indigo-500/[0.08] border border-indigo-500/20">
                    <span className="text-[12px] font-bold text-indigo-400">LMD</span>
                  </div>
                )}
                <div className="flex flex-col gap-0.5">
                  {evs.slice(0, 2).map(ev => {
                    const meu    = meusIds.has(ev.id)
                    const espaco = espacosIdx[ev.espaco_id]?.nome ?? ''
                    const tecIds = evTecIdx[ev.id] ?? (ev.tecnico_id ? [ev.tecnico_id] : [])
                    return (
                      <button key={ev.id}
                        onClick={e => { e.stopPropagation(); onEventoClick(ev) }}
                        className={clsx(
                          'w-full text-left rounded px-1 py-0.5 leading-none border transition-colors',
                          meu
                            ? 'bg-amber-400/10 border-amber-400/20 text-amber-300'
                            : 'bg-surface-3/60 border-border/40 text-accent-subtle',
                        )}
                        style={{ fontSize: 10 }}>
                        <span className="flex items-center gap-0.5">
                          {tecIds.slice(0, 2).map(tid => {
                            const cor = tecCorMap[tid]
                            return cor ? <span key={tid} className={clsx('w-1.5 h-1.5 rounded-full shrink-0', cor.dot)} /> : null
                          })}
                          <span className="truncate">{espaco || ev.evento}</span>
                        </span>
                      </button>
                    )
                  })}
                  {evs.length > 2 && (
                    <span className="text-[12px] text-accent-subtle/50 text-center">+{evs.length - 2}</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

// ── Vista Semana ──────────────────────────────────────────────────────────────
function PillLmdCard({ lmdIds, tecnicos, tecCorMap }) {
  if (!lmdIds || lmdIds.length === 0) return null
  return (
    <div className="shrink-0 flex flex-col gap-0.5 px-1 pb-0.5">
      {lmdIds.map(tid => {
        const tec = tecnicos.find(t => t.id === tid)
        if (!tec) return null
        const cor = tecCorMap[tid]
        return (
          <div key={tid} className="rounded border border-red-400/20 bg-red-400/[0.07] px-1.5 py-1 flex items-center gap-1">
            <span className={clsx('w-1.5 h-1.5 rounded-full shrink-0', cor?.dot ?? 'bg-red-400')} />
            <span className={clsx('text-[10px] font-semibold truncate', cor?.text ?? 'text-red-400')}>{tec.nome.split(' ')[0]}</span>
            <span className="text-[9px] text-red-400/70 ml-auto shrink-0">10:00–19:00</span>
          </div>
        )
      })}
    </div>
  )
}

function PillFolgaCard({ folgaIds, tecnicos, tecCorMap }) {
  if (!folgaIds || folgaIds.length === 0) return null
  return (
    <div className="shrink-0 flex flex-col gap-0.5 px-1 pb-1">
      {folgaIds.map(tid => {
        const tec = tecnicos.find(t => t.id === tid)
        if (!tec) return null
        const cor = tecCorMap[tid]
        return (
          <div key={tid} className="rounded border border-green-400/20 bg-green-400/[0.07] px-1.5 py-1 flex items-center gap-1">
            <span className={clsx('w-1.5 h-1.5 rounded-full shrink-0', cor?.dot ?? 'bg-green-400')} />
            <span className={clsx('text-[10px] font-semibold truncate', cor?.text ?? 'text-green-400')}>{tec.nome.split(' ')[0]}</span>
            <span className="text-[9px] text-green-400/70 ml-auto shrink-0">Boa folga!</span>
          </div>
        )
      })}
    </div>
  )
}

function VistaSemana({ semana7, paisagem, diaSeleccionado, setDiaSeleccionado, eventosPorDia, lmdPorDia, folgasIdx, meusIds, espacosIdx, tecnicos, tecCorMap, evTecIdx, colaborador, onEventoClick, onLmdClick }) {

  if (!paisagem) {
    // Portrait: strip de 7 dias + detalhe
    const evsDia    = eventosPorDia[diaSeleccionado] ?? []
    const temMeuLmd = (lmdPorDia[diaSeleccionado] ?? []).includes(colaborador?.id)

    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Day strip — grid fixo 7 colunas para garantir que o Domingo aparece */}
        <div className="shrink-0 grid grid-cols-7 gap-0.5 px-2 py-2 border-b border-border/40">
          {semana7.map(dataStr => {
            const dt     = parseISO(dataStr)
            const isHoje = dataStr === hojeStr
            const isSel  = dataStr === diaSeleccionado
            const temEvs = (eventosPorDia[dataStr] ?? []).length > 0
            return (
              <button key={dataStr} onClick={() => setDiaSeleccionado(dataStr)}
                className={clsx(
                  'flex flex-col items-center gap-0.5 py-1.5 rounded-xl border transition-all',
                  isSel ? 'bg-amber-400/15 border-amber-400/40 text-amber-400'
                    : isHoje ? 'bg-surface-2 border-amber-400/20 text-accent'
                    : 'bg-surface-2/40 border-border/40 text-accent-subtle hover:text-accent',
                )}>
                <span className="text-[10px] font-semibold uppercase">{NOMES_DIA_ABREV[dt.getDay()]}</span>
                <span className={clsx('w-6 h-6 flex items-center justify-center rounded-full text-[13px] font-black', isHoje && !isSel && 'text-amber-400')}>
                  {dt.getDate()}
                </span>
                {temEvs && <span className={clsx('w-1 h-1 rounded-full', isSel ? 'bg-amber-400' : 'bg-accent-subtle/50')} />}
              </button>
            )
          })}
        </div>
        {/* Detalhe */}
        <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2">
          {temMeuLmd && <PillLmd onClick={() => onLmdClick(diaSeleccionado)} comBotao={false} />}
          {evsDia.length === 0 && !temMeuLmd
            ? <p className="text-center text-accent-subtle/40 text-[15px] py-8">Sem eventos.</p>
            : evsDia.map(ev => {
                const meu    = meusIds.has(ev.id)
                const espaco = espacosIdx[ev.espaco_id]?.nome ?? ''
                const tecIds = evTecIdx[ev.id] ?? (ev.tecnico_id ? [ev.tecnico_id] : [])
                const tec    = tecnicos.find(t => t.id === tecIds[0])
                return (
                  <PillEvento key={ev.id} ev={ev} espaco={espaco} meu={meu}
                    tecNome={tec?.nome ?? null} tecCor={tec ? tecCorMap[tec.id] : null}
                    onClick={() => onEventoClick(ev)} />
                )
              })
          }
          <PillLmdCard lmdIds={lmdPorDia[diaSeleccionado]} tecnicos={tecnicos} tecCorMap={tecCorMap} />
          <PillFolgaCard folgaIds={folgasIdx?.[diaSeleccionado]} tecnicos={tecnicos} tecCorMap={tecCorMap} />
        </div>
      </div>
    )
  }

  // Landscape: 7 cards lado a lado
  return (
    <div className="flex-1 flex overflow-x-auto">
      {semana7.map(dataStr => {
        const dt        = parseISO(dataStr)
        const isHoje    = dataStr === hojeStr
        const evs       = eventosPorDia[dataStr] ?? []
        const temMeuLmd = (lmdPorDia[dataStr] ?? []).includes(colaborador?.id)
        return (
          <div key={dataStr}
            className={clsx(
              'flex-1 min-w-[120px] border-r border-border/30 last:border-r-0 flex flex-col',
              isHoje && 'bg-amber-400/[0.03]',
            )}>
            <div className={clsx('px-2 py-1.5 border-b border-border/30 text-center', isHoje ? 'bg-amber-400/10' : 'bg-surface-2/40')}>
              <p className="text-[12px] font-bold text-accent-subtle uppercase">{NOMES_DIA_ABREV[dt.getDay()]}</p>
              <p className={clsx('text-[13px] font-black', isHoje ? 'text-amber-400' : 'text-accent')}>{dt.getDate()}</p>
            </div>
            <div className="flex-1 flex flex-col gap-1 p-1 overflow-y-auto">
              {temMeuLmd && <PillLmd onClick={() => onLmdClick(dataStr)} />}
              {evs.map(ev => {
                const meu    = meusIds.has(ev.id)
                const espaco = espacosIdx[ev.espaco_id]?.nome ?? ''
                const tecIds = evTecIdx[ev.id] ?? (ev.tecnico_id ? [ev.tecnico_id] : [])
                const tec    = tecnicos.find(t => t.id === tecIds[0])
                return (
                  <PillEvento key={ev.id} ev={ev} espaco={espaco} meu={meu}
                    tecNome={tec?.nome ?? null} tecCor={tec ? tecCorMap[tec.id] : null} compact
                    onClick={() => onEventoClick(ev)} />
                )
              })}
            </div>
            <PillLmdCard lmdIds={lmdPorDia[dataStr]} tecnicos={tecnicos} tecCorMap={tecCorMap} />
            <PillFolgaCard folgaIds={folgasIdx?.[dataStr]} tecnicos={tecnicos} tecCorMap={tecCorMap} />
          </div>
        )
      })}
    </div>
  )
}

// ── Vista Dia ─────────────────────────────────────────────────────────────────
function VistaDia({ diaSeleccionado, eventosPorDia, lmdPorDia, meusIds, espacosIdx, tecnicos, tecCorMap, evTecIdx, colaborador, onEventoClick, onLmdClick }) {
  const evsDia    = eventosPorDia[diaSeleccionado] ?? []
  const temMeuLmd = (lmdPorDia[diaSeleccionado] ?? []).includes(colaborador?.id)
  const nomeDia   = cap(format(parseISO(diaSeleccionado), 'EEEE, d MMMM', { locale: pt }))
  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2">
      <p className="text-[12px] font-bold uppercase tracking-widest text-accent-subtle capitalize mb-1">{nomeDia}</p>
      {temMeuLmd && <PillLmd onClick={() => onLmdClick(diaSeleccionado)} comBotao />}
      {evsDia.length === 0 && !temMeuLmd
        ? <p className="text-center text-accent-subtle/40 text-[15px] py-8">Sem eventos neste dia.</p>
        : evsDia.map(ev => {
            const meu    = meusIds.has(ev.id)
            const espaco = espacosIdx[ev.espaco_id]?.nome ?? ''
            const tecIds = evTecIdx[ev.id] ?? (ev.tecnico_id ? [ev.tecnico_id] : [])
            const tec    = tecnicos.find(t => t.id === tecIds[0])
            return (
              <PillEvento key={ev.id} ev={ev} espaco={espaco} meu={meu}
                tecNome={tec?.nome ?? null} tecCor={tec ? tecCorMap[tec.id] : null}
                onClick={() => onEventoClick(ev)} />
            )
          })
      }
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────
export function ColaboradorAgenda() {
  const { anoMes, navegar }   = useMesStore()
  const { colaborador }       = useColaboradorStore()

  const [vista, setVista]             = useState('semana')
  const [diaSeleccionado, setDiaSelec] = useState(hojeStr)
  const [filtroMeu, setFiltroMeu]     = useState(false)
  const [eventoAberto, setAberto]     = useState(null)
  const [lmdAberto, setLmdAberto]     = useState(null)
  const [loading, setLoading]         = useState(true)

  const isPaisagem = () => typeof window !== 'undefined' && window.innerWidth > window.innerHeight
  const [paisagem, setPaisagem] = useState(isPaisagem)
  useEffect(() => {
    const fn = () => setPaisagem(isPaisagem())
    window.addEventListener('resize', fn)
    window.addEventListener('orientationchange', () => setTimeout(fn, 100))
    return () => { window.removeEventListener('resize', fn); window.removeEventListener('orientationchange', fn) }
  }, [])

  const semanaBase = useMemo(() => startOfWeek(parseISO(diaSeleccionado), { weekStartsOn: 1 }), [diaSeleccionado])
  const semana7    = useMemo(() => Array.from({ length: 7 }, (_, i) => isoData(addDays(semanaBase, i))), [semanaBase])

  const { dataInicio, dataFim, dias } = useMemo(() => {
    const [ano, mes] = anoMes.split('-').map(Number)
    const inicioMes  = startOfMonth(new Date(ano, mes - 1))
    const fimMes     = endOfMonth(inicioMes)
    const inicio     = startOfWeek(inicioMes, { weekStartsOn: 1 })
    const fim        = endOfWeek(fimMes, { weekStartsOn: 1 })
    return { dataInicio: isoData(inicio), dataFim: isoData(fim), dias: eachDayOfInterval({ start: inicio, end: fim }) }
  }, [anoMes])

  const nomeMes = cap(format(new Date(dataInicio + 'T00:00:00'), 'MMMM yyyy', { locale: pt }))

  const [tecnicos, setTecnicos]   = useState([])
  const [eventos, setEventos]     = useState([])
  const [evTecnicos, setEvTecs]   = useState([])
  const [agendamentos, setAgends] = useState([])
  const [espacos, setEspacos]     = useState([])
  const [meusIds, setMeusIds]     = useState(new Set())

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
    ]).then(async ([tRes, eRes, evRes, agRes]) => {
      if (!activo) return
      const tecs = tRes.data ?? []
      const evs  = evRes.data ?? []
      setTecnicos(tecs)
      setEspacos(eRes.data ?? [])
      setAgends(agRes.data ?? [])
      if (evs.length > 0) {
        const { data: etData } = await supabase
          .from('evento_tecnicos').select('evento_id, tecnico_id').in('evento_id', evs.map(e => e.id))
        setEvTecs(etData ?? [])
        setEventos(evs)
        const viaJuncao = new Set((etData ?? []).filter(r => r.tecnico_id === colaborador.id).map(r => r.evento_id))
        const viaResp   = new Set(evs.filter(e => e.tecnico_id === colaborador.id).map(e => e.id))
        setMeusIds(new Set([...viaJuncao, ...viaResp]))
      } else {
        setEvTecs([]); setEventos([]); setMeusIds(new Set())
      }
    }).catch(console.error).finally(() => activo && setLoading(false))
    return () => { activo = false }
  }, [colaborador, dataInicio, dataFim])

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

  const espacosIdx  = useMemo(() => Object.fromEntries(espacos.map(e => [e.id, e])), [espacos])
  const tecFixos    = useMemo(() => tecnicos.filter(t => t.tipo === 'fixo'), [tecnicos])

  const folgasIdx = useMemo(() => {
    const m = {}
    agendamentos.filter(a => a.folga).forEach(a => {
      if (!m[a.data]) m[a.data] = []
      m[a.data].push(a.tecnico_id)
    })
    return m
  }, [agendamentos])

  const lmdPorDia = useMemo(() => {
    const m = {}
    dias.forEach(dia => {
      const dataStr    = isoData(dia)
      const folgasHoje = new Set(folgasIdx[dataStr] ?? [])
      const atribuidos = new Set(
        evTecnicos.filter(et => eventos.find(e => e.id === et.evento_id)?.data_evento === dataStr).map(et => et.tecnico_id)
      )
      m[dataStr] = tecFixos.filter(t => !folgasHoje.has(t.id) && !atribuidos.has(t.id)).map(t => t.id)
    })
    return m
  }, [dias, folgasIdx, evTecnicos, eventos, tecFixos])

  const eventosFiltrados = useMemo(() =>
    filtroMeu ? eventos.filter(e => meusIds.has(e.id)) : eventos
  , [eventos, filtroMeu, meusIds])

  const eventosPorDia = useMemo(() => {
    const m = {}
    eventosFiltrados.forEach(ev => {
      if (!m[ev.data_evento]) m[ev.data_evento] = []
      m[ev.data_evento].push(ev)
    })
    return m
  }, [eventosFiltrados])

  const { proxima: proximaAssin, registar: registarAssin } = useAssinaturaDia(colaborador?.id ?? null)

  const navSemana = (delta) => {
    const base   = delta > 0 ? addWeeks(semanaBase, 1) : subWeeks(semanaBase, 1)
    const novaData = isoData(base)
    setDiaSelec(novaData)
    const novoMes = novaData.slice(0, 7)
    if (novoMes !== anoMes) navegar(delta)
  }

  const navDia = (delta) => {
    const novo = isoData(addDays(parseISO(diaSeleccionado), delta))
    setDiaSelec(novo)
    const novoMes = novo.slice(0, 7)
    if (novoMes !== anoMes) navegar(delta)
  }

  const onDiaClick = (dataStr) => { setDiaSelec(dataStr); setVista('dia') }

  const abrirEvento = (ev) => setAberto({
    ...ev,
    _tecnicosIds: evTecIdx[ev.id] ?? (ev.tecnico_id ? [ev.tecnico_id] : []),
    espacos: espacosIdx[ev.espaco_id] ? { nome: espacosIdx[ev.espaco_id]?.nome } : null,
  })

  const navLabel = useMemo(() => {
    if (vista === 'mes') return nomeMes
    if (vista === 'semana') {
      const d0 = cap(format(parseISO(semana7[0]), 'd MMM', { locale: pt }))
      const d6 = cap(format(parseISO(semana7[6]), 'd MMM', { locale: pt }))
      return `${d0} – ${d6}`
    }
    return cap(format(parseISO(diaSeleccionado), 'd MMMM yyyy', { locale: pt }))
  }, [vista, nomeMes, semana7, diaSeleccionado])

  if (loading) return <LoadingPage />

  return (
    <div className="flex flex-col flex-1 min-h-0" style={{ height: paisagem ? '100dvh' : 'calc(100svh - 112px)' }}>

      {/* Header */}
      <div className="shrink-0 border-b border-border/40">
        {/* Tabs + filtro */}
        <div className="flex items-center px-4 pt-2 gap-1 border-b border-border/30">
          {[
            { id: 'mes',    label: 'Mês',    Ic: CalendarRange },
            { id: 'semana', label: 'Semana', Ic: CalendarDays },
            { id: 'dia',    label: 'Dia',    Ic: List },
          ].map(({ id, label, Ic }) => (
            <button key={id} onClick={() => setVista(id)}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-2 text-[13px] font-semibold border-b-2 -mb-px transition-colors',
                vista === id ? 'border-amber-400 text-amber-400' : 'border-transparent text-accent-muted hover:text-accent',
              )}>
              <Ic size={13} />
              {label}
            </button>
          ))}
          <button onClick={() => setFiltroMeu(v => !v)}
            className={clsx(
              'ml-auto flex items-center gap-1 px-3 py-1.5 rounded-lg border text-[13px] font-semibold transition-colors',
              filtroMeu
                ? 'bg-amber-400/15 border-amber-400/30 text-amber-400'
                : 'bg-surface-2 border-border text-accent-muted hover:text-accent',
            )}>
            <Star size={13} className={filtroMeu ? 'fill-amber-400' : ''} />
          </button>
        </div>
        {/* Navegação */}
        <div className="flex items-center justify-between px-4 py-2">
          <button onClick={() => vista === 'mes' ? navegar(-1) : vista === 'semana' ? navSemana(-1) : navDia(-1)}
            className="p-1.5 rounded bg-surface-2 border border-border hover:bg-surface-3 transition-colors">
            <ChevronLeft size={14} />
          </button>
          <span className="text-[15px] font-bold text-accent capitalize">{navLabel}</span>
          <button onClick={() => vista === 'mes' ? navegar(1) : vista === 'semana' ? navSemana(1) : navDia(1)}
            className="p-1.5 rounded bg-surface-2 border border-border hover:bg-surface-3 transition-colors">
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {/* Conteúdo */}
      {vista === 'mes' && (
        <VistaMes anoMes={anoMes} dias={dias}
          eventosPorDia={eventosPorDia} lmdPorDia={lmdPorDia}
          meusIds={meusIds} espacosIdx={espacosIdx}
          tecnicos={tecnicos} tecCorMap={tecCorMap} evTecIdx={evTecIdx}
          colaborador={colaborador}
          onEventoClick={abrirEvento} onDiaClick={onDiaClick} />
      )}
      {vista === 'semana' && (
        <VistaSemana semana7={semana7} paisagem={paisagem}
          diaSeleccionado={diaSeleccionado} setDiaSeleccionado={setDiaSelec}
          eventosPorDia={eventosPorDia} lmdPorDia={lmdPorDia} folgasIdx={folgasIdx}
          meusIds={meusIds} espacosIdx={espacosIdx}
          tecnicos={tecnicos} tecCorMap={tecCorMap} evTecIdx={evTecIdx}
          colaborador={colaborador}
          onEventoClick={abrirEvento} onLmdClick={setLmdAberto} />
      )}
      {vista === 'dia' && (
        <VistaDia diaSeleccionado={diaSeleccionado}
          eventosPorDia={eventosPorDia} lmdPorDia={lmdPorDia}
          meusIds={meusIds} espacosIdx={espacosIdx}
          tecnicos={tecnicos} tecCorMap={tecCorMap} evTecIdx={evTecIdx}
          colaborador={colaborador}
          onEventoClick={abrirEvento} onLmdClick={setLmdAberto} />
      )}

      {eventoAberto && (
        <EventoModal
          evento={eventoAberto}
          mapaTecnicos={Object.fromEntries(tecnicos.map(t => [t.id, t.nome]))}
          onFechar={() => setAberto(null)}
        />
      )}
      {lmdAberto && (
        <ModalLmd dataStr={lmdAberto} proxima={proximaAssin}
          registar={registarAssin} onFechar={() => setLmdAberto(null)} />
      )}
    </div>
  )
}

