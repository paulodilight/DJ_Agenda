import React, { useState, useEffect } from 'react'
import {
  Plus, AlertTriangle, CheckCircle, AlertCircle, Clock,
  Trash2, ListChecks, ListTodo, X, ChevronLeft,
  Search, FileText,
} from 'lucide-react'
import { OcorrenciaDetalhe } from '@/components/ocorrencias/OcorrenciaDetalhe'
import { ModalNovaOcorrencia } from '@/components/ocorrencias/ModalNovaOcorrencia'
import { supabase, supaEventos } from '@/lib/supabase'
import { clsx } from 'clsx'

// ── Constantes ────────────────────────────────────────────────────────────────
const STATUS_OC = {
  aberta:      { label: 'Aberta',      Ic: AlertCircle, cls: 'text-red-400' },
  em_processo: { label: 'Em processo', Ic: Clock,        cls: 'text-amber-400' },
  fechada:     { label: 'Fechada',     Ic: CheckCircle,  cls: 'text-green-400' },
}
const ESTADOS_T = ['a fazer', 'em curso', 'a validar', 'concluída', 'fechada', 'cancelada']
const ESTADO_CLS = {
  'a fazer':   'bg-surface-3 text-accent-subtle border-border/50',
  'em curso':  'bg-amber-400/10 text-amber-400 border-amber-400/30',
  'a validar': 'bg-blue-400/10 text-blue-400 border-blue-400/30',
  'concluída': 'bg-green-400/10 text-green-400 border-green-400/30',
  'fechada':   'bg-emerald-900/20 text-emerald-400/70 border-emerald-400/20',
  'cancelada': 'bg-red-400/10 text-red-400/70 border-red-400/20',
}
const ESTADO_DOT = {
  'a fazer':   'bg-accent-subtle/30',
  'em curso':  'bg-amber-400',
  'a validar': 'bg-blue-400',
  'concluída': 'bg-green-400',
  'fechada':   'bg-emerald-500/40',
  'cancelada': 'bg-red-400/50',
}

const fmtData = (d) => d
  ? new Date(d + 'T00:00:00').toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' })
  : null

