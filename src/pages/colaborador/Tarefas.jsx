import { useState, useEffect, useRef } from 'react'
import { ClipboardList, Clock, Camera, ImageIcon, X } from 'lucide-react'
import { clsx } from 'clsx'
import { useColaboradorStore } from '@/store'
import { colaboradorApi } from '@/lib/colaboradorApi'
import { supabase } from '@/lib/supabase'
import { Badge } from '@/components/ui/Badge'
import { LoadingPage } from '@/components/ui/LoadingSpinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { dataLonga, hhmm } from '@/components/colaborador/format'

const ESTADOS_ATIVOS = ['a fazer', 'em curso', 'a validar']
const ESTADOS_OPCOES = ['em curso', 'a validar', 'concluída']

const ESTADO_VAR = {
  'concluída':  'confirmado',
  'concluida':  'confirmado',
  'em curso':   'proposta',
  'a fazer':    'default',
  'a validar':  'default',
  'cancelada':  'cancelado',
}

async function uploadFotoTarefa(file) {
  const ext  = (file.name.split('.').pop() || 'jpg').toLowerCase()
  const path = `tarefas/${Date.now()}.${ext}`
  const { error } = await supabase.storage.from('ocorrencias').upload(path, file, { upsert: true, contentType: file.type })
  if (error) throw error
  return supabase.storage.from('ocorrencias').getPublicUrl(path).data.publicUrl
}

