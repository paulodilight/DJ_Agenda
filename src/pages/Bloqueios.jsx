import { useState, useEffect, useCallback } from 'react'
import { Ban, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { LoadingPage } from '@/components/ui/LoadingSpinner'
import { Alerta } from '@/components/ui/Alerta'
import { Badge } from '@/components/ui/Badge'
import { FormBloqueio } from '@/components/bloqueios/FormBloqueio'
import { bloqueiosApi } from '@/lib/api'
import { useUndo } from '@/contexts/UndoContext'
import { formatarData } from '@/utils/datas'
import { clsx } from 'clsx'

const TABS = ['Todos', 'BAN', 'LOCK', 'SWAP']

const varianteBloqueio = { BAN: 'ban', LOCK: 'lock', SWAP: 'swap' }

export function Bloqueios() {
  const [bloqueios, setBloqueios] = useState([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState(null)
  const [tab, setTab] = useState('Todos')
  const [modalAberto, setModalAberto] = useState(false)
  const [desactivando, setDesactivando] = useState(null)
  const { pushUndo } = useUndo()

  const carregar = useCallback(async () => {
    setLoading(true); setErro(null)
    try { setBloqueios(await bloqueiosApi.listar()) }
    catch (e) { setErro(e.message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const desactivar = async (b) => {
    if (!confirm(`Remover este bloqueio (${b.tipo})?`)) return
    setDesactivando(b.id)
    try {
      await bloqueiosApi.desactivar(b.id)
      carregar()
      pushUndo({
        label: `Bloqueio ${b.tipo} removido`,
        undo: async () => { await bloqueiosApi.reactivar(b.id); carregar() },
      })
    }
    catch (e) { alert(e.message) }
    finally { setDesactivando(null) }
  }

  const filtrados = tab === 'Todos' ? bloqueios : bloqueios.filter((b) => b.tipo === tab)

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-base font-semibold text-accent">Bloqueios</h1>
          <p className="text-xs text-accent-muted mt-0.5">BAN, LOCK e SWAP activos</p>
        </div>
        <Button variante="primary" tamanho="sm" onClick={() => setModalAberto(true)}>
          <Plus size={14} />
          Novo bloqueio
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 bg-surface-1 border border-border rounded-lg p-1 w-fit">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={clsx(
              'px-3 py-1.5 rounded text-xs font-medium transition-colors',
              tab === t ? 'bg-surface-3 text-accent' : 'text-accent-muted hover:text-accent'
            )}
          >
            {t}
            {t !== 'Todos' && (
              <span className="ml-1.5 text-accent-subtle">
                {bloqueios.filter((b) => b.tipo === t).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading && <LoadingPage />}
      {erro && <Alerta tipo="erro" mensagem={erro} />}

      {!loading && !erro && filtrados.length === 0 && (
        <EmptyState
          icone={Ban}
          titulo="Sem bloqueios activos"
          descricao={tab === 'Todos' ? 'Cria um BAN, LOCK ou SWAP para gerir a distribuição.' : `Nenhum bloqueio do tipo ${tab}.`}
          accao={<Button variante="primary" tamanho="sm" onClick={() => setModalAberto(true)}><Plus size={14} />Novo bloqueio</Button>}
        />
      )}

      {!loading && !erro && filtrados.length > 0 && (
        <div className="flex flex-col gap-2">
          {filtrados.map((b) => (
            <div key={b.id} className="bg-surface-1 border border-border rounded-lg px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Badge variante={varianteBloqueio[b.tipo]}>{b.tipo}</Badge>

                <div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-medium text-accent">
                      {b.dj?.nome_artistico || b.dj?.id || '—'}
                    </span>
                    {b.tipo === 'SWAP' && b.dj_swap && (
                      <>
                        <span className="text-accent-subtle">↔</span>
                        <span className="font-medium text-accent">{b.dj_swap?.nome_artistico || b.dj_swap?.id}</span>
                      </>
                    )}
                    {b.espaco && (
                      <>
                        <span className="text-accent-subtle">·</span>
                        <span className="text-accent-muted">{b.espaco.nome}</span>
                      </>
                    )}
                    {b.data && (
                      <>
                        <span className="text-accent-subtle">·</span>
                        <span className="text-accent-muted">{formatarData(b.data)}</span>
                      </>
                    )}
                  </div>
                  {b.motivo && (
                    <p className="text-xs text-accent-subtle mt-0.5">{b.motivo}</p>
                  )}
                </div>
              </div>

              <Button
                variante="ghost"
                tamanho="sm"
                loading={desactivando === b.id}
                onClick={() => desactivar(b)}
                className="text-accent-subtle hover:text-status-cancelado shrink-0"
              >
                <X size={14} />
                Remover
              </Button>
            </div>
          ))}
        </div>
      )}

      <FormBloqueio
        aberto={modalAberto}
        onFechar={() => setModalAberto(false)}
        onGuardado={carregar}
      />
    </div>
  )
}
