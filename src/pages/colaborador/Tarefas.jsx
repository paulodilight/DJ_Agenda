import { useState, useEffect } from 'react'
import { ClipboardList, Check, Clock } from 'lucide-react'
import { clsx } from 'clsx'
import { useColaboradorStore } from '@/store'
import { colaboradorApi } from '@/lib/colaboradorApi'
import { Badge } from '@/components/ui/Badge'
import { LoadingPage } from '@/components/ui/LoadingSpinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { dataLonga, hhmm } from '@/components/colaborador/format'

const ESTADO_VAR = {
  'concluída': 'confirmado',
  'concluida': 'confirmado',
  'em curso': 'proposta',
  'a fazer': 'default',
  'atrasado': 'cancelado',
  'cancelada': 'cancelado',
}
const concluida = (estado) => ['concluída', 'concluida'].includes(estado)

export function ColaboradorTarefas() {
  const { colaborador } = useColaboradorStore()
  const [loading, setLoading] = useState(true)
  const [tarefas, setTarefas] = useState([])
  const [aGuardar, setAGuardar] = useState(null)

  useEffect(() => {
    if (!colaborador) return
    let activo = true
    setLoading(true)
    colaboradorApi
      .tarefasDoColaborador(colaborador.nome)
      .then((t) => activo && setTarefas(t))
      .catch(console.error)
      .finally(() => activo && setLoading(false))
    return () => {
      activo = false
    }
  }, [colaborador])

  const alternar = async (tarefa) => {
    const novoEstado = concluida(tarefa.estado) ? 'a fazer' : 'concluída'
    setAGuardar(tarefa.id)
    try {
      await colaboradorApi.actualizarEstadoTarefa(tarefa.id, novoEstado)
      setTarefas((prev) =>
        prev.map((t) =>
          t.id === tarefa.id
            ? { ...t, estado: novoEstado, confirmacao: novoEstado === 'concluída' ? 'concluida' : 'nao_concluida' }
            : t,
        ),
      )
    } catch (e) {
      console.error(e)
      alert('Não foi possível atualizar a tarefa: ' + e.message)
    } finally {
      setAGuardar(null)
    }
  }

  if (loading) return <LoadingPage />
  if (tarefas.length === 0)
    return <EmptyState icone={ClipboardList} titulo="Sem tarefas" descricao="Não tens tarefas atribuídas de momento." />

  const porFazer = tarefas.filter((t) => !concluida(t.estado) && t.estado !== 'cancelada')
  const feitas = tarefas.filter((t) => concluida(t.estado))

  const Linha = (t) => (
    <div
      key={t.id}
      className={clsx(
        'flex items-start gap-3 p-4 rounded-xl bg-surface-1 border border-border',
        concluida(t.estado) && 'opacity-60',
      )}
    >
      <button
        onClick={() => alternar(t)}
        disabled={aGuardar === t.id}
        className={clsx(
          'w-6 h-6 rounded-md border flex items-center justify-center shrink-0 mt-0.5 transition-colors',
          concluida(t.estado)
            ? 'bg-amber-400 border-amber-400 text-black'
            : 'border-accent-subtle/60 hover:border-amber-400 text-transparent',
        )}
      >
        <Check size={15} />
      </button>
      <div className="flex-1 min-w-0">
        <p className={clsx('text-sm text-accent', concluida(t.estado) && 'line-through')}>{t.tarefa}</p>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {t.estado && <Badge variante={ESTADO_VAR[t.estado] ?? 'default'}>{t.estado}</Badge>}
          {t.data_conclusao && (
            <span className="flex items-center gap-1 text-[11px] text-accent-subtle">
              <Clock size={11} /> {dataLonga(t.data_conclusao)}{t.hora ? ` · ${hhmm(t.hora)}` : ''}
            </span>
          )}
          {t.criado_por && <span className="text-[11px] text-accent-subtle">por {t.criado_por}</span>}
        </div>
      </div>
    </div>
  )

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h1 className="text-base font-bold text-accent mb-1">As minhas tarefas</h1>
        <h2 className="text-xs uppercase tracking-wider text-accent-subtle mb-3">Por fazer ({porFazer.length})</h2>
        <div className="flex flex-col gap-2">
          {porFazer.length > 0 ? porFazer.map(Linha) : <p className="text-sm text-accent-subtle">Tudo feito! 🎉</p>}
        </div>
      </section>

      {feitas.length > 0 && (
        <section>
          <h2 className="text-xs uppercase tracking-wider text-accent-subtle mb-3">Concluídas ({feitas.length})</h2>
          <div className="flex flex-col gap-2">{feitas.map(Linha)}</div>
        </section>
      )}
    </div>
  )
}
