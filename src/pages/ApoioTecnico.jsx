import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { format, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns'
import { pt } from 'date-fns/locale'
import { X, Search, Columns2, AlignJustify, BarChart3, Pencil, Info, AlertTriangle } from 'lucide-react'
import { useMesStore } from '@/store'
import { supabase } from '@/lib/supabase'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { LoadingPage } from '@/components/ui/LoadingSpinner'
import { clsx } from 'clsx'
import { corTecnico } from '@/utils/tecnicoColor'
import { FormEvento } from '@/components/eventos/FormEvento'

const isoData    = (d) => format(d, 'yyyy-MM-dd')
const hhmm       = (t) => t?.slice(0, 5) ?? null
const isFds      = (d) => [5, 6].includes(new Date(d + 'T00:00:00').getDay())
const NOMES_DIA_SEMANA = { 1:'Segunda', 2:'Terça', 3:'Quarta', 4:'Quinta', 5:'Sexta', 6:'Sábado', 0:'Domingo' }
const nomeDiaSem = (d) => format(new Date(d + 'T00:00:00'), 'EEE', { locale: pt })
const dataFmt    = (d) => format(new Date(d + 'T00:00:00'), 'dd/MM')
const cap        = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s
const diaSemanaData = (d) => {
  const dt = new Date(d + 'T00:00:00')
  const nome = NOMES_DIA_SEMANA[dt.getDay()] ?? nomeDiaSem(d)
  const data = cap(format(dt, 'd MMM', { locale: pt }))
  return `${nome}, ${data}`
}

// ── Detecção de conflitos ─────────────────────────────────────────────────────
function detectarConflitos(tecnicoId, data, eventoIdActual, eventos, agendamentos, tecnicos) {
  if (!tecnicoId || !data) return []
  const tec = tecnicos.find(t => t.id === tecnicoId)
  if (!tec) return []
  const conflitos = []
  // 1. Folga nesse dia
  if (agendamentos.some(a => a.tecnico_id === tecnicoId && a.data === data && a.folga))
    conflitos.push({ tipo: 'folga', msg: `${tec.nome} está de folga neste dia.` })
  // 2. Já alocado noutro evento no mesmo dia
  const outros = eventos.filter(e => e.tecnico_id === tecnicoId && e.data_evento === data && e.id !== eventoIdActual)
  outros.forEach(ev => conflitos.push({
    tipo: 'alocado',
    msg: `${tec.nome} já está alocado em "${ev.evento}"${ev.hora_inicio ? ` às ${hhmm(ev.hora_inicio)}` : ''}.`,
  }))
  return conflitos
}

// ── Modal de conflito (abre automaticamente) ──────────────────────────────────
function ModalConflito({ conflitos, nomeTecnico, onConfirmar, onCancelar }) {
  if (!conflitos || conflitos.length === 0) return null
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-surface-1 border border-orange-500/30 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-orange-500/20 flex items-center gap-3">
          <span className="w-8 h-8 rounded-xl bg-orange-500/15 flex items-center justify-center shrink-0">
            <AlertTriangle size={16} className="text-orange-400" />
          </span>
          <div>
            <p className="text-sm font-bold text-accent">Conflito detectado</p>
            <p className="text-[11px] text-accent-subtle mt-0.5">Atribuição de {nomeTecnico}</p>
          </div>
        </div>
        <div className="px-5 py-4 flex flex-col gap-2">
          {conflitos.map((c, i) => (
            <div key={i} className={clsx(
              'flex items-start gap-2 px-3 py-2.5 rounded-xl text-xs border',
              c.tipo === 'folga'
                ? 'bg-orange-500/10 border-orange-500/20 text-orange-300'
                : 'bg-red-500/10 border-red-500/20 text-red-300'
            )}>
              <AlertTriangle size={12} className="shrink-0 mt-0.5" />
              {c.msg}
            </div>
          ))}
          <p className="text-[11px] text-accent-subtle/60 mt-1">Queres atribuir mesmo assim?</p>
        </div>
        <div className="px-5 py-3 border-t border-border flex justify-end gap-2">
          <Button variante="secundario" onClick={onCancelar}>Cancelar</Button>
          <button
            onClick={onConfirmar}
            className="px-4 py-2 rounded-lg bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/30 text-orange-300 text-xs font-bold transition-all"
          >
            Atribuir mesmo assim
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Modal atribuição de técnico ───────────────────────────────────────────────
function ModalAtribuicao({ aberto, celula, tecnicos, eventos, agendamentos, onFechar, onGuardado }) {
  const [tecnicoId, setTecnicoId]     = useState('')
  const [loading, setLoading]         = useState(false)
  const [conflitos, setConflitos]     = useState([])
  const [confirmar, setConfirmar]     = useState(false)

  useEffect(() => {
    if (!aberto) return
    setTecnicoId(celula?.evento?.tecnico_id ?? celula?.agendamento?.tecnico_id ?? '')
    setConflitos([])
    setConfirmar(false)
  }, [aberto, celula])

  const handleTecnicoChange = (id) => {
    setTecnicoId(id)
    setConflitos([])
    setConfirmar(false)
    if (id) {
      const cs = detectarConflitos(id, celula?.data, celula?.evento?.id, eventos, agendamentos, tecnicos)
      setConflitos(cs)
      if (cs.length > 0) setConfirmar(true)
    }
  }

  const executarGuardar = async () => {
    if (!celula) return
    setLoading(true)
    try {
      if (celula.evento?.id) {
        await supabase.from('supa_eventos')
          .update({ tecnico_id: tecnicoId || null })
          .eq('id', celula.evento.id)
      } else {
        const ag = celula.agendamento
        if (ag?.id) {
          if (tecnicoId) {
            await supabase.from('agendamentos_tecnicos')
              .update({ tecnico_id: tecnicoId, folga: false })
              .eq('id', ag.id)
          } else {
            await supabase.from('agendamentos_tecnicos').delete().eq('id', ag.id)
          }
        } else if (tecnicoId) {
          await supabase.from('agendamentos_tecnicos').insert({
            data: celula.data, espaco_id: celula.espaco_id, tecnico_id: tecnicoId, folga: false,
          })
        }
      }
      onGuardado()
      onFechar()
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  const guardar = () => {
    if (!celula) return
    const cs = detectarConflitos(tecnicoId, celula?.data, celula?.evento?.id, eventos, agendamentos, tecnicos)
    if (cs.length > 0) { setConflitos(cs); setConfirmar(true); return }
    executarGuardar()
  }

  const nomeTecnico = tecnicos.find(t => t.id === tecnicoId)?.nome ?? ''

  return (
    <>
      <Modal aberto={aberto} onFechar={onFechar} largura="max-w-sm">
        <div className="flex flex-col">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <div>
              <p className="text-sm font-semibold text-accent">Atribuir Técnico</p>
              {celula && <p className="text-[11px] text-accent-subtle mt-0.5">{celula.espaco} · {celula.data}</p>}
            </div>
            <button onClick={onFechar} className="text-accent-subtle hover:text-accent"><X size={15} /></button>
          </div>
          <div className="px-5 py-4 flex flex-col gap-3">
            {(celula?.evento || celula?.dj) && (
              <div className="p-3 rounded-lg bg-surface-2 border border-border/50 text-[11px] flex flex-col gap-1">
                {celula.evento && <span className="text-accent-muted"><span className="text-accent-subtle">Evento:</span> {celula.evento.evento}</span>}
                {celula.evento?.hora_instalacao && <span className="text-accent-muted"><span className="text-accent-subtle">Inst.:</span> {hhmm(celula.evento.hora_instalacao)}</span>}
                {celula.evento?.hora_inicio && <span className="text-accent-muted"><span className="text-accent-subtle">Início:</span> {hhmm(celula.evento.hora_inicio)}</span>}
                {celula.dj && <span className="text-accent-muted"><span className="text-accent-subtle">DJ:</span> {celula.dj}</span>}
              </div>
            )}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-accent-subtle uppercase tracking-wider">Técnico</label>
              <select
                value={tecnicoId}
                onChange={e => handleTecnicoChange(e.target.value)}
                className="w-full bg-surface-2 border border-border rounded px-3 py-2 text-xs text-accent focus:outline-none focus:border-white/30"
              >
                <option value="">— Nenhum —</option>
                {tecnicos.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
              </select>
            </div>
            {/* Avisos inline */}
            {conflitos.length > 0 && (
              <div className="flex flex-col gap-1.5">
                {conflitos.map((c, i) => (
                  <div key={i} className={clsx(
                    'flex items-start gap-2 px-3 py-2 rounded-lg text-[11px] border',
                    c.tipo === 'folga'
                      ? 'bg-orange-500/10 border-orange-500/20 text-orange-300'
                      : 'bg-red-500/10 border-red-500/20 text-red-300'
                  )}>
                    <AlertTriangle size={11} className="shrink-0 mt-0.5" />{c.msg}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="px-5 py-3 border-t border-border flex justify-end gap-2">
            <Button variante="secundario" onClick={onFechar} disabled={loading}>Cancelar</Button>
            <Button onClick={guardar} disabled={loading}>{loading ? 'A guardar…' : 'Guardar'}</Button>
          </div>
        </div>
      </Modal>

      {/* Modal de conflito automático */}
      {confirmar && (
        <ModalConflito
          conflitos={conflitos}
          nomeTecnico={nomeTecnico}
          onConfirmar={() => { setConfirmar(false); executarGuardar() }}
          onCancelar={() => { setConfirmar(false); setTecnicoId(''); setConflitos([]) }}
        />
      )}
    </>
  )
}

// ── Modal folgas ──────────────────────────────────────────────────────────────
function ModalFolga({ aberto, data, tecnicos, folgasHoje, agendamentos, onFechar, onGuardado }) {
  const [seleccionados, setSeleccionados] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!aberto) return
    setSeleccionados(folgasHoje ?? [])
  }, [aberto, folgasHoje])

  const toggle = (id) => setSeleccionados(prev =>
    prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
  )

  const guardar = async () => {
    setLoading(true)
    try {
      const folgasAntigas = agendamentos.filter(a => a.data === data && a.folga)
      if (folgasAntigas.length > 0)
        await supabase.from('agendamentos_tecnicos').delete().in('id', folgasAntigas.map(a => a.id))
      if (seleccionados.length > 0)
        await supabase.from('agendamentos_tecnicos').insert(
          seleccionados.map(tid => ({ data, tecnico_id: tid, folga: true }))
        )
      onGuardado()
      onFechar()
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  return (
    <Modal aberto={aberto} onFechar={onFechar} largura="max-w-xs">
      <div className="flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <p className="text-sm font-semibold text-accent">Folgas</p>
            {data && <p className="text-[11px] text-accent-subtle mt-0.5">{dataFmt(data)} · {nomeDiaSem(data)}</p>}
          </div>
          <button onClick={onFechar} className="text-accent-subtle hover:text-accent"><X size={15} /></button>
        </div>
        <div className="px-5 py-4 flex flex-col gap-2">
          {tecnicos.map(t => (
            <label key={t.id} className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={seleccionados.includes(t.id)} onChange={() => toggle(t.id)}
                className="w-4 h-4 rounded border-border accent-status-confirmado" />
              <span className="text-sm text-accent">{t.nome}</span>
            </label>
          ))}
        </div>
        <div className="px-5 py-3 border-t border-border flex justify-end gap-2">
          <Button variante="secundario" onClick={onFechar} disabled={loading}>Cancelar</Button>
          <Button onClick={guardar} disabled={loading}>{loading ? 'A guardar…' : 'Guardar'}</Button>
        </div>
      </div>
    </Modal>
  )
}

// ── Chip de técnico (draggable) ───────────────────────────────────────────────
function TecnicoChip({ nome, cor, isDragging, onDragStart, onDragEnd }) {
  if (!nome) return <span className="text-border/30 text-[10px]">+ atribuir</span>
  return (
    <span
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={clsx(
        'inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold select-none border',
        cor?.chip ?? 'bg-status-confirmado/15 text-status-confirmado border-status-confirmado/30',
        'cursor-grab active:cursor-grabbing transition-opacity duration-150',
        isDragging ? 'opacity-25 scale-95' : 'opacity-100',
      )}
    >
      {nome}
    </span>
  )
}

// ── Utilitários estatísticas ──────────────────────────────────────────────────
function horasDecimais(t) {
  if (!t) return null
  const [h, m] = t.split(':').map(Number)
  return h + (m || 0) / 60
}
function fmtH(h) {
  const hh = Math.floor(h)
  const mm = Math.round((h - hh) * 60)
  return `${hh}h${mm > 0 ? String(mm).padStart(2, '0') : ''}`
}
function fmtEuroStat(v) {
  return v.toLocaleString('pt-PT', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €'
}
function calcStats(tecnicos, eventos, agendamentos) {
  return tecnicos.map(tec => {
    const evsT  = eventos.filter(e => e.tecnico_id === tec.id)
    const datas = new Set(evsT.map(e => e.data_evento)).size
    const folgas = agendamentos.filter(a => a.tecnico_id === tec.id && a.folga).length
    const horas  = evsT.reduce((acc, e) => {
      const chegada = e.hora_instalacao || e.hora_inicio
      if (!chegada) return acc
      const hC = horasDecimais(chegada)
      const hF = e.hora_inicio ? horasDecimais(e.hora_inicio) + 2 : hC + 3
      const d  = hF - hC
      return acc + (d > 0 ? d : d + 24)
    }, 0)
    const valor = evsT.reduce((acc, e) => acc + (e.valor_apoio_tecnico ?? 0), 0)
    return { tec, datas, folgas, horas, valor }
  }).filter(s => s.datas > 0 || s.folgas > 0)
}

const METRICAS = [
  { id: 'datas',  label: 'Datas',  fmt: v => String(v),       cor: 'text-accent' },
  { id: 'folgas', label: 'Folgas', fmt: v => String(v),       cor: 'text-orange-400' },
  { id: 'horas',  label: 'Horas',  fmt: v => fmtH(v),         cor: 'text-accent' },
  { id: 'valor',  label: 'Valor',  fmt: v => fmtEuroStat(v),  cor: 'text-accent' },
]

// ── Vista Estatísticas ────────────────────────────────────────────────────────
function VistaEstatisticas({ tecnicos, eventos, agendamentos, tecCorMap }) {
  const [metricaActiva, setMetricaActiva] = useState('datas')
  const stats = calcStats(tecnicos, eventos, agendamentos)

  if (stats.length === 0)
    return <div className="flex items-center justify-center py-20 text-accent-subtle/40 text-sm">Sem dados para este mês.</div>

  const metrica    = METRICAS.find(m => m.id === metricaActiva)
  const ordenados  = [...stats].sort((a, b) => b[metricaActiva] - a[metricaActiva])
  const maxVal     = Math.max(1, ...ordenados.map(s => s[metricaActiva]))

  return (
    <div className="p-6 flex flex-col gap-5 overflow-auto">

      {/* ── Card resumo comparativo ── */}
      <div className="bg-surface-1 border border-border rounded-2xl overflow-hidden">
        {/* Botões de métrica */}
        <div className="px-5 py-3.5 border-b border-border/50 flex items-center gap-2">
          <span className="text-[10px] font-bold text-accent-subtle uppercase tracking-widest mr-2">Comparação</span>
          {METRICAS.map(m => (
            <button key={m.id} onClick={() => setMetricaActiva(m.id)}
              className={clsx(
                'px-3.5 py-1.5 rounded-lg text-xs font-bold border transition-all',
                metricaActiva === m.id
                  ? 'bg-white/10 text-accent border-white/20'
                  : 'bg-surface-2 text-accent-muted border-border hover:text-accent hover:bg-surface-3'
              )}>
              {m.label}
            </button>
          ))}
        </div>
        {/* Ranking */}
        <div className="divide-y divide-border/20">
          {ordenados.map(({ tec, ...vals }, idx) => {
            const val = vals[metricaActiva]
            const cor = tecCorMap[tec.id]
            return (
              <div key={tec.id} className="flex items-center gap-4 px-5 py-3">
                <span className="w-5 text-[11px] text-accent-subtle/50 tabular-nums text-right font-bold">{idx + 1}</span>
                <span className={clsx('text-xs font-bold w-28 truncate shrink-0', cor?.text ?? 'text-accent')}>{tec.nome}</span>
                <div className="flex-1 h-1.5 bg-surface-3 rounded-full overflow-hidden">
                  <div className={clsx('h-full rounded-full transition-all duration-500', cor?.dot ?? 'bg-accent')}
                    style={{ width: `${(val / maxVal) * 100}%` }} />
                </div>
                <span className={clsx('text-base font-black tabular-nums shrink-0 w-20 text-right', cor?.text ?? 'text-accent')}>
                  {metrica.fmt(val)}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Cards individuais em linha ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(({ tec, datas, folgas, horas, valor }) => {
          const cor = tecCorMap[tec.id]
          return (
            <div key={tec.id} className="bg-surface-1 border border-border rounded-2xl p-4 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <span className={clsx('w-8 h-8 rounded-xl flex items-center justify-center text-sm font-black shrink-0', cor?.avatar ?? 'bg-surface-3 text-accent-muted')}>
                  {tec.nome.charAt(0).toUpperCase()}
                </span>
                <p className="font-bold text-accent text-sm truncate">{tec.nome}</p>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                {[
                  { label: 'Datas',  val: datas,              color: cor?.text ?? 'text-accent', fmt: v => v },
                  { label: 'Folgas', val: folgas,             color: 'text-orange-400',           fmt: v => v },
                  { label: 'Horas',  val: horas,              color: cor?.text ?? 'text-accent',  fmt: fmtH },
                  { label: 'Valor',  val: valor,              color: cor?.text ?? 'text-accent',  fmt: v => v > 0 ? fmtEuroStat(v) : '—' },
                ].map(({ label, val, color, fmt }) => (
                  <div key={label} className="flex flex-col gap-0.5">
                    <span className={clsx('text-lg font-black tabular-nums leading-none', color)}>{fmt(val)}</span>
                    <span className="text-[9px] text-accent-subtle uppercase tracking-wider">{label}</span>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

    </div>
  )
}

// ── FolgaChip — chip draggable para folgas ────────────────────────────────────
function FolgaChip({ tecnico, cor, dataStr, onDragStart, isDragging }) {
  return (
    <span
      draggable
      onDragStart={e => onDragStart(e, dataStr, tecnico.id)}
      onDragEnd={() => {}}
      className={clsx(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border select-none cursor-grab active:cursor-grabbing transition-opacity',
        cor?.chip ?? 'bg-orange-400/15 text-orange-400 border-orange-400/30',
        isDragging ? 'opacity-30' : 'opacity-100'
      )}
    >
      {tecnico.nome}
    </span>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────
export function ApoioTecnico() {
  const { anoMes } = useMesStore()
  const [loading, setLoading]           = useState(true)
  const [tecnicos, setTecnicos]         = useState([])
  const [agendamentos, setAgendamentos] = useState([])
  const [eventos, setEventos]           = useState([])
  const [slots, setSlots]               = useState([])
  const [espacos, setEspacos]           = useState([])
  const [modalAtrib, setModalAtrib]       = useState(null)
  const [modalFolga, setModalFolga]       = useState(null)
  const [modalEditEvento, setModalEditEvento] = useState(null) // evento obj
  const [filtroEspaco, setFiltroEspaco]   = useState('')
  const [filtroTecnico, setFiltroTecnico] = useState('')
  const [pesquisa, setPesquisa]           = useState('')
  const [vista, setVista]                 = useState('colunas')

  // ── Drag state (técnico) ────────────────────────────────────────────────────
  const [dragSource, setDragSource] = useState(null)  // { dropKey, tecnicoId, eventoId, agId }
  const [dragOver, setDragOver]     = useState(null)  // dropKey string

  // ── Drag state (folga) ──────────────────────────────────────────────────────
  const [dragFolga, setDragFolga]         = useState(null)
  const [dragOverFolga, setDragOverFolga] = useState(null)

  const { dataInicio, dataFim, dias } = useMemo(() => {
    const [ano, mes] = anoMes.split('-').map(Number)
    const ref    = new Date(ano, mes - 1, 1)
    const inicio = startOfMonth(ref)
    const fim    = endOfMonth(ref)
    return { dataInicio: isoData(inicio), dataFim: isoData(fim), dias: eachDayOfInterval({ start: inicio, end: fim }) }
  }, [anoMes])

  const carregar = useCallback(async () => {
    setLoading(true)
    const [tRes, eRes, agRes, evRes, slRes] = await Promise.all([
      supabase.from('tecnicos').select('*').eq('ativo', true).order('nome'),
      supabase.from('espacos').select('id, nome').eq('activo', true).order('nome'),
      supabase.from('agendamentos_tecnicos').select('*').gte('data', dataInicio).lte('data', dataFim),
      supabase.from('supa_eventos')
        .select('id, espaco_id, evento, data_evento, hora_inicio, hora_instalacao, status, tecnico_id, valor_apoio_tecnico')
        .gte('data_evento', dataInicio).lte('data_evento', dataFim).neq('status', 'cancelado'),
      supabase.from('agenda')
        .select('id, espaco_id, data, dj_nome, dj_id, tipo_slot, estado, djs(nome, nome_artistico)')
        .gte('data', dataInicio).lte('data', dataFim)
        .not('estado', 'in', '("cancelado","sem_efeito","faltou")'),
    ])
    if (!tRes.error) setTecnicos(tRes.data ?? [])
    if (!eRes.error) setEspacos(eRes.data ?? [])
    if (!agRes.error) setAgendamentos(agRes.data ?? [])
    if (!evRes.error) setEventos(evRes.data ?? [])
    if (!slRes.error) setSlots(slRes.data ?? [])
    setLoading(false)
  }, [dataInicio, dataFim])

  useEffect(() => { carregar() }, [carregar])
  useEffect(() => { setFiltroEspaco(''); setFiltroTecnico(''); setPesquisa('') }, [anoMes])

  // ── Handlers folga drag ──────────────────────────────────────────────────────
  const handleFolgaDragStart = useCallback((e, data, tecnicoId) => {
    e.stopPropagation()
    e.dataTransfer.effectAllowed = 'move'
    setDragFolga({ data, tecnicoId })
  }, [])

  const handleFolgaDrop = useCallback(async (e, targetData) => {
    e.preventDefault()
    e.stopPropagation()
    if (!dragFolga || dragFolga.data === targetData) { setDragFolga(null); setDragOverFolga(null); return }
    try {
      const folgaOrigem = agendamentos.find(a => a.data === dragFolga.data && a.tecnico_id === dragFolga.tecnicoId && a.folga)
      if (folgaOrigem) await supabase.from('agendamentos_tecnicos').delete().eq('id', folgaOrigem.id)
      const jaExiste = agendamentos.find(a => a.data === targetData && a.tecnico_id === dragFolga.tecnicoId && a.folga)
      if (!jaExiste) await supabase.from('agendamentos_tecnicos').insert({ data: targetData, tecnico_id: dragFolga.tecnicoId, folga: true })
      carregar()
    } catch (err) { console.error(err) }
    finally { setDragFolga(null); setDragOverFolga(null) }
  }, [dragFolga, agendamentos, carregar])

  const agIdx = useMemo(() => {
    const idx = {}
    agendamentos.filter(a => !a.folga && a.espaco_id).forEach(a => { idx[`${a.data}|${a.espaco_id}`] = a })
    return idx
  }, [agendamentos])

  const folgasIdx = useMemo(() => {
    const idx = {}
    agendamentos.filter(a => a.folga).forEach(a => {
      if (!idx[a.data]) idx[a.data] = []
      idx[a.data].push(a.tecnico_id)
    })
    return idx
  }, [agendamentos])

  const evIdx = useMemo(() => {
    const idx = {}
    eventos.forEach(e => { const k = `${e.data_evento}|${e.espaco_id}`; if (!idx[k]) idx[k] = e })
    return idx
  }, [eventos])

  const djIdx = useMemo(() => {
    const idx = {}
    slots.forEach(s => {
      const nome = s.djs?.nome_artistico ?? s.djs?.nome ?? s.dj_nome
      if (!nome) return
      const k = `${s.data}|${s.espaco_id}`
      if (!idx[k]) idx[k] = []
      if (!idx[k].includes(nome)) idx[k].push(nome)
    })
    return idx
  }, [slots])

  // Mapa tecnico_id → estilos de cor
  const tecCorMap = useMemo(() => {
    const m = {}
    tecnicos.forEach((t, i) => { m[t.id] = corTecnico(t.nome, i) })
    return m
  }, [tecnicos])

  const espacosActivos = useMemo(() => {
    const ids = new Set([...eventos.map(e => e.espaco_id), ...slots.map(s => s.espaco_id)])
    return espacos.filter(e => ids.has(e.id))
  }, [espacos, eventos, slots])

  const linhasBrutas = useMemo(() => {
    const result = []
    dias.forEach(dia => {
      const dataStr = isoData(dia)
      const linhas  = []
      espacos.forEach(espaco => {
        const k     = `${dataStr}|${espaco.id}`
        const ev    = evIdx[k]
        const dj    = djIdx[k]
        if (!ev) return
        const ag      = agIdx[k] ?? null
        const tecId   = ev?.tecnico_id ?? ag?.tecnico_id ?? null
        const tecNome = tecId ? tecnicos.find(t => t.id === tecId)?.nome ?? null : null
        linhas.push({ dataStr, dia, espaco_id: espaco.id, espacoNome: espaco.nome.trim(), ev, djs: dj ?? [], ag, tecNome, tecId })
      })
      result.push({ dataStr, dia, linhas, folgas: folgasIdx[dataStr] ?? [] })
    })
    return result
  }, [dias, espacos, evIdx, djIdx, agIdx, folgasIdx, tecnicos])

  const linhasPorDia = useMemo(() => {
    const q = pesquisa.trim().toLowerCase()
    const tecFiltroId = filtroTecnico
      ? tecnicos.find(t => t.nome === filtroTecnico)?.id ?? null
      : null

    return linhasBrutas.map(grupo => {
      let linhas = grupo.linhas

      if (filtroEspaco) linhas = linhas.filter(l => l.espaco_id === filtroEspaco)

      if (tecFiltroId) {
        linhas = linhas.filter(l => {
          const tecId = l.ev?.tecnico_id ?? l.ag?.tecnico_id ?? null
          return tecId === tecFiltroId
        })
      }

      if (q) linhas = linhas.filter(l =>
        l.espacoNome.toLowerCase().includes(q) ||
        (l.ev?.evento ?? '').toLowerCase().includes(q) ||
        (l.djs?.join(' ') ?? '').toLowerCase().includes(q) ||
        (l.tecNome ?? '').toLowerCase().includes(q)
      )

      const temFolgaDoTecnico = tecFiltroId && (grupo.folgas ?? []).includes(tecFiltroId)
      if (linhas.length === 0 && !temFolgaDoTecnico && (filtroEspaco || tecFiltroId || q)) return null

      return { ...grupo, linhas }
    }).filter(Boolean)
  }, [linhasBrutas, filtroEspaco, filtroTecnico, pesquisa, tecnicos])

  const maxGrupos = useMemo(() =>
    Math.max(1, ...linhasPorDia.map(g => g.linhas.length))
  , [linhasPorDia])

  // ── Handlers de drag & drop ──────────────────────────────────────────────────
  const handleDragStart = useCallback((e, linha) => {
    e.dataTransfer.effectAllowed = 'move'
    // Ghost image minimalista
    const ghost = document.createElement('span')
    ghost.textContent = linha.tecNome
    ghost.style.cssText = 'position:fixed;top:-100px;left:-100px;padding:2px 10px;background:#22c55e22;color:#22c55e;border:1px solid #22c55e44;border-radius:999px;font-size:11px;font-weight:600;'
    document.body.appendChild(ghost)
    e.dataTransfer.setDragImage(ghost, ghost.offsetWidth / 2, 12)
    setTimeout(() => document.body.removeChild(ghost), 0)

    setDragSource({
      dropKey:   `${linha.dataStr}|${linha.espaco_id}`,
      tecnicoId: linha.tecId,
      eventoId:  linha.ev?.id ?? null,
      agId:      linha.ag?.id ?? null,
    })
  }, [])

  const handleDragEnd = useCallback(() => {
    setDragSource(null)
    setDragOver(null)
  }, [])

  const handleDragOver = useCallback((e, key) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOver(key)
  }, [])

  const handleDragLeave = useCallback((e) => {
    // Só limpa se sair do td, não dos filhos
    if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(null)
  }, [])

  // Pendente de confirmação de conflito no drag
  const [conflitoDrag, setConflitoDrag] = useState(null) // { src, linha, conflitos }

  const executarDrop = useCallback(async (src, linha) => {
    try {
      if (linha.ev?.id) {
        await supabase.from('supa_eventos').update({ tecnico_id: src.tecnicoId }).eq('id', linha.ev.id)
      } else if (linha.ag?.id) {
        await supabase.from('agendamentos_tecnicos').update({ tecnico_id: src.tecnicoId }).eq('id', linha.ag.id)
      } else {
        await supabase.from('agendamentos_tecnicos').insert({ data: linha.dataStr, espaco_id: linha.espaco_id, tecnico_id: src.tecnicoId, folga: false })
      }
      if (src.eventoId) {
        await supabase.from('supa_eventos').update({ tecnico_id: null }).eq('id', src.eventoId)
      } else if (src.agId) {
        await supabase.from('agendamentos_tecnicos').delete().eq('id', src.agId)
      }
      carregar()
    } catch (err) { console.error(err) }
  }, [carregar])

  const handleDrop = useCallback((e, linha) => {
    e.preventDefault()
    setDragOver(null)
    const src = dragSource
    setDragSource(null)
    if (!src?.tecnicoId) return
    const dstKey = `${linha.dataStr}|${linha.espaco_id}`
    if (src.dropKey === dstKey) return

    // Verificar conflitos antes de executar
    const cs = detectarConflitos(src.tecnicoId, linha.dataStr, linha.ev?.id, eventos, agendamentos, tecnicos)
    if (cs.length > 0) {
      setConflitoDrag({ src, linha, conflitos: cs })
      return
    }
    executarDrop(src, linha)
  }, [dragSource, eventos, agendamentos, tecnicos, executarDrop])

  if (loading) return <LoadingPage />

  const thCls    = 'px-2 py-2 text-left text-[10px] font-bold text-accent-subtle uppercase tracking-widest whitespace-nowrap'
  const sepThCls = 'w-0.5 p-0 bg-border'

  // Helper: renderiza a célula de técnico (draggable + drop zone)
  const renderTecCell = (linha, extraCls = '') => {
    if (!linha) return <td className={clsx('px-2 py-2', extraCls)} />
    const dropKey   = `${linha.dataStr}|${linha.espaco_id}`
    const isSrc     = dragSource?.dropKey === dropKey
    const isDst     = dragOver === dropKey && dragSource && dragSource.dropKey !== dropKey
    const isDraggingAny = !!dragSource

    // Cor baseada no nome do técnico
    const tecIdx = linha.tecNome ? tecnicos.findIndex(t => t.id === linha.tecId) : -1
    const cor = linha.tecNome ? corTecnico(linha.tecNome, tecIdx) : null

    return (
      <td
        key={`tec-${dropKey}`}
        onDragOver={(e) => handleDragOver(e, dropKey)}
        onDragLeave={handleDragLeave}
        onDrop={(e) => handleDrop(e, linha)}
        onClick={!isDraggingAny
          ? () => setModalAtrib({
              data: linha.dataStr, espaco_id: linha.espaco_id,
              espaco: linha.espacoNome, agendamento: linha.ag,
              evento: linha.ev, dj: linha.djs?.join(', '),
            })
          : undefined
        }
        className={clsx(
          'px-2 py-1.5 whitespace-nowrap transition-all duration-100',
          extraCls,
          isDst
            ? 'bg-status-confirmado/10 outline outline-1 outline-inset outline-status-confirmado/50'
            : !isDraggingAny && 'cursor-pointer hover:bg-surface-2/40',
        )}
      >
        <TecnicoChip
          nome={linha.tecNome}
          cor={cor}
          isDragging={isSrc}
          onDragStart={(e) => handleDragStart(e, linha)}
          onDragEnd={handleDragEnd}
        />
      </td>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Filtros ── */}
      <div className="shrink-0 border-b border-border/50 bg-surface-0/40">

        {/* Linha 1 — Clientes + pesquisa */}
        <div className="px-5 py-2 flex items-center justify-between gap-3 border-b border-border/30">
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-[10px] font-semibold text-accent-subtle uppercase tracking-widest mr-2">Cliente</span>
            <button onClick={() => setFiltroEspaco('')}
              className={clsx('px-3 py-1.5 rounded text-xs transition-colors border',
                filtroEspaco === '' ? 'bg-surface-3 text-accent border-white/20 font-medium' : 'bg-surface-2 text-accent-muted border-border hover:text-accent')}>
              Todos
            </button>
            {espacosActivos.map(e => (
              <button key={e.id} onClick={() => setFiltroEspaco(filtroEspaco === e.id ? '' : e.id)}
                className={clsx('px-3 py-1.5 rounded text-xs transition-colors border',
                  filtroEspaco === e.id ? 'bg-surface-3 text-accent border-white/20 font-medium' : 'bg-surface-2 text-accent-muted border-border hover:text-accent')}>
                {e.nome.trim()}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* Toggle vista */}
            <div className="flex bg-surface-2 border border-border rounded p-0.5">
              <button
                onClick={() => setVista('colunas')}
                title="Vista em colunas"
                className={clsx('p-1.5 rounded transition-colors', vista === 'colunas' ? 'bg-surface-4 text-accent' : 'text-accent-muted hover:text-accent')}
              >
                <Columns2 size={13} />
              </button>
              <button
                onClick={() => setVista('linhas')}
                title="Vista em linhas"
                className={clsx('p-1.5 rounded transition-colors', vista === 'linhas' ? 'bg-surface-4 text-accent' : 'text-accent-muted hover:text-accent')}
              >
                <AlignJustify size={13} />
              </button>
              <button
                onClick={() => setVista('stats')}
                title="Estatísticas por colaborador"
                className={clsx('p-1.5 rounded transition-colors', vista === 'stats' ? 'bg-surface-4 text-accent' : 'text-accent-muted hover:text-accent')}
              >
                <BarChart3 size={13} />
              </button>
            </div>

            {/* Pesquisa */}
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-accent-subtle pointer-events-none" />
              <input type="text" placeholder="Pesquisar…" value={pesquisa} onChange={e => setPesquisa(e.target.value)}
                className="pl-8 pr-7 py-1.5 bg-surface-2 border border-border rounded text-xs text-accent placeholder:text-accent-subtle/50 focus:outline-none focus:border-white/20 w-44" />
              {pesquisa && (
                <button onClick={() => setPesquisa('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-accent-subtle hover:text-accent">
                  <X size={11} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Linha 2 — colaboradores (oculto na vista stats) */}
        <div className={clsx('px-5 py-2 flex items-center gap-1 flex-wrap', vista === 'stats' && 'hidden')}>
          <span className="text-[10px] font-semibold text-accent-subtle uppercase tracking-widest mr-2">Apoio</span>
          <button onClick={() => setFiltroTecnico('')}
            className={clsx('px-3 py-1.5 rounded text-xs transition-colors border',
              filtroTecnico === '' ? 'bg-surface-3 text-accent border-white/20 font-medium' : 'bg-surface-2 text-accent-muted border-border hover:text-accent')}>
            Todos
          </button>
          {tecnicos.map(t => {
            const cor = tecCorMap[t.id]
            const isDraggingThis = dragSource?.tecnicoId === t.id && dragSource?.dropKey === null
            return (
              <div
                key={t.id}
                draggable
                onDragStart={e => {
                  e.dataTransfer.effectAllowed = 'move'
                  // Ghost image
                  const ghost = document.createElement('span')
                  ghost.textContent = t.nome
                  ghost.style.cssText = `position:fixed;top:-100px;left:-100px;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:600;background:${cor ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.08)'};color:white;border:1px solid rgba(255,255,255,0.2);`
                  document.body.appendChild(ghost)
                  e.dataTransfer.setDragImage(ghost, ghost.offsetWidth / 2, 12)
                  setTimeout(() => document.body.removeChild(ghost), 0)
                  setDragSource({ dropKey: null, tecnicoId: t.id, eventoId: null, agId: null })
                }}
                onDragEnd={() => setDragSource(null)}
                onClick={() => setFiltroTecnico(filtroTecnico === t.nome ? '' : t.nome)}
                title={`Filtrar: ${t.nome} · Arrastar para atribuir`}
                className={clsx(
                  'px-3 py-1.5 rounded text-xs transition-all border select-none',
                  'cursor-grab active:cursor-grabbing',
                  isDraggingThis && 'opacity-40 scale-95',
                  filtroTecnico === t.nome
                    ? (cor?.chip ?? 'bg-status-confirmado/15 text-status-confirmado border-status-confirmado/30') + ' font-medium'
                    : 'bg-surface-2 text-accent-muted border-border hover:text-accent hover:border-white/20'
                )}
              >
                {t.nome}
              </div>
            )
          })}
          {/* Indicador visual quando está a arrastar da paleta */}
          {dragSource?.dropKey === null && dragSource?.tecnicoId && (
            <span className="ml-2 text-[10px] text-accent-subtle/60 animate-pulse">
              ↓ largar num slot para atribuir
            </span>
          )}
        </div>
      </div>

      {/* ── Tabela ── */}
      <div className="flex-1 overflow-auto">

        {/* ════ VISTA COLUNAS ════ */}
        {vista === 'colunas' && (
          <table className="text-xs border-collapse" style={{ minWidth: '100%' }}>
            <colgroup>
              <col style={{ width: 52 }} />
              <col style={{ width: 50 }} />
              {Array.from({ length: maxGrupos }, (_, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <col style={{ width: 2 }} />}
                  <col style={{ width: 100 }} />
                  <col style={{ width: 140 }} />
                  <col style={{ width: 150 }} />
                  <col style={{ width: 78 }} />
                  <col style={{ width: 78 }} />
                  <col style={{ width: 110 }} />
                </React.Fragment>
              ))}
              <col style={{ width: 100 }} />
            </colgroup>
            <thead className="sticky top-0 z-10 bg-surface-2 border-b-2 border-border">
              <tr>
                <th className={thCls} colSpan={2}>Dia</th>
                {Array.from({ length: maxGrupos }, (_, i) => [
                  i > 0 && <th key={`sh-sep-${i}`} className={sepThCls} />,
                  <th key={`sh-tec-${i}`} className={clsx(thCls, i > 0 && 'pl-3')}>Técnico</th>,
                  <th key={`sh-esp-${i}`} className={thCls}>Cliente</th>,
                  <th key={`sh-ev-${i}`}  className={thCls}>Evento</th>,
                  <th key={`sh-ins-${i}`} className={clsx(thCls, 'text-center')}>Hora Inst.</th>,
                  <th key={`sh-ini-${i}`} className={clsx(thCls, 'text-center')}>Hora Início</th>,
                  <th key={`sh-dj-${i}`}  className={thCls}>DJ</th>,
                ])}
                <th className={clsx(thCls, 'border-l border-border/60')}>Folga</th>
              </tr>
            </thead>
            <tbody>
              {linhasPorDia.length === 0 && (
                <tr><td colSpan={99} className="py-16 text-center text-accent-subtle/40">Sem eventos activos neste mês.</td></tr>
              )}
              {linhasPorDia.map(({ dataStr, dia, linhas, folgas }, dayIdx) => {
                const tecsFolga = folgas.map(tid => tecnicos.find(t => t.id === tid)).filter(Boolean)
                const zebraCls  = dayIdx % 2 === 1 ? 'bg-white/[0.025]' : ''
                return (
                  <tr key={dataStr} className={clsx(
                    'border-b border-border/30 hover:bg-surface-2/20 transition-colors align-middle',
                    isFds(dataStr) ? 'bg-blue-400/[0.04]' : zebraCls
                  )}>
                    <td colSpan={2} onClick={() => setModalFolga({ data: dataStr })} title="Gerir folgas"
                      className="px-3 py-2 font-medium whitespace-nowrap border-r border-border/40 cursor-pointer hover:bg-orange-400/5 transition-colors text-accent-muted">
                      {diaSemanaData(dataStr)}
                    </td>
                    {Array.from({ length: maxGrupos }, (_, i) => {
                      const linha = linhas[i] ?? null
                      return [
                        i > 0 && <td key={`sep-${dataStr}-${i}`} className="p-0 bg-border w-0.5" />,
                        // Técnico — draggable
                        renderTecCell(linha, i > 0 ? 'pl-3' : ''),
                        <td key={`esp-${dataStr}-${i}`} className="px-2 py-2 text-accent-muted font-medium whitespace-nowrap">{linha?.espacoNome ?? ''}</td>,
                        <td key={`ev-${dataStr}-${i}`}
                          onClick={() => linha?.ev && setModalEditEvento(linha.ev)}
                          className={clsx('px-2 py-2 text-accent-muted max-w-0 group', linha?.ev && 'cursor-pointer hover:text-accent transition-colors')}>
                          <span className="flex items-center gap-1">
                            <span className="block truncate">{linha?.ev?.evento ?? ''}</span>
                            {linha?.ev && <Pencil size={10} className="shrink-0 opacity-0 group-hover:opacity-40 transition-opacity" />}
                          </span>
                        </td>,
                        <td key={`ins-${dataStr}-${i}`} className="px-2 py-2 text-center tabular-nums whitespace-nowrap font-medium">
                          {linha?.ev?.hora_instalacao
                            ? <span className={tecCorMap[linha.tecId]?.text ?? 'text-accent-subtle'}>{hhmm(linha.ev.hora_instalacao)}</span>
                            : linha ? <span className="text-border/20">—</span> : null}
                        </td>,
                        <td key={`ini-${dataStr}-${i}`} className="px-2 py-2 text-center text-accent-subtle tabular-nums whitespace-nowrap">
                          {linha?.ev?.hora_inicio ? hhmm(linha.ev.hora_inicio) : linha ? <span className="text-border/20">—</span> : null}
                        </td>,
                        <td key={`dj-${dataStr}-${i}`} className="px-2 py-2 text-accent-muted whitespace-nowrap">
                          {linha ? linha.djs?.length ? <span>{linha.djs.join(' · ')}</span> : <span className="text-border/20">—</span> : null}
                        </td>,
                      ]
                    })}
                    <td
                      onClick={() => setModalFolga({ data: dataStr })}
                      onDragOver={e => { e.preventDefault(); setDragOverFolga(dataStr) }}
                      onDragLeave={() => setDragOverFolga(null)}
                      onDrop={e => handleFolgaDrop(e, dataStr)}
                      title="Gerir folgas · arrastar para mover folga"
                      className={clsx(
                        'px-2 py-2 border-l border-border/40 cursor-pointer transition-colors whitespace-nowrap',
                        dragOverFolga === dataStr ? 'bg-orange-400/10 outline outline-1 outline-orange-400/40' : 'hover:bg-orange-400/5'
                      )}>
                      {tecsFolga.length > 0
                        ? <span className="inline-flex flex-wrap gap-x-1 gap-y-1">
                            {tecsFolga.map(t => (
                              <FolgaChip key={t.id} tecnico={t} cor={tecCorMap[t.id]}
                                dataStr={dataStr} onDragStart={handleFolgaDragStart}
                                isDragging={dragFolga?.data === dataStr && dragFolga?.tecnicoId === t.id} />
                            ))}
                          </span>
                        : <span className="text-border/20 text-[10px]">—</span>
                      }
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}

        {/* ════ VISTA LINHAS ════ */}
        {vista === 'linhas' && (
          <table className="w-full text-xs border-collapse">
            <colgroup>
              <col style={{ width: 160 }} />
              <col style={{ width: 105 }} />
              <col style={{ width: 140 }} />
              <col style={{ width: 160 }} />
              <col style={{ width: 78 }} />
              <col style={{ width: 78 }} />
              <col style={{ width: 120 }} />
              <col style={{ width: 100 }} />
            </colgroup>
            <thead className="sticky top-0 z-10 bg-surface-2 border-b-2 border-border">
              <tr>
                <th className={thCls}>Dia</th>
                <th className={thCls}>Técnico</th>
                <th className={thCls}>Cliente</th>
                <th className={thCls}>Evento</th>
                <th className={clsx(thCls, 'text-center')}>Hora Inst.</th>
                <th className={clsx(thCls, 'text-center')}>Hora Início</th>
                <th className={thCls}>DJ</th>
                <th className={clsx(thCls, 'border-l border-border/60')}>Folga</th>
              </tr>
            </thead>
            <tbody>
              {linhasPorDia.length === 0 && (
                <tr><td colSpan={8} className="py-16 text-center text-accent-subtle/40">Sem eventos activos neste mês.</td></tr>
              )}
              {linhasPorDia.map(({ dataStr, dia, linhas, folgas }, dayIdx) => {
                const tecsFolga = folgas.map(tid => tecnicos.find(t => t.id === tid)).filter(Boolean)
                const rowSpan   = linhas.length || 1
                const zebraCls  = dayIdx % 2 === 1 ? 'bg-white/[0.025]' : ''
                // cor de fundo da linha: primeiro técnico com folga, se existir
                const folgaRowCls = tecsFolga.length > 0
                  ? (tecCorMap[tecsFolga[0].id]?.row ?? 'bg-orange-400/[0.06]')
                  : null
                const rowsToRender = linhas.length > 0 ? linhas : [null]
                return rowsToRender.map((linha, li) => (
                  <tr key={linha ? `${dataStr}-${linha.espaco_id}` : `${dataStr}-empty`}
                    className={clsx(
                      'hover:bg-surface-2/20 transition-colors',
                      li < rowsToRender.length - 1 ? 'border-b border-border/10' : 'border-b border-border/30',
                      folgaRowCls ?? (isFds(dataStr) ? 'bg-blue-400/[0.04]' : zebraCls)
                    )}
                  >
                    {li === 0 && (
                      <td rowSpan={rowSpan} onClick={() => setModalFolga({ data: dataStr })} title="Gerir folgas"
                        className="px-3 py-2 text-accent-muted font-medium whitespace-nowrap align-top border-r border-border/40 cursor-pointer hover:bg-orange-400/5 transition-colors">
                        {diaSemanaData(dataStr)}
                      </td>
                    )}
                    {/* Técnico — draggable */}
                    {linha ? renderTecCell(linha) : <td className="px-2 py-2" />}
                    {/* Cliente */}
                    <td className="px-2 py-2 text-accent-muted font-medium whitespace-nowrap">{linha?.espacoNome ?? ''}</td>
                    {/* Evento */}
                    <td
                      onClick={() => linha?.ev && setModalEditEvento(linha.ev)}
                      className={clsx('px-2 py-2 text-accent-muted max-w-0 group', linha?.ev && 'cursor-pointer hover:text-accent transition-colors')}>
                      <span className="flex items-center gap-1">
                        <span className="block truncate">{linha?.ev?.evento ?? ''}</span>
                        {linha?.ev && <Pencil size={10} className="shrink-0 opacity-0 group-hover:opacity-40 transition-opacity" />}
                      </span>
                    </td>
                    {/* Hora Inst. */}
                    <td className="px-2 py-2 text-center tabular-nums whitespace-nowrap font-medium">
                      {linha?.ev?.hora_instalacao
                        ? <span className={tecCorMap[linha.tecId]?.text ?? 'text-accent-subtle'}>{hhmm(linha.ev.hora_instalacao)}</span>
                        : linha ? <span className="text-border/20">—</span> : null}
                    </td>
                    {/* Hora Início */}
                    <td className="px-2 py-2 text-center text-accent-subtle tabular-nums whitespace-nowrap">
                      {linha?.ev?.hora_inicio ? hhmm(linha.ev.hora_inicio) : linha ? <span className="text-border/20">—</span> : null}
                    </td>
                    {/* DJ */}
                    <td className="px-2 py-2 text-accent-muted whitespace-nowrap">
                      {linha ? (linha.djs?.length ? linha.djs.join(' · ') : <span className="text-border/20">—</span>) : null}
                    </td>
                    {/* Folga — rowSpan */}
                    {li === 0 && (
                      <td rowSpan={rowSpan}
                        onClick={() => setModalFolga({ data: dataStr })}
                        onDragOver={e => { e.preventDefault(); setDragOverFolga(dataStr) }}
                        onDragLeave={() => setDragOverFolga(null)}
                        onDrop={e => handleFolgaDrop(e, dataStr)}
                        title="Gerir folgas · arrastar para mover folga"
                        className={clsx(
                          'px-2 py-2 align-top border-l border-border/40 cursor-pointer transition-colors whitespace-nowrap',
                          dragOverFolga === dataStr ? 'bg-orange-400/10 outline outline-1 outline-orange-400/40' : 'hover:bg-orange-400/5'
                        )}>
                        {tecsFolga.length > 0
                          ? <span className="inline-flex flex-wrap gap-x-1 gap-y-1">
                              {tecsFolga.map(t => (
                                <FolgaChip key={t.id} tecnico={t} cor={tecCorMap[t.id]}
                                  dataStr={dataStr} onDragStart={handleFolgaDragStart}
                                  isDragging={dragFolga?.data === dataStr && dragFolga?.tecnicoId === t.id} />
                              ))}
                            </span>
                          : <span className="text-border/20 text-[10px]">—</span>
                        }
                      </td>
                    )}
                  </tr>
                ))
              })}
            </tbody>
          </table>
        )}

        {/* ════ VISTA ESTATÍSTICAS ════ */}
        {vista === 'stats' && (
          <VistaEstatisticas
            tecnicos={tecnicos}
            eventos={eventos}
            agendamentos={agendamentos}
            tecCorMap={tecCorMap}
          />
        )}

      </div>

      <ModalAtribuicao
        aberto={!!modalAtrib} celula={modalAtrib} tecnicos={tecnicos}
        eventos={eventos} agendamentos={agendamentos}
        onFechar={() => setModalAtrib(null)}
        onGuardado={() => { setModalAtrib(null); carregar() }}
      />
      <ModalFolga
        aberto={!!modalFolga} data={modalFolga?.data ?? null} tecnicos={tecnicos}
        folgasHoje={folgasIdx[modalFolga?.data] ?? []} agendamentos={agendamentos}
        onFechar={() => setModalFolga(null)}
        onGuardado={() => { setModalFolga(null); carregar() }}
      />
      <FormEvento
        aberto={!!modalEditEvento}
        evento={modalEditEvento}
        onFechar={() => setModalEditEvento(null)}
        onGuardado={() => { setModalEditEvento(null); carregar() }}
      />

      {/* Modal conflito drag & drop */}
      {conflitoDrag && (
        <ModalConflito
          conflitos={conflitoDrag.conflitos}
          nomeTecnico={tecnicos.find(t => t.id === conflitoDrag.src.tecnicoId)?.nome ?? ''}
          onConfirmar={() => { const { src, linha } = conflitoDrag; setConflitoDrag(null); executarDrop(src, linha) }}
          onCancelar={() => setConflitoDrag(null)}
        />
      )}
    </div>
  )
}
