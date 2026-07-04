import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, startOfWeek, endOfWeek, addDays, parseISO, isSameMonth } from 'date-fns'
import { pt } from 'date-fns/locale'
import { X, Search, Columns2, AlignJustify, BarChart3, Pencil, Info, AlertTriangle, List, CalendarDays, ChevronLeft, ChevronRight, Plus, Wrench, CalendarRange, Clock, CheckCircle, AlertCircle, ArrowLeftRight, ListChecks, Trash2, Save } from 'lucide-react'
import { OcorrenciaDetalhe } from '@/components/ocorrencias/OcorrenciaDetalhe'
import { ModalNovaOcorrencia } from '@/components/ocorrencias/ModalNovaOcorrencia'
import { useMesStore } from '@/store'
import { supabase } from '@/lib/supabase'
import { supaEventosApi } from '@/lib/supaEventosApi'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { LoadingPage } from '@/components/ui/LoadingSpinner'
import { clsx } from 'clsx'
import { corTecnico } from '@/utils/tecnicoColor'
import { FormEvento } from '@/components/eventos/FormEvento'

const isoData    = (d) => format(d, 'yyyy-MM-dd')
const hojeStr    = isoData(new Date())
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

// ── Modal trocar / substituir técnico ────────────────────────────────────────
function ModalTroca({ srcTecNome, dstTecNome, dstEvNome, podeTrocar, onSubstituir, onTrocar, onCancelar }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-surface-1 border border-border rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center gap-3">
          <span className="w-8 h-8 rounded-xl bg-accent/10 flex items-center justify-center shrink-0">
            <ArrowLeftRight size={16} className="text-accent" />
          </span>
          <div>
            <p className="text-sm font-bold text-accent">{dstEvNome}</p>
            <p className="text-[11px] text-accent-subtle mt-0.5">Já tem <span className="font-semibold text-accent">{dstTecNome}</span> atribuído</p>
          </div>
        </div>
        <div className="px-5 py-4 flex flex-col gap-2">
          <button onClick={onSubstituir}
            className="w-full px-4 py-3 rounded-xl bg-surface-2 hover:bg-surface-3 border border-border text-left transition-colors">
            <p className="text-[13px] font-semibold text-accent">Substituir</p>
            <p className="text-[11px] text-accent-subtle mt-0.5">{dstTecNome} é retirado · {srcTecNome} entra</p>
          </button>
          {podeTrocar && (
            <button onClick={onTrocar}
              className="w-full px-4 py-3 rounded-xl bg-accent/10 hover:bg-accent/15 border border-accent/30 text-left transition-colors">
              <p className="text-[13px] font-semibold text-accent">Trocar</p>
              <p className="text-[11px] text-accent-subtle mt-0.5">{srcTecNome} ↔ {dstTecNome} trocam de evento</p>
            </button>
          )}
        </div>
        <div className="px-5 py-3 border-t border-border flex justify-end">
          <Button variante="secundario" onClick={onCancelar}>Cancelar</Button>
        </div>
      </div>
    </div>
  )
}

