import { useState, useEffect, useRef } from 'react'
import { ClipboardList, Clock, Camera, ImageIcon, X, ChevronLeft } from 'lucide-react'
import { clsx } from 'clsx'
import { useColaboradorStore } from '@/store'
import { colaboradorApi } from '@/lib/colaboradorApi'
import { supabase } from '@/lib/supabase'
import { LoadingPage } from '@/components/ui/LoadingSpinner'
import { dataLonga, hhmm } from '@/components/colaborador/format'

const ESTADO_CFG = {
  'a fazer':   { badge: 'bg-surface-3 text-accent-subtle border-border/50',        label: 'A fazer' },
  'em curso':  { badge: 'bg-amber-400/10 text-amber-400 border-amber-400/30',      label: 'Em curso' },
  'a validar': { badge: 'bg-blue-400/10 text-blue-400 border-blue-400/30',         label: 'A validar' },
  'concluída': { badge: 'bg-green-400/10 text-green-400 border-green-400/30',      label: 'Concluída' },
  'fechada':   { badge: 'bg-emerald-900/20 text-emerald-400/70 border-emerald-400/20', label: 'Fechada' },
}

const ESTADO_ORDER = ['a fazer', 'em curso', 'a validar', 'concluída', 'fechada']

const TRANSICOES = {
  'a fazer':   ['em curso'],
  'em curso':  ['a validar', 'concluída'],
  'a validar': ['em curso', 'concluída'],
}

const FILTROS = [
  { id: 'a-fazer',   label: 'A fazer',   match: (e) => ['a fazer', 'em curso'].includes(e) },
  { id: 'a-validar', label: 'A validar', match: (e) => e === 'a validar' },
  { id: 'concluido', label: 'Concluído', match: (e) => ['concluída', 'fechada'].includes(e) },
  { id: 'todas',     label: 'Todas',     match: () => true },
]

async function uploadFotoTarefa(file) {
  const ext  = (file.name.split('.').pop() || 'jpg').toLowerCase()
  const path = `tarefas/${Date.now()}.${ext}`
  const { error } = await supabase.storage
    .from('ocorrencias')
    .upload(path, file, { upsert: true, contentType: file.type })
  if (error) throw error
  return supabase.storage.from('ocorrencias').getPublicUrl(path).data.publicUrl
}

function TarefaCard({ t, onClick }) {
  const cfg = ESTADO_CFG[t.estado] ?? ESTADO_CFG['a fazer']
  return (
    <button onClick={onClick}
      className="w-full text-left rounded-xl border border-border/60 bg-surface-1 hover:border-white/15 active:scale-[0.99] transition-all px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13px] font-bold text-accent leading-snug flex-1 min-w-0 line-clamp-2">{t.tarefa}</p>
        <span className={clsx('shrink-0 inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full border', cfg.badge)}>
          {cfg.label}
        </span>
      </div>
      <div className="flex items-center gap-2 mt-1 text-[10px] text-accent-subtle/60 flex-wrap">
        {t.data_conclusao && (
          <span className="flex items-center gap-0.5">
            <Clock size={9} />
            {dataLonga(t.data_conclusao)}{t.hora ? ` ${hhmm(t.hora)}` : ''}
          </span>
        )}
        {t.criado_por && <><span>·</span><span>por {t.criado_por}</span></>}
        {t.motivo_validacao && t.estado === 'a validar' && (
          <><span>·</span><span className="text-blue-400/70">aguarda validação</span></>
        )}
      </div>
    </button>
  )
}

