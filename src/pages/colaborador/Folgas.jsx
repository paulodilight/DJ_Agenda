import { useState, useEffect } from 'react'
import { Coffee } from 'lucide-react'
import { clsx } from 'clsx'
import { useColaboradorStore } from '@/store'
import { colaboradorApi } from '@/lib/colaboradorApi'
import { LoadingPage } from '@/components/ui/LoadingSpinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { dataLonga, diaSemana } from '@/components/colaborador/format'

const hojeISO = () => {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

export function ColaboradorFolgas() {
  const { colaborador } = useColaboradorStore()
  const [loading, setLoading] = useState(true)
  const [folgas, setFolgas] = useState([])

  useEffect(() => {
    if (!colaborador) return
    let activo = true
    setLoading(true)
    colaboradorApi
      .folgasDoTecnico(colaborador.id)
      .then((f) => activo && setFolgas(f))
      .catch(console.error)
      .finally(() => activo && setLoading(false))
    return () => {
      activo = false
    }
  }, [colaborador])

  if (loading) return <LoadingPage />
  if (folgas.length === 0)
    return <EmptyState icone={Coffee} titulo="Sem folgas" descricao="Não tens folgas marcadas de momento." />

  const hoje = hojeISO()
  const proximas = folgas.filter((f) => f.data >= hoje)
  const passadas = folgas.filter((f) => f.data < hoje).reverse()

  const Cartao = (f) => (
    <div
      key={f.id}
      className={clsx(
        'flex items-center gap-3 p-4 rounded-xl bg-surface-1 border border-border',
        f.data < hoje && 'opacity-60',
      )}
    >
      <span className="w-11 h-11 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center shrink-0">
        <Coffee size={20} />
      </span>
      <div>
        <p className="text-sm font-medium text-accent capitalize">{diaSemana(f.data)}</p>
        <p className="text-xs text-accent-muted capitalize">{dataLonga(f.data)}</p>
      </div>
    </div>
  )

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h1 className="text-base font-bold text-accent mb-1">As minhas folgas</h1>
        <h2 className="text-xs uppercase tracking-wider text-accent-subtle mb-3">Próximas ({proximas.length})</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {proximas.length > 0 ? proximas.map(Cartao) : <p className="text-sm text-accent-subtle">Sem folgas próximas.</p>}
        </div>
      </section>

      {passadas.length > 0 && (
        <section>
          <h2 className="text-xs uppercase tracking-wider text-accent-subtle mb-3">Anteriores ({passadas.length})</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{passadas.map(Cartao)}</div>
        </section>
      )}
    </div>
  )
}