// ── Modal Checklist por evento ────────────────────────────────────────────────
function ModalChecklistApoio({ eventoId, eventoNome, tecIds, tecnicos, tecCorMap, onFechar }) {
  const [listas,    setListas]    = useState([])  // [{ ecId, clId, nome, itens:[{id,texto,ordem}] }]
  const [checks,    setChecks]    = useState({})  // { [itemId]: Set<tecId> }
  const [templates, setTemplates] = useState([])
  const [loading,   setLoading]   = useState(true)

  useEffect(() => {
    const load = async () => {
      const [{ data: ecs }, { data: chks }, { data: tpls }] = await Promise.all([
        supabase.from('evento_checklists')
          .select('id, checklist_id, checklists(id, nome, checklist_itens(id, texto, ordem))')
          .eq('evento_id', eventoId),
        supabase.from('checklist_checks')
          .select('checklist_item_id, tecnico_id')
          .eq('evento_id', eventoId),
        supabase.from('checklists').select('id, nome').order('nome'),
      ])
      setListas((ecs ?? []).map(ec => ({
        ecId: ec.id, clId: ec.checklist_id, nome: ec.checklists?.nome ?? '?',
        itens: (ec.checklists?.checklist_itens ?? []).sort((a, b) => a.ordem - b.ordem),
      })))
      const m = {}
      for (const c of (chks ?? [])) {
        if (!m[c.checklist_item_id]) m[c.checklist_item_id] = new Set()
        m[c.checklist_item_id].add(c.tecnico_id)
      }
      setChecks(m)
      setTemplates(tpls ?? [])
      setLoading(false)
    }
    load()
  }, [eventoId])

  const toggle = async (itemId, tecId) => {
    const current = checks[itemId]?.has(tecId) ?? false
    setChecks(prev => {
      const s = new Set(prev[itemId] ?? [])
      if (current) s.delete(tecId); else s.add(tecId)
      return { ...prev, [itemId]: s }
    })
    if (!current) {
      await supabase.from('checklist_checks').upsert(
        { evento_id: eventoId, checklist_item_id: itemId, tecnico_id: tecId },
        { onConflict: 'evento_id,checklist_item_id,tecnico_id' }
      )
    } else {
      await supabase.from('checklist_checks').delete()
        .eq('evento_id', eventoId).eq('checklist_item_id', itemId).eq('tecnico_id', tecId)
    }
  }

  const addTemplate = async (clId) => {
    if (listas.some(l => l.clId === clId)) return
    const { data: ec } = await supabase.from('evento_checklists')
      .upsert({ evento_id: eventoId, checklist_id: clId }, { onConflict: 'evento_id,checklist_id' })
      .select('id, checklist_id, checklists(id, nome, checklist_itens(id, texto, ordem))').single()
    if (ec) {
      setListas(prev => [...prev, {
        ecId: ec.id, clId: ec.checklist_id, nome: ec.checklists?.nome ?? '?',
        itens: (ec.checklists?.checklist_itens ?? []).sort((a, b) => a.ordem - b.ordem),
      }])
    }
  }

  const assignedTecs = tecIds.map(id => tecnicos.find(t => t.id === id)).filter(Boolean)

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-surface-1 border border-border rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-border flex items-center gap-3 shrink-0">
          <span className="w-8 h-8 rounded-xl bg-accent/10 flex items-center justify-center shrink-0">
            <ListChecks size={16} className="text-accent" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-accent truncate">{eventoNome}</p>
            <p className="text-[11px] text-accent-subtle mt-0.5">Checklist</p>
          </div>
          <button onClick={onFechar} className="text-accent-subtle hover:text-accent transition-colors shrink-0">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
          {loading && <p className="text-sm text-accent-subtle text-center py-4">A carregar…</p>}

          {!loading && listas.length === 0 && (
            <p className="text-[12px] text-accent-subtle/50 text-center py-4 italic">Sem checklists associadas a este evento.</p>
          )}

          {listas.map(lista => (
            <div key={lista.clId} className="border border-border rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 bg-surface-2 border-b border-border/50">
                <ListChecks size={12} className="text-accent-subtle shrink-0" />
                <p className="text-[12px] font-semibold text-accent">{lista.nome}</p>
              </div>
              <div className="flex flex-col">
                {lista.itens.map((item, idx) => {
                  const checkedBy = checks[item.id] ?? new Set()
                  const allChecked = assignedTecs.length > 0 && assignedTecs.every(t => checkedBy.has(t.id))
                  return (
                    <div key={item.id} className={clsx(
                      'flex items-center gap-2 px-3 py-2 border-b border-border/30 last:border-0',
                      allChecked ? 'bg-status-confirmado/5' : ''
                    )}>
                      <span className="text-[10px] text-accent-subtle/40 w-4 text-right shrink-0">{idx + 1}.</span>
                      <p className={clsx('flex-1 text-[12px]', allChecked ? 'text-accent-subtle/50 line-through' : 'text-accent')}>{item.texto}</p>
                      <div className="flex items-center gap-1 shrink-0">
                        {assignedTecs.length === 0
                          ? <span className="text-[10px] text-accent-subtle/30 italic">sem técnico</span>
                          : assignedTecs.map(tec => {
                              const checked = checkedBy.has(tec.id)
                              const cor = tecCorMap[tec.id]
                              return (
                                <button key={tec.id}
                                  onClick={() => toggle(item.id, tec.id)}
                                  title={`${checked ? 'Desmarcar' : 'Marcar'} — ${tec.nome}`}
                                  className={clsx(
                                    'px-2 py-0.5 rounded-md text-[11px] font-semibold border transition-colors',
                                    checked
                                      ? (cor?.chip ?? 'bg-status-confirmado/20 text-status-confirmado border-status-confirmado/40')
                                      : 'bg-surface-2 text-accent-subtle/40 border-border/40 hover:border-accent/30 hover:text-accent-subtle'
                                  )}>
                                  {tec.nome.split(' ')[0]}
                                </button>
                              )
                            })
                        }
                      </div>
                    </div>
                  )
                })}
                {lista.itens.length === 0 && (
                  <p className="text-[11px] text-accent-subtle/30 italic px-3 py-2">Sem itens.</p>
                )}
              </div>
            </div>
          ))}

          {/* Adicionar checklist */}
          {templates.filter(t => !listas.some(l => l.clId === t.id)).length > 0 && (
            <div className="border border-dashed border-border/50 rounded-xl px-3 py-3">
              <p className="text-[10px] text-accent-subtle/50 uppercase tracking-wider mb-2">Adicionar checklist</p>
              <select className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-[12px] text-accent outline-none"
                value="" onChange={e => { if (e.target.value) addTemplate(e.target.value) }}>
                <option value="">— Seleccionar template —</option>
                {templates.filter(t => !listas.some(l => String(l.clId) === String(t.id)))
                  .map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
              </select>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Modal atribuição de técnico (multi-select) ────────────────────────────────
function ModalAtribuicao({ aberto, celula, tecnicos, eventos, agendamentos, onFechar, onGuardado }) {
  const [seleccionados, setSeleccionados] = useState([])
  const [loading, setLoading]             = useState(false)
  const [conflitos, setConflitos]         = useState([])
  const [confirmar, setConfirmar]         = useState(false)
  const [tecConflito, setTecConflito]     = useState('')

  useEffect(() => {
    if (!aberto) return
    setSeleccionados(celula?.tecIds ?? [])
    setConflitos([])
    setConfirmar(false)
  }, [aberto, celula])

  const toggle = (id) => {
    const next = seleccionados.includes(id)
      ? seleccionados.filter(x => x !== id)
      : [...seleccionados, id]
    setSeleccionados(next)
    // Verificar conflitos para técnicos recém adicionados
    if (!seleccionados.includes(id)) {
      const cs = detectarConflitos(id, celula?.data, celula?.evento?.id, eventos, agendamentos, tecnicos)
      if (cs.length > 0) { setConflitos(cs); setTecConflito(id); setConfirmar(true) }
    }
  }

  const executarGuardar = async (ids) => {
    if (!celula?.evento?.id) return
    setLoading(true)
    try {
      const eventoId = celula.evento.id
      const actuais  = celula.tecIds ?? []
      const adicionar = ids.filter(id => !actuais.includes(id))
      const remover   = actuais.filter(id => !ids.includes(id))
      if (adicionar.length)
        await supabase.from('evento_tecnicos').upsert(
          adicionar.map(tid => ({ evento_id: eventoId, tecnico_id: tid })),
          { onConflict: 'evento_id,tecnico_id' }
        )
      if (remover.length)
        await Promise.all(remover.map(tid =>
          supabase.from('evento_tecnicos').delete().eq('evento_id', eventoId).eq('tecnico_id', tid)
        ))
      onGuardado()
      onFechar()
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  const guardar = () => {
    // Verificar conflitos para novos seleccionados
    const novos = seleccionados.filter(id => !(celula?.tecIds ?? []).includes(id))
    for (const id of novos) {
      const cs = detectarConflitos(id, celula?.data, celula?.evento?.id, eventos, agendamentos, tecnicos)
      if (cs.length > 0) { setConflitos(cs); setTecConflito(id); setConfirmar(true); return }
    }
    executarGuardar(seleccionados)
  }

  return (
    <>
      <Modal aberto={aberto} onFechar={onFechar} largura="max-w-sm">
        <div className="flex flex-col">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <div>
              <p className="text-sm font-semibold text-accent">Técnicos do evento</p>
              {celula && <p className="text-[11px] text-accent-subtle mt-0.5">{celula.espaco} · {celula.data}</p>}
            </div>
            <button onClick={onFechar} className="text-accent-subtle hover:text-accent"><X size={15} /></button>
          </div>
          <div className="px-5 py-4 flex flex-col gap-3">
            {celula?.evento && (
              <div className="p-3 rounded-lg bg-surface-2 border border-border/50 text-[11px] flex flex-col gap-1">
                <span className="text-accent-muted"><span className="text-accent-subtle">Evento:</span> {celula.evento.evento}</span>
                {celula.evento?.hora_instalacao && <span className="text-accent-muted"><span className="text-accent-subtle">Inst.:</span> {hhmm(celula.evento.hora_instalacao)}</span>}
                {celula.evento?.hora_inicio && <span className="text-accent-muted"><span className="text-accent-subtle">Início:</span> {hhmm(celula.evento.hora_inicio)}</span>}
              </div>
            )}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-accent-subtle uppercase tracking-wider">Seleccionar técnicos</label>
              <div className="flex flex-col gap-1 max-h-52 overflow-y-auto">
                {tecnicos.map(t => (
                  <label key={t.id}
                    className={clsx(
                      'flex items-center gap-3 px-3 py-2 rounded-lg border cursor-pointer transition-all',
                      seleccionados.includes(t.id)
                        ? 'bg-status-confirmado/10 border-status-confirmado/30'
                        : 'bg-surface-2 border-border hover:border-white/20'
                    )}>
                    <input type="checkbox" checked={seleccionados.includes(t.id)}
                      onChange={() => toggle(t.id)} className="accent-green-400 w-3.5 h-3.5" />
                    <span className={clsx('text-xs font-medium', seleccionados.includes(t.id) ? 'text-status-confirmado' : 'text-accent-muted')}>
                      {t.nome}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className="px-5 py-3 border-t border-border flex justify-end gap-2">
            <Button variante="secundario" onClick={onFechar} disabled={loading}>Cancelar</Button>
            <Button onClick={guardar} disabled={loading}>{loading ? 'A guardar…' : 'Guardar'}</Button>
          </div>
        </div>
      </Modal>

      {confirmar && (
        <ModalConflito
          conflitos={conflitos}
          nomeTecnico={tecnicos.find(t => t.id === tecConflito)?.nome ?? ''}
          onConfirmar={() => { setConfirmar(false); executarGuardar(seleccionados) }}
          onCancelar={() => { setConfirmar(false); setSeleccionados(seleccionados.filter(id => id !== tecConflito)) }}
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
function FolgaChip({ tecnico, cor, dataStr, onDragStart, isDragging, onRemover }) {
  return (
    <span
      draggable
      onDragStart={e => { if (e.target.closest('button')) { e.preventDefault(); return } onDragStart(e, dataStr, tecnico.id) }}
      onDragEnd={() => {}}
      className={clsx(
        'group/fchip inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-semibold border select-none cursor-grab active:cursor-grabbing transition-opacity',
        cor?.chip ?? 'bg-orange-400/15 text-orange-400 border-orange-400/30',
        isDragging ? 'opacity-30' : 'opacity-100'
      )}
    >
      {tecnico.nome}
      {onRemover && (
        <button
          onMouseDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); e.preventDefault(); onRemover() }}
          className="opacity-0 group-hover/fchip:opacity-100 text-[14px] leading-none hover:opacity-100 transition-opacity"
        >×</button>
      )}
    </span>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────
// ── Modal Dia (vista mês) ─────────────────────────────────────────────────────
function ModalDia({ dataStr, tecnicos, tecCorMap, lmdPorDia, linhasBrutas, folgasIdx, onFechar, onNavegar, onEditEvento, onAtribuir, onNovoEvento }) {
  if (!dataStr) return null
  const grupo = linhasBrutas.find(g => g.dataStr === dataStr)
  const linhas = (grupo?.linhas ?? []).filter(l => l.ev !== null)
  const folgaIds = folgasIdx[dataStr] ?? []
  const lmdTecs = lmdPorDia[dataStr] ?? []
  const dt = new Date(dataStr + 'T00:00:00')
  const label = format(dt, "EEEE, d 'de' MMMM", { locale: pt })
  const isHoje = dataStr === hojeStr

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onFechar}>
      <div className="bg-surface-1 border border-border rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[80vh]" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <button onClick={() => onNavegar(-1)} className="p-1.5 rounded-lg hover:bg-surface-2 text-accent-subtle hover:text-accent transition-colors"><ChevronLeft size={16} /></button>
          <div className="flex-1 text-center">
            <p className={clsx('text-sm font-bold capitalize', isHoje && 'text-amber-400')}>{label}</p>
          </div>
          <button onClick={() => onNavegar(1)} className="p-1.5 rounded-lg hover:bg-surface-2 text-accent-subtle hover:text-accent transition-colors"><ChevronRight size={16} /></button>
          <button onClick={onFechar} className="ml-1 text-accent-subtle hover:text-accent"><X size={15} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
          {lmdTecs.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-red-400/70 mb-2">LMD</p>
              <div className="flex flex-wrap gap-1">
                {lmdTecs.map(tid => {
                  const tec = tecnicos.find(t => t.id === tid)
                  const cor = tecCorMap[tid]
                  if (!tec) return null
                  return <span key={tid} className={clsx('inline-flex items-center px-2 py-1 rounded-md text-[11px] font-semibold border', cor?.chip ?? 'bg-red-400/15 text-red-400 border-red-400/30')}>{tec.nome}</span>
                })}
              </div>
            </div>
          )}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-accent-subtle mb-2">Eventos</p>
            {linhas.length === 0
              ? <p className="text-xs text-accent-subtle/50">Sem eventos neste dia.</p>
              : <div className="flex flex-col gap-2">
                  {linhas.map(linha => (
                    <div key={linha.espaco_id} className="p-3 rounded-xl border border-border bg-surface-2 flex flex-col gap-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-accent">{linha.espacoNome}</span>
                        <div className="flex items-center gap-1">
                          <button onClick={() => onAtribuir(linha)} className="px-2 py-1 rounded-lg bg-surface-3 hover:bg-surface-4 text-accent-subtle hover:text-accent text-[10px] border border-border transition-colors">técnico</button>
                          {linha.ev && <button onClick={() => onEditEvento(linha.ev)} className="px-2 py-1 rounded-lg bg-surface-3 hover:bg-surface-4 text-accent-subtle hover:text-accent text-[10px] border border-border transition-colors"><Pencil size={9} /></button>}
                        </div>
                      </div>
                      {linha.ev && <p className="text-[11px] text-accent-muted truncate">{linha.ev.evento}</p>}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {(linha.tecIds ?? []).map(tid => {
                          const tec = tecnicos.find(t => t.id === tid)
                          const cor = tecCorMap[tid]
                          if (!tec) return null
                          return <span key={tid} className={clsx('inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold border', cor?.chip ?? 'bg-surface-3 text-accent-muted border-border')}>{tec.nome}</span>
                        })}
                        {(linha.tecIds ?? []).length === 0 && <span className="text-[11px] italic text-red-400/70">sem técnico</span>}
                      </div>
                      {(linha.ev?.hora_instalacao || linha.ev?.hora_inicio) && (
                        <div className="flex items-center gap-2 text-[10px] text-accent-subtle">
                          {linha.ev?.hora_instalacao && <span><Wrench size={9} className="inline mr-0.5" />{hhmm(linha.ev.hora_instalacao)}</span>}
                          {linha.ev?.hora_inicio && <span>{hhmm(linha.ev.hora_inicio)}</span>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
            }
            <button onClick={() => onNovoEvento(dataStr)} className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-2 hover:bg-surface-3 border border-border text-xs text-accent-subtle hover:text-accent transition-colors">
              <Plus size={12} /> Novo evento
            </button>
          </div>
          {folgaIds.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-orange-400/70 mb-2">Folgas</p>
              <div className="flex flex-wrap gap-1">
                {folgaIds.map(tid => {
                  const tec = tecnicos.find(t => t.id === tid)
                  const cor = tecCorMap[tid]
                  if (!tec) return null
                  return <span key={tid} className={clsx('inline-flex items-center px-2 py-1 rounded-md text-[11px] font-semibold border', cor?.chip ?? 'bg-orange-400/15 text-orange-400 border-orange-400/30')}>{tec.nome}</span>
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Vista Ocorrências (Admin) ─────────────────────────────────────────────────
const STATUS_OC = {
  aberta:      { label: 'Aberta',      Ic: AlertCircle,  cls: 'text-red-400 bg-red-400/10 border-red-400/30' },
  em_processo: { label: 'Em processo', Ic: Clock,         cls: 'text-amber-400 bg-amber-400/10 border-amber-400/30' },
  fechada:     { label: 'Fechada',     Ic: CheckCircle,   cls: 'text-green-400 bg-green-400/10 border-green-400/30' },
}
const FILTROS_OC = [
  { id: 'todas', label: 'Todas' },
  { id: 'aberta', label: 'Abertas' },
  { id: 'em_processo', label: 'Em processo' },
  { id: 'fechada', label: 'Fechadas' },
]

function VistaOcorrencias({ espacos }) {
  const [ocorrencias, setOcorrencias] = useState([])
  const [intervIdx,   setIntervIdx]   = useState({})
  const [loading,     setLoading]     = useState(true)
  const [filtro,      setFiltro]      = useState('todas')
  const [aberta,      setAberta]      = useState(null)
  const [modalNova,   setModalNova]   = useState(false)
  const [versao,      setVersao]      = useState(0)

  useEffect(() => {
    let activo = true
    setLoading(true)
    supabase.from('ocorrencias').select('*, espacos(nome)').order('created_at', { ascending: false })
      .then(async ({ data: ocs }) => {
        if (!activo) return
        const ids = (ocs ?? []).map(o => o.id)
        let ivIdx = {}
        if (ids.length > 0) {
          const { data: ivs } = await supabase.from('ocorrencias_intervencoes')
            .select('*').in('ocorrencia_id', ids).order('created_at', { ascending: true })
          ;(ivs ?? []).forEach(iv => {
            if (!ivIdx[iv.ocorrencia_id]) ivIdx[iv.ocorrencia_id] = []
            ivIdx[iv.ocorrencia_id].push(iv)
          })
        }
        setOcorrencias(ocs ?? [])
        setIntervIdx(ivIdx)
        setLoading(false)
      })
    return () => { activo = false }
  }, [versao])

  const atualizar = () => {
    setVersao(v => v + 1)
    if (aberta) {
      supabase.from('ocorrencias').select('*, espacos(nome)').eq('id', aberta.id).single()
        .then(({ data }) => data && setAberta(data))
    }
  }

  const lista = filtro === 'todas' ? ocorrencias : ocorrencias.filter(o => o.status === filtro)

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-border/40 flex-wrap">
        <div className="flex gap-1 flex-wrap">
          {FILTROS_OC.map(f => (
            <button key={f.id} onClick={() => setFiltro(f.id)}
              className={clsx('px-3 py-1 rounded-full border text-[11px] font-semibold transition-colors',
                filtro === f.id
                  ? 'bg-amber-400/15 border-amber-400/30 text-amber-400'
                  : 'bg-surface-2/60 border-border/60 text-accent-subtle hover:text-accent')}>
              {f.label}
            </button>
          ))}
        </div>
        <button onClick={() => setModalNova(true)}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-amber-400/30 bg-amber-400/10 text-amber-400 text-[12px] font-semibold hover:bg-amber-400/20 transition-colors">
          <Plus size={13} />Nova ocorrência
        </button>
      </div>

      {/* Lista */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading
          ? <div className="flex items-center justify-center py-16 text-accent-subtle/40">A carregar…</div>
          : lista.length === 0
          ? <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <AlertTriangle size={32} className="text-accent-subtle/20" />
              <p className="text-[13px] text-accent-subtle/50">Sem ocorrências.</p>
            </div>
          : <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {lista.map(oc => {
                const cfg = STATUS_OC[oc.status] ?? STATUS_OC.aberta
                const Ic  = cfg.Ic
                const nIv = (intervIdx[oc.id] ?? []).length
                return (
                  <button key={oc.id} onClick={() => setAberta(oc)}
                    className="text-left rounded-xl border border-border/60 bg-surface-1 hover:border-white/15 active:scale-[0.99] transition-all px-4 py-3">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="text-[13px] font-bold text-accent leading-snug">{oc.titulo}</p>
                      <span className={clsx('shrink-0 inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border', cfg.cls)}>
                        <Ic size={9} />{cfg.label}
                      </span>
                    </div>
                    {oc.descricao && <p className="text-[11px] text-accent-muted line-clamp-2 mb-1">{oc.descricao}</p>}
                    {oc.foto_url && <img src={oc.foto_url} alt="" className="w-full h-24 object-cover rounded-lg border border-border/30 mb-1" />}
                    <div className="flex items-center gap-2 text-[10px] text-accent-subtle/60 flex-wrap">
                      <span>{oc.data_ocorrencia}</span>
                      {oc.espacos?.nome && <><span>·</span><span>{oc.espacos.nome}</span></>}
                      <span>·</span><span>{oc.registado_por}</span>
                      {nIv > 0 && <><span>·</span><span>{nIv} interv.</span></>}
                    </div>
                  </button>
                )
              })}
            </div>
        }
      </div>

      {aberta && (
        <OcorrenciaDetalhe
          ocorrencia={aberta}
          intervencoes={intervIdx[aberta.id] ?? []}
          nomeUtilizador="Admin"
          tipoUtilizador="admin"
          podeEditar
          onFechar={() => setAberta(null)}
          onAtualizar={atualizar}
          onApagar={() => setVersao(v => v + 1)}
        />
      )}
      {modalNova && (
        <ModalNovaOcorrencia
          nomeUtilizador="Admin"
          tipoUtilizador="admin"
          espacos={espacos}
          onFechar={() => setModalNova(false)}
          onCriada={() => setVersao(v => v + 1)}
        />
      )}
    </div>
  )
}

// ── Vista Checklists (Admin) ──────────────────────────────────────────────────
function VistaChecklists() {
  const [checklists, setChecklists] = useState([])  // [{ id, nome, tipo_evento_id, _tipoNome, itens:[{id,texto,ordem,_key}], _editNome, _deletedItems, _dirty }]
  const [tipos,      setTipos]      = useState([])
  const [loading,    setLoading]    = useState(true)
  const [saving,     setSaving]     = useState(null) // id being saved

  const uidL = () => Math.random().toString(36).slice(2)

  useEffect(() => {
    Promise.all([
      supabase.from('checklists').select('id, nome, tipo_evento_id, checklist_itens(id, texto, ordem)').order('nome'),
      supabase.from('tipo_eventos').select('id, nome').order('nome'),
    ]).then(([{ data: cls }, { data: tps }]) => {
      setTipos(tps ?? [])
      setChecklists((cls ?? []).map(cl => ({
        ...cl,
        _tipoNome: (tps ?? []).find(t => t.id === cl.tipo_evento_id)?.nome ?? '',
        _editNome: cl.nome,
        _tipoSel: cl.tipo_evento_id ?? '',
        itens: (cl.checklist_itens ?? []).sort((a, b) => a.ordem - b.ordem).map(it => ({ ...it, _key: uidL() })),
        _deletedItems: [],
        _dirty: false,
        _open: false,
      })))
      setLoading(false)
    })
  }, [])

  const update = (id, patch) => setChecklists(prev => prev.map(cl => cl.id === id ? { ...cl, ...patch, _dirty: true } : cl))

  const updateItem = (clId, key, patch) => setChecklists(prev => prev.map(cl => {
    if (cl.id !== clId) return cl
    return { ...cl, itens: cl.itens.map(it => it._key === key ? { ...it, ...patch } : it), _dirty: true }
  }))

  const addItem = (clId) => setChecklists(prev => prev.map(cl =>
    cl.id === clId ? { ...cl, itens: [...cl.itens, { id: null, texto: '', ordem: cl.itens.length, _key: uidL() }], _dirty: true } : cl
  ))

  const removeItem = (clId, key) => setChecklists(prev => prev.map(cl => {
    if (cl.id !== clId) return cl
    const item = cl.itens.find(it => it._key === key)
    return {
      ...cl,
      itens: cl.itens.filter(it => it._key !== key),
      _deletedItems: item?.id ? [...cl._deletedItems, item.id] : cl._deletedItems,
      _dirty: true,
    }
  }))

  const saveChecklist = async (cl) => {
    setSaving(cl.id)
    try {
      await supabase.from('checklists').update({ nome: cl._editNome, tipo_evento_id: cl._tipoSel || null }).eq('id', cl.id)
      for (const itemId of cl._deletedItems) {
        await supabase.from('checklist_itens').delete().eq('id', itemId)
      }
      const newItens = []
      for (let i = 0; i < cl.itens.length; i++) {
        const it = cl.itens[i]
        if (!it.texto.trim()) continue
        if (it.id) {
          await supabase.from('checklist_itens').update({ texto: it.texto, ordem: i }).eq('id', it.id)
          newItens.push({ ...it, ordem: i })
        } else {
          const { data } = await supabase.from('checklist_itens').insert({ checklist_id: cl.id, texto: it.texto, ordem: i }).select('id').single()
          newItens.push({ ...it, id: data?.id, ordem: i })
        }
      }
      setChecklists(prev => prev.map(c => c.id === cl.id ? {
        ...c, nome: cl._editNome, tipo_evento_id: cl._tipoSel || null,
        _tipoNome: tipos.find(t => t.id === cl._tipoSel)?.nome ?? '',
        itens: newItens, _deletedItems: [], _dirty: false,
      } : c))
    } catch (e) { console.error(e) }
    setSaving(null)
  }

  const deleteChecklist = async (id) => {
    if (!window.confirm('Apagar esta checklist?')) return
    await supabase.from('checklists').delete().eq('id', id)
    setChecklists(prev => prev.filter(cl => cl.id !== id))
  }

  const createChecklist = async () => {
    const { data } = await supabase.from('checklists').insert({ nome: 'Nova Checklist' }).select('id, nome, tipo_evento_id').single()
    if (data) {
      setChecklists(prev => [...prev, {
        ...data, _editNome: data.nome, _tipoSel: '', _tipoNome: '',
        itens: [], _deletedItems: [], _dirty: false, _open: true,
      }])
    }
  }

  if (loading) return <div className="p-8 text-center text-accent-subtle text-sm">A carregar…</div>

  return (
    <div className="p-4 flex flex-col gap-3 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-1">
        <p className="text-sm font-bold text-accent">Checklists</p>
        <button onClick={createChecklist}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-2 hover:bg-surface-3 border border-border text-xs text-accent-subtle hover:text-accent transition-colors">
          <Plus size={12} /> Nova checklist
        </button>
      </div>

      {checklists.length === 0 && (
        <p className="text-center text-accent-subtle/40 italic text-sm py-8">Sem checklists. Cria a primeira.</p>
      )}

      {checklists.map(cl => (
        <div key={cl.id} className="border border-border rounded-xl overflow-hidden bg-surface-1">
          {/* Header */}
          <div className="flex items-center gap-2 px-3 py-2.5 bg-surface-2 border-b border-border/50">
            <ListChecks size={13} className="text-accent-subtle shrink-0" />
            <input
              className="flex-1 text-[13px] font-semibold text-accent bg-transparent outline-none min-w-0"
              value={cl._editNome}
              onChange={e => update(cl.id, { _editNome: e.target.value })}
            />
            <select
              className="text-[11px] bg-surface-3 border border-border/50 rounded px-2 py-0.5 text-accent-subtle outline-none"
              value={cl._tipoSel}
              onChange={e => update(cl.id, { _tipoSel: e.target.value })}
            >
              <option value="">— Tipo —</option>
              {tipos.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
            </select>
            <button onClick={() => setChecklists(prev => prev.map(c => c.id === cl.id ? { ...c, _open: !c._open } : c))}
              className="text-accent-subtle/50 hover:text-accent transition-colors text-[11px] px-1">
              {cl._open ? '▲' : '▼'}
            </button>
            {cl._dirty && (
              <button onClick={() => saveChecklist(cl)} disabled={saving === cl.id}
                className="flex items-center gap-1 px-2 py-0.5 rounded bg-status-confirmado/15 border border-status-confirmado/30 text-status-confirmado text-[11px] hover:bg-status-confirmado/25 transition-colors disabled:opacity-50">
                <Save size={11} />{saving === cl.id ? '…' : 'Guardar'}
              </button>
            )}
            <button onClick={() => deleteChecklist(cl.id)}
              className="text-accent-subtle/30 hover:text-status-cancelado transition-colors shrink-0">
              <Trash2 size={13} />
            </button>
          </div>

          {/* Itens */}
          {cl._open && (
            <div className="px-3 py-2 flex flex-col gap-1.5">
              {cl.itens.map((item, idx) => (
                <div key={item._key} className="flex items-center gap-2">
                  <span className="text-[10px] text-accent-subtle/40 w-4 text-right shrink-0">{idx + 1}.</span>
                  <input
                    className="flex-1 text-[12px] text-accent bg-transparent border-b border-border/30 focus:border-accent/40 outline-none py-0.5"
                    value={item.texto}
                    placeholder={`Item ${idx + 1}…`}
                    onChange={e => updateItem(cl.id, item._key, { texto: e.target.value })}
                  />
                  <button onClick={() => removeItem(cl.id, item._key)}
                    className="text-accent-subtle/25 hover:text-status-cancelado transition-colors shrink-0">
                    <X size={11} />
                  </button>
                </div>
              ))}
              <button onClick={() => addItem(cl.id)}
                className="flex items-center gap-1 text-[11px] text-accent-subtle/40 hover:text-status-confirmado/70 transition-colors mt-1">
                <Plus size={11} /> Adicionar item
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

export function ApoioTecnico() {
  const { anoMes } = useMesStore()
  const [loading, setLoading]           = useState(true)
  const [tecnicos, setTecnicos]         = useState([])
  const [agendamentos, setAgendamentos] = useState([])
  const [eventos, setEventos]           = useState([])
  const [evTecnicos, setEvTecnicos]     = useState([])  // evento_tecnicos
  const [slots, setSlots]               = useState([])
  const [espacos, setEspacos]           = useState([])
  const [modalAtrib, setModalAtrib]       = useState(null)
  const [modalFolga, setModalFolga]       = useState(null)
  const [modalEditEvento, setModalEditEvento] = useState(null) // evento obj
  const [filtroEspaco, setFiltroEspaco]   = useState('')
  const [filtroTecnico, setFiltroTecnico] = useState('')
  const [pesquisa, setPesquisa]           = useState('')
  const [vista, setVista]                 = useState('lista') // lista | semana | mes | colunas | stats | ocorrencias
  const [semanaRef, setSemanaRef]         = useState(hojeStr)
  const [modalDia, setModalDia]           = useState(null)
  const [modalChecklist, setModalChecklist] = useState(null) // { eventoId, eventoNome, tecIds }

  // ── Scroll refs ─────────────────────────────────────────────────────────────
  const scrollRef   = useRef(null)
  const savedScroll = useRef({ top: 0, left: 0 })

  // ── Drag state (técnico) ────────────────────────────────────────────────────
  const [dragSource, setDragSource] = useState(null)  // { dropKey, tecnicoId, eventoId, agId }
  const dragSourceRef               = useRef(null)    // ref para evitar stale closure no handleDrop
  const [dragOver, setDragOver]     = useState(null)  // dropKey string

  // ── Drag state (folga) ──────────────────────────────────────────────────────
  const [dragFolga, setDragFolga]         = useState(null)
  const [dragOverFolga, setDragOverFolga] = useState(null)
  const [dragOverLmd,   setDragOverLmd]   = useState(null)

  const { dataInicio, dataFim, dias, dataInicioExt, dataFimExt, diasExt } = useMemo(() => {
    const [ano, mes] = anoMes.split('-').map(Number)
    const ref    = new Date(ano, mes - 1, 1)
    const inicio = startOfMonth(ref)
    const fim    = endOfMonth(ref)
    const inicioExt = startOfWeek(inicio, { weekStartsOn: 1 })
    const fimExt    = endOfWeek(fim, { weekStartsOn: 1 })
    return {
      dataInicio: isoData(inicio), dataFim: isoData(fim),
      dias: eachDayOfInterval({ start: inicio, end: fim }),
      dataInicioExt: isoData(inicioExt), dataFimExt: isoData(fimExt),
      diasExt: eachDayOfInterval({ start: inicioExt, end: fimExt }),
    }
  }, [anoMes])

  const carregar = useCallback(async () => {
    setLoading(true)
    const [tRes, eRes, agRes, evRes, slRes] = await Promise.all([
      supabase.from('tecnicos').select('id, nome, ativo, tipo').eq('ativo', true).order('nome'),
      supabase.from('espacos').select('id, nome').eq('activo', true).order('nome'),
      supabase.from('agendamentos_tecnicos').select('*').gte('data', dataInicioExt).lte('data', dataFimExt),
      supabase.from('supa_eventos')
        .select('id, espaco_id, evento, data_evento, hora_inicio, hora_fim, hora_instalacao, dia_instalacao, status, tecnico_id, tecnico2_id, valor_apoio_tecnico, tipo, notas_operacionais, Equipamentos, contacto_pelo_evento, morada, rider_url')
        .gte('data_evento', dataInicioExt).lte('data_evento', dataFimExt).neq('status', 'cancelado'),
      supabase.from('agenda')
        .select('id, espaco_id, data, dj_nome, dj_id, tipo_slot, estado, djs(nome, nome_artistico)')
        .gte('data', dataInicioExt).lte('data', dataFimExt)
        .not('estado', 'in', '("cancelado","sem_efeito","faltou")'),
    ])
    if (!tRes.error) setTecnicos(tRes.data ?? [])
    if (!eRes.error) setEspacos(eRes.data ?? [])
    if (!agRes.error) setAgendamentos(agRes.data ?? [])
    if (!evRes.error) {
      const evs = evRes.data ?? []
      setEventos(evs)
      // Fetch tecnicos para os eventos deste mês
      if (evs.length > 0) {
        const { data: etData } = await supabase
          .from('evento_tecnicos')
          .select('evento_id, tecnico_id')
          .in('evento_id', evs.map(e => e.id))
        setEvTecnicos(etData ?? [])
      } else {
        setEvTecnicos([])
      }
    }
    if (!slRes.error) setSlots(slRes.data ?? [])
    setLoading(false)
  }, [dataInicioExt, dataFimExt])

  useEffect(() => { carregar() }, [carregar])
  useEffect(() => { setFiltroEspaco(''); setFiltroTecnico(''); setPesquisa('') }, [anoMes])

  useEffect(() => {
    const ch = supabase.channel('apoio-tecnico-eventos')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'supa_eventos' }, () => carregar())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [carregar])


  const carregarComScroll = useCallback(() => {
    if (scrollRef.current) {
      savedScroll.current = { top: scrollRef.current.scrollTop, left: scrollRef.current.scrollLeft }
    }
    return carregar()
  }, [carregar])

  useEffect(() => {
    if (!loading && (savedScroll.current.top > 0 || savedScroll.current.left > 0)) {
      requestAnimationFrame(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop  = savedScroll.current.top
          scrollRef.current.scrollLeft = savedScroll.current.left
        }
      })
    }
  }, [loading])

  // ── Handlers folga drag ──────────────────────────────────────────────────────
  const handleFolgaDragStart = useCallback((e, data, tecnicoId) => {
    e.stopPropagation()
    e.dataTransfer.effectAllowed = 'move'
    setDragFolga({ data, tecnicoId })
  }, [])

  const handleFolgaDrop = useCallback(async (e, targetData) => {
    e.preventDefault()
    e.stopPropagation()

    // ── Caso 1: drag de chip de técnico (paleta ou slot) ────────────────────
    const tecIdFromTransfer = e.dataTransfer.getData('tecnicoId')
    const tecId = tecIdFromTransfer || dragSourceRef.current?.tecnicoId
    if (tecId) {
      const srcEvento  = e.dataTransfer.getData('eventoId')  || dragSourceRef.current?.eventoId || null
      const srcDropKey = e.dataTransfer.getData('dropKey')   || dragSourceRef.current?.dropKey  || null
      dragSourceRef.current = null; setDragSource(null); setDragOverFolga(null)
      try {
        const { data: existe } = await supabase.from('agendamentos_tecnicos')
          .select('id').eq('data', targetData).eq('tecnico_id', tecId).eq('folga', true).maybeSingle()
        if (!existe) await supabase.from('agendamentos_tecnicos')
          .insert({ data: targetData, tecnico_id: tecId, folga: true })
        if (srcEvento && srcDropKey) await supabase.from('evento_tecnicos')
          .delete().eq('evento_id', srcEvento).eq('tecnico_id', tecId)
        carregarComScroll()
      } catch (err) { console.error('Folga drop (tech):', err) }
      return
    }

    // ── Caso 2: drag de FolgaChip (mover folga) ─────────────────────────────
    if (!dragFolga || dragFolga.data === targetData) { setDragFolga(null); setDragOverFolga(null); return }
    try {
      const folgaOrigem = agendamentos.find(a => a.data === dragFolga.data && a.tecnico_id === dragFolga.tecnicoId && a.folga)
      if (folgaOrigem) await supabase.from('agendamentos_tecnicos').delete().eq('id', folgaOrigem.id)
      const jaExiste = agendamentos.find(a => a.data === targetData && a.tecnico_id === dragFolga.tecnicoId && a.folga)
      if (!jaExiste) await supabase.from('agendamentos_tecnicos').insert({ data: targetData, tecnico_id: dragFolga.tecnicoId, folga: true })
      carregarComScroll()
    } catch (err) { console.error('Folga drop (move):', err) }
    finally { setDragFolga(null); setDragOverFolga(null) }
  }, [dragFolga, agendamentos, carregarComScroll])

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

  // evento_id → tecnico_id[] (apenas evento_tecnicos — tecnico_id é sincronizado pelo API)
  const evTecIdx = useMemo(() => {
    const idx = {}
    evTecnicos.forEach(({ evento_id, tecnico_id }) => {
      if (!idx[evento_id]) idx[evento_id] = []
      if (!idx[evento_id].includes(tecnico_id)) idx[evento_id].push(tecnico_id)
    })
    return idx
  }, [evTecnicos])

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

  // Só espaços com actividade no mês + LMD sempre presente
  const espacosActivos = useMemo(() => {
    const ids = new Set([...eventos.map(e => e.espaco_id), ...slots.map(s => s.espaco_id)])
    return espacos.filter(e => ids.has(e.id) || e.nome?.trim().toLowerCase() === 'lmd')
  }, [espacos, eventos, slots])

  // Técnicos fixos + i4DJ espaco_id
  const tecnicosFixos = useMemo(() => tecnicos.filter(t => t.tipo === 'fixo'), [tecnicos])
  const i4djEspacoId  = useMemo(() => espacos.find(e => e.nome?.trim().toLowerCase() === 'lmd')?.id ?? null, [espacos])

  const handleLmdDrop = useCallback(async (e, dataStr, linhasLmdDia) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOverLmd(null)
    const tecIdFromTransfer = e.dataTransfer.getData('tecnicoId')
    const tecId = tecIdFromTransfer || dragSourceRef.current?.tecnicoId
    if (!tecId || !i4djEspacoId) return
    const srcEvento = e.dataTransfer.getData('eventoId') || dragSourceRef.current?.eventoId || null
    const srcAgId   = dragSourceRef.current?.agId || null
    dragSourceRef.current = null; setDragSource(null)
    try {
      if (srcEvento) await supabase.from('evento_tecnicos').delete().eq('evento_id', srcEvento).eq('tecnico_id', tecId)
      else if (srcAgId) await supabase.from('agendamentos_tecnicos').update({ tecnico_id: null }).eq('id', srcAgId)
      const existingEv = linhasLmdDia?.find(l => l.ev)?.ev
      if (existingEv) {
        await supabase.from('evento_tecnicos')
          .upsert({ evento_id: existingEv.id, tecnico_id: tecId }, { onConflict: 'evento_id,tecnico_id' })
      } else {
        await supaEventosApi.criar({
          espaco_id: i4djEspacoId, data_evento: dataStr,
          evento: 'Trabalho LMD', hora_instalacao: '10:00:00', hora_inicio: '19:00:00',
          status: 'confirmado', tecnico_id: tecId,
        })
      }
      carregarComScroll()
    } catch (err) { console.error('LMD drop:', err) }
  }, [i4djEspacoId, carregarComScroll])

  // Semana view: 7 dias a partir de 2ª feira da semana que contém semanaRef
  const semana7 = useMemo(() => {
    const ref = parseISO(semanaRef)
    const lun = startOfWeek(ref, { weekStartsOn: 1 })
    return Array.from({ length: 7 }, (_, i) => isoData(addDays(lun, i)))
  }, [semanaRef])

  // LMD por dia: data → tecIds (técnicos fixos livres = no LMD)
  const lmdPorDia = useMemo(() => {
    const m = {}
    diasExt.forEach(dia => {
      const dataStr    = isoData(dia)
      const folgasHoje = new Set(folgasIdx[dataStr] ?? [])
      // Técnicos já atribuídos a qualquer evento neste dia
      const atribuidos = new Set(
        evTecnicos
          .filter(et => { const ev2 = eventos.find(e => e.id === et.evento_id); return ev2?.data_evento === dataStr })
          .map(et => et.tecnico_id)
      )
      // LMD manual (evento_tecnicos para o espaço LMD)
      const lmdEv = i4djEspacoId ? evIdx[`${dataStr}|${i4djEspacoId}`] : null
      const lmdTecs = lmdEv ? (evTecIdx[lmdEv.id] ?? []) : []
      // Técnicos fixos livres (auto-LMD)
      const livres = tecnicosFixos
        .filter(t => !folgasHoje.has(t.id) && !atribuidos.has(t.id))
        .map(t => t.id)
      m[dataStr] = [...new Set([...lmdTecs, ...livres])]
    })
    return m
  }, [diasExt, folgasIdx, evTecnicos, eventos, evTecIdx, evIdx, tecnicosFixos, i4djEspacoId])

  const linhasBrutas = useMemo(() => {
    const result = []
    diasExt.forEach(dia => {
      const dataStr = isoData(dia)
      const linhas  = []
      // LMD é cliente real: entra nas linhas como qualquer outro espaço
      // (continua também a ser mostrado na coluna especial "LMD" à direita)
      espacos.forEach(espaco => {
        const k      = `${dataStr}|${espaco.id}`
        const ev     = evIdx[k] ?? null
        const dj     = djIdx[k]
        const ag     = agIdx[k] ?? null
        const tecIds = ev ? (evTecIdx[ev.id] ?? (ag?.tecnico_id ? [ag.tecnico_id] : []))
                          : (ag?.tecnico_id ? [ag.tecnico_id] : [])
        linhas.push({ dataStr, dia, espaco_id: espaco.id, espacoNome: espaco.nome.trim(), ev, djs: dj ?? [], ag, tecIds })
      })
      result.push({ dataStr, dia, linhas, folgas: folgasIdx[dataStr] ?? [] })
    })
    return result
  }, [diasExt, espacos, evIdx, djIdx, agIdx, folgasIdx, evTecIdx, i4djEspacoId])

  const linhasPorDia = useMemo(() => {
    const q = pesquisa.trim().toLowerCase()
    const tecFiltroId = filtroTecnico
      ? tecnicos.find(t => t.nome === filtroTecnico)?.id ?? null
      : null

    return linhasBrutas.filter(grupo => grupo.dataStr >= dataInicio && grupo.dataStr <= dataFim).map(grupo => {
      let linhas = grupo.linhas

      if (filtroEspaco) linhas = linhas.filter(l => l.espaco_id === filtroEspaco)

      if (tecFiltroId) {
        linhas = linhas.filter(l => (l.tecIds ?? []).includes(tecFiltroId))
      }

      if (q) linhas = linhas.filter(l => {
        const tecNomes = (l.tecIds ?? []).map(id => tecnicos.find(t => t.id === id)?.nome ?? '').join(' ')
        return l.espacoNome.toLowerCase().includes(q) ||
          (l.ev?.evento ?? '').toLowerCase().includes(q) ||
          (l.djs?.join(' ') ?? '').toLowerCase().includes(q) ||
          tecNomes.toLowerCase().includes(q)
      })

      return { ...grupo, linhas }
    }).filter(Boolean)
  }, [linhasBrutas, dataInicio, dataFim, filtroEspaco, filtroTecnico, pesquisa, tecnicos])

  // Estatísticas por técnico — filtradas pelo espaço seleccionado
  const tecStats = useMemo(() => {
    const m = {}
    tecnicos.forEach(t => { m[t.id] = { datas: 0, folgas: 0, valor: 0 } })
    // Filtrar eventos pelo espaço activo
    const eventosFiltrados = filtroEspaco
      ? eventos.filter(e => e.espaco_id === filtroEspaco)
      : eventos
    const eventoIdsFiltrados = new Set(eventosFiltrados.map(e => e.id))
    // Datas com trabalho
    const datasVistas = {}
    evTecnicos.forEach(({ evento_id, tecnico_id }) => {
      if (!eventoIdsFiltrados.has(evento_id)) return
      const ev = eventos.find(e => e.id === evento_id)
      if (!ev) return
      if (!datasVistas[tecnico_id]) datasVistas[tecnico_id] = new Set()
      datasVistas[tecnico_id].add(ev.data_evento)
      if (m[tecnico_id]) m[tecnico_id].valor += (ev.valor_apoio_tecnico ?? 0)
    })
    Object.entries(datasVistas).forEach(([tid, set]) => {
      if (m[tid]) m[tid].datas = set.size
    })
    // Folgas — filtradas pelo espaço se existir
    agendamentos.filter(a => a.folga && (!filtroEspaco || a.espaco_id === filtroEspaco || !a.espaco_id)).forEach(a => {
      if (m[a.tecnico_id]) m[a.tecnico_id].folgas++
    })
    return m
  }, [tecnicos, evTecnicos, eventos, agendamentos, filtroEspaco])

  const maxGrupos = useMemo(() =>
    Math.max(1, ...linhasPorDia.map(g => g.linhas.length))
  , [linhasPorDia])

  // ── Handlers de drag & drop ──────────────────────────────────────────────────
  const handleDragStart = useCallback((e, linha, tecnicoId) => {
    e.dataTransfer.effectAllowed = 'move'
    const tec = tecnicos.find(t => t.id === tecnicoId)
    const ghost = document.createElement('span')
    ghost.textContent = tec?.nome ?? '?'
    ghost.style.cssText = 'position:fixed;top:-100px;left:-100px;padding:2px 10px;background:#22c55e22;color:#22c55e;border:1px solid #22c55e44;border-radius:999px;font-size:11px;font-weight:600;'
    document.body.appendChild(ghost)
    e.dataTransfer.setDragImage(ghost, ghost.offsetWidth / 2, 12)
    setTimeout(() => document.body.removeChild(ghost), 0)
    const src = {
      dropKey:   `${linha.dataStr}|${linha.espaco_id}`,
      tecnicoId,
      eventoId:  linha.ev?.id ?? null,
      agId:      linha.ag?.id ?? null,
    }
    dragSourceRef.current = src
    setDragSource(src)
    e.dataTransfer.setData('tecnicoId', tecnicoId)
    e.dataTransfer.setData('eventoId', src.eventoId ?? '')
    e.dataTransfer.setData('dropKey', src.dropKey ?? '')
  }, [tecnicos])

  const handleDragEnd = useCallback(() => {
    dragSourceRef.current = null
    setDragSource(null)
    setDragOver(null)
  }, [])

  const removerFolga = useCallback(async (dataStr, tecnicoId) => {
    const ag = agendamentos.find(a => a.data === dataStr && a.tecnico_id === tecnicoId && a.folga)
    if (!ag) return
    try {
      await supabase.from('agendamentos_tecnicos').delete().eq('id', ag.id)
      carregarComScroll()
    } catch (err) { console.error(err) }
  }, [agendamentos, carregarComScroll])

  const removerTecSlot = useCallback(async (linha, tecnicoId) => {
    try {
      if (linha.ev?.id) {
        await supabase.from('evento_tecnicos').delete().eq('evento_id', linha.ev.id).eq('tecnico_id', tecnicoId)
      } else if (linha.ag?.id) {
        await supabase.from('agendamentos_tecnicos').update({ tecnico_id: null }).eq('id', linha.ag.id)
      }
      carregarComScroll()
    } catch (err) { console.error(err) }
  }, [carregarComScroll])

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

  const executarDrop = useCallback(async (src, linha, modo = 'mover') => {
    try {
      const dstTecIds   = linha.tecIds ?? []
      const vemDeEvento = src.eventoId && src.dropKey !== null

      if (modo === 'trocar') {
        const dstTecId = dstTecIds.find(tid => tid !== src.tecnicoId)
        await Promise.all([
          supabase.from('evento_tecnicos').delete().eq('evento_id', src.eventoId).eq('tecnico_id', src.tecnicoId),
          supabase.from('evento_tecnicos').delete().eq('evento_id', linha.ev.id).eq('tecnico_id', dstTecId),
        ])
        await Promise.all([
          supabase.from('evento_tecnicos').upsert({ evento_id: linha.ev.id,  tecnico_id: src.tecnicoId }, { onConflict: 'evento_id,tecnico_id' }),
          supabase.from('evento_tecnicos').upsert({ evento_id: src.eventoId, tecnico_id: dstTecId      }, { onConflict: 'evento_id,tecnico_id' }),
        ])
      } else if (modo === 'substituir') {
        const dstTecId = dstTecIds.find(tid => tid !== src.tecnicoId)
        if (dstTecId && linha.ev?.id)
          await supabase.from('evento_tecnicos').delete().eq('evento_id', linha.ev.id).eq('tecnico_id', dstTecId)
        if (linha.ev?.id)
          await supabase.from('evento_tecnicos').upsert({ evento_id: linha.ev.id, tecnico_id: src.tecnicoId }, { onConflict: 'evento_id,tecnico_id' })
        if (vemDeEvento)
          await supabase.from('evento_tecnicos').delete().eq('evento_id', src.eventoId).eq('tecnico_id', src.tecnicoId)
      } else {
        // ── MOVER / ADICIONAR ───────────────────────────────────────────────
        if (linha.ev?.id) {
          await supabase.from('evento_tecnicos')
            .upsert({ evento_id: linha.ev.id, tecnico_id: src.tecnicoId }, { onConflict: 'evento_id,tecnico_id' })
        } else if (linha.ag?.id) {
          await supabase.from('agendamentos_tecnicos').update({ tecnico_id: src.tecnicoId }).eq('id', linha.ag.id)
        } else {
          await supabase.from('agendamentos_tecnicos').insert({ data: linha.dataStr, espaco_id: linha.espaco_id, tecnico_id: src.tecnicoId, folga: false })
        }
        if (vemDeEvento) {
          await supabase.from('evento_tecnicos').delete().eq('evento_id', src.eventoId).eq('tecnico_id', src.tecnicoId)
        } else if (src.agId && src.dropKey !== null) {
          await supabase.from('agendamentos_tecnicos').delete().eq('id', src.agId)
        }
      }
      carregarComScroll()
    } catch (err) { console.error(err) }
  }, [carregarComScroll])

  const handleDrop = useCallback((e, linha) => {
    e.preventDefault()
    setDragOver(null)
    const src = dragSourceRef.current   // ← sempre o valor mais recente
    dragSourceRef.current = null
    setDragSource(null)
    if (!src?.tecnicoId) return
    const dstKey = `${linha.dataStr}|${linha.espaco_id}`
    if (src.dropKey === dstKey) return

    const dstTecIds = linha.tecIds ?? []
    const outroTec  = dstTecIds.find(tid => tid !== src.tecnicoId)

    // Destino já tem um técnico diferente → modal substituir / trocar
    if (outroTec && dstTecIds.length === 1 && linha.ev?.id) {
      setConflitoDrag({ src, linha, conflitos: [], troca: { dstTecId: outroTec } })
      return
    }

    // Verificar conflitos antes de executar
    const cs = detectarConflitos(src.tecnicoId, linha.dataStr, linha.ev?.id, eventos, agendamentos, tecnicos)
    if (cs.length > 0) {
      setConflitoDrag({ src, linha, conflitos: cs })
      return
    }
    executarDrop(src, linha)
  }, [dragSource, eventos, agendamentos, tecnicos, executarDrop])

  if (loading) return <LoadingPage />

  const thCls    = 'px-2 py-2 text-left text-[12px] font-bold text-accent-subtle uppercase tracking-widest whitespace-nowrap'
  const sepThCls = 'w-0.5 p-0 bg-border'

  // Helper: renderiza a célula de técnico (multi-tech, chips fixed-width, drop zone)
  const renderTecCell = (linha, extraCls = '') => {
    if (!linha) return <td className={clsx('px-2 py-1.5', extraCls)} />
    const dropKey       = `${linha.dataStr}|${linha.espaco_id}`
    const isDst         = dragOver === dropKey && dragSource && dragSource.dropKey !== dropKey
    const isDraggingAny = !!dragSource
    const tecIds        = linha.tecIds ?? []

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
              tecIds,
            })
          : undefined
        }
        className={clsx(
          'px-2 py-1 transition-all duration-100',
          extraCls,
          isDst
            ? 'bg-status-confirmado/10 outline outline-1 outline-inset outline-status-confirmado/50'
            : !isDraggingAny && 'cursor-pointer hover:bg-surface-2/40',
        )}
      >
        <div className="flex items-center gap-1 flex-nowrap overflow-hidden">
          {tecIds.length === 0 ? (
            <span className="text-border/30 text-[10px]">+ atribuir</span>
          ) : tecIds.map(tid => {
            const tec    = tecnicos.find(t => t.id === tid)
            const tidx   = tecnicos.findIndex(t => t.id === tid)
            const cor    = tec ? corTecnico(tec.nome, tidx) : null
            const isSrcChip = dragSource?.dropKey === dropKey && dragSource?.tecnicoId === tid
            return (
              <span
                key={tid}
                draggable
                onDragStart={(e) => { e.stopPropagation(); handleDragStart(e, linha, tid) }}
                onDragEnd={handleDragEnd}
                title={tec?.nome}
                className={clsx(
                  'inline-flex items-center justify-center px-0 rounded-md text-[11px] font-semibold border select-none cursor-grab active:cursor-grabbing transition-opacity shrink-0',
                  'w-[72px] overflow-hidden',
                  cor?.chip ?? 'bg-surface-3 text-accent-muted border-border',
                  isSrcChip && 'opacity-30'
                )}
              >
                <span className="truncate px-1.5 py-0.5">{tec?.nome ?? '?'}</span>
              </span>
            )
          })}
        </div>
      </td>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Filtros ── */}
      <div className="shrink-0 border-b border-border/50 bg-surface-0/40">

        {/* Linha 1 — só clientes */}
        <div className="px-5 py-2 flex items-center gap-1 flex-wrap border-b border-border/30">
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

        {/* Linha 2 — apoio + vista + pesquisa */}
        <div className="px-5 py-2 flex items-center gap-1 flex-wrap">
          <span className="text-[10px] font-semibold text-accent-subtle uppercase tracking-widest mr-2">Apoio</span>
          <button onClick={() => setFiltroTecnico('')}
            className={clsx('px-3 py-1.5 rounded text-xs transition-colors border',
              filtroTecnico === '' ? 'bg-surface-3 text-accent border-white/20 font-medium' : 'bg-surface-2 text-accent-muted border-border hover:text-accent')}>
            Todos
          </button>
          {tecnicos.map(t => {
            const cor  = tecCorMap[t.id]
            const st   = tecStats[t.id] ?? { datas: 0, folgas: 0, valor: 0 }
            const isDraggingThis = dragSource?.tecnicoId === t.id && dragSource?.dropKey === null
            return (
              <div
                key={t.id}
                draggable
                onDragStart={e => {
                  e.dataTransfer.effectAllowed = 'move'
                  const ghost = document.createElement('span')
                  ghost.textContent = t.nome
                  ghost.style.cssText = `position:fixed;top:-100px;left:-100px;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:600;background:${cor ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.08)'};color:white;border:1px solid rgba(255,255,255,0.2);`
                  document.body.appendChild(ghost)
                  e.dataTransfer.setDragImage(ghost, ghost.offsetWidth / 2, 12)
                  setTimeout(() => document.body.removeChild(ghost), 0)
                  const paletteSrc = { dropKey: null, tecnicoId: t.id, eventoId: null, agId: null }
                  dragSourceRef.current = paletteSrc
                  setDragSource(paletteSrc)
                  e.dataTransfer.setData('tecnicoId', t.id)
                  e.dataTransfer.setData('eventoId', '')
                  e.dataTransfer.setData('dropKey', '')
                }}
                onDragEnd={() => { dragSourceRef.current = null; setDragSource(null) }}
                onClick={() => setFiltroTecnico(filtroTecnico === t.nome ? '' : t.nome)}
                title={`Filtrar: ${t.nome} · Arrastar para atribuir`}
                className={clsx(
                  'flex items-center gap-2 px-3 py-1.5 rounded text-xs transition-all border select-none',
                  'cursor-grab active:cursor-grabbing',
                  isDraggingThis && 'opacity-40 scale-95',
                  cor?.chip ?? 'bg-surface-2 text-accent-muted border-border',
                  filtroTecnico === t.nome
                    ? 'font-medium ring-1 ring-white/20'
                    : 'opacity-50 hover:opacity-90'
                )}
              >
                <span className={clsx('font-semibold', cor?.text ?? 'text-accent-muted')}>{t.nome}</span>
                <button
                  onClick={async e => {
                    e.stopPropagation()
                    const novoTipo = t.tipo === 'fixo' ? 'freelancer' : 'fixo'
                    await supabase.from('tecnicos').update({ tipo: novoTipo }).eq('id', t.id)
                    carregar()
                  }}
                  title={t.tipo === 'fixo' ? 'Fixo — clique para mudar para Freelancer' : 'Freelancer — clique para mudar para Fixo'}
                  className={clsx(
                    'text-[9px] font-bold px-1 py-0.5 rounded border transition-all shrink-0',
                    t.tipo === 'fixo'
                      ? 'bg-violet-500/20 text-violet-300 border-violet-500/30'
                      : 'bg-surface-3 text-accent-subtle/50 border-border/50 hover:text-accent-subtle'
                  )}
                >
                  {t.tipo === 'fixo' ? 'FIXO' : 'FREE'}
                </button>
                {(st.datas > 0 || st.folgas > 0 || st.valor > 0) && (
                  <span className="flex items-center gap-0.5 text-[11px] opacity-80 font-normal shrink-0">
                    {[
                      st.datas  > 0 && ['D', st.datas],
                      st.folgas > 0 && ['F', st.folgas],
                      st.valor  > 0 && ['V', Math.round(st.valor)],
                    ].filter(Boolean).map(([letra, val], i, arr) => (
                      <span key={i} className="flex items-center gap-0.5">
                        <span className="opacity-70">{letra}</span>
                        <span>{val}</span>
                        {i < arr.length - 1 && <span className="opacity-30 mx-0.5">|</span>}
                      </span>
                    ))}
                  </span>
                )}
              </div>
            )
          })}
          {/* Indicador visual quando está a arrastar da paleta */}
          {dragSource?.dropKey === null && dragSource?.tecnicoId && (
            <span className="ml-2 text-[10px] text-accent-subtle/60 animate-pulse">
              ↓ largar num slot para atribuir
            </span>
          )}

          <div className="ml-auto flex items-center gap-2 shrink-0">
            {/* Toggle vista */}
            <div className="flex bg-surface-2 border border-border rounded p-0.5">
              <button onClick={() => setVista('lista')} title="Lista"
                className={clsx('p-1.5 rounded transition-colors', vista === 'lista' ? 'bg-surface-4 text-accent' : 'text-accent-muted hover:text-accent')}>
                <List size={13} />
              </button>
              <button onClick={() => setVista('semana')} title="Semana"
                className={clsx('p-1.5 rounded transition-colors', vista === 'semana' ? 'bg-surface-4 text-accent' : 'text-accent-muted hover:text-accent')}>
                <CalendarRange size={13} />
              </button>
              <button onClick={() => setVista('mes')} title="Mês"
                className={clsx('p-1.5 rounded transition-colors', vista === 'mes' ? 'bg-surface-4 text-accent' : 'text-accent-muted hover:text-accent')}>
                <CalendarDays size={13} />
              </button>
              <button onClick={() => setVista('colunas')} title="Colunas"
                className={clsx('p-1.5 rounded transition-colors', vista === 'colunas' ? 'bg-surface-4 text-accent' : 'text-accent-muted hover:text-accent')}>
                <Columns2 size={13} />
              </button>
              <button onClick={() => setVista('stats')} title="Estatísticas"
                className={clsx('p-1.5 rounded transition-colors', vista === 'stats' ? 'bg-surface-4 text-accent' : 'text-accent-muted hover:text-accent')}>
                <BarChart3 size={13} />
              </button>
              <button onClick={() => setVista('ocorrencias')} title="Ocorrências"
                className={clsx('p-1.5 rounded transition-colors', vista === 'ocorrencias' ? 'bg-surface-4 text-amber-400' : 'text-accent-muted hover:text-accent')}>
                <AlertTriangle size={13} />
              </button>
              <button onClick={() => setVista('checklists')} title="Checklists"
                className={clsx('p-1.5 rounded transition-colors', vista === 'checklists' ? 'bg-surface-4 text-teal-400' : 'text-accent-muted hover:text-accent')}>
                <ListChecks size={13} />
              </button>
            </div>
            {/* Pesquisa */}
            <div className="relative">
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
        </div>
      </div>

      {/* ── Tabela ── */}
      <div ref={scrollRef} className="flex-1 overflow-auto">

        {/* ════ VISTA COLUNAS ════ */}
        {vista === 'colunas' && (
          <table className="text-xs border-collapse" style={{ minWidth: '100%' }}>
            <colgroup>
              <col style={{ width: 52 }} />
              <col style={{ width: 50 }} />
              {Array.from({ length: maxGrupos }, (_, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <col style={{ width: 2 }} />}
                  <col style={{ width: 160 }} />
                  <col style={{ width: 130 }} />
                  <col style={{ width: 140 }} />
                  <col style={{ width: 72 }} />
                  <col style={{ width: 72 }} />
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
                {i4djEspacoId && <th className={clsx(thCls, 'border-l border-red-500/30 text-red-400/70')}>LMD</th>}
              </tr>
            </thead>
            <tbody>
              {linhasPorDia.length === 0 && (
                <tr><td colSpan={99} className="py-16 text-center text-accent-subtle/40">Sem eventos activos neste mês.</td></tr>
              )}
              {linhasPorDia.flatMap(({ dataStr, dia, linhas, folgas }, dayIdx) => {
                const tecsFolga  = folgas.map(tid => tecnicos.find(t => t.id === tid)).filter(Boolean)
                const zebraCls   = dayIdx % 2 === 1 ? 'bg-white/[0.04]' : ''
                const isSab      = new Date(dataStr + 'T00:00:00').getDay() === 0
                const isHoje     = dataStr === hojeStr

                const row = (
                  <tr key={dataStr} className={clsx(
                    'border-b border-border/20 hover:bg-surface-2/20 transition-colors align-middle',
                    isHoje ? 'bg-zinc-100 [&_td]:!text-gray-700' : zebraCls
                  )}>
                    <td colSpan={2} onClick={() => setModalFolga({ data: dataStr })} title="Gerir folgas"
                      className={clsx('px-3 py-2 font-medium whitespace-nowrap border-r border-border/40 cursor-pointer hover:bg-orange-400/5 transition-colors',
                        isHoje ? 'text-gray-800 font-bold' : 'text-accent-muted')}>
                      {diaSemanaData(dataStr)}
                    </td>
                    {Array.from({ length: maxGrupos }, (_, i) => {
                      const linha = linhas[i] ?? null
                      return [
                        i > 0 && <td key={`sep-${dataStr}-${i}`} className="p-0 bg-border/30 w-px" />,
                        renderTecCell(linha, i > 0 ? 'pl-3' : ''),
                        <td key={`esp-${dataStr}-${i}`} className={clsx('px-2 py-2 font-medium whitespace-nowrap', linha?.espacoNome?.toLowerCase() === 'lmd' ? 'text-red-400' : 'text-accent-muted')}>{linha?.espacoNome ?? ''}</td>,
                        /* Evento — clique para editar, criar com espaço, ou criar só com data */
                        <td key={`ev-${dataStr}-${i}`}
                          onClick={() => {
                            if (linha?.ev) setModalEditEvento(linha.ev)
                            else if (linha) setModalEditEvento({ espaco_id: linha.espaco_id, data_evento: dataStr })
                            else if (i === 0) setModalEditEvento({ data_evento: dataStr })
                          }}
                          className="px-2 py-2 text-accent-muted max-w-0 group cursor-pointer hover:text-accent transition-colors">
                          <span className="flex items-center gap-1">
                            <span className="block truncate">{linha?.ev?.evento ?? ''}</span>
                            {linha?.ev
                              ? <Pencil size={10} className="shrink-0 opacity-0 group-hover:opacity-40 transition-opacity" />
                              : linha
                                ? <span className="opacity-0 group-hover:opacity-30 text-[10px]">+ evento</span>
                                : i === 0 && <span className="opacity-0 group-hover:opacity-40 text-[10px] text-status-confirmado/70">+ evento</span>}
                          </span>
                        </td>,
                        <td key={`ins-${dataStr}-${i}`} className="px-2 py-2 text-center tabular-nums whitespace-nowrap font-medium">
                          {linha?.ev?.hora_instalacao
                            ? <span className="text-accent-subtle">{hhmm(linha.ev.hora_instalacao)}</span>
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
                    {/* Folga */}
                    <td
                      onClick={() => setModalFolga({ data: dataStr })}
                      onDragOver={e => { e.preventDefault(); setDragOverFolga(dataStr) }}
                      onDragLeave={() => setDragOverFolga(null)}
                      onDrop={e => handleFolgaDrop(e, dataStr)}
                      title="Gerir folgas · arrastar para mover folga"
                      className={clsx(
                        'px-2 py-2 border-l border-border/40 cursor-pointer transition-colors whitespace-nowrap',
                        tecsFolga.length === 1 ? 'align-middle' : 'align-top',
                        dragOverFolga === dataStr ? 'bg-orange-400/10 outline outline-1 outline-orange-400/40' : 'hover:bg-orange-400/5'
                      )}>
                      {tecsFolga.length > 0
                        ? <span className="inline-flex flex-nowrap gap-1 overflow-hidden">
                            {tecsFolga.map(t => (
                              <FolgaChip key={t.id} tecnico={t} cor={tecCorMap[t.id]}
                                dataStr={dataStr} onDragStart={handleFolgaDragStart}
                                isDragging={dragFolga?.data === dataStr && dragFolga?.tecnicoId === t.id} />
                            ))}
                          </span>
                        : <span className="text-border/20 text-[10px]">—</span>
                      }
                    </td>
                    {/* Coluna LMD — aceita drag de técnicos */}
                    {i4djEspacoId && (
                      <td
                        onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }}
                        onDrop={async e => {
                          e.preventDefault()
                          const src = dragSourceRef.current
                          if (!src?.tecnicoId) return
                          dragSourceRef.current = null; setDragSource(null)
                          // Criar agendamento no LMD para este técnico neste dia
                          // Verificar se já existe antes de inserir
                          const { data: existente } = await supabase.from('agendamentos_tecnicos')
                            .select('id').eq('data', dataStr).eq('espaco_id', i4djEspacoId).eq('tecnico_id', src.tecnicoId).maybeSingle()
                          if (!existente) {
                            await supabase.from('agendamentos_tecnicos')
                              .insert({ data: dataStr, espaco_id: i4djEspacoId, tecnico_id: src.tecnicoId, folga: false })
                          }
                          // Se veio de outro evento, remove da origem
                          if (src.eventoId && src.dropKey !== null) {
                            await supabase.from('evento_tecnicos').delete().eq('evento_id', src.eventoId).eq('tecnico_id', src.tecnicoId)
                          }
                          carregarComScroll()
                        }}
                        className="px-2 py-2 border-l border-red-500/20 whitespace-nowrap align-middle cursor-pointer hover:bg-red-500/5 transition-colors">
                        <span className="inline-flex flex-nowrap gap-1 overflow-hidden">
                          {(lmdPorDia[dataStr] ?? []).map(tid => {
                            const tec = tecnicos.find(t => t.id === tid)
                            const cor = tecCorMap[tid]
                            if (!tec) return null
                            return (
                              <span key={tid} className={clsx(
                                'inline-flex items-center justify-center px-1.5 py-0.5 rounded-md text-[11px] font-semibold border shrink-0',
                                cor?.chip ?? 'bg-red-400/15 text-red-400 border-red-400/30'
                              )}>
                                {tec.nome}
                              </span>
                            )
                          })}
                          {(lmdPorDia[dataStr] ?? []).length === 0 && <span className="text-border/20 text-[10px]">—</span>}
                        </span>
                      </td>
                    )}
                  </tr>
                )

                // Separador de semana após Domingo
                const sep = isSab ? (
                  <tr key={`sep-week-${dataStr}`}>
                    <td colSpan={99} className="h-[3px] bg-border/80 p-0" />
                  </tr>
                ) : null

                return sep ? [row, sep] : [row]
              })}
            </tbody>
          </table>
        )}

        {/* ════ VISTA LISTA ════ */}
        {vista === 'lista' && (
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
                <th className={thCls}>Técnico</th>
                <th className={thCls}>Cliente</th>
                <th className={thCls}>Evento</th>
                <th className={clsx(thCls, 'text-center')}>Inst.</th>
                <th className={clsx(thCls, 'text-center')}>Início</th>
                <th className={thCls}>DJ</th>
              </tr>
            </thead>
            <tbody>
              {linhasPorDia.length === 0 && (
                <tr><td colSpan={6} className="py-16 text-center text-accent-subtle/40">Sem eventos activos neste mês.</td></tr>
              )}
              {linhasPorDia.flatMap(({ dataStr, dia, linhas, folgas }, dayIdx) => {
                const tecsFolga    = folgas.map(tid => tecnicos.find(t => t.id === tid)).filter(Boolean)
                const isSabLinhas  = new Date(dataStr + 'T00:00:00').getDay() === 0
                const isHojeLinhas = dataStr === hojeStr
                const lmdTecsDia   = lmdPorDia[dataStr] ?? []
                const rowsToRender = linhas.length > 0 ? linhas : [null]
                // Unused vars kept for compat
                void dayIdx

                // ── Linha de cabeçalho do dia ──────────────────────────────
                const dayHeader = (
                  <tr key={`hdr-${dataStr}`} className={isHojeLinhas ? 'bg-amber-400/10' : 'bg-surface-2/60'}>
                    <td colSpan={6} className="px-3 py-2 border-b border-border/40">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className={clsx('text-[11px] font-bold', isHojeLinhas ? 'text-amber-400' : 'text-accent-muted')}>
                          {diaSemanaData(dataStr)}
                        </span>
                        {lmdTecsDia.length > 0 && (
                          <span className="flex items-center gap-1">
                            <span className="text-[9px] font-bold text-red-400/60 uppercase tracking-widest">LMD</span>
                            {lmdTecsDia.map(tid => {
                              const tec = tecnicos.find(t => t.id === tid)
                              const cor = tecCorMap[tid]
                              if (!tec) return null
                              return <span key={tid} className={clsx('inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border', cor?.chip ?? 'bg-red-400/15 text-red-400 border-red-400/30')}>{tec.nome}</span>
                            })}
                          </span>
                        )}
                        {tecsFolga.length > 0 && (
                          <button onClick={() => setModalFolga({ data: dataStr })}
                            className="flex items-center gap-1 hover:opacity-80 transition-opacity">
                            <span className="text-[9px] font-bold text-orange-400/60 uppercase tracking-widest">Folga</span>
                            {tecsFolga.map(t => (
                              <FolgaChip key={t.id} tecnico={t} cor={tecCorMap[t.id]}
                                dataStr={dataStr} onDragStart={handleFolgaDragStart}
                                isDragging={dragFolga?.data === dataStr && dragFolga?.tecnicoId === t.id} />
                            ))}
                          </button>
                        )}
                        <button onClick={() => setModalEditEvento({ data_evento: dataStr })}
                          className="ml-auto flex items-center gap-1 px-2 py-0.5 rounded border border-border/50 text-[10px] text-accent-subtle/50 hover:text-accent-subtle hover:border-border transition-colors">
                          <Plus size={10} /> evento
                        </button>
                      </div>
                    </td>
                  </tr>
                )

                // ── Linhas de eventos ───────────────────────────────────────
                const rows = rowsToRender.map((linha, li) => (
                  <tr key={linha ? `${dataStr}-${linha.espaco_id}` : `${dataStr}-empty`}
                    className={clsx(
                      'hover:bg-surface-2/20 transition-colors border-b border-border/10',
                    )}
                  >
                    {/* Técnico — draggable */}
                    {linha ? renderTecCell(linha) : <td className="px-2 py-2" />}
                    {/* Cliente */}
                    <td className={clsx('px-2 py-2 font-medium whitespace-nowrap', linha?.espacoNome?.toLowerCase() === 'lmd' ? 'text-red-400' : 'text-accent-muted')}>{linha?.espacoNome ?? ''}</td>
                    {/* Evento */}
                    <td onClick={() => linha?.ev ? setModalEditEvento(linha.ev) : linha ? setModalEditEvento({ espaco_id: linha.espaco_id, data_evento: dataStr }) : null}
                      className="px-2 py-2 text-accent-muted max-w-0 group cursor-pointer hover:text-accent transition-colors">
                      <span className="flex items-center gap-1">
                        <span className="block truncate">{linha?.ev?.evento ?? ''}</span>
                        {linha?.ev
                          ? <Pencil size={10} className="shrink-0 opacity-0 group-hover:opacity-40 transition-opacity" />
                          : linha ? <span className="opacity-0 group-hover:opacity-30 text-[10px]">+ evento</span> : null}
                      </span>
                      {linha && (linha.tecIds ?? []).length === 0 && (
                        <span className="text-[10px] italic text-red-400/70">sem técnico</span>
                      )}
                    </td>
                    {/* Hora Inst. */}
                    <td className="px-2 py-2 text-center tabular-nums whitespace-nowrap font-medium">
                      {linha?.ev?.hora_instalacao ? <span className="text-accent-subtle">{hhmm(linha.ev.hora_instalacao)}</span> : linha ? <span className="text-border/20">—</span> : null}
                    </td>
                    {/* Hora Início */}
                    <td className="px-2 py-2 text-center text-accent-subtle tabular-nums whitespace-nowrap">
                      {linha?.ev?.hora_inicio ? hhmm(linha.ev.hora_inicio) : linha ? <span className="text-border/20">—</span> : null}
                    </td>
                    {/* DJ */}
                    <td className="px-2 py-2 text-accent-muted whitespace-nowrap">
                      {linha ? (linha.djs?.length ? linha.djs.join(' · ') : <span className="text-border/20">—</span>) : null}
                    </td>
                  </tr>
                ))

                const sepLinhas = isSabLinhas ? (
                  <tr key={`sep-week-linhas-${dataStr}`}>
                    <td colSpan={6} className="h-[3px] bg-border/80 p-0" />
                  </tr>
                ) : null

                return sepLinhas ? [dayHeader, ...rows, sepLinhas] : [dayHeader, ...rows]
              })}
            </tbody>
          </table>
        )}

        {/* ════ VISTA SEMANA ════ */}
        {vista === 'semana' && (
          <div className="flex flex-col h-full overflow-hidden">
            {/* Nav semana */}
            <div className="shrink-0 px-4 py-2 border-b border-border/30 flex items-center gap-2">
              <button onClick={() => setSemanaRef(prev => isoData(addDays(parseISO(prev), -7)))}
                className="p-1.5 rounded hover:bg-surface-2 text-accent-subtle hover:text-accent transition-colors">
                <ChevronLeft size={14} />
              </button>
              <span className="text-xs text-accent-muted flex-1 text-center font-medium">
                {cap(format(new Date(semana7[0] + 'T00:00:00'), 'EEE', { locale: pt }))} {dataFmt(semana7[0])}
                {' — '}
                {cap(format(new Date(semana7[6] + 'T00:00:00'), 'EEE', { locale: pt }))} {dataFmt(semana7[6])}
              </span>
              <button onClick={() => setSemanaRef(prev => isoData(addDays(parseISO(prev), 7)))}
                className="p-1.5 rounded hover:bg-surface-2 text-accent-subtle hover:text-accent transition-colors">
                <ChevronRight size={14} />
              </button>
            </div>
            {/* 7 cartões */}
            <div className="flex-1 overflow-auto p-3 grid grid-cols-7 gap-2 min-h-0">
              {semana7.map(dataStr => {
                const grupo       = linhasBrutas.find(g => g.dataStr === dataStr) ?? { linhas: [], folgas: [] }
                const linhasDia   = grupo.linhas.filter(l => l.ev !== null && (!filtroEspaco || l.espaco_id === filtroEspaco))
                const linhasEv    = linhasDia.filter(l => l.espacoNome?.toLowerCase() !== 'lmd')
                                             .sort((a, b) => (a.ev?.hora_instalacao ?? '99') < (b.ev?.hora_instalacao ?? '99') ? -1 : 1)
                const linhasLmd   = linhasDia.filter(l => l.espacoNome?.toLowerCase() === 'lmd')
                const lmdTecsDia  = lmdPorDia[dataStr] ?? []
                const lmdEvTecIds = new Set(linhasLmd.flatMap(l => l.tecIds ?? []))
                const lmdLivres   = lmdTecsDia.filter(tid => !lmdEvTecIds.has(tid))
                const folgaIds    = folgasIdx[dataStr] ?? []
                const isHoje      = dataStr === hojeStr
                const isDropFolga = dragOverFolga === dataStr
                return (
                  <div key={dataStr} className={clsx(
                    'flex flex-col rounded-xl border overflow-hidden',
                    isHoje ? 'border-accent/40 bg-accent/[0.04]' : 'border-border bg-surface-1'
                  )}>
                    {/* Cabeçalho */}
                    <div className={clsx('px-2 py-1.5 text-center text-[12px] font-bold border-b border-border/40 shrink-0', isHoje ? 'text-amber-400' : 'text-accent-muted')}>
                      {cap(format(new Date(dataStr + 'T00:00:00'), 'EEE d', { locale: pt }))}
                    </div>

                    {/* Slots */}
                    <div className="flex-1 overflow-y-auto px-1.5 py-1 flex flex-col gap-1 min-h-0">

                      {/* Eventos normais */}
                      {linhasEv.map(linha => {
                        const dropKey = `${linha.dataStr}|${linha.espaco_id}`
                        const isDst   = dragOver === dropKey && dragSource && dragSource.dropKey !== dropKey
                        return (
                          <div key={linha.espaco_id}
                            onDragOver={e => handleDragOver(e, dropKey)}
                            onDragLeave={handleDragLeave}
                            onDrop={e => handleDrop(e, linha)}
                            onClick={() => setModalEditEvento(linha.ev)}
                            className={clsx(
                              'px-1.5 py-1 rounded-lg border cursor-pointer transition-colors',
                              isDst ? 'bg-accent/10 border-accent/40' : 'bg-surface-2 border-border/50 hover:bg-surface-3'
                            )}
                          >
                            <p className="text-[11px] font-semibold text-white/90 truncate leading-tight uppercase tracking-wide">{linha.espacoNome}</p>
                            {linha.ev?.evento && <p className="text-[11px] text-blue-300/90 truncate leading-tight">{linha.ev.evento}</p>}
                            {(linha.ev?.hora_instalacao || linha.ev?.hora_inicio) && (
                              <div className="flex items-center gap-1.5 text-[12px] text-white/55 tabular-nums leading-tight flex-wrap">
                                {linha.ev?.hora_instalacao && (
                                  <span className="flex items-center gap-0.5">
                                    <Wrench size={9} className="shrink-0 opacity-70" />
                                    <span className="text-white/35 text-[10px] mr-0.5">Dia {parseInt(dataStr.slice(8, 10))}</span>
                                    {hhmm(linha.ev.hora_instalacao)}
                                  </span>
                                )}
                                {linha.ev?.hora_inicio && (
                                  <span className="flex items-center gap-0.5">
                                    <Clock size={9} className="shrink-0 opacity-70" />{hhmm(linha.ev.hora_inicio)}
                                  </span>
                                )}
                              </div>
                            )}
                            <div className="flex flex-wrap gap-1 mt-0.5 justify-end items-center">
                              {linha.ev?.id && (
                                <button onMouseDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); window.open(`/apoiot/checklist/${linha.ev.id}`, '_blank') }}
                                  className="text-white/25 hover:text-white/70 transition-colors">
                                  <ListChecks size={11} />
                                </button>
                              )}
                              {(linha.tecIds ?? []).length > 0
                                ? (linha.tecIds ?? []).map(tid => {
                                    const tec = tecnicos.find(t => t.id === tid)
                                    const cor = tecCorMap[tid]
                                    if (!tec) return null
                                    return (
                                      <span key={tid} draggable
                                        onDragStart={e => { if (e.target.closest('button')) { e.preventDefault(); return } e.stopPropagation(); handleDragStart(e, linha, tid) }}
                                        onDragEnd={handleDragEnd}
                                        className={clsx('group/chip inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border select-none cursor-grab active:cursor-grabbing', cor?.chip ?? 'bg-accent/10 text-accent border-accent/20')}
                                      >
                                        {tec.nome.split(' ')[0]}
                                        <button onMouseDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); e.preventDefault(); removerTecSlot(linha, tid) }}
                                          className="opacity-0 group-hover/chip:opacity-100 text-[14px] leading-none transition-opacity">×</button>
                                      </span>
                                    )
                                  })
                                : <p className="text-[11px] italic text-accent-subtle/40">sem técnico</p>
                              }
                            </div>
                          </div>
                        )
                      })}

                      <button onClick={() => setModalEditEvento({ data_evento: dataStr })}
                        className="w-full text-center text-[11px] text-accent-subtle/40 hover:text-accent-subtle py-0.5 transition-colors">
                        + evento
                      </button>
                    </div>

                    {/* LMD — zona fixa, aceita drop → cria evento 10h-19h */}
                    {(() => {
                      const isDropLmd = dragOverLmd === dataStr
                      const hasTecs   = lmdTecsDia.length > 0
                      const evLmd     = linhasLmd.find(l => l.ev)?.ev
                      return (
                        <div
                          onDragOver={e => { e.preventDefault(); setDragOverLmd(dataStr) }}
                          onDragLeave={() => setDragOverLmd(null)}
                          onDrop={e => handleLmdDrop(e, dataStr, linhasLmd)}
                          onClick={() => {
                            if (evLmd) setModalEditEvento(evLmd)
                            else setModalEditEvento({ espaco_id: i4djEspacoId, data_evento: dataStr })
                          }}
                          className={clsx(
                            'shrink-0 border-t px-1.5 py-1 h-[64px] overflow-hidden transition-colors cursor-pointer',
                            isDropLmd ? 'bg-red-500/20 border-red-500/40' :
                            hasTecs   ? 'bg-red-500/[0.06] border-red-700/20' :
                            'bg-transparent border-border/15'
                          )}
                        >
                          <p className="text-[10px] font-semibold text-red-400/50 uppercase tracking-wide leading-tight">LMD</p>
                          {evLmd?.evento && <p className="text-[11px] text-white/70 truncate leading-tight">{evLmd.evento}</p>}
                          {(evLmd?.hora_inicio || evLmd?.hora_instalacao) && (
                            <p className="text-[10px] text-accent-subtle/50 tabular-nums leading-tight">
                              {[evLmd?.hora_inicio, evLmd?.hora_instalacao].filter(Boolean).map(h => hhmm(h)).join(' - ')}
                            </p>
                          )}
                          <div className="flex flex-wrap gap-1 justify-end mt-0.5">
                            {lmdTecsDia.map(tid => {
                              const tec = tecnicos.find(t => t.id === tid)
                              const cor = tecCorMap[tid]
                              if (!tec) return null
                              const linhaLmd = linhasLmd.find(l => (l.tecIds ?? []).includes(tid))
                              return (
                                <span key={tid}
                                  draggable={!!linhaLmd}
                                  onDragStart={linhaLmd ? e => { if (e.target.closest('button')) { e.preventDefault(); return } e.stopPropagation(); handleDragStart(e, linhaLmd, tid) } : undefined}
                                  onDragEnd={linhaLmd ? handleDragEnd : undefined}
                                  className={clsx('group/lmdchip inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border select-none', linhaLmd ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer', cor?.chip ?? 'bg-red-400/15 text-red-400 border-red-400/30')}
                                >
                                  {tec.nome.split(' ')[0]}
                                  <button
                                    onMouseDown={e => e.stopPropagation()}
                                    onClick={e => {
                                      e.stopPropagation(); e.preventDefault()
                                      if (linhaLmd) removerTecSlot(linhaLmd, tid)
                                      else {
                                        const ag = agendamentos.find(a => a.espaco_id === i4djEspacoId && a.data === dataStr && a.tecnico_id === tid)
                                        if (ag) supabase.from('agendamentos_tecnicos').update({ tecnico_id: null }).eq('id', ag.id).then(carregarComScroll)
                                      }
                                    }}
                                    className="opacity-0 group-hover/lmdchip:opacity-100 text-[14px] leading-none transition-opacity"
                                  >×</button>
                                </span>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })()}

                    {/* Folga — sempre no fundo, aceita drop */}
                    <div
                      onDragOver={e => { e.preventDefault(); setDragOverFolga(dataStr) }}
                      onDragLeave={() => setDragOverFolga(null)}
                      onDrop={e => handleFolgaDrop(e, dataStr)}
                      className={clsx(
                        'shrink-0 border-t px-1.5 py-1 h-[64px] overflow-hidden transition-colors',
                        isDropFolga ? 'bg-teal-500/15 border-teal-500/30' :
                        folgaIds.length > 0 ? 'bg-teal-900/[0.15] border-teal-700/20' :
                        'bg-transparent border-border/15'
                      )}
                    >
                      <p className="text-[10px] font-semibold text-teal-400/50 uppercase tracking-wide leading-tight">Boa Folga!</p>
                      <div className="flex flex-wrap gap-0.5 mt-0.5 justify-end">
                        {folgaIds.map(tid => {
                          const tec = tecnicos.find(t => t.id === tid)
                          if (!tec) return null
                          return (
                            <FolgaChip key={tid} tecnico={tec} cor={tecCorMap[tid]}
                              dataStr={dataStr} onDragStart={handleFolgaDragStart}
                              isDragging={dragFolga?.data === dataStr && dragFolga?.tecnicoId === tid}
                              onRemover={() => removerFolga(dataStr, tid)} />
                          )
                        })}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ════ VISTA MÊS ════ */}
        {vista === 'mes' && (
          <div className="flex h-full overflow-hidden">
            {/* Calendário */}
            <div className="flex-1 overflow-auto p-4">
              {/* Cabeçalho dias da semana */}
              <div className="grid grid-cols-7 gap-1 mb-1">
                {['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'].map(d => (
                  <div key={d} className="text-center text-[10px] font-bold text-accent-subtle py-1">{d}</div>
                ))}
              </div>
              {/* Grid do calendário */}
              {(() => {
                const primeiro = parseISO(anoMes + '-01')
                const lun0 = startOfWeek(startOfMonth(primeiro), { weekStartsOn: 1 })
                const dom6 = endOfWeek(endOfMonth(primeiro), { weekStartsOn: 1 })
                const celulas = []
                let cur = lun0
                while (cur <= dom6) { celulas.push(isoData(cur)); cur = addDays(cur, 1) }
                const semanas = []
                for (let i = 0; i < celulas.length; i += 7) semanas.push(celulas.slice(i, i + 7))
                return semanas.map((semana, si) => (
                  <div key={si} className="grid grid-cols-7 gap-1 mb-1">
                    {semana.map(dataStr => {
                      const grupo = linhasBrutas.find(g => g.dataStr === dataStr) ?? { linhas: [], folgas: [] }
                      const linhasDia = grupo.linhas.filter(l => l.ev !== null && (!filtroEspaco || l.espaco_id === filtroEspaco))
                      const folgaIds  = folgasIdx[dataStr] ?? []
                      const lmdTecsDia = lmdPorDia[dataStr] ?? []
                      const isHoje    = dataStr === hojeStr
                      const isNoMes   = dataStr >= dataInicio && dataStr <= dataFim
                      return (
                        <div key={dataStr} onClick={() => setModalDia(dataStr)}
                          className={clsx(
                            'rounded-xl border cursor-pointer transition-all min-h-[80px] p-1.5 flex flex-col gap-0.5',
                            isHoje ? 'border-accent/40 bg-accent/[0.04]' : isNoMes ? 'border-border bg-surface-1 hover:bg-surface-2' : 'border-border/20 bg-transparent opacity-30 pointer-events-none',
                          )}>
                          <p className={clsx('text-[10px] font-bold mb-0.5', isHoje ? 'text-amber-400' : 'text-accent-subtle')}>{parseInt(dataStr.slice(-2))}</p>
                          {lmdTecsDia.length > 0 && (
                            <div className="flex gap-0.5 flex-wrap mb-0.5">
                              {lmdTecsDia.slice(0, 2).map(tid => {
                                const tec = tecnicos.find(t => t.id === tid)
                                const cor = tecCorMap[tid]
                                return tec ? <span key={tid} className={clsx('text-[8px] font-bold px-1 rounded border', cor?.chip ?? 'bg-red-400/15 text-red-400 border-red-400/30')}>{tec.nome.split(' ')[0]}</span> : null
                              })}
                              {lmdTecsDia.length > 2 && <span className="text-[8px] text-accent-subtle">+{lmdTecsDia.length - 2}</span>}
                            </div>
                          )}
                          {linhasDia.slice(0, 3).map(linha => (
                            <div key={linha.espaco_id} className="px-1 py-0.5 rounded bg-surface-2 border border-border/40">
                              <p className="text-[8px] font-bold text-accent-subtle truncate">{linha.espacoNome}</p>
                              <div className="flex items-center gap-0.5">
                                {(linha.tecIds ?? []).slice(0, 2).map(tid => {
                                  const cor = tecCorMap[tid]
                                  return cor ? <span key={tid} className={clsx('w-1.5 h-1.5 rounded-full shrink-0', cor.dot)} /> : null
                                })}
                                <p className="text-[9px] text-accent truncate">{linha.ev?.evento ?? ''}</p>
                              </div>
                            </div>
                          ))}
                          {linhasDia.length > 3 && <p className="text-[8px] text-accent-subtle/50">+{linhasDia.length - 3} mais</p>}
                          {folgaIds.length > 0 && (
                            <div className="flex gap-0.5 flex-wrap mt-auto">
                              {folgaIds.slice(0, 2).map(tid => {
                                const tec = tecnicos.find(t => t.id === tid)
                                return tec ? <span key={tid} className="text-[8px] px-0.5 rounded bg-orange-400/10 text-orange-400/70">{tec.nome.split(' ')[0]}</span> : null
                              })}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ))
              })()}
            </div>

            {/* Painel de técnicos (arrastar para atribuir) */}
            <div className="w-36 shrink-0 border-l border-border overflow-y-auto p-3 flex flex-col gap-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-accent-subtle mb-1">Técnicos</p>
              {tecnicos.map(t => {
                const cor = tecCorMap[t.id]
                const isDraggingThis = dragSource?.tecnicoId === t.id && dragSource?.dropKey === null
                return (
                  <div key={t.id}
                    draggable
                    onDragStart={e => {
                      e.dataTransfer.effectAllowed = 'move'
                      const paletteSrc = { dropKey: null, tecnicoId: t.id, eventoId: null, agId: null }
                      dragSourceRef.current = paletteSrc
                      setDragSource(paletteSrc)
                      e.dataTransfer.setData('tecnicoId', t.id)
                      e.dataTransfer.setData('eventoId', '')
                      e.dataTransfer.setData('dropKey', '')
                    }}
                    onDragEnd={() => { dragSourceRef.current = null; setDragSource(null) }}
                    className={clsx(
                      'px-2 py-1.5 rounded-lg border text-xs font-semibold cursor-grab active:cursor-grabbing select-none transition-opacity',
                      cor?.chip ?? 'bg-surface-2 text-accent-muted border-border',
                      isDraggingThis && 'opacity-40'
                    )}
                  >
                    {t.nome}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ════ VISTA OCORRÊNCIAS ════ */}
        {vista === 'ocorrencias' && (
          <VistaOcorrencias espacos={espacos} />
        )}

        {vista === 'checklists' && (
          <VistaChecklists />
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
        onGuardado={() => { setModalAtrib(null); carregarComScroll() }}
      />
      <ModalFolga
        aberto={!!modalFolga} data={modalFolga?.data ?? null} tecnicos={tecnicos}
        folgasHoje={folgasIdx[modalFolga?.data] ?? []} agendamentos={agendamentos}
        onFechar={() => setModalFolga(null)}
        onGuardado={() => { setModalFolga(null); carregarComScroll() }}
      />
      <FormEvento
        aberto={!!modalEditEvento}
        evento={modalEditEvento}
        onFechar={() => setModalEditEvento(null)}
        onGuardado={() => { setModalEditEvento(null); carregarComScroll() }}
      />

      {/* Modal Dia (vista mês) */}
      {modalDia && (
        <ModalDia
          dataStr={modalDia}
          tecnicos={tecnicos}
          tecCorMap={tecCorMap}
          lmdPorDia={lmdPorDia}
          linhasBrutas={linhasBrutas}
          folgasIdx={folgasIdx}
          onFechar={() => setModalDia(null)}
          onNavegar={delta => {
            const next = isoData(addDays(parseISO(modalDia), delta))
            setModalDia(next)
          }}
          onEditEvento={ev => { setModalDia(null); setModalEditEvento(ev) }}
          onAtribuir={linha => {
            setModalDia(null)
            setModalAtrib({
              data: linha.dataStr, espaco_id: linha.espaco_id,
              espaco: linha.espacoNome, agendamento: linha.ag,
              evento: linha.ev, dj: linha.djs?.join(', '),
              tecIds: linha.tecIds,
            })
          }}
          onNovoEvento={data => { setModalDia(null); setModalEditEvento({ data_evento: data }) }}
        />
      )}

      {/* Modal conflito drag & drop */}
      {conflitoDrag && (
        conflitoDrag.troca ? (
          <ModalTroca
            srcTecNome={tecnicos.find(t => t.id === conflitoDrag.src.tecnicoId)?.nome?.split(' ')[0] ?? ''}
            dstTecNome={tecnicos.find(t => t.id === conflitoDrag.troca.dstTecId)?.nome?.split(' ')[0] ?? ''}
            dstEvNome={conflitoDrag.linha.ev?.evento ?? conflitoDrag.linha.espacoNome ?? ''}
            podeTrocar={!!conflitoDrag.src.eventoId && !!conflitoDrag.linha.ev?.id}
            onSubstituir={() => { const { src, linha } = conflitoDrag; setConflitoDrag(null); executarDrop(src, linha, 'substituir') }}
            onTrocar={() => { const { src, linha } = conflitoDrag; setConflitoDrag(null); executarDrop(src, linha, 'trocar') }}
            onCancelar={() => setConflitoDrag(null)}
          />
        ) : (
          <ModalConflito
            conflitos={conflitoDrag.conflitos}
            nomeTecnico={tecnicos.find(t => t.id === conflitoDrag.src.tecnicoId)?.nome ?? ''}
            onConfirmar={() => { const { src, linha } = conflitoDrag; setConflitoDrag(null); executarDrop(src, linha) }}
            onCancelar={() => setConflitoDrag(null)}
          />
        )
      )}

      {modalChecklist && (
        <ModalChecklistApoio
          eventoId={modalChecklist.eventoId}
          eventoNome={modalChecklist.eventoNome}
          tecIds={modalChecklist.tecIds}
          tecnicos={tecnicos}
          tecCorMap={tecCorMap}
          onFechar={() => setModalChecklist(null)}
        />
      )}
    </div>
  )
}