function fmtConcluida(iso) {
  if (!iso) return null
  return new Date(iso).toLocaleString('pt-PT', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export function ColaboradorTarefas() {
  const { colaborador } = useColaboradorStore()
  const [loading, setLoading] = useState(true)
  const [tarefas, setTarefas] = useState([])
  const [aGuardar, setAGuardar] = useState(null)
  const [aUpload, setAUpload]   = useState(null)
  const camaraRefs  = useRef({})
  const galeriaRefs = useRef({})

  useEffect(() => {
    if (!colaborador) return
    let activo = true
    setLoading(true)
    colaboradorApi
      .tarefasDoColaborador(colaborador.nome)
      .then((t) => activo && setTarefas(t.filter((x) => ESTADOS_ATIVOS.includes(x.estado))))
      .catch(console.error)
      .finally(() => activo && setLoading(false))
    return () => { activo = false }
  }, [colaborador])

  const mudarEstado = async (tarefa, novoEstado) => {
    setAGuardar(tarefa.id)
    try {
      await colaboradorApi.actualizarEstadoTarefa(tarefa.id, novoEstado)
      setTarefas((prev) =>
        prev.map((t) =>
          t.id === tarefa.id
            ? { ...t, estado: novoEstado, concluida_em: novoEstado === 'concluída' ? new Date().toISOString() : null }
            : t,
        ),
      )
    } catch (e) {
      console.error(e)
      alert('Não foi possível atualizar: ' + e.message)
    } finally {
      setAGuardar(null)
    }
  }

  const onFoto = async (e, tarefaId) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAUpload(tarefaId)
    try {
      const url = await uploadFotoTarefa(file)
      await colaboradorApi.actualizarFotoTarefa(tarefaId, url)
      setTarefas((prev) => prev.map((t) => t.id === tarefaId ? { ...t, foto_url: url } : t))
    } catch (err) {
      alert('Erro ao guardar foto: ' + err.message)
    } finally {
      setAUpload(null)
      e.target.value = ''
    }
  }

  const removerFoto = async (tarefaId) => {
    try {
      await colaboradorApi.actualizarFotoTarefa(tarefaId, null)
      setTarefas((prev) => prev.map((t) => t.id === tarefaId ? { ...t, foto_url: null } : t))
    } catch (err) {
      alert('Erro ao remover foto: ' + err.message)
    }
  }

  if (loading) return <LoadingPage />
  if (tarefas.length === 0)
    return <EmptyState icone={ClipboardList} titulo="Sem tarefas" descricao="Não tens tarefas pendentes." />

  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-base font-bold text-accent">As minhas tarefas ({tarefas.length})</h1>
      {tarefas.map((t) => {
        const bloqueada = t.estado === 'concluída' || t.estado === 'concluida'
        return (
          <div key={t.id} className={clsx('flex flex-col rounded-xl bg-surface-1 border border-border', bloqueada && 'opacity-70')}>
            <div className="flex items-start p-4">
              <div className="flex-1 min-w-0">
                <p className={clsx('text-sm font-medium text-accent', bloqueada && 'line-through')}>{t.tarefa}</p>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <Badge variante={ESTADO_VAR[t.estado] ?? 'default'}>{t.estado}</Badge>
                  {t.tipo === 'Recorrente' && t.recorrencia ? (
                    <span className="text-[11px] text-accent-subtle">
                      {t.recorrencia === 'semanal' ? 'Semanal' : 'Mensal'}
                    </span>
                  ) : t.data_conclusao ? (
                    <span className="flex items-center gap-1 text-[11px] text-accent-subtle">
                      <Clock size={11} />
                      {dataLonga(t.data_conclusao)}{t.hora ? ` · ${hhmm(t.hora)}` : ''}
                    </span>
                  ) : null}
                  {t.criado_por && <span className="text-[11px] text-accent-subtle">por {t.criado_por}</span>}
                </div>
                {t.notas_operacionais && (
                  <p className="text-[12px] text-accent-muted mt-1.5 leading-relaxed">{t.notas_operacionais}</p>
                )}
                {bloqueada && t.concluida_em && (
                  <p className="text-[11px] text-amber-400/70 mt-1.5 font-medium">
                    ✓ Concluída em {fmtConcluida(t.concluida_em)}
                  </p>
                )}
              </div>
            </div>

            {/* Botões de estado */}
            {!bloqueada && (
              <div className="flex gap-1.5 px-4 pb-3 flex-wrap">
                {ESTADOS_OPCOES.map((s) => (
                  <button
                    key={s}
                    onClick={() => mudarEstado(t, s)}
                    disabled={aGuardar === t.id || t.estado === s}
                    className={clsx(
                      'px-2.5 py-1 rounded-full text-[11px] transition-colors border',
                      t.estado === s
                        ? 'bg-surface-4 border-border text-accent cursor-default'
                        : 'bg-surface-2 border-border/60 text-accent-subtle hover:text-accent hover:border-white/20 disabled:opacity-40',
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {/* Foto */}
            {!bloqueada && (
              t.foto_url ? (
                <div className="px-4 pb-4 relative">
                  <img src={t.foto_url} alt="" className="w-full max-h-48 object-cover rounded-lg border border-border" />
                  <button
                    onClick={() => removerFoto(t.id)}
                    className="absolute top-2 right-6 p-1 rounded-full bg-black/60 text-white/70 hover:text-white transition-colors"
                  >
                    <X size={12} />
                  </button>
                </div>
              ) : (
                <div className="flex gap-2 px-4 pb-3">
                  <input ref={el => { camaraRefs.current[t.id] = el }} type="file" accept="image/*" capture="environment"
                    className="hidden" onChange={e => onFoto(e, t.id)} />
                  <input ref={el => { galeriaRefs.current[t.id] = el }} type="file" accept="image/*"
                    className="hidden" onChange={e => onFoto(e, t.id)} />
                  <button
                    onClick={() => camaraRefs.current[t.id]?.click()}
                    disabled={aUpload === t.id}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border text-[11px] text-accent-subtle hover:text-accent hover:border-white/20 transition-colors disabled:opacity-40"
                  >
                    <Camera size={12} />
                    {aUpload === t.id ? 'A guardar…' : 'Câmara'}
                  </button>
                  <button
                    onClick={() => galeriaRefs.current[t.id]?.click()}
                    disabled={aUpload === t.id}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border text-[11px] text-accent-subtle hover:text-accent hover:border-white/20 transition-colors disabled:opacity-40"
                  >
                    <ImageIcon size={12} />
                    Galeria
                  </button>
                </div>
              )
            )}
          </div>
        )
      })}
    </div>
  )
}