function TarefaDetalhe({ t, onFechar, onAtualizado }) {
  const [tarefa, setTarefa]     = useState(t)
  const [pendente, setPendente] = useState(null)
  const [motivo, setMotivo]     = useState('')
  const [aGuardar, setAGuardar] = useState(false)
  const [aUpload, setAUpload]   = useState(false)
  const camaraRef  = useRef()
  const galeriaRef = useRef()

  const estado     = tarefa.estado
  const transicoes = TRANSICOES[estado] ?? []
  const bloqueada  = transicoes.length === 0
  const cfg        = ESTADO_CFG[estado] ?? ESTADO_CFG['a fazer']

  const confirmar = async () => {
    if (!pendente) return
    if (pendente === 'a validar' && !motivo.trim()) return
    setAGuardar(true)
    try {
      const extra = pendente === 'a validar' ? { motivo_validacao: motivo.trim() } : {}
      await colaboradorApi.actualizarEstadoTarefa(tarefa.id, pendente, extra)
      const novo = {
        ...tarefa,
        estado: pendente,
        ...extra,
        concluida_em: pendente === 'concluída' ? new Date().toISOString() : tarefa.concluida_em,
      }
      setTarefa(novo)
      setPendente(null)
      setMotivo('')
      onAtualizado(novo)
    } catch (e) { alert('Erro: ' + e.message) }
    finally { setAGuardar(false) }
  }

  const onFoto = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAUpload(true)
    try {
      const url = await uploadFotoTarefa(file)
      await colaboradorApi.actualizarFotoTarefa(tarefa.id, url)
      const novo = { ...tarefa, foto_url: url }
      setTarefa(novo)
      onAtualizado(novo)
    } catch (err) { alert('Erro ao guardar foto: ' + err.message) }
    finally { setAUpload(false); e.target.value = '' }
  }

  const removerFoto = async () => {
    try {
      await colaboradorApi.actualizarFotoTarefa(tarefa.id, null)
      const novo = { ...tarefa, foto_url: null }
      setTarefa(novo)
      onAtualizado(novo)
    } catch (err) { alert(err.message) }
  }

  return (
    <div className="fixed inset-0 z-40 bg-surface-0 flex flex-col">
      {/* Header */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-border/40">
        <button onClick={onFechar}
          className="flex items-center gap-1 text-accent-subtle hover:text-accent text-[13px] transition-colors">
          <ChevronLeft size={16} /> Voltar
        </button>
        <span className={clsx('ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full border', cfg.badge)}>
          {cfg.label}
        </span>
      </div>

      {/* Conteúdo */}
      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">
        <h2 className="text-[15px] font-bold text-accent leading-snug">{tarefa.tarefa}</h2>

        {tarefa.notas_operacionais && (
          <p className="text-[13px] text-accent-muted leading-relaxed">{tarefa.notas_operacionais}</p>
        )}

        {tarefa.motivo_validacao && (
          <div className="rounded-xl bg-blue-400/10 border border-blue-400/30 px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-wide text-blue-400/70 mb-1">Motivo de validação</p>
            <p className="text-[13px] text-accent-muted">{tarefa.motivo_validacao}</p>
          </div>
        )}

        {tarefa.foto_url && (
          <div className="relative">
            <img src={tarefa.foto_url} alt=""
              className="w-full max-h-56 object-cover rounded-xl border border-border" />
            {!bloqueada && (
              <button onClick={removerFoto}
                className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 text-white/70 hover:text-white transition-colors">
                <X size={13} />
              </button>
            )}
          </div>
        )}

        {!bloqueada && !tarefa.foto_url && (
          <div className="flex gap-2">
            <input ref={camaraRef} type="file" accept="image/*" capture="environment"
              className="hidden" onChange={onFoto} />
            <input ref={galeriaRef} type="file" accept="image/*"
              className="hidden" onChange={onFoto} />
            <button onClick={() => camaraRef.current?.click()} disabled={aUpload}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-[11px] text-accent-subtle hover:text-accent hover:border-white/20 transition-colors disabled:opacity-40">
              <Camera size={12} />{aUpload ? 'A guardar…' : 'Câmara'}
            </button>
            <button onClick={() => galeriaRef.current?.click()} disabled={aUpload}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-[11px] text-accent-subtle hover:text-accent hover:border-white/20 transition-colors disabled:opacity-40">
              <ImageIcon size={12} />Galeria
            </button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 text-[11px]">
          {tarefa.data_conclusao && (
            <div>
              <p className="text-accent-subtle/50 mb-0.5">Conclusão</p>
              <p className="text-accent-muted">
                {dataLonga(tarefa.data_conclusao)}{tarefa.hora ? ` ${hhmm(tarefa.hora)}` : ''}
              </p>
            </div>
          )}
          {tarefa.criado_por && (
            <div>
              <p className="text-accent-subtle/50 mb-0.5">Criado por</p>
              <p className="text-accent-muted">{tarefa.criado_por}</p>
            </div>
          )}
          {tarefa.concluida_em && (
            <div className="col-span-2">
              <p className="text-accent-subtle/50 mb-0.5">Concluída em</p>
              <p className="text-accent-muted">
                {new Date(tarefa.concluida_em).toLocaleString('pt-PT', {
                  day: '2-digit', month: '2-digit', year: 'numeric',
                  hour: '2-digit', minute: '2-digit',
                })}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Footer de estado */}
      {!bloqueada ? (
        <div className="shrink-0 border-t border-border/40 px-4 py-4 flex flex-col gap-3">
          <p className="text-[10px] uppercase tracking-wide text-accent-subtle/50">Mudar estado</p>
          <div className="flex gap-2">
            {transicoes.map(s => (
              <button key={s} onClick={() => setPendente(pendente === s ? null : s)}
                className={clsx(
                  'flex-1 py-2.5 rounded-xl border text-[12px] font-semibold capitalize transition-colors',
                  pendente === s
                    ? 'bg-accent/20 border-accent/40 text-accent'
                    : 'bg-surface-2 border-border/60 text-accent-subtle hover:text-accent hover:border-white/20',
                )}>
                {s}
              </button>
            ))}
          </div>

          {pendente === 'a validar' && (
            <textarea
              value={motivo}
              onChange={e => setMotivo(e.target.value)}
              placeholder="Motivo ou questão para validação…"
              rows={3}
              className="w-full bg-surface-2 rounded-xl border border-border px-3 py-2.5 text-[13px] text-accent placeholder:text-accent-subtle/40 outline-none focus:border-white/20 resize-none"
            />
          )}

          {pendente && (
            <button onClick={confirmar}
              disabled={aGuardar || (pendente === 'a validar' && !motivo.trim())}
              className="w-full py-3 rounded-xl bg-accent/20 border border-accent/40 text-accent font-semibold text-[13px] hover:bg-accent/30 transition-colors disabled:opacity-40">
              {aGuardar ? 'A guardar…' : `Confirmar → ${pendente}`}
            </button>
          )}
        </div>
      ) : (
        <div className="shrink-0 border-t border-border/40 px-4 py-4">
          <p className="text-center text-[12px] text-accent-subtle/40">
            {estado === 'fechada'   ? 'Tarefa fechada pelo admin' :
             estado === 'concluída' ? '✓ Marcada como concluída' : ''}
          </p>
        </div>
      )}
    </div>
  )
}

export function ColaboradorTarefas() {
  const { colaborador } = useColaboradorStore()
  const [loading, setLoading] = useState(true)
  const [tarefas, setTarefas] = useState([])
  const [filtro,  setFiltro]  = useState('a-fazer')
  const [aberta,  setAberta]  = useState(null)

  useEffect(() => {
    if (!colaborador) return
    let activo = true
    setLoading(true)
    colaboradorApi
      .tarefasDoColaborador(colaborador.nome)
      .then(t => activo && setTarefas(t))
      .catch(console.error)
      .finally(() => activo && setLoading(false))
    return () => { activo = false }
  }, [colaborador])

  const atualizado = (nova) => {
    setTarefas(prev => prev.map(t => t.id === nova.id ? nova : t))
    setAberta(nova)
  }

  const filtroAtual = FILTROS.find(f => f.id === filtro) ?? FILTROS[0]
  const lista = tarefas
    .filter(t => filtroAtual.match(t.estado))
    .sort((a, b) => {
      const oa = ESTADO_ORDER.indexOf(a.estado)
      const ob = ESTADO_ORDER.indexOf(b.estado)
      if (oa !== ob) return oa - ob
      const da = a.data_conclusao ?? ''
      const db = b.data_conclusao ?? ''
      return da.localeCompare(db)
    })

  const pendentes = tarefas.filter(t => ['a fazer', 'em curso'].includes(t.estado)).length

  if (loading) return <LoadingPage />

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 flex items-center gap-2 px-4 py-3 border-b border-border/40">
        <span className="text-[15px] font-bold text-accent">Tarefas</span>
        {pendentes > 0 && (
          <span className="text-[10px] font-bold bg-amber-400/15 border border-amber-400/30 text-amber-400 rounded-full px-2 py-0.5">
            {pendentes}
          </span>
        )}
      </div>

      {/* Filtros */}
      <div className="shrink-0 flex gap-1.5 px-4 py-2 border-b border-border/30 overflow-x-auto">
        {FILTROS.map(f => (
          <button key={f.id} onClick={() => setFiltro(f.id)}
            className={clsx(
              'px-3 py-1 rounded-full border text-[11px] font-semibold shrink-0 transition-colors',
              filtro === f.id
                ? 'bg-amber-400/15 border-amber-400/30 text-amber-400'
                : 'bg-surface-2/60 border-border/60 text-accent-subtle hover:text-accent',
            )}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Lista */}
      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2">
        {lista.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <ClipboardList size={32} className="text-accent-subtle/20" />
            <p className="text-[13px] text-accent-subtle/50">Sem tarefas.</p>
          </div>
        ) : (
          lista.map(t => (
            <TarefaCard key={t.id} t={t} onClick={() => setAberta(t)} />
          ))
        )}
      </div>

      {aberta && (
        <TarefaDetalhe
          t={aberta}
          onFechar={() => setAberta(null)}
          onAtualizado={atualizado}
        />
      )}
    </div>
  )
}