// ── Modal Editar Tarefa ───────────────────────────────────────────────────────
function ModalEditarTarefa({ tarefa, onFechar, onGuardada, onApagada }) {
  const [form, setForm] = useState({
    tarefa:             tarefa.tarefa ?? '',
    responsavel:        tarefa.responsavel ?? '',
    tipo:               tarefa.tipo || 'Pontual',
    recorrencia:        tarefa.recorrencia ?? 'semanal',
    data_conclusao:     tarefa.data_conclusao ?? '',
    hora:               tarefa.hora ?? '',
    notas_operacionais: tarefa.notas_operacionais ?? '',
    estado:             tarefa.estado ?? 'a fazer',
  })
  const [saving, setSaving] = useState(false)
  const [colaboradores, setColaboradores] = useState([])
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => {
    supabase.from('vw_colaboradores').select('id, nome').order('nome')
      .then(({ data }) => setColaboradores(data ?? []))
  }, [])

  const guardar = async () => {
    setSaving(true)
    const concluida = form.estado === 'concluída'
    const fechada   = form.estado === 'fechada'
    const pontual   = form.tipo === 'Pontual'
    const patch = {
      tarefa:             form.tarefa.trim(),
      responsavel:        form.responsavel || null,
      tipo:               form.tipo,
      recorrencia:        pontual ? null : form.recorrencia,
      data_conclusao:     pontual ? (form.data_conclusao || null) : null,
      hora:               pontual ? (form.hora || null) : null,
      notas_operacionais: form.notas_operacionais.trim() || null,
      estado:             form.estado,
      confirmacao:        concluida ? 'concluida' : null,
    }
    if (concluida)     patch.concluida_em = new Date().toISOString()
    else if (!fechada) patch.concluida_em = null
    await supaEventos.from('supa_tarefas').update(patch).eq('id', tarefa.id)
    setSaving(false)
    onGuardada({ ...tarefa, ...form })
  }

  const apagar = async () => {
    if (!window.confirm('Apagar esta tarefa?')) return
    await supaEventos.from('supa_tarefas').delete().eq('id', tarefa.id)
    onApagada(tarefa.id)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={e => e.target === e.currentTarget && onFechar()}>
      <div className="bg-surface-1 border border-border rounded-2xl w-full max-w-md mx-4 shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/50">
          <p className="text-sm font-bold text-accent">Editar Tarefa</p>
          <button onClick={onFechar}><X size={16} className="text-accent-subtle hover:text-accent" /></button>
        </div>
        <div className="px-5 py-4 flex flex-col gap-3 overflow-y-auto max-h-[70vh]">
          <div>
            <label className="block text-[11px] text-accent-subtle mb-1">Tarefa *</label>
            <input value={form.tarefa} onChange={e => set('tarefa', e.target.value)} autoFocus
              className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-accent outline-none focus:border-white/25" />
          </div>
          <div>
            <label className="block text-[11px] text-accent-subtle mb-1">Descrição da tarefa</label>
            <textarea value={form.notas_operacionais} onChange={e => set('notas_operacionais', e.target.value)} rows={2}
              className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-accent outline-none focus:border-white/25 resize-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-accent-subtle mb-1">Responsável</label>
              <select value={form.responsavel} onChange={e => set('responsavel', e.target.value)}
                className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-accent outline-none focus:border-white/25">
                <option value="">— Selecionar —</option>
                {form.responsavel && !colaboradores.some(c => c.nome === form.responsavel) && (
                  <option value={form.responsavel}>{form.responsavel}</option>
                )}
                {colaboradores.map(c => <option key={c.id} value={c.nome}>{c.nome}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-accent-subtle mb-1">Tipo</label>
              <select value={form.tipo} onChange={e => set('tipo', e.target.value)}
                className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-accent outline-none focus:border-white/25">
                <option value="Pontual">Pontual</option>
                <option value="Recorrente">Recorrente</option>
              </select>
            </div>
          </div>
          {form.tipo === 'Pontual' ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-accent-subtle mb-1">Data limite</label>
                <input type="date" value={form.data_conclusao} onChange={e => set('data_conclusao', e.target.value)}
                  className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-accent outline-none focus:border-white/25" />
              </div>
              <div>
                <label className="block text-[11px] text-accent-subtle mb-1">Hora</label>
                <input type="time" value={form.hora} onChange={e => set('hora', e.target.value)}
                  className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-accent outline-none focus:border-white/25" />
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-[11px] text-accent-subtle mb-1">Repetição</label>
              <select value={form.recorrencia} onChange={e => set('recorrencia', e.target.value)}
                className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-accent outline-none focus:border-white/25">
                <option value="semanal">Semanal</option>
                <option value="mensal">Mensal</option>
              </select>
            </div>
          )}
          <div>
            <label className="block text-[11px] text-accent-subtle mb-1">Estado</label>
            <select value={form.estado} onChange={e => set('estado', e.target.value)}
              className={clsx('w-full border rounded-lg px-3 py-2 text-sm outline-none', ESTADO_CLS[form.estado] ?? ESTADO_CLS['a fazer'])}>
              {ESTADOS_T.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>
        </div>
        <div className="px-5 pb-4 flex items-center justify-between gap-2">
          <button onClick={apagar} className="flex items-center gap-1 text-xs text-red-400/60 hover:text-red-400 transition-colors">
            <Trash2 size={12} /> Apagar
          </button>
          <div className="flex gap-2">
            <button onClick={onFechar} className="px-4 py-2 rounded-lg text-xs text-accent-subtle hover:text-accent hover:bg-surface-2 transition-colors">Cancelar</button>
            <button onClick={guardar} disabled={saving || !form.tarefa.trim()}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-accent/15 border border-accent/30 text-accent hover:bg-accent/25 transition-colors disabled:opacity-40">
              {saving ? 'A guardar…' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Modal Criar Tarefa ────────────────────────────────────────────────────────
function ModalCriarTarefa({ onFechar, onCriada }) {
  const [form, setForm] = useState({
    tarefa: '', responsavel: '', tipo: 'Pontual', recorrencia: 'semanal',
    data_conclusao: '', hora: '', notas_operacionais: '',
  })
  const [saving, setSaving] = useState(false)
  const [colaboradores, setColaboradores] = useState([])
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => {
    supabase.from('vw_colaboradores').select('id, nome').order('nome')
      .then(({ data }) => setColaboradores(data ?? []))
  }, [])

  const guardar = async () => {
    if (!form.tarefa.trim()) return
    setSaving(true)
    const pontual = form.tipo === 'Pontual'
    const { data } = await supaEventos.from('supa_tarefas').insert({
      tarefa:             form.tarefa.trim(),
      responsavel:        form.responsavel || null,
      tipo:               form.tipo,
      recorrencia:        pontual ? null : form.recorrencia,
      data_conclusao:     pontual ? (form.data_conclusao || null) : null,
      hora:               pontual ? (form.hora || null) : null,
      notas_operacionais: form.notas_operacionais.trim() || null,
      estado:             'a fazer',
      criado_por:         'Admin',
    }).select().single()
    setSaving(false)
    if (data) onCriada(data)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={e => e.target === e.currentTarget && onFechar()}>
      <div className="bg-surface-1 border border-border rounded-2xl w-full max-w-md mx-4 shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/50">
          <p className="text-sm font-bold text-accent">Nova Tarefa</p>
          <button onClick={onFechar}><X size={16} className="text-accent-subtle hover:text-accent" /></button>
        </div>
        <div className="px-5 py-4 flex flex-col gap-3">
          <div>
            <label className="block text-[11px] text-accent-subtle mb-1">Tarefa *</label>
            <input autoFocus value={form.tarefa} onChange={e => set('tarefa', e.target.value)}
              className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-accent outline-none focus:border-white/25 placeholder:text-accent-subtle/40"
              placeholder="Descrição da tarefa…" />
          </div>
          <div>
            <label className="block text-[11px] text-accent-subtle mb-1">Descrição da tarefa</label>
            <textarea value={form.notas_operacionais} onChange={e => set('notas_operacionais', e.target.value)} rows={2}
              className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-accent outline-none focus:border-white/25 resize-none" placeholder="Detalhes…" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-accent-subtle mb-1">Responsável</label>
              <select value={form.responsavel} onChange={e => set('responsavel', e.target.value)}
                className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-accent outline-none focus:border-white/25">
                <option value="">— Selecionar —</option>
                {colaboradores.map(c => <option key={c.id} value={c.nome}>{c.nome}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-accent-subtle mb-1">Tipo</label>
              <select value={form.tipo} onChange={e => set('tipo', e.target.value)}
                className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-accent outline-none focus:border-white/25">
                <option value="Pontual">Pontual</option>
                <option value="Recorrente">Recorrente</option>
              </select>
            </div>
          </div>
          {form.tipo === 'Pontual' ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-accent-subtle mb-1">Data limite</label>
                <input type="date" value={form.data_conclusao} onChange={e => set('data_conclusao', e.target.value)}
                  className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-accent outline-none focus:border-white/25" />
              </div>
              <div>
                <label className="block text-[11px] text-accent-subtle mb-1">Hora</label>
                <input type="time" value={form.hora} onChange={e => set('hora', e.target.value)}
                  className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-accent outline-none focus:border-white/25" />
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-[11px] text-accent-subtle mb-1">Repetição</label>
              <select value={form.recorrencia} onChange={e => set('recorrencia', e.target.value)}
                className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-accent outline-none focus:border-white/25">
                <option value="semanal">Semanal</option>
                <option value="mensal">Mensal</option>
              </select>
            </div>
          )}
        </div>
        <div className="px-5 pb-4 flex justify-end gap-2">
          <button onClick={onFechar} className="px-4 py-2 rounded-lg text-xs text-accent-subtle hover:text-accent hover:bg-surface-2 transition-colors">Cancelar</button>
          <button onClick={guardar} disabled={saving || !form.tarefa.trim()}
            className="px-4 py-2 rounded-lg text-xs font-semibold bg-accent/15 border border-accent/30 text-accent hover:bg-accent/25 transition-colors disabled:opacity-40">
            {saving ? 'A guardar…' : 'Criar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Card de Tarefa ─────────────────────────────────────────────────────────────
function CardTarefa({ tarefa, onClick }) {
  return (
    <button onClick={onClick}
      className="w-full text-left rounded-xl border border-border/60 bg-surface-1 hover:border-white/15 hover:bg-surface-2 active:scale-[0.99] transition-all px-3 py-2.5 flex flex-col gap-1">
      <div className="flex items-start gap-2">
        <span className={clsx('w-2 h-2 rounded-full shrink-0 mt-1', ESTADO_DOT[tarefa.estado] ?? ESTADO_DOT['a fazer'])} />
        <p className="flex-1 text-[13px] font-medium text-accent leading-snug">{tarefa.tarefa}</p>
        {fmtData(tarefa.data_conclusao) && (
          <span className="text-[10px] text-accent-subtle/50 shrink-0 whitespace-nowrap">{fmtData(tarefa.data_conclusao)}</span>
        )}
      </div>
      <div className="flex items-center gap-2 pl-4">
        <span className={clsx('text-[10px] font-semibold border rounded px-1.5 py-px', ESTADO_CLS[tarefa.estado] ?? ESTADO_CLS['a fazer'])}>
          {tarefa.estado}
        </span>
        {tarefa.responsavel && <span className="text-[10px] text-accent-subtle/50">{tarefa.responsavel}</span>}
        {tarefa.tipo && <span className="text-[10px] text-accent-subtle/40">· {tarefa.tipo}</span>}
      </div>
    </button>
  )
}

// ── Vista Tarefas ─────────────────────────────────────────────────────────────
function VistaTarefas({ onVoltar, limite }) {
  const [tarefas,  setTarefas]  = useState([])
  const [loading,  setLoading]  = useState(true)
  const [pesquisa, setPesquisa] = useState('')
  const [filtro,   setFiltro]   = useState('a-fazer')
  const [editando, setEditando] = useState(null)
  const [criando,  setCriando]  = useState(false)

  useEffect(() => {
    setLoading(true)
    supaEventos.from('supa_tarefas')
      .select('id, tarefa, responsavel, estado, data_conclusao, hora, tipo, notas_operacionais, criado_por, concluida_em')
      .order('data_conclusao', { ascending: true, nullsFirst: false })
      .then(({ data }) => { setTarefas(data ?? []); setLoading(false) })
  }, [])

  const lista = tarefas
    .filter(t => {
      if (filtro === 'a-fazer')   return ['a fazer', 'em curso'].includes(t.estado)
      if (filtro === 'a-validar') return t.estado === 'a validar'
      if (filtro === 'concluido') return ['concluída', 'fechada'].includes(t.estado)
      return true
    })
    .filter(t => {
      if (!pesquisa) return true
      const q = pesquisa.toLowerCase()
      return (t.tarefa ?? '').toLowerCase().includes(q)
        || (t.responsavel ?? '').toLowerCase().includes(q)
    })
    .slice(0, limite)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {!limite && (
        <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-border/40 flex-wrap">
          {onVoltar && (
            <button onClick={onVoltar}
              className="flex items-center gap-1 text-accent-subtle hover:text-accent text-xs transition-colors">
              <ChevronLeft size={14} /> Voltar
            </button>
          )}
          <div className="flex gap-1">
            {[
              { id: 'a-fazer', label: 'A fazer' },
              { id: 'a-validar', label: 'A validar' },
              { id: 'concluido', label: 'Concluído' },
              { id: 'todas', label: 'Todas' },
            ].map(f => (
              <button key={f.id} onClick={() => setFiltro(f.id)}
                className={clsx('px-3 py-1 rounded-full border text-[11px] font-semibold transition-colors',
                  filtro === f.id
                    ? 'bg-accent/10 border-accent/30 text-accent'
                    : 'bg-surface-2/60 border-border/60 text-accent-subtle hover:text-accent')}>
                {f.label}
              </button>
            ))}
          </div>
          <div className="relative ml-auto">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-accent-subtle/50 pointer-events-none" />
            <input type="text" placeholder="Pesquisar…" value={pesquisa} onChange={e => setPesquisa(e.target.value)}
              className="pl-7 pr-6 py-1 bg-surface-2 border border-border rounded text-xs text-accent placeholder:text-accent-subtle/40 focus:outline-none focus:border-white/20 w-36" />
            {pesquisa && (
              <button onClick={() => setPesquisa('')} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-accent-subtle/50 hover:text-accent">
                <X size={10} />
              </button>
            )}
          </div>
          <button onClick={() => setCriando(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-accent/30 bg-accent/10 text-accent text-xs font-semibold hover:bg-accent/20 transition-colors">
            <Plus size={12} /> Nova
          </button>
        </div>
      )}

      <div className={clsx('overflow-y-auto', limite ? '' : 'flex-1 p-3')}>
        {loading
          ? <p className="text-center text-accent-subtle/40 text-sm py-6">A carregar…</p>
          : lista.length === 0
          ? <p className="text-center text-accent-subtle/40 text-sm py-6">Sem tarefas.</p>
          : <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {lista.map(t => (
                <CardTarefa key={t.id} tarefa={t} onClick={() => setEditando(t)} />
              ))}
            </div>
        }
      </div>

      {editando && (
        <ModalEditarTarefa
          tarefa={editando}
          onFechar={() => setEditando(null)}
          onGuardada={(updated) => { setTarefas(prev => prev.map(t => t.id === updated.id ? updated : t)); setEditando(null) }}
          onApagada={(id) => { setTarefas(prev => prev.filter(t => t.id !== id)); setEditando(null) }}
        />
      )}
      {criando && (
        <ModalCriarTarefa
          onFechar={() => setCriando(false)}
          onCriada={(nova) => { setTarefas(prev => [nova, ...prev]); setCriando(false) }}
        />
      )}
    </div>
  )
}

// ── Card de Ocorrência ─────────────────────────────────────────────────────────
function CardOcorrencia({ oc, onClick }) {
  const cfg = STATUS_OC[oc.status] ?? STATUS_OC.aberta
  const Ic  = cfg.Ic
  return (
    <button onClick={onClick}
      className="w-full text-left rounded-xl border border-border/60 bg-surface-1 hover:border-white/15 hover:bg-surface-2 active:scale-[0.99] transition-all px-3 py-2.5 flex flex-col gap-1">
      <div className="flex items-start gap-2">
        <Ic size={13} className={clsx('shrink-0 mt-0.5', cfg.cls)} />
        <p className="flex-1 text-[13px] font-medium text-accent leading-snug">{oc.titulo}</p>
        <span className="text-[10px] text-accent-subtle/50 shrink-0 whitespace-nowrap">{oc.data_ocorrencia}</span>
      </div>
      {(oc.espacos?.nome || oc.registado_por) && (
        <div className="flex items-center gap-2 pl-5 text-[10px] text-accent-subtle/50">
          {oc.espacos?.nome && <span>{oc.espacos.nome}</span>}
          {oc.registado_por && <span>· {oc.registado_por}</span>}
        </div>
      )}
    </button>
  )
}

// ── Vista Ocorrências ─────────────────────────────────────────────────────────
function VistaOcorrencias({ espacos, onVoltar, limite }) {
  const [ocorrencias, setOcorrencias] = useState([])
  const [intervIdx,   setIntervIdx]   = useState({})
  const [loading,     setLoading]     = useState(true)
  const [filtro,      setFiltro]      = useState('abertas')
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

  const lista = ocorrencias
    .filter(o => {
      if (filtro === 'abertas') return o.status !== 'fechada'
      if (filtro === 'fechadas') return o.status === 'fechada'
      return true
    })
    .slice(0, limite)

  const FILTROS = [
    { id: 'abertas', label: 'Abertas' },
    { id: 'todas',   label: 'Todas' },
    { id: 'fechadas',label: 'Fechadas' },
  ]

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {!limite && (
        <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-border/40 flex-wrap">
          {onVoltar && (
            <button onClick={onVoltar}
              className="flex items-center gap-1 text-accent-subtle hover:text-accent text-xs transition-colors">
              <ChevronLeft size={14} /> Voltar
            </button>
          )}
          <div className="flex gap-1">
            {FILTROS.map(f => (
              <button key={f.id} onClick={() => setFiltro(f.id)}
                className={clsx('px-3 py-1 rounded-full border text-[11px] font-semibold transition-colors',
                  filtro === f.id
                    ? 'bg-amber-400/10 border-amber-400/30 text-amber-400'
                    : 'bg-surface-2/60 border-border/60 text-accent-subtle hover:text-accent')}>
                {f.label}
              </button>
            ))}
          </div>
          <button onClick={() => setModalNova(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-400/30 bg-amber-400/10 text-amber-400 text-xs font-semibold hover:bg-amber-400/20 transition-colors ml-auto">
            <Plus size={12} /> Nova
          </button>
        </div>
      )}

      <div className={clsx('overflow-y-auto', limite ? '' : 'flex-1 p-3')}>
        {loading
          ? <p className="text-center text-accent-subtle/40 text-sm py-6">A carregar…</p>
          : lista.length === 0
          ? <p className="text-center text-accent-subtle/40 text-sm py-6">Sem ocorrências.</p>
          : <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {lista.map(oc => (
                <CardOcorrencia key={oc.id} oc={oc} onClick={() => setAberta(oc)} />
              ))}
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

// ── Modal Editar Checklist ─────────────────────────────────────────────────────
function ModalEditarChecklist({ checklist, tipos, onFechar, onGuardada, onApagada }) {
  const uidL = () => Math.random().toString(36).slice(2)
  const [editNome, setEditNome] = useState(checklist.nome ?? '')
  const [tipoSel,  setTipoSel]  = useState(checklist.tipo_evento_id ?? '')
  const [itens,    setItens]    = useState(
    (checklist.checklist_itens ?? []).sort((a, b) => a.ordem - b.ordem).map(it => ({ ...it, _key: uidL() }))
  )
  const [deleted, setDeleted] = useState([])
  const [saving,  setSaving]  = useState(false)

  const addItem = () => setItens(prev => [...prev, { id: null, texto: '', ordem: prev.length, _key: uidL() }])
  const rmItem  = (key) => {
    const item = itens.find(i => i._key === key)
    setItens(prev => prev.filter(i => i._key !== key))
    if (item?.id) setDeleted(prev => [...prev, item.id])
  }
  const updItem = (key, texto) => setItens(prev => prev.map(i => i._key === key ? { ...i, texto } : i))

  const guardar = async () => {
    setSaving(true)
    await supabase.from('checklists').update({ nome: editNome, tipo_evento_id: tipoSel || null }).eq('id', checklist.id)
    for (const id of deleted) await supabase.from('checklist_itens').delete().eq('id', id)
    const novosItens = []
    for (let i = 0; i < itens.length; i++) {
      const it = itens[i]
      if (!it.texto.trim()) continue
      if (it.id) {
        await supabase.from('checklist_itens').update({ texto: it.texto, ordem: i }).eq('id', it.id)
        novosItens.push({ ...it, ordem: i })
      } else {
        const { data } = await supabase.from('checklist_itens')
          .insert({ checklist_id: checklist.id, texto: it.texto, ordem: i }).select('id').single()
        novosItens.push({ ...it, id: data?.id, ordem: i })
      }
    }
    setSaving(false)
    onGuardada({ ...checklist, nome: editNome, tipo_evento_id: tipoSel || null, checklist_itens: novosItens })
  }

  const apagar = async () => {
    if (!window.confirm('Apagar esta checklist?')) return
    await supabase.from('checklists').delete().eq('id', checklist.id)
    onApagada(checklist.id)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={e => e.target === e.currentTarget && onFechar()}>
      <div className="bg-surface-1 border border-border rounded-2xl w-full max-w-md mx-4 shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/50">
          <p className="text-sm font-bold text-accent">Editar Checklist</p>
          <button onClick={onFechar}><X size={16} className="text-accent-subtle hover:text-accent" /></button>
        </div>
        <div className="px-5 py-4 flex flex-col gap-3 overflow-y-auto max-h-[60vh]">
          <div>
            <label className="block text-[11px] text-accent-subtle mb-1">Nome</label>
            <input autoFocus value={editNome} onChange={e => setEditNome(e.target.value)}
              className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-accent outline-none focus:border-white/25" />
          </div>
          <div>
            <label className="block text-[11px] text-accent-subtle mb-1">Tipo de evento</label>
            <select value={tipoSel} onChange={e => setTipoSel(e.target.value)}
              className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-accent outline-none focus:border-white/25">
              <option value="">— Nenhum —</option>
              {tipos.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] text-accent-subtle mb-2">Itens</label>
            <div className="flex flex-col gap-1.5">
              {itens.map((it, idx) => (
                <div key={it._key} className="flex items-center gap-2">
                  <span className="text-[10px] text-accent-subtle/40 w-4 text-right shrink-0">{idx + 1}.</span>
                  <input value={it.texto} onChange={e => updItem(it._key, e.target.value)}
                    placeholder={`Item ${idx + 1}…`}
                    className="flex-1 text-[12px] text-accent bg-transparent border-b border-border/30 focus:border-accent/40 outline-none py-0.5" />
                  <button onClick={() => rmItem(it._key)} className="text-accent-subtle/25 hover:text-red-400 transition-colors">
                    <X size={11} />
                  </button>
                </div>
              ))}
              <button onClick={addItem}
                className="flex items-center gap-1 text-[11px] text-accent-subtle/40 hover:text-accent transition-colors mt-1">
                <Plus size={11} /> Adicionar item
              </button>
            </div>
          </div>
        </div>
        <div className="px-5 pb-4 flex items-center justify-between gap-2">
          <button onClick={apagar} className="flex items-center gap-1 text-xs text-red-400/60 hover:text-red-400 transition-colors">
            <Trash2 size={12} /> Apagar
          </button>
          <div className="flex gap-2">
            <button onClick={onFechar} className="px-4 py-2 rounded-lg text-xs text-accent-subtle hover:text-accent hover:bg-surface-2 transition-colors">Cancelar</button>
            <button onClick={guardar} disabled={saving}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-accent/15 border border-accent/30 text-accent hover:bg-accent/25 transition-colors disabled:opacity-40">
              {saving ? 'A guardar…' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Card de Checklist ──────────────────────────────────────────────────────────
function CardChecklist({ cl, onClick }) {
  const nItens = (cl.checklist_itens ?? []).length
  return (
    <button onClick={onClick}
      className="w-full text-left rounded-xl border border-border/60 bg-surface-1 hover:border-white/15 hover:bg-surface-2 active:scale-[0.99] transition-all px-3 py-2.5 flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <ListChecks size={13} className="text-teal-400 shrink-0" />
        <p className="flex-1 text-[13px] font-medium text-accent leading-snug">{cl.nome}</p>
      </div>
      <div className="flex items-center gap-2 pl-5 text-[10px] text-accent-subtle/50">
        {cl.tipo_eventos?.nome && <span>{cl.tipo_eventos.nome}</span>}
        {cl.tipo_eventos?.nome && nItens > 0 && <span>·</span>}
        {nItens > 0 && <span>{nItens} {nItens === 1 ? 'item' : 'itens'}</span>}
        {nItens === 0 && !cl.tipo_eventos?.nome && <span className="italic">Sem itens</span>}
      </div>
    </button>
  )
}

// ── Vista Checklists ──────────────────────────────────────────────────────────
function VistaChecklists({ onVoltar, limite }) {
  const uidL = () => Math.random().toString(36).slice(2)
  const [checklists, setChecklists] = useState([])
  const [tipos,      setTipos]      = useState([])
  const [loading,    setLoading]    = useState(true)
  const [editando,   setEditando]   = useState(null)

  useEffect(() => {
    Promise.all([
      supabase.from('checklists')
        .select('id, nome, tipo_evento_id, tipo_eventos(nome), checklist_itens(id, texto, ordem)')
        .order('nome'),
      supabase.from('tipo_eventos').select('id, nome').order('nome'),
    ]).then(([{ data: cls }, { data: tps }]) => {
      setTipos(tps ?? [])
      setChecklists(cls ?? [])
      setLoading(false)
    })
  }, [])

  const criarChecklist = async () => {
    const { data } = await supabase.from('checklists')
      .insert({ nome: 'Nova Checklist' })
      .select('id, nome, tipo_evento_id, tipo_eventos(nome), checklist_itens(id, texto, ordem)')
      .single()
    if (data) { setChecklists(prev => [data, ...prev]); setEditando(data) }
  }

  const lista = checklists.slice(0, limite)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {!limite && (
        <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-border/40">
          {onVoltar && (
            <button onClick={onVoltar}
              className="flex items-center gap-1 text-accent-subtle hover:text-accent text-xs transition-colors">
              <ChevronLeft size={14} /> Voltar
            </button>
          )}
          <button onClick={criarChecklist}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-teal-400/30 bg-teal-400/10 text-teal-400 text-xs font-semibold hover:bg-teal-400/20 transition-colors ml-auto">
            <Plus size={12} /> Nova
          </button>
        </div>
      )}

      <div className={clsx('overflow-y-auto', limite ? '' : 'flex-1 p-3')}>
        {loading
          ? <p className="text-center text-accent-subtle/40 text-sm py-6">A carregar…</p>
          : lista.length === 0
          ? <p className="text-center text-accent-subtle/40 text-sm py-6">Sem checklists.</p>
          : <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {lista.map(cl => (
                <CardChecklist key={cl.id} cl={cl} onClick={() => setEditando(cl)} />
              ))}
            </div>
        }
      </div>

      {editando && (
        <ModalEditarChecklist
          checklist={editando}
          tipos={tipos}
          onFechar={() => setEditando(null)}
          onGuardada={(updated) => { setChecklists(prev => prev.map(cl => cl.id === updated.id ? updated : cl)); setEditando(null) }}
          onApagada={(id) => { setChecklists(prev => prev.filter(cl => cl.id !== id)); setEditando(null) }}
        />
      )}
    </div>
  )
}

// ── Visão Geral — 3 colunas, 5 cards cada ────────────────────────────────────
function VistaGeral({ onIr, espacos }) {
  return (
    <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">

      {/* Tarefas */}
      <div className="flex flex-col rounded-2xl border border-border/40 bg-surface-1 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/30 bg-surface-2">
          <div className="flex items-center gap-2">
            <ListTodo size={14} className="text-accent" />
            <p className="text-[11px] font-bold uppercase tracking-wider text-accent">Tarefas</p>
          </div>
          <button onClick={() => onIr('tarefas')}
            className="text-[10px] text-accent-subtle/60 hover:text-accent transition-colors">Ver todas →</button>
        </div>
        <div className="p-3">
          <VistaTarefas limite={5} />
        </div>
      </div>

      {/* Ocorrências */}
      <div className="flex flex-col rounded-2xl border border-border/40 bg-surface-1 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/30 bg-surface-2">
          <div className="flex items-center gap-2">
            <AlertTriangle size={14} className="text-amber-400" />
            <p className="text-[11px] font-bold uppercase tracking-wider text-amber-400">Ocorrências</p>
          </div>
          <button onClick={() => onIr('ocorrencias')}
            className="text-[10px] text-accent-subtle/60 hover:text-accent transition-colors">Ver todas →</button>
        </div>
        <div className="p-3">
          <VistaOcorrencias espacos={espacos} limite={5} />
        </div>
      </div>

      {/* Checklists */}
      <div className="flex flex-col rounded-2xl border border-border/40 bg-surface-1 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/30 bg-surface-2">
          <div className="flex items-center gap-2">
            <ListChecks size={14} className="text-teal-400" />
            <p className="text-[11px] font-bold uppercase tracking-wider text-teal-400">Checklists</p>
          </div>
          <button onClick={() => onIr('checklists')}
            className="text-[10px] text-accent-subtle/60 hover:text-accent transition-colors">Ver todas →</button>
        </div>
        <div className="p-3">
          <VistaChecklists limite={5} />
        </div>
      </div>

    </div>
  )
}

// ── Página PRODUÇÃO ───────────────────────────────────────────────────────────
export function Producao() {
  const [vista,   setVista]   = useState('geral')
  const [espacos, setEspacos] = useState([])

  useEffect(() => {
    supabase.from('espacos').select('id, nome').eq('activo', true).order('nome')
      .then(({ data }) => setEspacos(data ?? []))
  }, [])

  const TABS = [
    { id: 'geral',       label: 'Visão Geral',  Ic: FileText },
    { id: 'tarefas',     label: 'Tarefas',       Ic: ListTodo },
    { id: 'ocorrencias', label: 'Ocorrências',   Ic: AlertTriangle },
    { id: 'checklists',  label: 'Checklists',    Ic: ListChecks },
  ]

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 flex border-b border-border/40 bg-surface-1">
        {TABS.map(tab => {
          const Ic = tab.Ic
          return (
            <button key={tab.id} onClick={() => setVista(tab.id)}
              className={clsx(
                'flex items-center gap-1.5 px-4 py-3 text-[12px] font-semibold border-b-2 transition-colors whitespace-nowrap',
                vista === tab.id
                  ? 'border-accent text-accent'
                  : 'border-transparent text-accent-subtle hover:text-accent'
              )}>
              <Ic size={13} />
              {tab.label}
            </button>
          )
        })}
      </div>

      <div className="flex-1 overflow-hidden flex flex-col">
        {vista === 'geral'       && <VistaGeral onIr={setVista} espacos={espacos} />}
        {vista === 'tarefas'     && <VistaTarefas onVoltar={() => setVista('geral')} />}
        {vista === 'ocorrencias' && <VistaOcorrencias espacos={espacos} onVoltar={() => setVista('geral')} />}
        {vista === 'checklists'  && <VistaChecklists onVoltar={() => setVista('geral')} />}
      </div>
    </div>
  )
}
