import { Undo2, X } from 'lucide-react'
import { useUndo } from '@/contexts/UndoContext'
import { clsx } from 'clsx'

/**
 * Toast flutuante no fundo do ecrã com botão Desfazer.
 * Incluir uma vez dentro de <Layout> (ou em <App>).
 */
export function UndoToast() {
  const { entrada, executando, executarUndo, descartar } = useUndo()

  if (!entrada) return null

  return (
    <div
      key={entrada.id}
      className={clsx(
        'fixed bottom-6 left-1/2 z-[500]',
        'animate-slide-up',
        'min-w-[300px] max-w-[480px]',
        'bg-surface-3 border border-border rounded-xl shadow-2xl overflow-hidden',
      )}
      style={{ transform: 'translateX(-50%)' }}
    >
      {/* Corpo */}
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Label */}
        <span className="flex-1 text-xs text-accent-muted truncate">
          {entrada.label}
        </span>

        {/* Botão Desfazer */}
        <button
          onClick={executarUndo}
          disabled={executando}
          className={clsx(
            'shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors',
            executando
              ? 'opacity-50 cursor-not-allowed border-border text-accent-muted'
              : 'border-white/20 text-accent hover:bg-white/10 hover:border-white/30',
          )}
        >
          <Undo2 size={12} />
          {executando ? 'A desfazer…' : 'Desfazer'}
        </button>

        {/* Fechar */}
        <button
          onClick={descartar}
          className="shrink-0 p-1 rounded text-accent-subtle hover:text-accent transition-colors"
        >
          <X size={13} />
        </button>
      </div>

      {/* Barra de progresso (drena ao longo de `duracao` ms) */}
      <div className="h-[2px] bg-surface-4 w-full">
        <div
          key={`bar-${entrada.id}`}
          className="h-full bg-status-confirmado/60 animate-drain"
          style={{ animationDuration: `${entrada.duracao}ms` }}
        />
      </div>
    </div>
  )
}
